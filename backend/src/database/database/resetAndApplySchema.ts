import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// Path to schema.sql file - adjust path if needed
const schemaFilePath = join(__dirname, '../../../database/schema.sql');

// Read the schema from the SQL file
const schemaSQL = readFileSync(schemaFilePath, 'utf-8');

const terminateConnections = `
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = 'wer_wird_millionaer'
          AND pid <> pg_backend_pid()
    ) LOOP
        -- Terminate each connection
    END LOOP;
END $$;
`;

try {
    console.log('Terminating active database connections...');
    execSync(`docker exec -i wwmai-db-1 psql -U your_username -d postgres -c "${terminateConnections}"`);

    console.log('Dropping and reapplying schema from schema.sql...');
    // Use the schema.sql file content directly
    execSync(`docker exec -i wwmai-db-1 psql -U your_username -d wer_wird_millionaer -c "${schemaSQL}"`);

    console.log('Schema reset and reapplied successfully.');
} catch (error) {
    console.error('Error during schema reset and reapplication:', error);
}