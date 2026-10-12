# Work session memory — October 12, 2026

## User decisions
- Automatically associate one matching LEARN/Piazza course per normalized code. Ask for confirmation for duplicate candidates or conflicting known terms.
- Prioritize local semantic retrieval; keep keyword results immediate and exact identifiers strict.
- Next proposed milestone (planned, not implemented): index selectable-text lecture PDFs for one selected course, retain page-level text/snippets locally, then embed passages. Explicit indexing, progress/cancel, incremental refresh, size limits; OCR/handwriting later.

## Local implementation before integration
- v0.3.0: contextual filename/course inference, bidirectional assignment aliases including underscore filenames; optional local MiniLM embeddings of metadata, not PDF bodies.
- Unique cross-source associations plus account-scoped manual confirmations; retain source IDs and URLs.
- Transformers.js 4.3.1, Vite 7.3.7; local quantized MiniLM assets installed separately, runtime packaged in offscreen document; no remote inference.
- Semantic hits append after lexical results, obey filters/numeric identifiers, ignore stale requests, preserve selection; account changes close model cache.
- 74 tests passed; build and actual disposable Chrome extension inference/cache cleanup passed. Dependency installation audit reported zero vulnerabilities.
- Browser validation proves execution, not usefulness on real courses. User saw identical results with semantic toggle on/off; inspect candidate scores/cutoff/content before claiming relevance.

## Outstanding live bugs / limitations
- Piazza friendly course name may remain opaque ID mthaufbzhue5jn; CS246 A2 requires valid name, manual course-name save is fallback.
- Möbius uwmo.mobius.cloud/lti/advantage launch may still open empty LEARN wrapper; preserve authenticated LTI route, do not navigate directly to generic endpoint.
- Embeddings see metadata only. week_05_annotated cannot reveal taught topics without PDF/outline text.
- No PDF extraction, OCR, outline mapping, or deadline extraction implemented by this local increment.
- Model vectors memory-only; first query may be slow; cutoff 0.4 not calibrated on student queries.

## Handoff
User requests preserve this work, fetch friend's overlapping commits, review code/docs, and integrate the strongest parts. Snapshot branch/commit protects the uncommitted implementation. See LOCAL_SEMANTIC_SEARCH.md, CONTEXTUAL_SEARCH_PLAN.md, SEARCH_ROADMAP.md and BUGS_AND_NEXT_STEPS.md for details; integration may supersede their implementation descriptions.

## Integration result — October 12
- Incoming main b959e6a reviewed and pulled (six commits). Keep its worker/IndexedDB/hybrid/benchmark/catalog/outline architecture.
- Local snapshot bcd912d remains on backup/local-search-2026-10-12; combined main uses one runtime, not two.
- Bring over automatic/account-scoped confirmed associations into both UI and authoritative semantic broker, assignment separator fixes, filename/teacher-note/week inference, robust Piazza naming, version footer, faster 120 ms semantic pause, patched Vite, and actual content-script browser check.
- Local hard-coded concept aliases are not added to lexical ranking; incoming semantic retrieval handles these broader concepts and retains benchmark semantics.
- PDF indexing is still planned. Outline/catalog CLI generation exists incoming, but ignored vectors generated on the friend's machine are absent here and not connected to live retrieval.
- Updated implementation truth: SEMANTIC_SEARCH.md, LOCAL_SEMANTIC_SEARCH.md, INTEGRATION_REPORT.md. Old local-stage documents contain historical plans.
