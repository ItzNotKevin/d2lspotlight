# Semantic search setup

Hybrid keyword and local semantic search is available through **Meaning search: on/off** in Spotlight. It searches saved metadata and bounded passages from cached PDF, PowerPoint, and Word text. Complete Piazza threads are not indexed. When model assets are installed, it defaults on unless a saved preference explicitly disables it. The preference persists on this device.

## Install and try

1. Run `npm ci`.
2. Run `npm run setup:semantic` once to download the pinned model files.
3. Run `npm run build`.
4. Reload the unpacked extension at `chrome://extensions`, then reload the LEARN/Piazza tabs. Chrome 116 or later is required.
5. Open Spotlight, enable **Meaning search**, and search with descriptive wording. Existing indexed resources are embedded when the first semantic query runs. Keyword results remain immediately available during preparation.

The setup downloads quantized `Xenova/all-MiniLM-L6-v2` at revision `751bff37182d3f1213fa05d7196b954e230abad9` from Hugging Face. Its model files total about 22.8 MiB. Downloads live in ignored `semantic-assets/`; the setup script verifies cached file hashes and reuses them on subsequent runs. The build copies them and the matching ONNX WebAssembly runtime into ignored `dist/`. The initial extension build is about 50 MiB, including roughly 26 MiB of runtime assets. A normal keyword-only build still works without downloading the model.

No course data is sent to Hugging Face. Model acquisition happens through the development setup script; installed semantic search loads bundled extension files and runs locally. It uses a single CPU WebAssembly thread in this first version. Model files are Apache-2.0 licensed; retain the model/runtime notices when preparing a distribution package.

## How it works

The content-script overlay sends a query and filters to the service worker. The service worker reads the authoritative saved LEARN/Piazza indices, adds their account scopes, and delegates to an offscreen extension document. That document owns a module worker containing Transformers.js. The overlay bundle contains no model runtime.

Each resource has two views: its title alone, and natural text combining its title, bounded saved description and snippet, module path, descriptive course name, service, and aliases. Descriptions and snippets are stripped of markup and limited to 600 characters each. Encoded course labels, bare course codes, field labels, and technical file-type labels are excluded from the embedding input; course identity and resource types still apply through filters and strict identifier matching. Each view has its own mean-pooled, normalized 384-dimensional embedding in extension-origin IndexedDB. Keys include the encoding version, model revision, source, account, resource ID, and view; a SHA-256 text hash detects changes. New/changed views are embedded again, and obsolete entries are pruned when the corpus changes. Unchanged vectors are reused after restarting the worker or Chrome. Two views increase the initial embedding work and vector storage compared with the initial single-vector setup.

Queries wait for a 120 ms typing pause. In a subject query such as `inheritance notes`, words such as notes, slides, and textbook act as mild resource preferences instead of required topic words. Notes-only and course/identifier-only queries still require the requested resource words. Keyword ranking weights terms by how rarely they occur in the index; frequency statistics are cached for each resource collection. Semantic query embeddings use the topic words so generic resource words cannot dominate meaning retrieval.

Each resource uses its strongest title/context cosine similarity. Keyword and semantic candidates are combined before the result limit, with 35% normalized lexical topic relevance, 65% semantic similarity above the retrieval threshold, and a resource preference bonus capped at 3%. Exact full titles and exact assignment identities retain priority, and identifiers/course filters remain strict. Semantic-only candidates display **Related meaning**. These initial blend weights still need broader evaluation. Results retain their observed destinations and use the existing opening action. Empty semantic retrieval reports that no related meaning matches were found instead of just reporting readiness.

Course relevance is scored separately from resource relevance. Descriptive course names are preserved during indexing; common subject abbreviations such as stats, bio, chem, psych, and econ are normalized for keyword matching. The model compares the topic query with one cached embedding per indexed course, across all subjects rather than a fixed set of program classifications. A course score above the provisional `0.4` cutoff contributes a bounded bonus of up to `0.18` to hybrid ranking; keyword course relevance can supply the same bonus. The resource must still qualify through keyword or resource-level semantic retrieval. Several courses can receive boosts, and original course associations, explicit identifiers, and filters remain intact. Shared course vectors are account/source scoped and are reused across resources in that course.

