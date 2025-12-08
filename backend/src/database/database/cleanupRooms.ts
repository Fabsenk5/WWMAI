import pool from '../db'; // Import the centralized pool
import { PoolClient } from 'pg';

// Remove redundant pool creation
// const pool = new Pool({...});

const retryInterval = 5000; // Retry every 5 seconds
const maxRetries = 12; // Retry for up to 1 minute

async function waitForDatabase() {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            await pool.query('SELECT 1'); // Simple query to check connection
            console.log('Database is ready.');
            return;
        } catch (error) {
            console.error('Database not ready, retrying in 5 seconds...');
            retries++;
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
    }
    throw new Error('Database did not become ready in time.');
}

async function cleanupRooms() {
    let client: PoolClient | undefined;
    try {
        client = await pool.connect(); // Use a client from the centralized pool

        // Log all rooms and their last_active timestamps for debugging
        const debugResult = await client.query('SELECT game_id, last_active FROM games');
        console.log('All rooms and their last_active timestamps:', JSON.stringify(debugResult.rows));
        console.log('Current time:', new Date().toISOString());

        console.log('Verifying database connection and query execution...');
        const connectionTest = await client.query('SELECT NOW()');
        console.log('Database connection verified. Current database time:', connectionTest.rows[0].now);

        console.log('Executing query: DELETE FROM games WHERE last_active < NOW() - INTERVAL \'5 minutes\' RETURNING game_id, room_code');
        console.log('Current time:', new Date().toISOString());
        const result = await client.query(
            `DELETE FROM games 
             WHERE last_active < NOW() - INTERVAL '5 minutes' 
             RETURNING game_id, room_code`
        );

        if (result.rowCount && result.rowCount > 0) {
            console.log(`Closed ${result.rowCount} inactive room(s):`, result.rows.map(row => ({ game_id: row.game_id, room_code: row.room_code })));
        } else {
            console.log('No inactive rooms to close.');
        }
    } catch (error) {
        console.error('Error cleaning up rooms:', error);
    } finally {
        if (client) {
            client.release(); // Release the client back to the pool
        }
        // Removed pool.end() - the service should not close the shared pool
    }
}

// Run cleanup periodically (e.g., every minute)
setInterval(cleanupRooms, 60 * 1000);

(async () => {
    try {
        await waitForDatabase();
        console.log('Cleanup service started, checking for inactive rooms every minute...');
        // Initial run
        cleanupRooms();
    } catch (error) {
        console.error('Failed to start cleanup service:', error);
    }
})();

export { cleanupRooms };