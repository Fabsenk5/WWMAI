// Script to apply the game_fixed_questions table to the database
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Use the same database connection details as your application
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'millionaire',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function applyFixedQuestionsTable() {
  console.log('Applying game_fixed_questions table to database...');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'game_fixed_questions.sql');
    console.log(`Reading SQL file from: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('SQL file content:', sql);
    
    // Apply the SQL commands
    await pool.query(sql);
    
    console.log('Successfully applied game_fixed_questions table to database!');
  } catch (error) {
    console.error('Error applying game_fixed_questions table:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the function
applyFixedQuestionsTable();