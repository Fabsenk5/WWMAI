# AGENTS.md

Monorepo for **WWMAI** ("Wer wird Millionär AI") — a multiplayer "Who Wants to Be a Millionaire" trivia game with real-time WebSocket gameplay, JWT auth, AI question generation (DeepSeek), Stripe premium, and i18n (en/de/ru/es). Live demo is a hobby project on Render/Neon; keep free-tier constraints in mind (see "Infrastructure").

## Tech stack

- **Backend**: Node + Express 4, TypeScript 5 (strict), `pg` (PostgreSQL), Socket.IO 4, JWT + bcrypt, Stripe, `@google/generative-ai`.
- **Frontend**: React 19 via **Create React App** (`react-scripts`), TypeScript 4.9, react-router-dom 6, react-i18next, lucide-react, Socket.IO client, axios.
- **Tests**: Jest + ts-jest + supertest (root config), **no lint setup**.

## Commands

```bash
npm test                        # root: jest, runs backend/tests only
cd backend && npm run dev       # ts-node-dev + dotenv, port 5000
cd backend && npm run build     # tsc -> dist/
cd backend && npm start         # node dist/src/app.js
cd backend && npm run seed      # seed questions if empty (auto-seeds on boot too)
cd frontend && npm start        # CRA dev server, port 3000, proxies /api to :5000
cd frontend && npm run build    # react-scripts build
docker-compose up               # backend + frontend + postgres:13 + cleanup service
```

- Always start the backend first; it **auto-creates/syncs the DB schema on boot** (`syncDatabaseSchema` in `backend/src/database/sync_schema.ts`) and auto-seeds if the `questions` table is empty. `sync_schema.ts` is the schema source of truth (tables: users, questions, games, players, player_answers, system_settings, feature_wishes, rooms, game_questions).
- DB reset: run `backend/database/schema.sql` (destructive, drops all — kept in sync with `sync_schema.ts`) then restart the backend to re-seed.

## Repo layout (key paths)

```
backend/src/
  app.ts                 # entry; mounts routes, socket joinRoom handler, keep-alive, room cleanup
  socketSetup.ts         # exports io; initializeSocket(server)
  controllers/           # gameController (huge: game flow + jokers), admin, Auth, Billing, FeatureWishlist
  routes/                # gameRoutes (setRoutes factory), adminRoutes (factory), auth/billing/featureWishlist
  middleware/authMiddleware.ts  # authenticateToken, optionalAuthenticateToken (Bearer JWT)
  models/questionModel.ts       # question queries + difficulty/prize mapping
  services/aiService.ts  # DeepSeek (OpenAI-compatible) question gen, translation backfill
  services/embeddingService.ts  # local embeddings (all-MiniLM-L6-v2) + duplicate gate
  database/cleanupSimilarQuestions.ts  # 24h job: embedding backfill + auto-deactivate near-duplicates
  database/              # db.ts (Pool), seed.ts, sync_schema.ts, cleanupRooms.ts, run_migrations.ts, migrations/*.sql, schema.sql (stale base)
backend/tests/           # questionModel, gameController, integration (uses REAL db; one broken import)
frontend/src/
  App.tsx                # routes + shell (UserIcon/Branding/ThemeToggle/LanguageSwitcher/AudioPlayer)
  pages/                 # LobbyPage (main gameplay UI + jokers), GamePage, AdminDashboard, etc.
  context/               # Auth, Audio, Game, Language, Modal, Theme
  hooks/useGame.ts, config/api.ts, services/adminService.ts, locales/{en,de,ru,es}.json
```

## Architecture & key flows

### API + socket
- REST under `/api/games`, `/api/auth`, `/api/admin`, `/api/billing`, `/api/feature-wishes`; health at `/health` (DB ping). Rate limits on `/api` (300/15min) and game creation (10/hour/IP).
- Socket.IO events: server emits `gameStarted`, `newQuestion`, `playerAnswered`, `revealAnswers`, `gameEnded`, `jokerUsed`, `playerKicked`, `gamePaused`, `userJoined`; client emits `joinRoom`. The joinRoom socket handler lives in `app.ts`.
- Question payload shape (over the wire): `{ id, category, difficulty, question, questionTranslations, level, prize, options:[{text, translations}] }`. Options are deterministically shuffled per question ID (`getConsistentOptions`).

### Game flow
- Create → `POST /api/games/create` (room code = 6-char uppercase alnum). Join → `POST /api/games/join` (generates guest userId, auto-starts when room fills). Answer → `POST /api/games/:roomCode/submit-answer` (aliased by `/answer`).
- **15 levels**, prize ladder in `getPrizeForLevel` (`gameController.ts`): `[50,100,200,300,500,1000,2000,4000,8000,16000,32000,64000,125000,500000,1000000]`.
- Difficulty per level (standard): L1-4 easy, L5-9 medium, L10-13 hard, L14-15 very_hard. Modes: `standard|easy|hard|mixed` (see `questionModel.getQuestionByLevel`; has adjacent-difficulty fallback chain).
- **Game modes**: `cooperative` (team votes, majority answer decides, shared lives; wrong answer −1 life) and `survival` (per-player lives, individual score; eliminated players spectate).
- Round resolution emits `revealAnswers`, then advances after `wait_time` (default 15s). `gameEnded` is emitted 30s+wait later. Stats finalized in `finalizeGameStats` (registered users only; guests skipped).
- **Jokers** (`POST /api/games/:roomCode/joker`): `5050` (2 wrong removed), `audience` (simulated % stats, reliability scales down with difficulty), `phone` (heuristic friend). Co-op = team-scoped (games.jokers_used); survival = per-player (players.jokers_used).

