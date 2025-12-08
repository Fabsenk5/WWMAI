CREATE TABLE IF NOT EXISTS game_fixed_questions (
    room_code VARCHAR(10) PRIMARY KEY,
    fixed_question_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_game_fixed_questions_room_code ON game_fixed_questions(room_code);