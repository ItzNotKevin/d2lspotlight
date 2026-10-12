# Local semantic search — implementation and testing

Implemented October 11, 2026, following the user's choice of local semantic retrieval and automatic unambiguous course associations.

## What changed

- Assignment aliases are tested in **both directions**: A1, Assignment1, Assignment 01, assn-1, HW_01, and a_01_notes.pdf. Identifier checks now share the same separator normalization as matching. A12 remains distinct from A1 even when its module mentions Assignment 1.
- A unique LEARN/Piazza pair with the same normalized course code shares a course filter. Original source course IDs and URLs remain intact. Duplicate candidates or conflicting known terms stay separate and show a confirmation dropdown. Confirmations are stored under the current pair of source accounts and invalid/missing targets are ignored.
- A local quantized MiniLM embedding model retrieves paraphrases beyond the curated vocabulary. It embeds title, course, path, service, aliases, and inferred metadata. It does not read PDF bodies or complete Piazza threads.
- Keyword/contextual results remain synchronous. The model adds up to ten **Semantic match** results afterward; exact matches stay ahead, duplicate IDs are removed, and unknown IDs cannot introduce new destinations.
- Model candidates obey source/course/document/recent filters plus strict numbered identifiers and latest-note constraints. An A2 query cannot gain A12 through vector similarity.
- Async responses from previous queries are ignored. Appended semantic results preserve the selected resource rather than resetting keyboard selection.
- The overlay footer displays the extension version, currently **v0.3.0**.

## Model and runtime

Model: [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), quantized ONNX, 384 dimensions. Installation resolves a repository revision and records it locally; repeat setup uses that revision.

Runtime: [Transformers.js 4.3.1](https://huggingface.co/docs/transformers.js/index), ONNX WebAssembly with one thread, in a bundled [Chrome offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen). MV3 packaging permits local WebAssembly with `wasm-unsafe-eval`; scripts and WASM assets are bundled. Chrome 116+ is required for the offscreen context check.

There is no remote inference endpoint or new host permission. Model download happens only through the explicit developer setup command. Runtime remote-model loading is disabled, so search text and course content stay local. The extension adds the `offscreen` permission.

Model vectors are cached in the offscreen document's memory, by resource ID and embedding text, with an account scope and bounded retention. They are not yet persisted to IndexedDB. Account changes/clearing either source close the offscreen document. A first search can be slower while the eligible resources are embedded; lexical results stay available throughout. In-memory model work can be interrupted by a newer request; only the latest UI request is displayed.

## Install and test

```sh
npm ci
npm run setup:semantic
npm run build
npm test
npm run check:semantic
```

The model files (about 22 MiB for quantized weights, plus tokenizer/config) and runtime binaries are ignored build/setup artifacts. Friends must run setup locally; pulling the code alone does not include them.

1. Reload the extension at `chrome://extensions`, then reload browser tabs.
2. Verify **v0.3.0** in the footer. Refresh source data if course labels/posts are old.
3. Enable **Local semantic search**. The preference is saved locally.
4. Try `counting ways to arrange objects`, `practice for class hierarchies`, or a paraphrase of an actual indexed title/snippet.
5. Check that lexical results appear first and additional results show **Semantic match**.
6. Try a course plus assignment number, e.g. `cs246 assignment 2 class hierarchies`; verify all semantic results have that course/number evidence.
7. Type quickly, change filters, and navigate with arrows while the model works. Old-query matches must not appear or change the selected lexical resource.
8. Switch or clear a source account; confirm the old results disappear and the in-memory vector cache is dropped.

On macOS with Google Chrome installed, the isolated browser WASM/CSP check is:

```sh
npm run check:semantic:browser
```

It uses headless Chrome, a temporary profile, and a localhost fixture server. Set `SPOTLIGHT_CHROME` to a compatible browser executable on another system. It verifies browser inference using the packaged assets/CSP; it does **not** verify the real extension's offscreen messaging or signed-in LEARN/Piazza integration.

The actual unpacked-extension path is also tested:

```sh
npm run check:semantic:extension
```

This loads the extension in the temporary profile, invokes its toolbar action to grant activeTab,
sends a real content-script search through the service worker, runs the offscreen model, and checks
that an account change closes the model cache. Signed-in LEARN/Piazza data access remains a separate
manual check. The test's extension debugging flag applies only to the disposable profile.

## Evidence and limitations

- Real local CPU inference: counting query vs combinatorics scored 0.669, vs unrelated C++ material 0.028.
- Unpacked-extension WASM inference: corresponding fixture scores were 0.710 and -0.009.
- The unpacked-extension content-script/broker/offscreen path passes the same fixture.
- These are smoke checks, not a relevance benchmark or proof that arbitrary student queries will work.
- Similarity cutoff 0.4 is an initial conservative heuristic, pending calibration with real query labels.
- Broad concepts can still retrieve irrelevant material; exact identifiers/filters help but do not replace relevance evaluation.
- Course association cannot recover a missing friendly Piazza label. Fix or manually save the label before expecting automatic association by course code.
- Unique course-code matches follow the user's preference; one course from an old term and one from a new term can still be incorrectly paired if term metadata is absent. Duplicate-code cases require confirmation.
- No outline extraction, calendar teaching-week inference, full document text, or deadline extraction has been added in this increment.

## Next steps

- [x] Validate unpacked-extension offscreen messaging and account-change cache cleanup with an isolated fixture.
- [ ] Validate signed-in source clearing, source filters after association, and real student model queries.
- [ ] Collect labelled student queries and tune semantic cutoff, document text construction, and ranking.
- [ ] Add progressive indexing status and persist versioned vectors in IndexedDB if first-search latency warrants it.
- [x] Require confirmation for conflicting known course terms.
- [ ] Add section evidence and a management screen for reviewing/removing saved confirmations.
- [x] Upgrade model/build dependencies; installation audit reports zero vulnerabilities on October 11, 2026.
