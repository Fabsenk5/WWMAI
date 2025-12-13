import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });
import pool from '../database/db';

async function verifyColumn() {
    try {
        const result = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='questions' AND column_name='is_active'
        `);

        if (result.rows.length > 0) {
            console.log('Column is_active exists.');
        } else {
            console.log('Column is_active does NOT exist.');
        }
    } catch (error) {
        console.error('Error verifying column:', error);
    } finally {
        await pool.end();
    }
}

verifyColumn();
