import pool from './db';

export const syncDatabaseSchema = async () => {
    console.log('[Schema Sync] Starting database schema synchronization...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Ensure 'users' table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                subscription_status VARCHAR(20) DEFAULT 'free',
                stripe_customer_id VARCHAR(255)
            );
        `);
        console.log('[Schema Sync] Verified users table.');

        // 2. Ensure 'games' table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS games (
                game_id SERIAL PRIMARY KEY,
                room_code VARCHAR(10) UNIQUE NOT NULL,
                host_id INT REFERENCES users(id),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                current_level INT DEFAULT 0,
                current_question_id INT,
                selected_categories TEXT[],
                player_count INT DEFAULT 10,
                game_mode VARCHAR(20) DEFAULT 'cooperative',
                lives INT DEFAULT 3,
                wait_time INT DEFAULT 15,
                difficulty_mode VARCHAR(20) DEFAULT 'standard',
                last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('[Schema Sync] Verified games table.');

        // 3. Check and Add Missing Columns for 'games'
        const addColumnIfNotExists = async (table: string, column: string, type: string) => {
            const check = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            `, [table, column]);

            if (check.rows.length === 0) {
                console.log(`[Schema Sync] Adding missing column ${column} to ${table}...`);
                await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
            }
        };

        await addColumnIfNotExists('games', 'host_id', 'INT REFERENCES users(id)');
        await addColumnIfNotExists('games', 'difficulty_mode', "VARCHAR(20) DEFAULT 'standard'");
        await addColumnIfNotExists('games', 'selected_categories', 'TEXT[]');
        await addColumnIfNotExists('games', 'game_mode', "VARCHAR(20) DEFAULT 'cooperative'");
        await addColumnIfNotExists('games', 'lives', 'INT DEFAULT 3');
        await addColumnIfNotExists('games', 'lives', 'INT DEFAULT 3');
        await addColumnIfNotExists('games', 'wait_time', 'INT DEFAULT 15');
        await addColumnIfNotExists('games', 'moderator_mode', 'BOOLEAN DEFAULT FALSE');

        // 4. Ensure 'players' table exists
        await client.query(`
             CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                userId VARCHAR(50), 
                room_code VARCHAR(10) REFERENCES games(room_code),
                name VARCHAR(50),
                score INT DEFAULT 0,
                lives INT DEFAULT 3,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(userId, room_code)
            );
        `);
        console.log('[Schema Sync] Verified players table.');

        // 5. Ensure 'player_answers' table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_answers (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                question_id INT,
                answer VARCHAR(255),
                is_correct BOOLEAN,
                room_code VARCHAR(10),
                level INT,
                answered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('[Schema Sync] Verified player_answers table.');

        await client.query('COMMIT');
        console.log('[Schema Sync] Database synchronized successfully.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[Schema Sync] Error synchronizing database:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Auto-run if called directly
if (require.main === module) {
    syncDatabaseSchema().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