### AI question generation
- `AiService.ensureCategoryPool(category, threshold)` is fired in background on game creation if pool is low; capped at 50 questions/request, difficulty split ~25/35/25/15%. Uses an **OpenAI-compatible chat completions endpoint** (DeepSeek): model `DEEPSEEK_MODEL` (default `deepseek-v4-flash`, fallback `deepseek-chat`), base URL `DEEPSEEK_BASE_URL` (default `https://opencode.ai/zen/go/v1`), JSON output via `response_format`. Retry (2×) on main model, then falls back. Disabled without `DEEPSEEK_API_KEY`.
- **Duplicate protection** (see `services/embeddingService.ts`): per-category concurrency lock + 6h cooldown, intra-batch duplicate rejection, normalized exact-match check, and an embedding gate (`questions.embedding REAL[]`, local `Xenova/all-MiniLM-L6-v2`, lazy-loaded; duplicate if identical answer + sim ≥ 0.60, or combined Q+A sim ≥ 0.85). `cleanupSimilarQuestions` (24h interval in app.ts) backfills embeddings and auto-deactivates near-duplicates (`is_active=false`, never deletes). `questionModel.getQuestionByLevel` accepts `usedEmbeddings` so round questions stay semantically distant (≥0.85).
- **Pool rotation & filling**: every question pick updates `questions.last_used_at`/`times_used`; `getQuestionsByDifficulty` orders by a soft age-weighted `RANDOM()` so never/least-recently used questions come first (cross-round repeats are rare). `fillQuestionPools` (same 24h interval) tops up categories below 150 active questions (respects the 6h cooldown); admin can trigger per category via `POST /api/admin/categories/fill`.
- Questions carry `translations` JSONB `{de,ru,es:{question,correct_answer,incorrect_answers}}`.

### Auth / premium
- JWT payload `{userId, username, role: subscription_status}`, 24h expiry. `optionalAuthenticateToken` allows guest game creation.
- Premium gates (co-op kick, moderator mode, custom categories, non-standard difficulty) are checked **fresh from DB** in `createGame`, plus global flags in `system_settings` (`global_premium_unlocked`, `global_guest_premium_unlocked` — togglable via admin).
- Admin routes use a plain `ADMIN_PASSWORD` env (default `admin`) passed per-request — no JWT. Billing webhook must stay mounted before `express.json()` (raw body) in `app.ts`.

### i18n
- UI chrome strings: `frontend/src/locales/*.json` (flat, ~55 keys, via react-i18next, fallback en). Game content translations come from the DB question `translations`, selected by `LanguageContext.language`.

## Conventions & rules

- **Git**: after any change is implemented and validated, **push it** (`git add . && git commit -m "<msg>" && git push`) — this is a standing repo rule (`.agent/rules/`). Keep commit messages lowercase-prefixed like `docs:`, `fix:`, `feat:`.
- TypeScript strict on both sides. Do not add code comments unless needed for intent.
- DB access: import the shared `pool` from `backend/src/database/db` (singleton). Parameterize all queries ($1…).
- Schema evolution: prefer adding to `sync_schema.ts` (idempotent `CREATE TABLE IF NOT EXISTS` / `addColumnIfNotExists`, runs on boot) OR add a file in `database/migrations/` and run `run_migrations.ts`. Keep `schema.sql` in sync only for fresh installs — it is currently stale.
- Backend code style: 4-space indent, single quotes, explicit `console.log` diagnostics everywhere (mimic existing).
- Frontend: CRA, CSS files alongside components/pages, CSS variables + `data-theme` for light/dark in `App.css`.

## Gotchas (read before editing)

- `integration.test.ts` needs a **live DB**; it now pings the DB in `beforeAll` and skips gracefully when none is reachable, so root `npm test` stays green without Postgres. When a DB is up it **drops and recreates all tables** — never point it at a DB with real data.
- `backend/package.json` `test` script references a missing `jest.config.js` — use root `npm test`.
- Docs (`DEVELOPER_GUIDE.md`, `README.md`) were partially updated; older prose may still reference removed scripts (`resetAndApplySchema.ts`, `reset-db`, `seed-db`) — treat leftovers as illustrative.
- `backend/database/schema.sql` (fresh-install reset) and `backend/src/database/sync_schema.ts` (boot sync) must stay in sync when changing the schema. `jokers_used` (games+players) and `players.game_id` live in both.
- `frontend/src_backup/` contains an old frontend snapshot — don't edit it.
- Leftover local backup branches `cleanup-backup`/`v1-backup` still contain old history (incl. the purged `debug_output.txt`) — don't push them.

## Environment

`backend/.env` (see `.env.example`): `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` + `DEEPSEEK_MODEL`, plus `JWT_SECRET`, `DATABASE_URL` (prod, SSL), `CLIENT_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_PASSWORD`, `PORT`. Root `.env` also used.

## Infrastructure

- Render hosts backend/frontend; Neon PostgreSQL (free tier → small pool `max:5`, 30s timeouts, keep-alive). `app.ts` pings DB every 14 min; GitHub Actions (`keep-alive.yml`, `server-keepalive.yml`) curl `/health` so the free instance doesn't cold-sleep. Room cleanup runs every 5 min (`cleanupInactiveRooms`).
