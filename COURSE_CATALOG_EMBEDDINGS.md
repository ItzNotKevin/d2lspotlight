# Waterloo course baseline embeddings

The catalog pipeline collects every course entry returned by the current public undergraduate and graduate academic calendars, then embeds its title, subject, and available description using the same pinned, normalized, 384-dimensional MiniLM model as Spotlight. It does not require Outline sign-in or an Open Data API key.

This inventory covers the selected current calendars, including courses not scheduled in the upcoming term. It is not an inventory of every retired course ever offered. Outline topics, teaching weeks, readings, and section-specific content remain a separate enrichment layer.

## Current local status — v0.3.1

This file describes **academic-calendar** course descriptions, not collected course outlines. The local manifest lists the 2026-2027 undergraduate calendar and Fall 2026 graduate calendar, both using the public Kuali calendar feed. Regeneration from the uploaded manifest produced 6,494 chunks and 6,249 unique vectors covering 6,467 courses. The build now packages this optional bundle; the worker uses description-vector similarity as a bounded course-relevance bonus. The resource must still qualify by keyword or resource-level semantic matching.

Real Fall 2026 outline discovery found 1,739 distinct URLs across 156 subjects. The generated outline-coverage.json records captured/embedded outlines by course, term and section. A uniquely matched outline replaces the calendar course-context boost; the calendar remains a fallback for missing or ambiguous matches. Explicit week-labelled study notes can use the matching outline’s weekly topics for retrieval; PDF extraction and nonweek resource-number associations remain unimplemented. See OUTLINE_EMBEDDINGS.md and GENERAL_SEMANTIC_SEARCH.md.

The sections below preserve the friend's earlier collection report. Paths on /Users/kevinli and prototype artifacts describe that machine, not files guaranteed to exist in this checkout.

## Earlier status and next step

Completed: all 6,467 current-calendar courses have descriptions and baseline vectors; the expanded title lookup is rebuilt into the extension; collection and encoding reuse are verified; 113 tests and the extension build pass. The supplied MATH 239 outline has a separate 22-vector prototype. No additional outlines have been embedded.

Next: connect the catalog bundle to the live search worker and combine description keyword matches with semantic course scores. Then collect outlines across subjects and terms, generate focused topic/week/reading vectors, and link them to indexed resources using course/term/section evidence. Model threshold tuning and validation across programs are required, particularly for weak short queries. The detailed ordered checklist is in [SEARCH_ROADMAP.md](SEARCH_ROADMAP.md).

## Where the embeddings are

The current files are inside `/Users/kevinli/d2lspotlight/`:

| File | Contains |
| --- | --- |
| [outline-data/catalog-embeddings/vectors-b048e7fdb156ff05ef24.f32](outline-data/catalog-embeddings/vectors-b048e7fdb156ff05ef24.f32) | All 6,249 unique course baseline vectors, covering 6,467 course identities; 9,598,464 bytes |
| [outline-data/catalog-embeddings/manifest.json](outline-data/catalog-embeddings/manifest.json) | Course metadata, exact embedding input text, chunk-to-vector mapping, dimensions, model/version signature, checksum, and coverage |
| [outline-data/catalog/inventory.json](outline-data/catalog/inventory.json) | Normalized source descriptions and metadata for all 6,467 courses |
| [outline-data/catalog-embeddings/outline-coverage.json](outline-data/catalog-embeddings/outline-coverage.json) | Pending outline enrichment statuses, tracked separately from complete baseline coverage |
| [outline-data/catalog-embeddings/query-checks.json](outline-data/catalog-embeddings/query-checks.json) | Actual exploratory query results, including observed retrieval weaknesses |
| [outline-data/math239-fall2026/vectors-a966563ad6ba2b25ab61.f32](outline-data/math239-fall2026/vectors-a966563ad6ba2b25ab61.f32) | The separate MATH 239 outline's 22 vectors; 33,792 bytes |
| [outline-data/math239-fall2026/manifest.json](outline-data/math239-fall2026/manifest.json) | MATH 239 topics, weeks, reading evidence, and vector mappings |

The `.f32` files are binary little-endian float32 vectors, not readable text. Use the accompanying `manifest.json` to inspect what was embedded and where each vector is stored, or use the CLI preview below. The hash in each vector filename changes when its contents change; the manifest's `vectorFile` field always identifies the active file.

These artifacts are local, ignored by Git, and not uploaded to Supabase. Since v0.3.1, a locally imported compatible catalog bundle is copied into the extension build and connected as a bounded course-relevance bonus. The bundled title lookup is already part of the rebuilt extension.

## Collect and embed

```sh
npm run update:course-catalog
npm run embed:catalog
npm run search:catalog -- outline-data/catalog-embeddings "cell division"
npm run search:catalog -- outline-data/catalog-embeddings "PD 1"
```

