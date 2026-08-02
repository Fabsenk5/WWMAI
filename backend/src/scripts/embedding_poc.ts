import { pipeline } from '@xenova/transformers';

// PoC: Lokale Embeddings (all-MiniLM-L6-v2) für die Duplikat-Erkennung der Fragen-Pipeline.
// Läuft einmalig: npx ts-node src/scripts/embedding_poc.ts
// Misst Qualität (Ähnlichkeits-Schwellen), Latenz und RAM-Verbrauch.

interface TestPair {
    name: string;
    a: string;
    b: string;
    expectSimilar: boolean; // true = soll als Duplikat erkannt werden
}

const pairs: TestPair[] = [
    // Echte Duplikate
    { name: 'exact-dup', a: 'What is the capital of France?', b: 'What is the capital of France?', expectSimilar: true },
    { name: 'case-space-dup', a: 'What is the capital of France?', b: ' what is the capital of FRANCE? ', expectSimilar: true },
    // Paraphrasen
    { name: 'paraphrase-1', a: 'What is the capital of France?', b: 'Which city serves as the capital of France?', expectSimilar: true },
    { name: 'paraphrase-2', a: 'Who painted the Mona Lisa?', b: 'The Mona Lisa was painted by whom?', expectSimilar: true },
    { name: 'paraphrase-3', a: 'What is the chemical symbol for gold?', b: 'Which element has the chemical symbol Au?', expectSimilar: true },
    // Gleiches Sub-Topic, andere Formulierung
    { name: 'same-subtopic-1', a: 'What is the largest planet in our solar system?', b: 'Which planet is the biggest in our solar system?', expectSimilar: true },
    { name: 'same-subtopic-2', a: 'Who developed the theory of relativity?', b: 'Which scientist is famous for the theory of relativity?', expectSimilar: true },
    { name: 'same-subtopic-3', a: 'What is 12 x 12?', b: 'How much is twelve times twelve?', expectSimilar: true },
    // Verwandt, aber verschieden genug (soll durchkommen)
    { name: 'related-ok-1', a: 'What is the capital of France?', b: 'What is the population of Paris?', expectSimilar: false },
    { name: 'related-ok-2', a: 'What is the chemical symbol for gold?', b: 'What is the atomic number of gold?', expectSimilar: false },
    { name: 'related-ok-3', a: 'Who painted the Mona Lisa?', b: 'Where is the Mona Lisa displayed today?', expectSimilar: false },
    { name: 'related-ok-4', a: 'What is the largest planet in our solar system?', b: 'How many moons does Jupiter have?', expectSimilar: false },
    // Komplett verschieden
    { name: 'unrelated-1', a: 'What is the capital of France?', b: 'What is 2 + 2?', expectSimilar: false },
    { name: 'unrelated-2', a: 'Who painted the Mona Lisa?', b: 'What is the boiling point of water?', expectSimilar: false },
    { name: 'unrelated-3', a: 'What is the chemical symbol for gold?', b: 'Which bird is known as a symbol of peace?', expectSimilar: false },
];

function cosine(u: number[], v: number[]): number {
    let dot = 0, nu = 0, nv = 0;
    for (let i = 0; i < u.length; i++) {
        dot += u[i] * v[i];
        nu += u[i] * u[i];
        nv += v[i] * v[i];
    }
    return dot / (Math.sqrt(nu) * Math.sqrt(nv));
}

