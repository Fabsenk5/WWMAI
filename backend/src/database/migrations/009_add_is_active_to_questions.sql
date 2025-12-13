-- Add is_active column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Create an index for performance since this will be in every game query
CREATE INDEX IF NOT EXISTS idx_questions_is_active ON questions(is_active);
