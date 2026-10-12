# Integration report — October 12, 2026

## Recovery and incoming work

Local pre-merge work is preserved at `bcd912d` on `backup/local-search-2026-10-12`. Main was fast-forwarded from `d744637` to incoming `b959e6a`, then the local snapshot was merged with overlaps resolved deliberately. No private session data or generated model/index bundles were committed.

Incoming commits add local semantic workers and IndexedDB vectors, topic-frequency/hybrid ranking, scrolling fixes, synthetic model benchmarks, Waterloo calendar collection/title lookup, and outline text/JSON extraction with token-budgeted embeddings. All these tools remain available. Descriptive catalog/outline vector bundles described in the incoming docs were produced on the friend's machine and are ignored; those generated artifacts were not fetched by Git or reproduced here.

## Merge choices

| Area | Combined choice |
| --- | --- |
| Model execution | Incoming offscreen + module worker, persistent versioned/account-scoped IndexedDB vectors, two-minute idle release; remove duplicate local engine |
| Retrieval | Incoming title/context/course views, frequency weights, protected exact identities, topic-focused queries, hybrid blending, synthetic benchmarks |
| Local context | Preserve annotated/weekly filenames, professor/teacher note interpretation, broad STAT230 evidence, within-course newest week; no invented week topics |
| Course associations | Local automatic unique code pairing, known term conflict/duplicate confirmation, account-scoped persistence; use identical rules in worker and UI |
| Piazza | Preserve incoming full courseName/date fields and service results, plus local profile/header fallbacks and opaque-label recovery |
| Identifiers | Local shared filename-separator normalization; test assignment aliases both ways and keep course/numeric identifiers strict |
| Build | Incoming checksum-verified model setup/build, patched Vite 7.3.7 / Transformers.js 4.3.1, version 0.3.0 |
| Browser checks | Keep incoming persistence smoke test; add adapted local real content-script/broker/offscreen/worker/source-clear check |
| Catalog/outline | Keep incoming collection, CLI search, extraction, embedding, coverage and model benchmark scripts; do not claim live resource integration |

Semantic work waits 120 ms after typing; keyword results remain synchronous. The UI keeps the incoming **Meaning search** toggle, avoiding two competing settings. Known source bug status remains in BUGS_AND_NEXT_STEPS.md.

## Validation

- 127 unit/regression tests pass, including every incoming test and complementary local tests.
- Extension build passes. Vite reports the existing model chunk-size advisory.
- Local native inference passes sparse Enumeration vs chemistry and six course-subject cases.
- Actual disposable Chrome extension test passes content-script -> broker -> offscreen -> worker inference and persistent-vector deletion through the source-clear action.
- Dependency installation audit reports zero vulnerabilities.
- Signed-in LEARN/Piazza and actual Möbius launches remain manual checks. Smoke inference is not a relevance benchmark on real student data.

## Next work

1. Verify friendly Piazza course names, CS246/A2 queries, combined course/source filters and the known Möbius wrapper against actual accounts.
2. Pilot explicit one-course PDF indexing: sequential authenticated fetches, selectable text with page numbers, local IndexedDB text, progress/cancel/storage limits, snippets and keyword search before passage embeddings. OCR/handwriting later.
3. Integrate catalog/outline evidence into live ranking only with course/term/section checks; keep course-topic evidence separate from claims about individual document contents.
4. Collect labelled real queries, inspect similarity/cutoff rejection, and measure latency before tuning retrieval.

The integration is committed locally for reproducibility; pushing is separate.
