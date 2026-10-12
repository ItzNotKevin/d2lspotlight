# Semantic search setup

Hybrid keyword and local semantic search is the next development priority. The initial implementation is available behind **Meaning search: on/off** in Spotlight. It searches saved metadata rather than PDF contents or complete Piazza threads. It is off by default; the preference persists on this device.

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

Each resource has two views: its title alone, and natural text combining its title, module path or Piazza snippet, descriptive course name, service, and aliases. Encoded course labels, bare course codes, field labels, and technical file-type labels are excluded from the embedding input; course identity and resource types still apply through filters and strict identifier matching. Each view has its own mean-pooled, normalized 384-dimensional embedding in extension-origin IndexedDB. Keys include the encoding version, model revision, source, account, resource ID, and view; a SHA-256 text hash detects changes. New/changed views are embedded again, and obsolete entries are pruned when the corpus changes. Unchanged vectors are reused after restarting the worker or Chrome. Two views increase the initial embedding work and vector storage compared with the initial single-vector setup.

Queries wait for a 250 ms typing pause. In a subject query such as `inheritance notes`, words such as notes, slides, and textbook act as mild resource preferences instead of required topic words. Notes-only and course/identifier-only queries still require the requested resource words. Keyword ranking weights terms by how rarely they occur in the index; frequency statistics are cached for each resource collection. Semantic query embeddings use the topic words so generic resource words cannot dominate meaning retrieval.

Each resource uses its strongest title/context cosine similarity. Keyword and semantic candidates are combined before the result limit, with 35% normalized lexical topic relevance, 65% semantic similarity above the retrieval threshold, and a resource preference bonus capped at 3%. Exact full titles and exact assignment identities retain priority, and identifiers/course filters remain strict. Semantic-only candidates display **Related meaning**. These initial blend weights still need broader evaluation. Results retain their observed destinations and use the existing opening action. Empty semantic retrieval reports that no related meaning matches were found instead of just reporting readiness.

Source, course, document, and Recent filters apply before semantic candidate selection and again during merging. Explicit course codes, assignment numbers, and other numeric identifiers remain strict. Stale query replies are discarded; closing Spotlight, changing queries, or disabling meaning search cancels the request. Async result additions preserve selection by resource ID.

The model and in-memory vectors are released after two minutes without pending work. IndexedDB survives that release. Clearing either source or detecting an account change stops the worker and clears the shared embedding cache; the other source's metadata remains intact and its vectors can be rebuilt. Model files remain installed.

## Validation

- `npm test`: keyword regression checks, hybrid matching/filter/identifier rules, content invalidation, account-scoped cache keys, trusted-message routing, and rejection of responses after an account change.
- `npm run check:semantic`: actual local-model inference on synthetic enumeration and chemistry resources, with remote loading disabled.
- `npm run check:semantic:browser`: actual extension/offscreen/worker inference under Manifest V3 CSP, filtering, warm queries, cache retention after restarting the offscreen document, and cache clearing. Set `SEMANTIC_BROWSER_PATH` to a Chromium or Chrome for Testing executable; the script creates and removes its own temporary profile and uses only synthetic resources.

The regression query `combinatorics textbook` retrieves a sparse **Enumeration** resource whose module is **Course Notes** and whose course name is an encoded MATH239 label, ahead of an unrelated chemistry manual. The `combinatorics` query also retrieves it through its title view. The original smoke fixture used an explicit Combinatorics course name and was too easy to detect this failure. Encoding version v2 rebuilds saved embeddings automatically; the model files do not need downloading again. Broader signed-in LEARN/Piazza UI, retrieval-quality, and keyboard testing remain necessary.

## Next implementation work

An initial three-model, eight-field screening benchmark is available. See [benchmarks/README.md](benchmarks/README.md); run `npm run setup:search-models` followed by `npm run benchmark:search-models`. Reports contain separate raw and calibrated hybrid rankings and stay in ignored `benchmark-results/`. This does not switch the installed extension's model or cutoff.

1. Collect at least 50 realistic queries with expected resources, including paraphrases, exact identifiers, wrong-course examples, and queries with no relevant answer. Measure keyword versus hybrid top-5 recall and incorrect results.
2. Tune the provisional similarity threshold (`0.4`) and evaluate candidate models. Similarity is not a probability. This model is a starting baseline, not a final retrieval-quality decision.
3. Measure cold/warm latency, indexing duration, and memory on realistic course collections. Current requests time out at two minutes; completed embeddings remain cached for retries.
4. Improve indexing scheduling and progress reporting. The initial version indexes up to the first 5,000 saved resources and reports partial coverage beyond that limit. Keyword search continues to cover the complete metadata index. Avoid source-order bias when expanding this cap.
5. Evaluate the initial ranking blend on realistic queries and tune its weights without reducing exact-title or assignment-identifier accuracy.
6. Add bounded PDF/full-post extraction only if metadata-level evaluation demonstrates that missing context prevents useful retrieval.

The dependency audit after selecting Transformers.js 4.3.1 still reports the existing one low and two high findings in the project's build tooling. These were present before this setup and remain release work; the newly added runtime's initial advisories were removed by using its patched release.

References: [model card](https://huggingface.co/Xenova/all-MiniLM-L6-v2), [local model configuration](https://huggingface.co/docs/transformers.js/en/custom_usage), [Chrome offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen).
