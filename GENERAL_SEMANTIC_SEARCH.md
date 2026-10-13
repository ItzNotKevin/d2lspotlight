# General semantic retrieval — v0.3.1

## Changes

- Removed special STAT230/STAT231 subject mappings and the unused hand-authored concept groups.
- Removed teacher/professor/instructor-notes -> annotated-notes and annotations -> annotated replacements. Authorship is no longer asserted by query rewriting.
- Kept structural identifiers, source/course filters, assignment aliases, filename week extraction and existing generic subject abbreviations. Annotated filenames retain a resource-role fallback; this does not assert who annotated them.
- The model now compares the natural-language query as well as the simplified topic query with resource title/context vectors. Natural-language input keeps phrase relationships; only explicit identifiers/order operators are removed, because those are enforced separately.
- Imported the supplied checksummed public course-catalog bundle. The build emits an optional compact manifest and binary vectors under `dist/catalog/`. The worker verifies the checksum/model settings and uses the enrolled course's description vectors for a bounded course-relevance bonus.
- A course boost cannot independently create a resource match: keyword or resource-level semantic evidence is still required. Course descriptions are not treated as document contents.
- Waterloo catalog evidence applies to LEARN and Piazza classes linked to LEARN, not unrelated institutions' classes. Unknown course codes retain metadata/model matching without invented topic mappings.
- Resource embedding cache version advanced to v4. Catalog vectors encoded with the same actual model/assets/pooling remain compatible despite the older resource metadata cache version.

## Setup and untracked data

```sh
npm run import:catalog -- /path/to/manifest.json
npm run build
```

The manifest's named `.f32` file must be beside it. Imports stay ignored by Git. No course collection or network scrape is performed by import. Friends must copy/import both files locally or generate their own compatible catalog bundle. A keyword/metadata-only build works without catalog artifacts.

For testing, reload extension/tabs, verify v0.3.1 and enable **Meaning search**. Try natural descriptions of actual resource titles, and course-topic queries; inspect **Related meaning** results. Lack of differences can still mean lexical overlap, missing content, or a similarity below the cutoff. The model cutoff and max-of-query-views approach need real-query evaluation, particularly no-answer false positives.

## Outline dates and next work

See [OUTLINE_PARSING_RESULTS.md](OUTLINE_PARSING_RESULTS.md). The full Fall 2026 collection now supports explicit weeks and typed lecture/module/unit/chapter/dated/topic entries with raw date labels. Calendar-to-week mapping, nonweek filename associations and PDF passage extraction remain separate work.

## Validation

148 tests pass; extension build and local native inference pass. The actual disposable Chrome test confirms all 6,467 catalog courses load with 6,249 vectors, resource inference works, and source-clear deletes account-scoped embedding caches. This establishes execution and invariants, not broad retrieval accuracy on real PDFs. The packaged catalog occupies about 13 MiB. No PDF scraping was performed.

## Real outlines

Authenticated current-term outline collection is implemented in `scripts/collect-outlines.mjs`. Builds verify and package the default `outline-data/embeddings` bundle. The worker prefers a unique matching term/section outline over calendar context, and uses only one of those sources for its bounded course boost. Unknown terms, unmatched sections and duplicate outline candidates fall back to the calendar. Explicit week-labelled study notes now use the matching outline’s weekly topic vectors for retrieval and show an “Outline suggests Week …” label. PDF contents remain unverified. See OUTLINE_EMBEDDINGS.md for collection, build and coverage commands.
