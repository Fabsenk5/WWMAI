-- Add statistics columns to users table
ALTER TABLE users 
ADD COLUMN games_played INT DEFAULT 0,
ADD COLUMN games_won INT DEFAULT 0,
ADD COLUMN total_earnings INT DEFAULT 0,
ADD COLUMN current_win_streak INT DEFAULT 0,
ADD COLUMN longest_win_streak INT DEFAULT 0;
