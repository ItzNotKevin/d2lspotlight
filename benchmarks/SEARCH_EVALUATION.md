# Evaluate searches you actually use

The example file contains 24 authored queries and small synthetic resources/passages. It is a starting point for recording your own expectations, not a capture of live Waterloo courses or a claim about real-course accuracy.

Install the semantic model once, then run:

```sh
npm run setup:semantic
npm run evaluate:search
```

The command runs the real local embedding model, keyword/hybrid ranking, and document passage matching. It reports top-five document IDs, expected IDs, active filters, missed queries, hit@1, hit@5, recall@5, mean reciprocal rank at five (MRR@5), and false positives for queries where no answer should exist. Multiple matching pages count as one document. Optional generated catalog/outline vector bundles and browser execution are excluded; Chrome checks cover the actual extension path separately. The report is a measurement and does not exit with an error merely because a query misses.

## Use private course examples locally

Reports include the dataset SHA-256 hash, model ID, and run time. Each query's `missing` list identifies expected resources excluded by filters, excluded by query constraints, or absent from the top five. `hasDocumentText` records whether extracted text was supplied for that resource; it does not establish extraction quality. Use these clues to investigate a miss before adjusting ranking.

Copy `search-evaluation.example.json` into an ignored file such as `benchmark-results/my-courses.json`. Keep 20–30 natural queries, including:

- Exact resource names and course/assignment identifiers.
- Bare course numbers with multiple matching subjects.
- Textbook requests for differently named course notes.
- Paraphrases whose answers occur only inside a document.
- Queries with course, source, section, instructor, and recent filters.
- Plausible requests where your saved resources contain no answer.

Each resource needs a unique `id`, title, course, courseId, source, type, and its normal opening URL. Documents reference that `resourceId` and supply extracted `pages`, each with a positive `page` index and `text`. Office resources also need `documentFormat`, `documentUrl`, and the original viewer URL; their pages may specify a slide/paragraph `location`. Use physical PDF page numbers. Assign a resource's ID to a query's `relevant` array; use an empty array when no result should appear. Optional query `filters` use the app's filter fields. A top-level `history` object maps opened resource IDs to timestamps for recent-filter cases.

```sh
npm run evaluate:search -- benchmark-results/my-courses.json > benchmark-results/my-courses-report.json
```

Inference stays local with remote model loading disabled. The report includes your query text and resource IDs; keep private datasets and reports in ignored `benchmark-results/`. Do not add credentials or authenticated launch tokens to the dataset.

## Initial seed result

Rechecked October 25, 2026 on v0.8.0 using the installed local model: hit@1 **14/18 (77.8%)**, hit@5 **15/18 (83.3%)**, recall@5 **80.6%**, MRR@5 **0.806**, and no-answer false positives **0/6**. The three misses listed below remain unchanged. This run covers the synthetic seed only; no live account was used. All 254 automated tests passed after adding the metrics.

The initial run finds an expected document in the top five for 15 of 18 supported queries (83.3%). Mean recall@5 is 80.6%; none of the six no-answer queries returned a result. Known misses include `math239 textbook`, `cs246 choosing a method at runtime`, and `stat230 restricting the sample space`. Keep those misses visible rather than changing labels to make the score look better.

The set is small, synthetic, and already used during implementation. Treat it as a regression aid, not held-out evidence of real-course quality. Add your own cases before tuning the model or similarity cutoff. The separate 80-query metadata benchmark remains available through `npm run check:semantic`.