The Waterloo title lookup is refreshed from the current public undergraduate and graduate academic calendars using `npm run update:course-catalog`. It enriches recognized LEARN course codes, including encoded labels, without fetching the catalog during search. Missing codes use their indexed names. Catalog entries never create resource search results. Piazza uses its indexed course names rather than assuming that every class belongs to Waterloo. The [catalog baseline pipeline](COURSE_CATALOG_EMBEDDINGS.md) separately collects descriptions, preserves cross-listed identities, generates local precomputed vectors, and reports coverage. The optional description bundle is now loaded into live resource ranking as bounded course context; a uniquely matched real course/term/section outline replaces that context. Neither source proves which document contains a topic. Rebuild the extension after updating its bundled title snapshot.

`latest`/`newest` note queries first use numbered teaching weeks within the same course; otherwise `latest`, `newest`, `recent`, and `recently` request descending source update dates; `oldest` and `earliest` request ascending dates. These operators are removed from semantic topic text. Date ordering applies to eligible matches, favors strong course matches first, and places entries without usable dates last. LEARN supplies `LastModifiedDate`; Piazza retains parseable `modified` or `updated` timestamps when available. Refresh time and opening history are never substituted. These are update dates, not guaranteed publication dates, and queries such as “this week” are not yet date-window filters. The Recent chip continues to mean recently opened resources. Reload the extension and refresh source indices to gain preserved course names and Piazza dates; the model files do not need downloading again.

Source, course, document, and Recent filters apply before semantic candidate selection and again during merging. Explicit course codes, assignment numbers, and other numeric identifiers remain strict. Stale query replies are discarded; closing Spotlight, changing queries, or disabling meaning search cancels the request. Async result additions preserve selection by resource ID.

The model and in-memory vectors are released after two minutes without pending work. IndexedDB survives that release. Clearing either source or detecting an account change stops the worker and clears the shared embedding cache; the other source's metadata remains intact and its vectors can be rebuilt. Model files remain installed.

## Validation

- `npm test`: keyword regression checks, hybrid matching/filter/identifier rules, content invalidation, account-scoped cache keys, trusted-message routing, and rejection of responses after an account change.
- `npm run check:semantic`: actual local-model inference on synthetic enumeration and chemistry resources, plus course matching across statistics, biology, history, accounting, music, and computing, with remote loading disabled.
- `npm run check:semantic:browser`: actual extension/offscreen/worker inference under Manifest V3 CSP, filtering, warm queries, cache retention after restarting the offscreen document, and cache clearing. Set `SEMANTIC_BROWSER_PATH` to a Chromium or Chrome for Testing executable; the script creates and removes its own temporary profile and uses only synthetic resources.

The regression query `combinatorics textbook` retrieves a sparse **Enumeration** resource whose module is **Course Notes** and whose course name is an encoded MATH239 label, ahead of an unrelated chemistry manual. The `combinatorics` query also retrieves it through its title view. The original smoke fixture used an explicit Combinatorics course name and was too easy to detect this failure. Encoding version v2 rebuilds saved embeddings automatically; the model files do not need downloading again. Broader signed-in LEARN/Piazza UI, retrieval-quality, and keyboard testing remain necessary.

## Next implementation work

A local outline importer and precomputation prototype is now available. It produces focused course/topic/week/reading vectors from supplied text or structured JSON, with model-verified token budgets and reusable binary output. See [OUTLINE_EMBEDDINGS.md](OUTLINE_EMBEDDINGS.md). Real-outline bundles are used by Spotlight for course relevance and for topic retrieval of study notes with explicit week labels, when course/term/section matches uniquely. The UI labels inferred weekly topics separately from matches in extracted document passages.

An initial three-model, eight-field screening benchmark is available. See [benchmarks/README.md](benchmarks/README.md); run `npm run setup:search-models` followed by `npm run benchmark:search-models`. Reports contain separate raw and calibrated hybrid rankings and stay in ignored `benchmark-results/`. This does not switch the installed extension's model or cutoff.

