
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Force load env
const potentialPaths = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env')
];
for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
        console.log(`Loading env from ${p}`);
        dotenv.config({ path: p });
        break;
    }
}
const pool = require('../database/db').default;

async function removeConstraint() {
    try {
        fs.writeFileSync('constraint_log.txt', '--- REMOVE CONSTRAINT START ---\n');

        // Function to get FKs
        const getFKs = async () => {
            const fkQuery = `
                SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, rc.delete_rule
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
                JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = tc.constraint_name
                WHERE tc.table_name = 'player_answers' AND tc.constraint_type = 'FOREIGN KEY'
            `;
            return (await pool.query(fkQuery)).rows;
        };

        const fksBefore = await getFKs();
        fs.appendFileSync('constraint_log.txt', 'FKs Before:\n' + JSON.stringify(fksBefore, null, 2) + '\n');

        // Target ANY constraint that cascades delete
        const targetFKs = fksBefore.filter((fk: any) => fk.delete_rule === 'CASCADE');

        if (targetFKs.length === 0) {
            fs.appendFileSync('constraint_log.txt', 'No CASCADE Foreign Keys found on "player_answers".\n');
        } else {
            for (const fk of targetFKs) {
                fs.appendFileSync('constraint_log.txt', `Dropping FK: ${fk.constraint_name} (Table: ${fk.foreign_table_name}, Rule: ${fk.delete_rule})...\n`);
                await pool.query(`ALTER TABLE player_answers DROP CONSTRAINT "${fk.constraint_name}"`);
            }
        }

        const fksAfter = await getFKs();
        fs.appendFileSync('constraint_log.txt', 'FKs After:\n' + JSON.stringify(fksAfter, null, 2) + '\n');

        if (targetFKs.length > 0) {
            fs.appendFileSync('constraint_log.txt', 'SUCCESS: CASCADE Constraints removed.\n');
        }

    } catch (err: any) { // Type as any for error
        fs.appendFileSync('constraint_log.txt', 'Failed to remove constraint: ' + err.message + '\n');
        console.error('Failed to remove constraint:', err);
    } finally {
        await pool.end();
    }
}

removeConstraint();
