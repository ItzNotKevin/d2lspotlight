# Real outline collection and local embeddings

The development importer turns UTF-8 outline text or structured JSON into reusable course, topic, weekly, and reading embeddings. It uses the same pinned MiniLM model as the extension, with native CPU inference, mean pooling, normalization, and 384 dimensions. It runs without remote model loading or course-data uploads.

The collector reads real term-specific outlines through your signed-in Chrome viewer. The embedding pipeline produces a local bundle and a command-line search preview. Builds package the bundle for Spotlight, where a uniquely matched course/term/section outline replaces calendar context in the bounded course-relevance boost. For study notes with an explicit week number, the worker also compares the query against that week’s topic vectors in the uniquely matched outline. This can retrieve a generic filename such as `week_05_annotated`; the result is labelled “Outline suggests Week 5.” It is evidence from the planned schedule, not verification of PDF contents. Document passage extraction remains separate work.

[The course catalog baseline pipeline](COURSE_CATALOG_EMBEDDINGS.md) provides a separate vector layer for every entry in the current undergraduate and graduate calendars, including courses whose outline has not yet been collected.

## Current collection — October 12, 2026

Authenticated discovery searched all 156 subjects from the current calendar inventory for Fall 2026 and found 1,739 distinct outline URLs. This is a term-specific viewer inventory, not a guarantee that every university course publishes an outline. Completed locally: **1,739 outlines captured and embedded, 1,682 course codes, zero failed subjects/captures, 36,812 unique vectors**. All captures use version 4. There are 775 explicit weekly plans (44.57%), 1,123 structured teaching plans (64.58%), and 1,089 plans with topic text (62.62%). 4,859 weekly entries retain date labels. Residual schedule text remains in 1,542 outlines, including parsed plans. See [OUTLINE_PARSING_RESULTS.md](OUTLINE_PARSING_RESULTS.md) for definitions and limitations. Coverage is recorded in `outline-data/collected/F26/coverage.json`; collection progress is in `collection.json`.

The calendar and outlines serve different purposes. A matching real outline takes precedence; the calendar supplies fallback context when an outline is missing, the resource term is unknown, or its section cannot be matched uniquely. They are never added together as two course-evidence boosts. Keep the single calendar bundle for that fallback. Never substitute a different section or term's schedule.

## Collect and build

On macOS, open a signed-in `https://outline.uwaterloo.ca/viewer/` tab in Chrome. Enable **View → Developer → Allow JavaScript from Apple Events**. The collector uses observed read-only viewer search/detail routes with the browser's existing session; it does not export cookies or save authentication tokens.

```sh
npm run collect:outlines -- --term F26
npm run embed:outlines -- outline-data/collected/F26/outlines.json
node scripts/report-outline-coverage.mjs outline-data/collected/F26
npm run build
npm run search:outlines -- outline-data/embeddings "stat230 week 5"
```

Collection resumes from its checkpoint when rerun, skipping captures from the current adapter version and retrying failures. Use `--refresh` to recapture changed published outlines. `--subjects STAT,CS,MATH` limits discovery; default discovery uses the current calendar subjects. `--outline nc3jfs` refreshes only an already-discovered outline (comma-separated IDs are supported); `--out DIRECTORY` changes the source output location. Embedding's default output `outline-data/embeddings` is the bundle the build consumes. Do not run an isolated Chrome test during collection; macOS Apple Events can lose its connection when that test browser exits. The helper reconnects if macOS reports that Chrome is not running. Close the Outline tab or disable Apple Events after collection if desired.

Sources are normalized into one JSON file per outline; `outlines.json` is the derived bulk embedding input. Raw HTML, contact sections and policy text are not stored as another searchable corpus. Course descriptions, outcomes, readings and weekly topics retain source URLs and evidence. Schedules that cannot be parsed stay as source text and receive a warning; they can contribute topic context but do not create week associations. Authentication failures stop collection rather than marking courses absent. Shared hosting is not implemented.

## Verified viewer routes

The viewer's own JavaScript uses `GET /viewer/api/search/?q=SUBJECT%20TERM`. Searches return term, course codes, section labels and observed `/viewer/view/<id>` URLs. The collector only reads those two route families; it does not use author/admin exports, guess outline IDs, or access account tokens. A batch has at most three fetch workers, each pausing between requests. Every completed batch checkpoints normalized records locally.

## Generate a bundle

Run `npm run setup:semantic` if the model files have not been downloaded, then:

```sh
npm run embed:outlines -- --out outline-data/example outline-data/course.txt
npm run search:outlines -- outline-data/example "recurrence relations notes"
```

