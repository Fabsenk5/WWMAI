-- Drop dependent tables first to avoid conflicts
DROP TABLE IF EXISTS player_answers CASCADE;
DROP TABLE IF EXISTS game_questions CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS questions CASCADE;

-- Recreate tables with updated schema
CREATE TABLE questions (
    question_id SERIAL PRIMARY KEY,
    category VARCHAR(255) NOT NULL,
    difficulty VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    incorrect_answers TEXT[] NOT NULL
);

CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    player_count INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    room_code VARCHAR(10) UNIQUE, -- Added UNIQUE constraint for room_code
    current_question_id INT REFERENCES questions(question_id),
    status VARCHAR(50) DEFAULT 'pending', -- Added status column
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Added last_active column
);

CREATE TABLE players (
    userId VARCHAR(50) NOT NULL, -- Renamed from playerId to userId
    room_code VARCHAR(10) NOT NULL REFERENCES games(room_code) ON DELETE CASCADE, -- Added ON DELETE CASCADE
    name VARCHAR(255) NOT NULL,
    score INT DEFAULT 0, -- Added score column
    lives INT DEFAULT 3, -- Added lives column
    PRIMARY KEY (userId, room_code) -- Made composite primary key
);

CREATE TABLE game_questions (
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(question_id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, question_id)
);

CREATE TABLE player_answers (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL, -- Updated to reference userId
    room_code VARCHAR(10) NOT NULL, -- Added room_code to link answers to a specific game instance via player
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(question_id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    FOREIGN KEY (user_id, room_code) REFERENCES players(userId, room_code) ON DELETE CASCADE -- Composite foreign key
);