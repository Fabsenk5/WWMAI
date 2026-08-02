# Developer Documentation

This guide provides detailed technical documentation for developers working on the Wer Wird Millionär project. It includes function-by-function documentation for key components and explains the technical implementation of game logic.

## Key Backend Components

### GameController

The `GameController` class in `backend/src/controllers/gameController.ts` is responsible for managing the game lifecycle, processing player actions, and coordinating real-time updates.

#### Methods

##### `createGame(req, res)`
Creates a new game instance with a unique room code.
- Generates a random alphanumeric room code
- Creates a new game record in the database
- Returns the game ID and room code to the client

##### `joinGame(req, res)`
Handles player joining a game room.
- Validates room code existence and capacity
- Creates or retrieves player record
- Returns userId to the client for future authentication

##### `startGame(req, res)`
Initiates a game session.
- Validates game exists and is in 'pending' status
- Fetches the first question for level 1
- Updates game status to 'started'
- Updates current question ID and level in database
- Emits 'gameStarted' and 'newQuestion' socket events
- Returns first question data to host

##### `submitAnswer(req, res)`
Processes a player's answer submission.
- Validates the answer belongs to current user and question
- Checks if answer is correct
- Updates player score if correct
- Decrements player lives if incorrect
- Checks if all players have answered
- When all answers received, emits 'revealAnswers' event
- Schedules next question advance after delay

##### `advanceToNextQuestion(roomCode, gameId, currentLevel)`
Internal method to progress to the next question/level.
- Increments current level
- Fetches question for new level
- Updates game state in database
- Emits 'newQuestion' event to all players in room

##### `cleanupInactiveRooms()`
Scheduled maintenance task that removes stale game rooms.
- Runs every 5 minutes via setInterval in app.ts
- Identifies games inactive for >5 minutes (based on last_active timestamp)
- Only removes non-ended games (status 'pending' or 'started')
- Logs cleanup activity (room count before/after)

### QuestionModel

The `QuestionModel` class in `backend/src/models/questionModel.ts` handles question data access.

#### Methods

##### `getQuestionByLevel(level)`
Fetches a random question for the specified level.
- Uses SQL query with difficulty mapping based on level
- Random selection via ORDER BY RANDOM() LIMIT 1
- Returns question with correct answer and incorrect options

##### `getQuestionById(id)`
Retrieves a specific question by its ID.
- Direct database query by primary key
- Used when advancing to next question or validating answers

## Key Frontend Components

### GameContext

The `GameContext` in `frontend/src/context/GameContext.tsx` provides a central state management system.

#### Core State
- `gameData`: Current game state including room code, status, players
- `currentQuestion`: Current active question data
- `loading`: Loading state indicator
- `error`: Error state for API failures

#### Key Methods

##### `fetchGameData(id)`
Retrieves full game state from server.
- HTTP GET request to /api/games/:id
- Updates local state with received data
- Handles errors with appropriate messaging

##### `submitAnswer(gameId, questionId, answer)`
Sends player's answer to server.
- HTTP POST to /api/games/:gameId/submit-answer
- Updates local state based on response
- Provides feedback on answer correctness

### LobbyPage

`LobbyPage` in `frontend/src/pages/LobbyPage.tsx` is the main game interface for players.

#### Socket Event Handlers

##### `handleGameStarted(data)`
Triggered when game begins.
- Updates game status in context
- Prepares UI for receiving questions

##### `handleNewQuestion(question)`
Processes incoming questions.
- Updates current question state
- Resets answer-related states
- Updates game level in context

##### `handleRevealAnswers(data)`
Displays answer results to all players.
- Shows correct answer
- Lists all player answers and whether they were correct
- Displays countdown to next question

## Game Logic Implementation

### Question Difficulty Progression

Questions increase in difficulty as levels progress:
- Levels 1-5: "easy" difficulty
- Levels 6-10: "medium" difficulty  
- Levels 11-15: "hard" difficulty

This is implemented in `QuestionModel.getQuestionByLevel()`:

```typescript
getQuestionByLevel(level: number) {
  let difficulty;
  if (level <= 5) difficulty = 'easy';
  else if (level <= 10) difficulty = 'medium';
  else difficulty = 'hard';
  
  const query = `SELECT * FROM questions WHERE difficulty = $1 ORDER BY RANDOM() LIMIT 1`;
  // Execute query with difficulty parameter...
}
```

### Prize Amount Calculation

Prize amounts follow the traditional "Who Wants to Be a Millionaire" progression:
- Level 1: $50
- Level 2: $100
- ...
- Level 15: $1,000,000

Implemented in `gameController.ts` via the `getPrizeForLevel` method:

```typescript
private getPrizeForLevel(level: number): number {
  const prizeAmounts = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
  return prizeAmounts[level - 1] || 0;
}
```

### Answer Validation and Player Lives

Players lose a life when answering incorrectly:
- Each player starts with 3 lives
- Incorrect answers reduce lives by 1
- Players with 0 lives cannot continue

### Real-time Synchronization

The application uses a hybrid approach for state management:
1. **HTTP Requests**: For initial loading and explicit user actions
2. **WebSockets (Socket.IO)**: For real-time updates and event notifications

This ensures consistency across all clients while providing immediacy for game events.

## Development Guidelines

### Adding New Questions

To add questions to the database:
1. Add entries to the seed array in `backend/src/database/seed.ts`
2. Ensure each question has:
   - category (string)
   - difficulty (easy, medium, hard)
   - question text
   - correct_answer
   - incorrect_answers (array of 3 options)
3. Run `npm run seed` (from `backend/`) or restart the backend — it seeds automatically when the table is empty

### Adding New Socket Events

When adding new real-time features:
1. Define the event name in a centralized constants file
2. Add socket.emit calls in appropriate controller methods
3. Add socket.on listeners in relevant frontend components
4. Ensure proper error handling and fallbacks

### Database Schema Evolution

When modifying the database schema:
1. Update `backend/src/database/sync_schema.ts` (idempotent, runs on every boot — the primary mechanism)
2. For existing deployments, add a file to `backend/src/database/migrations/` and run `backend/src/database/run_migrations.ts`
3. Keep `backend/database/schema.sql` in sync for fresh installs / full resets
4. Update related models and controllers