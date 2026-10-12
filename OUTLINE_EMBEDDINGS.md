# Local outline embedding prototype

The development importer turns UTF-8 outline text or structured JSON into reusable course, topic, weekly, and reading embeddings. It uses the same pinned MiniLM model as the extension, with native CPU inference, mean pooling, normalization, and 384 dimensions. It runs without remote model loading or course-data uploads.

This prototype produces a local data bundle and a command-line search preview. It is not yet connected to Spotlight's resource ranking. Automated collection from Outline, live resource associations, shared hosting, and browser loading of these bundles remain separate work.

[The course catalog baseline pipeline](COURSE_CATALOG_EMBEDDINGS.md) provides a separate vector layer for every entry in the current undergraduate and graduate calendars, including courses whose outline has not yet been collected.

## Bulk collection findings

The signed-in Chrome viewer was inspected on October 12, 2026. Its Browse Outlines page supports a full course code or a subject/term combination; the UI gives `PSYCH 101` and `PSYCH F22` as examples. Submitting an empty search did not reveal the repository. A subject alone (`MATH`) and a term alone (`F26`) triggered the full-course-or-subject/term instruction.

Searching `MATH F26` returned 42 outline rows in one rendered table, with term, course code, title, section range, and a View link for each row. No pagination or bulk-export control was visible in that result. This establishes a subject/term discovery route, not a verified total for the university or a guarantee that every larger result is unpaginated. The site explicitly says not all courses use Outline.

Opening [MATH 103 Fall 2026](https://outline.uwaterloo.ca/viewer/view/njf248) showed the outline even though the page said the signed-in student was not enrolled in its sections. It exposed a latest publication date, Revision History, Save a Local Copy, course description, learning outcomes, a 13-week table, and readings. The weekly table had separate Content, Tutorial, and Written Assignment columns, so collection must retain table structure rather than flatten all columns into topic text. The local-copy download did not complete through the browser tool, and subsequent Chrome calls failed to load the browser access policy. Its file format remains unverified. No new outline contents were imported or embedded during this inspection.

The collection workflow should:

1. Search each actual subject for a selected term through the signed-in viewer. Start with Fall 2026 for a current-term pilot and record the query, result rows, and collection timestamp.
2. Queue every observed View URL. Deduplicate by outline ID, not course code: MATH 127, 128, 137, 145, and other courses returned separate outlines for different sections. Preserve their titles, terms, and section ranges.
3. Read each outline through the authenticated browser, preserving heading boundaries and table columns. Record the published date and explicit source URL. Use the local-copy export only after verifying its format; a structured DOM capture can supply the existing JSON importer independently of that download.
4. Save a resumable local collection index with per-outline states for discovered, captured, normalized, embedded, unavailable, and failed. Treat expired sign-in as a paused collection rather than missing course data. Do not guess outline IDs or undisclosed API endpoints.
5. Normalize and validate each capture. Keep course topics, outcomes, readings, and explicit week associations; leave policy and contact sections out of embedding inputs. Report unsupported layouts and missing weekly plans separately from collection failures.
6. Supply the complete normalized JSON collection to `embed:outlines` for a replacement bundle. Reuse unchanged vectors, and retain section-specific outlines when associating vectors with a user's resources.

The current undergraduate and graduate calendar inventory can seed subject discovery. It covers those published calendars, rather than every historical subject ever offered. A claim of complete outline coverage still needs a collection report for every subject/term searched. Current browser inspection confirms only the MATH Fall 2026 result and the MATH 103 detail page; it does not verify a student-accessible institutional API or one-click export of all outlines.

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

The default output is `outline-data/embeddings`. The entire `outline-data/` directory is ignored by Git and is not copied into the extension build. Use it for imported source files as well as generated data. Changing a bundle creates a new content-addressed vector file; older vector files are retained. The manifest points to the current file.

## What is extracted

Text imports recognize common headings for course descriptions, learning outcomes/objectives, topics, reading lists, and weekly plans. They support numbered/Markdown headings, repeated table-of-contents headings, tab-separated or Markdown weekly tables, the vertically pasted schedule used by the supplied Waterloo example, and `Week 1: ...` lists. Different source formats can use structured JSON directly.

Reading aliases come from definitions inside the document, such as `COUNT=Counting notes`; no particular course abbreviation is built into the extractor. Named readings in tables or bullet lists can resolve explicit references to the same title. Generic citations such as “Chapter 2” remain unresolved when the source does not identify the book. The importer does not infer an assignment's topic from its due date.

Administrative policies, contact details, class meeting locations, and grading sections are excluded from the embedding sections. Course code, term, section numbers, week numbers, date labels, and reading-section citations are retained as metadata instead of being added to every vector's text. Weekly topics include the human course title and names of explicitly associated readings.

The course overview uses the first description paragraph and learning outcomes. If these are absent, it uses available topic or weekly text. Other description paragraphs, outcomes, topic sections, weeks, and named readings receive their own focused views. Long text is split at sentence boundaries, with word-based splitting for oversized sentences. Every final input is measured with the actual model tokenizer and must fit within 256 tokens, including its repeated course context and special tokens. The text is not silently truncated.

An unsupported schedule layout produces a warning and no invented weekly associations. Missing terms also produce a warning; resource associations must verify the term separately. The text importer is a first set of layout adapters, not a universal outline reader. PDF extraction, OCR, HTML import, assessment extraction, and arbitrary prose-to-resource inference are not included.

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

The preview applies exact course-code and week constraints and uses a provisional `0.4` similarity cutoff for topic queries. Week operators stay out of semantic query text. Metadata-only searches such as `MATH239 week 5` return matching chunks without running query inference and display a null similarity score. It returns outline chunks and their references, not LEARN resources or guaranteed document contents. Course/term/section matching and evidence-based mapping to users' resource IDs are the next integration step.