The collector discovers each catalog ID from Waterloo's public calendar page, reads the course list and metadata from the public feed used by that page, and requests each listed course's detail. The feed is a website implementation detail rather than a guaranteed public API contract, so the importer validates configuration and record identities before publishing an inventory. It uses four concurrent detail requests, a short delay between requests, bounded retries, and backoff for transient failures.

Each detail is saved immediately under `outline-data/catalog/details/`. Re-running resumes valid cached work, with a 24-hour cache lifetime; `--refresh` forces every detail to be retrieved again. `--out DIRECTORY` changes the collection directory. Failed or incomplete collections write a report and retain the previous complete inventory and bundled title snapshot. Duplicate course identities and unexpectedly small lists stop collection.

The inventory preserves the source catalog, academic level, course code, title, subject, description, cross-listed codes, effective date, and links to the published course and detail feed. Professional-development, co-op, and graduate suffix codes are included. Cross-listed course codes remain individually addressable. Prerequisite and antirequisite text is excluded from embedding input because it describes entry requirements rather than what the course teaches.

## Local artifacts

- `outline-data/catalog/inventory.json`: the complete normalized course inventory, source catalog counts, and description coverage.
- `outline-data/catalog/collection-report.json`: collection counts, reuse counts, and any failed detail requests.
- `outline-data/catalog-embeddings/manifest.json`: course metadata, exact encoded text, token counts, vector indices, model signature, input hashes, and baseline embedding coverage.
- `outline-data/catalog-embeddings/vectors-<hash>.f32`: unique normalized vectors as little-endian float32, verified against a checksum in the manifest.
- `outline-data/catalog-embeddings/outline-coverage.json`: a separate per-course outline enrichment status, initially `not-linked`. Generating catalog vectors does not link an outline to the baseline. Existing statuses are retained when rebuilding the baseline. The separate MATH 239 prototype bundle remains available and is not yet linked here.

The entire `outline-data/` directory is ignored by Git. These vectors are generated locally and are not uploaded or copied into the extension build. The existing bundled `src/search/catalog/waterloo.json` is updated with the complete calendar title list, so title-based course attribution can use the expanded inventory immediately after rebuilding the extension. Loading the precomputed description vectors into live resource ranking remains an integration task.

## Encoding and coverage

Every catalog entry receives at least one chunk. Its subject and title form the context prefix; available description text forms the body. A missing description results in an explicit `title-only` chunk, with no invented course topics. Description chunks split at sentence or word boundaries and fit within 256 actual model tokens, including special tokens. Long tails are retained instead of silently truncated.

Identical input text shares a vector without merging course identities. Unchanged text reuses a compatible saved vector. The encoder signature includes model revision, quantization, pooling, normalization, asset hash, and `catalog-v1` encoding policy. Catalog bundles and outline bundles are distinct. Each writer locks its output directory and publishes the manifest after the vector file is saved.

The CLI preview groups matches by course, taking the strongest chunk similarity, and returns ten candidates without a relevance cutoff. It is an inspection tool rather than a validated production ranking policy. A query consisting entirely of a course code returns that exact course without model inference. Topic searches do not return LEARN documents; those associations must be made using the user's actual course/resource records.

Completion means every entry from both source lists has a captured detail and at least one valid vector. The report separately identifies missing descriptions and pending outline enrichment. Collection success does not establish retrieval accuracy, so real query checks across different subject areas are recorded separately.

## Completed October 12, 2026

The 2026-2027 Undergraduate Studies Academic Calendar returned 4,343 courses, and the Fall 2026 Graduate Calendar returned 2,124 courses. All 6,467 distinct course codes across 156 subjects were collected with descriptions, with no failed detail requests and no title-only fallbacks.

The baseline contains 6,494 chunks and 6,249 unique vectors, covering every inventory entry. The binary vectors occupy 9,598,464 bytes, about 9.6 MB; text and metadata add separate storage. The maximum encoded chunk is 256 tokens. Initial encoding took approximately 24 seconds on this computer after model setup. Rebuilding unchanged input generated zero vectors and reused all 6,249.

The exploratory `outline-data/catalog-embeddings/query-checks.json` report records five candidates for each of seven real topic searches. Relevant courses appeared for cell division, Renaissance painting, quantum mechanics, and financial reporting. Short-query weaknesses remain: `counterpoint` did not retrieve MUSIC 270 even though its description explicitly includes species counterpoint, and `permutations and combinations` favored some broad graduate combinatorics courses. These findings support combining description keyword evidence with semantic scores and adding outline topic chunks during live ranking integration; baseline coverage is not an accuracy guarantee.
