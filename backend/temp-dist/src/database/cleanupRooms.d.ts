/**
 * Cleans up inactive game rooms from the database.
 * A room is considered inactive if its `last_active` timestamp is older than
 * INACTIVITY_THRESHOLD_MINUTES and its status is not 'ended'.
 */
export declare const cleanupInactiveRooms: () => Promise<void>;