Optional single-outline metadata overrides are `--course`, `--title`, `--term`, and `--source-url`. Each takes its value as the next argument. Quote values containing spaces. For bulk imports, provide multiple files or a JSON array of outlines; include each outline's own metadata rather than applying one override to multiple courses.

Generated bundles contain:

- `manifest.json`: extracted outline data, publication metadata, warnings, source evidence, the exact text and token count of each chunk, reading references, model signature, text hashes, and vector indices.
- `vectors-<hash>.f32`: unique normalized vectors stored as little-endian float32 values, with a checksum in the manifest.

The default output is `outline-data/embeddings`. The entire `outline-data/` directory is ignored by Git. The build verifies and copies the compact runtime manifest and current vectors from `outline-data/embeddings` into `dist/outlines`; source captures stay outside the build. Use it for imported source files as well as generated data. Changing a bundle creates a new content-addressed vector file; obsolete generated vector files are removed after a successful manifest update. The manifest points to the current file.

## What is extracted

Text imports recognize common headings for course descriptions, learning outcomes/objectives, topics, reading lists, and weekly plans. They support numbered/Markdown headings, repeated table-of-contents headings, tab-separated or Markdown weekly tables, the vertically pasted schedule used by the supplied Waterloo example, and `Week 1: ...` lists. Different source formats can use structured JSON directly.

Reading aliases come from definitions inside the document, such as `COUNT=Counting notes`; no particular course abbreviation is built into the extractor. Named readings in tables or bullet lists can resolve explicit references to the same title. Generic citations such as “Chapter 2” remain unresolved when the source does not identify the book. The importer does not infer an assignment's topic from its due date.

Administrative policies, contact details, class meeting locations, and grading sections are excluded from the embedding sections. Course code, term, section numbers, week numbers, date labels, and reading-section citations are retained as metadata instead of being added to every vector's text. Weekly topics include the human course title and names of explicitly associated readings.

The course overview uses the first description paragraph and learning outcomes. If these are absent, it uses available topic or weekly text. Other description paragraphs, outcomes, topic sections, weeks, and named readings receive their own focused views. Long text is split at sentence boundaries, with word-based splitting for oversized sentences. Every final input is measured with the actual model tokenizer and must fit within 256 tokens, including its repeated course context and special tokens. The text is not silently truncated. URLs and tracking parameters stay in source/reading metadata rather than semantic input (`outline-v2`).

An unsupported schedule layout produces a warning and no invented weekly associations. Missing terms also produce a warning; resource associations must verify the term separately. The text importer is a first set of layout adapters, not a universal outline reader. PDF extraction, OCR, assessment extraction, and arbitrary prose-to-resource inference are not included. Authenticated HTML viewer collection is implemented separately by the collector.

## Structured input

```json
{
  "id": "synthetic-biology-outline",
  "course": "BIO 100",
  "title": "Cell Biology",
  "term": "Fall 2026",
  "sections": ["001"],
  "description": ["Cell structures and reproduction."],
  "outcomes": ["Explain mitosis and meiosis."],
  "topics": [{"heading": "Cell reproduction", "text": "Chromosomes and cellular division."}],
  "weeks": [{
    "week": 2,
    "topics": "Mitosis and meiosis",
    "references": [{"name": "Biology notes", "citation": "Chapter 2", "resolved": true}]
  }],
  "readings": [{"name": "Biology notes"}]
}
```

The example is synthetic. Use `resolved: true` only when the source explicitly associates the named resource with that topic or week. Optional `evidence` fields preserve headings or other source references. A course code, title, and at least one usable description, outcome, topic, or week are required. Other fields can be absent.

## Reuse and validation

The importer verifies the installed model files against the pinned setup manifest before encoding. The bundle records the model revision, asset hash, encoding policy, dimensions, and pooling/normalization settings. Unchanged input text reuses compatible saved vectors, including across outline versions. Changes to the normalized outline produce a different version key, while identical embedding text can still reuse a vector. Corrupt or incompatible saved bundles are rebuilt; preview queries reject incompatible model signatures.

The writer uses an output-directory lock and publishes the manifest after the vector file has been saved. Re-running the same import replaces the current manifest and does not append duplicate chunks. To produce a complete replacement bundle, supply all outlines intended for that bundle on each run.

```sh
npm test
npm run check:outlines
```

Unit checks cover diverse heading and schedule layouts, generic/named reading references, missing metadata, exclusion of administrative text, token-budget splitting, binary vector integrity, and bundle checksums. The native model check uses synthetic biology, history, accounting, music, computing, and physics examples, plus a long passage whose final content must survive splitting. These smoke checks establish functionality; they do not establish production retrieval accuracy across real programs.

