CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    category VARCHAR(255) NOT NULL,
    difficulty VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    incorrect_answers TEXT[] NOT NULL,
    CONSTRAINT unique_question UNIQUE (category, question, difficulty) -- Add a unique constraint to prevent duplicate questions
);

CREATE TABLE games (
    game_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    player_count INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    room_code VARCHAR(10) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, started, ended
    current_level INT DEFAULT 1, -- Track current level, start at 1
    current_question_id INT REFERENCES questions(id), -- Track the current question
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_count INTEGER NOT NULL DEFAULT 0, -- Add user_count column to the games table
    lives INT DEFAULT 3, -- Team shared lives
    jokers_used TEXT[] DEFAULT '{}', -- Track used jokers
    game_mode VARCHAR(20) DEFAULT 'cooperative' -- 'cooperative' or 'survival'
);

CREATE TABLE players (
    userId VARCHAR(50) PRIMARY KEY, -- Renamed from playerId to userId
    room_code VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    lives INT DEFAULT 3,
    score INT DEFAULT 0,
    jokers_used TEXT[] DEFAULT '{}', -- Track used jokers for survival mode
    CONSTRAINT unique_player_name_per_room UNIQUE (room_code, name) -- Add a unique constraint to prevent duplicate player names in the same room
);

CREATE TABLE game_questions (
    game_id INT REFERENCES games(game_id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, question_id)
);

CREATE TABLE player_answers (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES players(userId) ON DELETE CASCADE, -- Updated to reference userId
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    answer TEXT,
    is_correct BOOLEAN,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    room_code VARCHAR(10) REFERENCES games(room_code) ON DELETE CASCADE, -- Added room_code
    level INT,                                                          -- Added level
    CONSTRAINT unique_player_question_level_room UNIQUE (user_id, question_id, level, room_code) -- Updated constraint
);

-- Table to store fixed questions for game rooms
CREATE TABLE game_fixed_questions (
    room_code VARCHAR(10) PRIMARY KEY,
    fixed_question_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add an index for faster lookups
CREATE INDEX idx_game_fixed_questions_room_code ON game_fixed_questions(room_code);

CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);