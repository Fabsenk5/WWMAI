ALTER TABLE games ADD COLUMN host_id INT REFERENCES users(id);
-- Optional: Index on host_id for faster lookups
CREATE INDEX idx_games_host_id ON games(host_id);
