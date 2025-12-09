import pool from './database/db';

async function checkSchema() {
    try {
        console.log('Checking games table schema...');
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'games';
        `);
        console.log('Columns in games table:', res.rows);
    } catch (err: any) {
        console.error('Error checking schema:', err.message);
    } finally {
        // We can't easily close the pool default export as it doesn't expose end(), 
        // strictly speaking we should process.exit()
        process.exit(0);
    }
}

checkSchema();
