# Evaluate searches you actually use

The example file contains 24 authored queries and small synthetic resources/passages. It is a starting point for recording your own expectations, not a capture of live Waterloo courses or a claim about real-course accuracy.

Install the semantic model once, then run:

```sh
npm run setup:semantic
npm run evaluate:search
```

The command runs the real local embedding model, keyword/hybrid ranking, and document passage matching. It reports top-five document IDs, expected IDs, missed queries, hit@5, recall@5, and false positives for queries where no answer should exist. Multiple matching pages count as one document. Optional generated catalog/outline vector bundles and browser execution are excluded; Chrome checks cover the actual extension path separately. The report is a measurement and does not exit with an error merely because a query misses.

## Use private course examples locally

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

The initial run finds an expected document in the top five for 15 of 18 supported queries (83.3%). Mean recall@5 is 80.6%; none of the six no-answer queries returned a result. Known misses include `math239 textbook`, `cs246 choosing a method at runtime`, and `stat230 restricting the sample space`. Keep those misses visible rather than changing labels to make the score look better.

The set is small, synthetic, and already used during implementation. Treat it as a regression aid, not held-out evidence of real-course quality. Add your own cases before tuning the model or similarity cutoff. The separate 80-query metadata benchmark remains available through `npm run check:semantic`.
