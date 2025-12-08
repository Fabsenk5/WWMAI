
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load current env vars
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

async function changePassword() {
    const newPassword = process.argv[2];

    if (!newPassword) {
        console.error('Usage: npx ts-node change_password.ts <NEW_PASSWORD>');
        process.exit(1);
    }

    if (newPassword.length < 8) {
        console.warn('Warning: Password is short. Check security best practices.');
    }

    const dbUser = process.env.DB_USER;

    if (!dbUser) {
        console.error('Error: DB_USER not found in .env');
        process.exit(1);
    }

    console.log(`Connecting to database as ${dbUser}...`);

    // Connect with OLD credentials
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await client.connect();

        console.log(`Updating password for user "${dbUser}" in Postgres...`);
        // Use parameterized query for safety? ALTER USER usually requires literal string for password or careful quoting.
        // Postgres: ALTER USER "user" WITH PASSWORD 'password';
        // We must escape the password to avoid SQL injection, though technically you assume the admin is running this.
        await client.query(`ALTER USER "${dbUser}" WITH PASSWORD '${newPassword}';`);

        console.log('Database password updated successfully.');

        // Now update .env file
        console.log('Updating .env file...');
        let envContent = fs.readFileSync(envPath, 'utf8');

        // Regex to replace DB_PASSWORD line
        const passwordRegex = /^DB_PASSWORD=.*$/m;

        if (passwordRegex.test(envContent)) {
            envContent = envContent.replace(passwordRegex, `DB_PASSWORD=${newPassword}`);
        } else {
            envContent += `\nDB_PASSWORD=${newPassword}`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log('.env file updated.');

        console.log('✅ ALL DONE! Please restart your backend server to apply changes.');

    } catch (err) {
        console.error('Error changing password:', err);
    } finally {
        await client.end();
    }
}

changePassword();