1. Collect at least 50 realistic queries with expected resources, including paraphrases, exact identifiers, wrong-course examples, and queries with no relevant answer. Measure keyword versus hybrid top-5 recall and incorrect results.
2. Tune the provisional similarity threshold (`0.4`) and evaluate candidate models. Similarity is not a probability. This model is a starting baseline, not a final retrieval-quality decision.
3. Measure cold/warm latency, indexing duration, and memory on realistic course collections. Current requests time out at two minutes; completed embeddings remain cached for retries.
4. Improve indexing scheduling and progress reporting. The initial version indexes up to the first 5,000 saved resources and reports partial coverage beyond that limit. Keyword search continues to cover the complete metadata index. Avoid source-order bias when expanding this cap.
5. Evaluate the initial ranking blend on realistic queries and tune its weights without reducing exact-title or assignment-identifier accuracy.
6. Evaluate semantic passage coverage, latency, and retrieval quality on real documents before expanding the passage budget or adding OCR/full-thread embeddings.

The dependency audit after selecting Transformers.js 4.3.1 still reports the existing one low and two high findings in the project's build tooling. These were present before this setup and remain release work; the newly added runtime's initial advisories were removed by using its patched release.

References: [model card](https://huggingface.co/Xenova/all-MiniLM-L6-v2), [local model configuration](https://huggingface.co/docs/transformers.js/en/custom_usage), [Chrome offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

## October 12 integration

Course associations and weekly filename context now apply to both keyword and semantic retrieval. See [LOCAL_SEMANTIC_SEARCH.md](LOCAL_SEMANTIC_SEARCH.md) for the integrated behavior and `npm run check:semantic:extension` for the actual content-script/broker/worker/source-clear check.

## v0.3.1 generalization update

Natural-language query embeddings now supplement simplified topic embeddings. Course-specific subject rules and professor->annotated rewrites are removed. Optional imported course-description vectors are connected to the worker as a bounded course-relevance boost; they do not establish document contents. See [GENERAL_SEMANTIC_SEARCH.md](GENERAL_SEMANTIC_SEARCH.md) for import/setup and limitations. Earlier descriptions of catalog vectors as unconnected refer to the pre-v0.3.1 state.


## Course-number intent and retrieval evaluation

A bare three-digit course number (including a suffix, such as `246A`) is derived from course metadata. `246 outline` can match CS 246 and MATH 246; `cs246 outline` keeps its subject constraint. Incidental numbers in document titles do not establish course identity. Assignment numbers retain their existing meaning.

Run `npm run check:semantic` after installing models. It exercises actual local-model retrieval for ambiguous outlines, course notes requested as textbooks, explicit course constraints, literal-title priority, and unrelated queries, then compares thresholds on the existing 80-query synthetic benchmark. `npm run check:semantic:extension` also checks these intents in the real extension worker.

The 0.4 cutoff remains unchanged: increasing it to 0.45 reduced held-out positive-query hit@5 from 81.25% to 72.92% in this synthetic comparison. This is evidence against a blanket stricter cutoff, not a real-course accuracy guarantee. Related lecture material can still appear for a broad textbook query. Content-based document-role ranking remains future evaluation work; this update adds no textbook-to-notes synonym rule.


## Meaning search inside documents

When Meaning search is enabled, cached native PDF, PPTX, and DOCX text also supplies body-only embeddings. Overlapping passages contain at most 600 characters with 100-character overlap and never cross a physical PDF page or Office location. Native extracted text is used; experimental OCR stays in its labelled keyword path.

The current budget is 2,000 passages across cached documents. Quotas are shared across documents and sampled across their contents, so one large book cannot consume the whole budget. Partial passage coverage is reported in the search status. Filtering does not expand that global sample. Passage vectors are prepared lazily for eligible documents and reused from account-scoped IndexedDB; initial preparation can take longer than a keyword search. A model/indexing failure leaves keyword results available.

Passage matches show **Related meaning** and an exact snippet from the selected passage. PDF links use physical pages; Office links retain the original viewer and slide/paragraph label. Multiple chunks from one page are deduplicated, with keyword evidence preferred when both paths find that page. Course, source, document, recent, section, instructor, account, revision, and session constraints remain in force. Clear document text also resets the meaning-search cache so cleared passage vectors cannot be reused.

See [the evaluation guide](benchmarks/SEARCH_EVALUATION.md) for the local query set and report command.
