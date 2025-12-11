
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function simulateFetch() {
    try {
        const categories = ['Cars', 'General Knowledge'];
        const difficulty = 'medium';
        const excludeIds = [];

        // Exact query logic from QuestionModel
        let query = 'SELECT * FROM questions';
        const params: any[] = [];
        let paramIndex = 1;
        const conditions: string[] = [];

        conditions.push(`difficulty = $${paramIndex++}`);
        params.push(difficulty);

        conditions.push(`category = ANY($${paramIndex++})`);
        params.push(categories);

        // conditions.push(`id NOT IN ...`) // empty

        query += ` WHERE ${conditions.join(' AND ')}`;
        query += ' ORDER BY RANDOM() LIMIT 1';

        console.log('Query:', query);
        console.log('Params:', params);

        const res = await pool.query(query, params);
        console.log('Result Count:', res.rowCount);
        if (res.rowCount && res.rowCount > 0) {
            console.log('Found:', res.rows[0].question);
        } else {
            console.log('Found NOTHING!');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

simulateFetch();
