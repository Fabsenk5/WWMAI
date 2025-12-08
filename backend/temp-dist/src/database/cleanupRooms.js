"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupInactiveRooms = void 0;
const db_1 = __importDefault(require("./db"));
const INACTIVITY_THRESHOLD_MINUTES = 5; // Changed from hours to minutes and value to 5
/**
 * Cleans up inactive game rooms from the database.
 * A room is considered inactive if its `last_active` timestamp is older than
 * INACTIVITY_THRESHOLD_MINUTES and its status is not 'ended'.
 */
const cleanupInactiveRooms = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`[RoomCleanup] Running task to cleanup rooms inactive for over ${INACTIVITY_THRESHOLD_MINUTES} minutes...`);
    let client;
    try {
        client = yield db_1.default.connect();
        // Count active rooms before cleanup (status != 'ended')
        const activeRoomsResult = yield client.query("SELECT COUNT(*) AS count FROM games WHERE status != 'ended'");
        const activeRoomCount = parseInt(activeRoomsResult.rows[0].count, 10);
        // Delete inactive rooms (status is 'pending' or 'started')
        const deleteQuery = `
            DELETE FROM games
            WHERE last_active < NOW() - INTERVAL '${INACTIVITY_THRESHOLD_MINUTES} minutes' 
            AND (status = 'pending' OR status = 'started')
            RETURNING room_code;
        `;
        const deletedRoomsResult = yield client.query(deleteQuery);
        const deletedRoomCount = deletedRoomsResult.rowCount || 0; // Add || 0 to ensure it's not null
        console.log(`[RoomCleanup] Found ${activeRoomCount} active (not ended) room(s) before cleanup.`);
        if (deletedRoomCount > 0) {
            console.log(`[RoomCleanup] Deleted ${deletedRoomCount} inactive (pending/started and timed out) room(s): ${deletedRoomsResult.rows.map(r => r.room_code).join(', ')}`);
        }
        else {
            console.log("[RoomCleanup] No inactive rooms needed deletion.");
        }
        console.log("[RoomCleanup] Task finished.");
    }
    catch (error) {
        console.error("[RoomCleanup] Error during cleanup task:", error);
    }
    finally {
        if (client) {
            client.release();
        }
    }
});
exports.cleanupInactiveRooms = cleanupInactiveRooms;
// REMOVE the direct call to cleanup() and connectWithRetry() as this will be managed by app.ts
// cleanup();
// connectWithRetry();
