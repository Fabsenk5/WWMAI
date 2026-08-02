-- Full reset schema for WWMAI (destructive). Kept in sync with
-- backend/src/database/sync_schema.ts (the boot-time source of truth).

DROP TABLE IF EXISTS game_questions CASCADE;
DROP TABLE IF EXISTS player_answers CASCADE;
DROP TABLE IF EXISTS feature_wishes CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    subscription_status VARCHAR(20) DEFAULT 'free',
    subscription_end_date TIMESTAMP WITH TIME ZONE,
    stripe_customer_id VARCHAR(255),
    avatar_url VARCHAR(255),
    games_played INT DEFAULT 0,
    games_won INT DEFAULT 0,
    total_earnings INT DEFAULT 0,
    current_win_streak INT DEFAULT 0,
    longest_win_streak INT DEFAULT 0
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    category VARCHAR(255),
    difficulty VARCHAR(50),
    question TEXT,
    correct_answer TEXT,
    incorrect_answers TEXT[],
    translations JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    embedding REAL[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_question UNIQUE (category, question, difficulty)
);

CREATE TABLE games (
    game_id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    host_id INT REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_level INT DEFAULT 0,
    current_question_id INT REFERENCES questions(id),
    selected_categories TEXT[],
    player_count INT DEFAULT 10,
    game_mode VARCHAR(20) DEFAULT 'cooperative',
    lives INT DEFAULT 3,
    wait_time INT DEFAULT 15,
    difficulty_mode VARCHAR(20) DEFAULT 'standard',
    moderator_mode BOOLEAN DEFAULT FALSE,
    jokers_used TEXT[] DEFAULT '{}',
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    userId VARCHAR(50),
    room_code VARCHAR(10) REFERENCES games(room_code),
    name VARCHAR(50),
    score INT DEFAULT 0,
    lives INT DEFAULT 3,
    jokers_used TEXT[] DEFAULT '{}',
    game_id INT,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (userId, room_code)
);

CREATE TABLE player_answers (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    question_id INT,
    answer VARCHAR(255),
    is_correct BOOLEAN,
    room_code VARCHAR(10),
    level INT,
    category VARCHAR(50),
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_questions (
    game_id INT REFERENCES games(game_id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, question_id)
);

CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255)
);

INSERT INTO system_settings (key, value) VALUES
    ('global_premium_unlocked', 'false'),
    ('global_guest_premium_unlocked', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE feature_wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_email VARCHAR(255)
);
