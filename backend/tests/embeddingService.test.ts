import {
    normalizeText,
    cosineSimilarity,
    computeDuplicateCheck,
    DUPLICATE_SIMILARITY,
    DUPLICATE_SAME_ANSWER_SIMILARITY,
} from '../src/services/embeddingService';
import type { SimilarQuestion } from '../src/services/embeddingService';

// Pure functions only — no model loading, no @xenova/transformers import needed.

const makeExisting = (q: string, a: string, emb: number[] | null): SimilarQuestion => ({
    question: q,
    correct_answer: a,
    embedding: emb,
});

// Simple deterministic fake vectors for similarity control:
// [1,0,0,...] is orthogonal to [0,1,0,...], identical to itself.
const V_A = [1, 0, 0, 0, 0, 0, 0, 0];
const V_B = [0.9, 0.2, 0, 0, 0, 0, 0, 0]; // ~0.98 similarity to V_A
const V_C = [0.5, 0.5, 0, 0, 0, 0, 0, 0]; // ~0.71 similarity to V_A
const V_ORTHO = [0, 1, 0, 0, 0, 0, 0, 0];

describe('normalizeText', () => {
    it('lowercases, trims and collapses whitespace', () => {
        expect(normalizeText('  What IS   the capital of FRANCE?  ')).toBe('what is the capital of france?');
    });
});

describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors and 0 for orthogonal ones', () => {
        expect(cosineSimilarity(V_A, V_A)).toBeCloseTo(1, 5);
        expect(cosineSimilarity(V_A, V_ORTHO)).toBeCloseTo(0, 5);
    });

    it('returns 0 for empty/zero vectors instead of NaN', () => {
        expect(cosineSimilarity([], [1, 2])).toBe(0);
        expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
});

describe('computeDuplicateCheck', () => {
    it('rejects a near-identical question with the same answer (same-answer rule)', () => {
        const result = computeDuplicateCheck(V_B, 'What is 12 x 12?', '144', [
            makeExisting('How much is twelve times twelve?', '144', V_A),
        ]);
        expect(result.duplicate).toBe(true);
        expect(result.similarTo).toBe('How much is twelve times twelve?');
    });

    it('rejects a question above the combined similarity threshold', () => {
        const result = computeDuplicateCheck(V_A, 'What is the capital of France?', 'Paris', [
            makeExisting('Which city serves as the capital of France?', 'Paris', V_B),
        ]);
        expect(result.duplicate).toBe(true);
    });

    it('accepts related but distinct questions', () => {
        const result = computeDuplicateCheck(V_ORTHO, 'What is the capital of France?', 'Paris', [
            makeExisting('What is the population of Paris?', 'About 2.1 million', V_A),
        ]);
        expect(result.duplicate).toBe(false);
    });

    it('uses the exact-match fallback when no embedding is available', () => {
        const result = computeDuplicateCheck([], 'What is 2 + 2?', '4', [
            makeExisting('what is 2 + 2?', '4', null), // same normalized question + answer
        ]);
        expect(result.duplicate).toBe(true);

        const distinct = computeDuplicateCheck([], 'What is 2 + 2?', '4', [
            makeExisting('What is 2 + 3?', '5', null),
        ]);
        expect(distinct.duplicate).toBe(false);
    });

    it('exposes sane calibrated thresholds for the PoC results', () => {
        // PoC: worst "should be caught" was 0.613 (same answer), best "should pass" was 0.788
        expect(DUPLICATE_SAME_ANSWER_SIMILARITY).toBeLessThanOrEqual(0.65);
        expect(DUPLICATE_SAME_ANSWER_SIMILARITY).toBeGreaterThanOrEqual(0.55);
        expect(DUPLICATE_SIMILARITY).toBeGreaterThanOrEqual(0.80);
        expect(DUPLICATE_SIMILARITY).toBeLessThanOrEqual(0.90);
    });
});
