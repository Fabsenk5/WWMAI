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
exports.cleanupRooms = cleanupRooms;
const db_1 = __importDefault(require("../db")); // Import the centralized pool
// Remove redundant pool creation
// const pool = new Pool({...});
const retryInterval = 5000; // Retry every 5 seconds
const maxRetries = 12; // Retry for up to 1 minute
function waitForDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                yield db_1.default.query('SELECT 1'); // Simple query to check connection
                console.log('Database is ready.');
                return;
            }
            catch (error) {
                console.error('Database not ready, retrying in 5 seconds...');
                retries++;
                yield new Promise((resolve) => setTimeout(resolve, retryInterval));
            }
        }
        throw new Error('Database did not become ready in time.');
    });
}
function cleanupRooms() {
    return __awaiter(this, void 0, void 0, function* () {
        let client;
        try {
            client = yield db_1.default.connect(); // Use a client from the centralized pool
            // Log all rooms and their last_active timestamps for debugging
            const debugResult = yield client.query('SELECT game_id, last_active FROM games');
            console.log('All rooms and their last_active timestamps:', JSON.stringify(debugResult.rows));
            console.log('Current time:', new Date().toISOString());
            console.log('Verifying database connection and query execution...');
            const connectionTest = yield client.query('SELECT NOW()');
            console.log('Database connection verified. Current database time:', connectionTest.rows[0].now);
            console.log('Executing query: DELETE FROM games WHERE last_active < NOW() - INTERVAL \'5 minutes\' RETURNING game_id, room_code');
            console.log('Current time:', new Date().toISOString());
            const result = yield client.query(`DELETE FROM games 
             WHERE last_active < NOW() - INTERVAL '5 minutes' 
             RETURNING game_id, room_code`);
            if (result.rowCount && result.rowCount > 0) {
                console.log(`Closed ${result.rowCount} inactive room(s):`, result.rows.map(row => ({ game_id: row.game_id, room_code: row.room_code })));
            }
            else {
                console.log('No inactive rooms to close.');
            }
        }
        catch (error) {
            console.error('Error cleaning up rooms:', error);
        }
        finally {
            if (client) {
                client.release(); // Release the client back to the pool
            }
            // Removed pool.end() - the service should not close the shared pool
        }
    });
}
// Run cleanup periodically (e.g., every minute)
setInterval(cleanupRooms, 60 * 1000);
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield waitForDatabase();
        console.log('Cleanup service started, checking for inactive rooms every minute...');
        // Initial run
        cleanupRooms();
    }
    catch (error) {
        console.error('Failed to start cleanup service:', error);
    }
}))();
