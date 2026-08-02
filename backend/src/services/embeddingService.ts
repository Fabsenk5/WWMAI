// Lokale Embeddings für die Duplikat-Erkennung der Fragen-Pipeline.
// Modell: Xenova/all-MiniLM-L6-v2 (384-dim, ~23MB ONNX, CPU-only).
// NOTE: @xenova/transformers is ESM-only and heavy — imported dynamically so
// jest/ts-jest can parse this module and the model only loads on first use.
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// Kalibriert per PoC (siehe backend/src/scripts/embedding_poc.ts)
export const DUPLICATE_SIMILARITY = 0.85;              // combined Q+A similarity -> duplicate
export const DUPLICATE_SAME_ANSWER_SIMILARITY = 0.60;  // identical answer + similar question -> duplicate

let extractorPromise: Promise<any> | null = null;

function getExtractor(): Promise<any> {
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const { pipeline } = await import('@xenova/transformers');
            return pipeline('feature-extraction', MODEL_NAME);
        })().catch((err: any) => {
            console.error('[EmbeddingService] Failed to load embedding model:', err);
            extractorPromise = null; // allow retry on next call
            throw err;
        });
    }
    return extractorPromise;
}

export function normalizeText(text: string): string {
    return (text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function getEmbedding(text: string): Promise<number[]> {
    const extractor = await getExtractor();
    const result = await extractor(text, { pooling: 'mean', normalize: true });
    return result.tolist()[0] as number[];
}

export function cosineSimilarity(u: number[], v: number[]): number {
    let dot = 0;
    let nu = 0;
    let nv = 0;
    for (let i = 0; i < u.length; i++) {
        dot += u[i] * v[i];
        nu += u[i] * u[i];
        nv += v[i] * v[i];
    }
    if (nu === 0 || nv === 0) return 0;
    return dot / (Math.sqrt(nu) * Math.sqrt(nv));
}

// Frage + korrekte Antwort kombiniert embedden — trennt Duplikate deutlich besser
// als die reine Frage ("What is 12 x 12?" vs "How much is twelve times twelve?").
export async function getQuestionEmbedding(question: string, correctAnswer: string): Promise<number[]> {
    return getEmbedding(`Question: ${normalizeText(question)} [SEP] Answer: ${normalizeText(correctAnswer)}`);
}

export interface SimilarQuestion {
    question: string;
    correct_answer: string;
    embedding: number[] | null;
}

// Duplikat-Prüfung für eine neue Frage (Embedding der neuen Frage wird einmal
// vorab berechnet und hier nur noch mit dem Bestand verglichen):
// - Regel 1: identische (normalisierte) Antwort UND Fragen-Ähnlichkeit >= 0.60 → Duplikat
// - Regel 2: kombinierte Frage+Antwort-Ähnlichkeit >= 0.85 → Duplikat
// - Fallback ohne Embedding: identische Antwort UND identische Frage (normalisiert) → Duplikat
export function computeDuplicateCheck(
    newQuestionEmbedding: number[],
    question: string,
    correctAnswer: string,
    existing: SimilarQuestion[]
): { duplicate: boolean; similarTo?: string; similarity?: number } {
    const newQ = normalizeText(question);
    const newA = normalizeText(correctAnswer);

    for (const e of existing) {
        const answerIdentical = normalizeText(e.correct_answer) === newA;
        if (e.embedding && e.embedding.length > 0) {
            const sim = cosineSimilarity(newQuestionEmbedding, e.embedding);
            if ((answerIdentical && sim >= DUPLICATE_SAME_ANSWER_SIMILARITY) || sim >= DUPLICATE_SIMILARITY) {
                return { duplicate: true, similarTo: e.question, similarity: sim };
            }
        } else if (answerIdentical && normalizeText(e.question) === newQ) {
            return { duplicate: true, similarTo: e.question, similarity: 1 };
        }
    }
    return { duplicate: false };
}
