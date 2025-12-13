
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { QuestionModel } from '../models/questionModel';
// import pool from '../database/db'; // Delayed import

// Force load env
const potentialPaths = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env')
];
for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        break;
    }
}

// Import pool after env is loaded
const pool = require('../database/db').default;

async function verifyFix() {
    try {
        fs.writeFileSync('verify_output.txt', '--- VERIFICATION START ---\n');
        const qModel = new QuestionModel(pool);

        // 1. Create Dummy Question
        const insertQ = `
            INSERT INTO questions (category, difficulty, question, correct_answer, incorrect_answers, is_active)
            VALUES ('TestCategory', 'easy', 'Test Question?', 'A', '["B","C","D"]', true)
            RETURNING id, category
        `;
        const qRes = await pool.query(insertQ);
        const qId = qRes.rows[0].id;
        fs.appendFileSync('verify_output.txt', `Created Dummy Question ID: ${qId}\n`);

        // 2. Insert Player Answer (Simulating NEW GameController logic)
        // We assume User ID 1 exists
        const userId = 1;
        const insertAns = `
            INSERT INTO player_answers (user_id, question_id, answer, is_correct, room_code, level, category)
            VALUES ($1, $2, 'A', true, 'TESTROOM', 1, $3)
            RETURNING id
        `;
        await pool.query(insertAns, [userId, qId, 'TestCategory']);
        fs.appendFileSync('verify_output.txt', 'Inserted Player Answer with Category.\n');

        // 3. Verify Stats BEFORE Deletion
        const statsQuery = `
            SELECT pa.category, COUNT(*) as count 
            FROM player_answers pa 
            WHERE pa.user_id = $1::text AND pa.category = 'TestCategory'
            GROUP BY pa.category
        `;
        const resBefore = await pool.query(statsQuery, [userId]);
        fs.appendFileSync('verify_output.txt', 'Stats Before Deletion: ' + JSON.stringify(resBefore.rows) + '\n');

        if (resBefore.rows.length === 0) {
            throw new Error('Failed to retrieve stats before deletion.');
        }

        // 4. Delete Question (Simulating Admin Action or Cleanup)
        fs.appendFileSync('verify_output.txt', 'Deleting Question...\n');
        const deleted = await qModel.deleteQuestion(qId);
        fs.appendFileSync('verify_output.txt', `Question Deleted: ${deleted}\n`);

        // 5. Verify Stats AFTER Deletion
        const resAfter = await pool.query(statsQuery, [userId]);
        fs.appendFileSync('verify_output.txt', 'Stats After Deletion: ' + JSON.stringify(resAfter.rows) + '\n');

        if (resAfter.rows.length > 0 && resAfter.rows[0].count === resBefore.rows[0].count) {
            fs.appendFileSync('verify_output.txt', 'SUCCESS: Stats persisted after question deletion!\n');
        } else {
            fs.appendFileSync('verify_output.txt', 'FAILURE: Stats lost after question deletion.\n');
        }

        // Cleanup (Delete the test answer)
        await pool.query("DELETE FROM player_answers WHERE room_code = 'TESTROOM'");
        fs.appendFileSync('verify_output.txt', 'Cleanup complete.\n');

    } catch (err: any) {
        fs.appendFileSync('verify_output.txt', 'Verification Failed: ' + err.message + '\n');
        console.error('Verification Failed:', err);
    } finally {
        await pool.end();
    }
}

verifyFix();
