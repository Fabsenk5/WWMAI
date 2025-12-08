
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Force load env
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('No API Key found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Using the internal API to list models if available, 
    // but the SDK typically doesn't expose listModels directly on the main class in some versions.
    // However, usually it's accessible via the ModelManager or similar.
    // NOTE: The JS SDK might simpler. Let's try a basic approach or fetch raw.
    // Actually, checking SDK docs... currently mostly `getGenerativeModel`.
    // But we can try a direct fetch if SDK doesn't support it easily.
    // Or just try to instantiate and catch the error which lists them? NO.

    // Let's try a raw fetch which is reliable.
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log('Available Models:');
            data.models.forEach((m: any) => {
                if (m.supportedGenerationMethods?.includes('generateContent')) {
                    console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
                }
            });
        } else {
            console.log('No models found or error:', data);
        }
    } catch (e) {
        console.error('Error fetching models:', e);
    }
}

listModels();
