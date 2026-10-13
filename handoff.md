# Developer handoff — October 12, 2026

## PDF implementation update

v0.4.0 adds bounded local selectable-text PDF indexing, verified page snippets and direct page links, course/notes-section/instructor filters, cancellation, account/revision isolation and IndexedDB caching. See [PDF_CONTENT_SEARCH.md](PDF_CONTENT_SEARCH.md). `npm run check:pdf:extension` tests the built extension with intercepted LEARN responses and real fixture PDFs. Live STAT 230 file access and native viewer landing still need the user's browser check. OCR, exact paragraph highlighting and passage embeddings remain future work. The older queue item below describing PDF extraction as unimplemented is superseded by this update.

Start here after pulling `main`. This is the current work queue; older research and checklist documents preserve historical plans. Do not interpret their old unchecked items as the current implementation state.

## What is done

- v0.3.1 runs optional local hybrid search through an offscreen page and worker, with account-scoped persistent resource embeddings.
- Compatible catalog and outline bundles are packaged during build. A unique course/term/section outline replaces calendar context; calendar vectors remain the fallback. Explicit week-labelled study notes can retrieve outline weekly topics and display `Outline suggests Week …`. This is schedule evidence, not extracted document content.
- Collected all 1,739 discovered Fall 2026 outlines across 156 subjects and 1,682 course codes with zero failures. Capture version 4 preserves bounded schedule structure and merged-cell geometry for offline reparsing.
- Structural adapters cover explicit weeks plus lecture/module/unit/chapter/dated/calendar/topic plans. Weekly coverage is **775/1,739 (44.57%)**, up from 497 (28.58%); all structured teaching coverage is **1,123 (64.58%)**. **1,089 (62.62%)** have topic text. Reference-only plans do not create topic vectors. See [results and limitations](OUTLINE_PARSING_RESULTS.md).
- Stale extension-context cleanup, root replacement, captured storage-listener cleanup, cached manifest version and guarded semantic cancellation address the reported undefined `onChanged`/`getManifest` failures.
- 148 unit tests, native outline embedding checks, build and disposable Chrome integration checks pass. Browser checks cover dialog rendering, simulated stale-root recovery, inference, cache cleanup and real STAT 230 outline evidence with fixture notes: Week 5 scores 0.6194 versus Week 6 at 0.4393 for `probability mass functions notes`.

Full actual extension reload was not browser-verified: its CDP action test timed out, so the recovery check simulates an invalidated root. The `waterloo.json` failed-script report's origin remains unconfirmed; the project injects `dist/spotlight.js`, not JSON. Do not claim these checks validate the user's current saved resources or broad retrieval accuracy.

## Setup and artifacts your clone will not contain

```sh
npm ci
npm test
npm run setup:semantic
npm run build
```

Load the repository root as an unpacked extension. The root `manifest.json` is the Chrome manifest; `outline-data/catalog-embeddings/manifest.json` is embedding data and must not be loaded as an extension. After rebuilding, reload the extension **and refresh existing LEARN/Piazza tabs**. Enable Meaning search for semantic checks.

Git ignores `dist/`, `semantic-assets/`, `outline-data/`, models and benchmark outputs. Pulling code alone will not reproduce the measured outline corpus or package its topic vectors. Obtain compatible artifacts separately from Alan or regenerate them:

- Catalog: import both `manifest.json` and its named `.f32` file with `npm run import:catalog -- /path/to/manifest.json`, or use the catalog collection/embedding scripts documented in [COURSE_CATALOG_EMBEDDINGS.md](COURSE_CATALOG_EMBEDDINGS.md).
- Outline parser work: obtain `outline-data/collected/F26/`, including `collection.json`, `outlines.json` and per-outline JSON with `scheduleSource`.
- Runtime outline evidence: obtain `outline-data/embeddings/manifest.json` and its named `.f32`, or regenerate from the source corpus. Current bundle: 36,812 unique vectors, 39,632 chunks, 56,543,232 vector bytes. Never substitute an incompatible model bundle.
- Regeneration currently uses macOS Chrome AppleEvents: sign in to the Outline viewer, enable **Allow JavaScript from Apple Events**, then run `npm run collect:outlines -- --term F26`. This requires the catalog subject inventory. Read [OUTLINE_EMBEDDINGS.md](OUTLINE_EMBEDDINGS.md) first.

Only exchange authorized source/artifact data. Cookies, CSRF tokens, private Piazza posts and user resource indexes must stay out of Git.

## Work on these next, in order

1. **Validate actual reported failures.** On authorized live accounts, retry `probability mass functions notes`, Piazza `cs246 a2`, and Möbius launch. Check indexed resources, filters, friendly course names, matching term/section and diagnostics before changing thresholds. The detailed cases and acceptance criteria are in [BUGS_AND_NEXT_STEPS.md](BUGS_AND_NEXT_STEPS.md). For Möbius, inspect the actual LEARN launch; do not open a context-dependent `/lti/advantage` endpoint as a plain URL. Verify repeated injection and a real extension reload followed by reopening on the same tab.
2. **Evaluate search quality.** Collect a sanitized labelled query set across subjects: exact identifiers, paraphrases, generic filenames, no-answer queries and wrong-course distractors. Measure recall@5, wrong-course results, false positives and latency. Current smoke checks establish execution, not retrieval accuracy. Start at `src/search/semantic/worker.js`, `src/search/outlines/live.js`, `src/search/hybrid.js` and `tests/live-catalog.test.js`.
3. **Improve remaining outline parsing with evidence.** There are 473 unsupported/prose plans, 100 external schedule referrals and 43 outlines with no plan found. Inspect saved `scheduleSource` blocks, choose a recurring layout, add a minimized fixture to `tests/outline-schedule.test.js`, then improve `src/search/outlines/schedule.js` and compare coverage. Dense cells can still mix tutorial/admin wording with topics. Separate those roles before increasing coverage through looser heuristics. External referrals need additional authorized source documents. Lecture/module/date numbers must never become guessed weeks.
4. **Add PDF content search in stages.** Implement bounded selectable-text extraction, page evidence, local caching, progress/cancellation and keyword snippets first; evaluate passage embeddings afterward. PDF text, OCR, handwriting and full Piazza-thread indexing are not implemented. Keep inferred outline topics distinct from verified file contents.
5. **Make delivery reproducible.** Validate a clean clone with transferred or regenerated compatible bundles, document storage/latency costs and decide how friends receive updates. Shared hosting/Supabase delivery is not implemented. Nonweek filename-to-entry associations and calendar-to-week mapping also need explicit course scheduling evidence before shipping.

## Parser iteration and verification

```sh
npm test
npm run reparse:outlines
npm run report:outlines
npm run embed:outlines -- outline-data/collected/F26/outlines.json
npm run check:outlines
npm run build
npm run check:semantic:extension
git diff --check
```

Reparse/report require the ignored source corpus and catalog manifest. Embedding needs local model assets. Run embedding after extraction is stable, then build; do not change the corpus while embedding runs. The browser check uses a disposable Chrome profile and fixture resources. Record gained/lost weekly plans, typed coverage and plans with topic text separately; more parsed entries alone do not prove correctness.

Useful references: [parsing results](OUTLINE_PARSING_RESULTS.md), [layout strategy and source examples](OUTLINE_PARSING_STRATEGY.md), [embedding pipeline](OUTLINE_EMBEDDINGS.md), [semantic search](SEMANTIC_SEARCH.md), and [session history](WORK_SESSION_MEMORY.md).