The supplied MATH 239 Fall 2026 text has also been processed locally. Its bundle is at `outline-data/math239-fall2026`. It contains 22 vectors including all 13 teaching weeks. Preview searches for recurrence relations retrieve Week 5 with Enumeration reading sections 3.2, 3.3, and 4.1; Hall's theorem retrieves Week 13 with Graph Theory section 8.6. The binary vectors occupy 33 KiB; the manifest adds extracted text and metadata. A second unchanged import reuses all 22 vectors.

The preview applies exact course-code and week constraints and uses a provisional `0.4` similarity cutoff for topic queries. Week operators stay out of semantic query text. Metadata-only searches such as `MATH239 week 5` return matching chunks without running query inference and display a null similarity score. It returns outline chunks and their references, not LEARN resources or guaranteed document contents. Live Spotlight performs course/term/section matching and can associate explicitly week-labelled study notes with the matching weekly topic vectors. Dated schedules now contribute course context. Calendar-to-week mapping, lecture-number filename associations, named-reading matching and PDF passage verification remain separate work.

## Headerless schedule tables

The parser supports two-column tables with repeated explicit `W`, `Wk` or `Week` labels, even without column headings. It preserves dates from labels such as `W2 - Sep 14 & 16` and merges blank-week continuation rows into the preceding teaching week. Cancelled lectures, reading weeks, makeup days and other unmatched rows remain in unparsed schedule text. Unnumbered sessions do not receive guessed week numbers. Headerless tables with extra columns require evidence for their column roles; ambiguous layouts remain unparsed.

The ACTSC 363 outline `nc3jfs` was refreshed with this parser: 11 teaching weeks (W2–W12), with continued topics correctly retained for W2 and W4. All 1,739 captures have now been refreshed with adapter version 4 and re-embedded.

## Weekly topic retrieval in Spotlight

The build preserves vector indices for each parsed teaching week. For a note such as `week_05_annotated`, the worker first verifies the course, term and unambiguous outline section, then compares the query against Week 5’s topic vectors. Its inferred-topic similarity is discounted by 10% and can qualify the resource for semantic retrieval before the bounded course bonus is applied. Hard course, week and assignment constraints still apply; assignments are not reclassified as lecture notes. Unknown terms, ambiguous outlines, missing weekly plans and lecture numbers without explicit week labels receive no weekly inference.

Actual STAT 230 Fall 2026 section 001 Week 5 embedding input:

```text
Probability. Discrete Random Variables, Probability Mass Functions, Cumulative Distribution Functions, Functions of a Random Variable
```

The course code, Fall 2026, sections, Week 5, `Oct. 5 - 9`, citations and source URL accompany the chunk as metadata. The vector represents the quoted topic text. Course overview, individual descriptions/outcomes, recognized topic sections, retained unparsed schedules and named readings also get separate focused chunks. Dedicated contact, location, grading and policy sections are excluded; inline administrative wording inside retained schedule/topic paragraphs can still be present.

Enable meaning search and test `probability mass functions notes` after rebuilding/reloading the extension and reloading your LEARN/Piazza tabs. A saved STAT 230 Week 5 note in the matching term/section should be retrieved; related weeks can also appear. “Outline suggests Week 5” denotes an inference, not text extracted from the file.

## Structured schedule extraction — October 12, 2026

The collector preserves a bounded tentative-plan DOM representation: paragraph boundaries, links, cells and merged-cell geometry. Offline structural adapters extract explicit weeks and typed lecture/module/unit/chapter/dated/topic entries, preserving source evidence, references, events and external schedule referrals. Nonweek topic entries create `schedule` chunks for course context; resource-number inference still uses explicit weeks only. Reference-only entries do not create topic vectors.

All 1,739 outlines were recollected with capture version 4, with zero failures. Weekly coverage increased from 497 (28.6%) to 775 (44.6%); structured teaching coverage is 1,123 (64.6%), including 1,089 plans with topic text. No previously weekly-parsed outline lost all its weeks. The rebuilt bundle has 36,812 unique vectors (56,543,232 bytes), with 16,395 generated and 20,417 reused. See [OUTLINE_PARSING_RESULTS.md](OUTLINE_PARSING_RESULTS.md) for remaining classifications and validation.

```sh
npm run reparse:outlines
npm run report:outlines
npm run embed:outlines -- outline-data/collected/F26/outlines.json
npm run build
```

Reparsing uses saved source structures without another authenticated collection. Embedding and building are required after parser changes to refresh Spotlight's packaged evidence.
