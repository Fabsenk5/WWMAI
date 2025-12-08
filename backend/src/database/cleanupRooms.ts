import pool from './db';

const INACTIVITY_THRESHOLD_MINUTES = 5; // Changed from hours to minutes and value to 5

/**
 * Cleans up inactive game rooms from the database.
 * A room is considered inactive if its `last_active` timestamp is older than
 * INACTIVITY_THRESHOLD_MINUTES and its status is not 'ended'.
 */
export const cleanupInactiveRooms = async () => {
    console.log(`[RoomCleanup] Running task to cleanup rooms inactive for over ${INACTIVITY_THRESHOLD_MINUTES} minutes...`);
    let client;
    try {
        client = await pool.connect();

        // Count active rooms before cleanup (status != 'ended')
        const activeRoomsResult = await client.query("SELECT COUNT(*) AS count FROM games WHERE status != 'ended'");
        const activeRoomCount = parseInt(activeRoomsResult.rows[0].count, 10);

        // Delete inactive rooms (status is 'pending' or 'started')
        const deleteQuery = `
            DELETE FROM games
            WHERE last_active < NOW() - INTERVAL '${INACTIVITY_THRESHOLD_MINUTES} minutes' 
            AND (status = 'pending' OR status = 'started')
            RETURNING room_code;
        `;
        const deletedRoomsResult = await client.query(deleteQuery);
        const deletedRoomCount = deletedRoomsResult.rowCount || 0; // Add || 0 to ensure it's not null

        console.log(`[RoomCleanup] Found ${activeRoomCount} active (not ended) room(s) before cleanup.`);
        if (deletedRoomCount > 0) {
            console.log(`[RoomCleanup] Deleted ${deletedRoomCount} inactive (pending/started and timed out) room(s): ${deletedRoomsResult.rows.map(r => r.room_code).join(', ')}`);
        } else {
            console.log("[RoomCleanup] No inactive rooms needed deletion.");
        }
        console.log("[RoomCleanup] Task finished.");

    } catch (error) {
        console.error("[RoomCleanup] Error during cleanup task:", error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

// REMOVE the direct call to cleanup() and connectWithRetry() as this will be managed by app.ts
// cleanup();
// connectWithRetry();