async function main() {
    const tLoad = Date.now();
    console.log('[PoC] Lade Embedding-Modell (erster Lauf lädt ~23MB von HuggingFace Hub)...');
    const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log(`[PoC] Modell geladen in ${((Date.now() - tLoad) / 1000).toFixed(1)}s`);

    // Einzel-Call Latenz (wie beim Insert-Gate: 1 Frage pro Prüfung)
    const tWarm = Date.now();
    await embedder('warmup text for latency measurement', { pooling: 'mean', normalize: true });
    const singleMs = Date.now() - tWarm;

    // Batch-Lauf für alle Test-Texte (wie beim Cleanup-Backfill)
    const texts: string[] = [];
    pairs.forEach(p => { texts.push(p.a); texts.push(p.b); });

    const memBefore = process.memoryUsage();
    const tBatch = Date.now();
    const results = await embedder(texts, { pooling: 'mean', normalize: true });
    const batchMs = Date.now() - tBatch;
    const memAfter = process.memoryUsage();

    const vecs = results.tolist() as number[][];
    console.log(`[PoC] Embedding-Dimension: ${vecs[0].length}`);

    // Runde 2: Frage + korrekte Antwort kombiniert embedden (wie das Insert-Gate es tun würde)
    console.log('\n=== Runde 2: Frage + Antwort kombiniert ("Frage [SEP] Antwort") ===');
    const pairsQA: TestPair[] = [
        { name: 'dup-12x12', a: 'What is 12 x 12?', b: 'How much is twelve times twelve?', expectSimilar: true },
        { name: 'dup-gold', a: 'What is the chemical symbol for gold?', b: 'Which element has the chemical symbol Au?', expectSimilar: true },
        { name: 'dup-capital', a: 'What is the capital of France?', b: 'Which city serves as the capital of France?', expectSimilar: true },
        { name: 'diff-capital-vs-pop', a: 'What is the capital of France?', b: 'What is the population of Paris?', expectSimilar: false },
        { name: 'diff-gold-symbol-vs-number', a: 'What is the chemical symbol for gold?', b: 'What is the atomic number of gold?', expectSimilar: false },
        { name: 'diff-mona-painter-vs-location', a: 'Who painted the Mona Lisa?', b: 'Where is the Mona Lisa displayed today?', expectSimilar: false },
    ];
    const textsQA: string[] = [];
    pairsQA.forEach(p => {
        textsQA.push(`Question: ${p.a} [SEP] Answer: Paris, Leonardo da Vinci, Au, 144, 2.1 million, Jupiter`);
        textsQA.push(`Question: ${p.b} [SEP] Answer: Paris, Leonardo da Vinci, Au, 144, 2.1 million, Jupiter`);
    });
    const resultsQA = await embedder(textsQA, { pooling: 'mean', normalize: true });
    const vecsQA = resultsQA.tolist() as number[][];
    // Hinweis: Platzhalter-Antworten — echtes Gate nutzt die korrekte Antwort der jeweiligen Frage
    const simQA = pairsQA.map((p, i) => cosine(vecsQA[i * 2], vecsQA[i * 2 + 1]));
    pairsQA.forEach((p, i) => {
        console.log(`${(p.expectSimilar ? (simQA[i] >= 0.75 ? 'OK ' : '!! ') : (simQA[i] < 0.8 ? 'OK ' : '!! '))} ${p.name.padEnd(18)} sim=${simQA[i].toFixed(3)}  (${p.expectSimilar ? 'soll ähnlich' : 'soll verschieden'})`);
    });
    // Echter Test: korrekte Antworten pro Frage verwenden
    const realQA: TestPair[] = [
        { name: 'real-12x12', a: 'What is 12 x 12? [SEP] 144', b: 'How much is twelve times twelve? [SEP] 144', expectSimilar: true },
        { name: 'real-gold', a: 'What is the chemical symbol for gold? [SEP] Au', b: 'Which element has the chemical symbol Au? [SEP] Au', expectSimilar: true },
        { name: 'real-capital-vs-pop', a: 'What is the capital of France? [SEP] Paris', b: 'What is the population of Paris? [SEP] About 2.1 million', expectSimilar: false },
    ];
    const realTexts: string[] = [];
    realQA.forEach(p => { realTexts.push(p.a); realTexts.push(p.b); });
    const realResults = await embedder(realTexts, { pooling: 'mean', normalize: true });
    const realVecs = realResults.tolist() as number[][];
    console.log('\n=== Runde 3: Frage [SEP] korrekte Antwort (realistisch) ===');
    realQA.forEach((p, i) => {
        const sim = cosine(realVecs[i * 2], realVecs[i * 2 + 1]);
        const ok = (p.expectSimilar && sim >= 0.75) || (!p.expectSimilar && sim < 0.8);
        console.log(`${ok ? 'OK ' : '!! '} ${p.name.padEnd(18)} sim=${sim.toFixed(3)}  (${p.expectSimilar ? 'soll ähnlich' : 'soll verschieden'})`);
    });

    console.log('\n=== Ähnlichkeits-Matrix (Paarweise) ===');
    let worstSimilar = 1;   // niedrigste Sim unter "soll erkannt werden"
    let bestDifferent = 0;  // höchste Sim unter "soll durchkommen"

    pairs.forEach((p, i) => {
        const sim = cosine(vecs[i * 2], vecs[i * 2 + 1]);
        if (p.expectSimilar) worstSimilar = Math.min(worstSimilar, sim);
        else bestDifferent = Math.max(bestDifferent, sim);
        const ok = (p.expectSimilar && sim >= 0.8) || (!p.expectSimilar && sim < 0.88);
        console.log(`${ok ? 'OK ' : '!! '} ${p.name.padEnd(18)} sim=${sim.toFixed(3)}  (${p.expectSimilar ? 'soll ähnlich' : 'soll verschieden'})`);
    });

    console.log(`\n=== Ergebnisse ===`);
    console.log(`Niedrigste Sim bei "soll erkannt":   ${worstSimilar.toFixed(3)}`);
    console.log(`Höchste Sim bei "soll durchkommen":  ${bestDifferent.toFixed(3)}`);
    console.log(`Empfohlene Schwelle (Mittelpunkt):   ~${(((worstSimilar + bestDifferent) / 2)).toFixed(3)}`);
    console.log(`(Sicherer Bereich für Gate: zwischen ${bestDifferent.toFixed(3)} und ${worstSimilar.toFixed(3)})`);

    console.log(`\n=== Ressourcen (lokal, Indikator für Render Free Tier 512MB) ===`);
    console.log(`Einzel-Call Latenz (Warmup): ${singleMs}ms`);
    console.log(`Batch ${texts.length} Texte: ${batchMs}ms (~${(batchMs / texts.length).toFixed(0)}ms/Text)`);
    console.log(`RAM heapUsed-Delta: ${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(1)} MB`);
    console.log(`RAM RSS total: ${(memAfter.rss / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => {
    console.error('[PoC] Fehler:', err);
    process.exit(1);
});
