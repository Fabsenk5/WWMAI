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
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dbConnectionString = `postgresql://your_username:your_password@localhost:5432/wer_wird_millionaer`;
const pool = new pg_1.Pool({ connectionString: dbConnectionString });
function testGameQuestions() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Testing game_questions table...');
            const result = yield pool.query(`
            SELECT gq.game_id, gq.question_id, q.question
            FROM game_questions gq
            JOIN questions q ON gq.question_id = q.id
        `);
            console.log('game_questions table contents:', result.rows);
        }
        catch (error) {
            console.error('Error querying game_questions table:', error);
        }
        finally {
            yield pool.end();
        }
    });
}
testGameQuestions();
