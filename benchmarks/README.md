# Academic retrieval model screening

Run `npm run setup:search-models`, then `npm run benchmark:search-models`. Setup downloads pinned q8 ONNX model files and caches their SHA-256 hashes; repeat setup verifies cached files. Benchmark inference is entirely local with remote model loading disabled. Each model runs in a separate Node process. Reports appear in ignored `benchmark-results/`; candidate weights live in ignored `benchmark-assets/` and are excluded from the extension build.

The first dataset in `academic.js` contains 48 synthetic resources, with six from each of CS, mathematics, biology, chemistry, physics, humanities, arts, and social sciences. It includes encoded course labels, sparse titles, generic notes, contextual paraphrases, exact names, assignment identifiers, a typo, and near-topic unsupported queries. These are authored labels rather than expert-reviewed relevance judgments. They describe metadata retrieval; no source document bodies are assumed to have been indexed.

There are 24 calibration queries and 56 distinct test queries. Each field contributes two supported calibration queries plus one unsupported calibration query, and six supported test queries plus one unsupported test query. Test query kinds vary by field, so compare paraphrase-only scores as well as overall scores. Only calibration labels select the cutoff; test scores are never used to choose it. The initial objective equally weights supported-query top-5 success and unsupported-query rejection. No model weights are trained.

Three candidates are evaluated:

| Candidate | Pooling | Query prefix | Resource prefix |
| --- | --- | --- | --- |
| Current MiniLM L6 | Mean | None | None |
| BGE-small v1.5 | CLS | Recommended retrieval instruction | None |
| E5-small v2 | Mean | `query:` | `passage:` |

Pooling and prefixes follow the original authors' [BGE guidance](https://huggingface.co/BAAI/bge-small-en-v1.5) and [E5 guidance](https://huggingface.co/intfloat/e5-small-v2). The converted [BGE](https://huggingface.co/Xenova/bge-small-en-v1.5) and [E5](https://huggingface.co/Xenova/e5-small-v2) repositories supply Transformers.js-compatible ONNX weights. BGE's converted model card includes mean-pooling examples, but this run uses CLS according to the original author's embedding instructions. Exact revisions and configurations are in `models.js` and each JSON report.

Raw retrieval ranks candidates with cosine similarity after the existing strict identifier constraints. Hybrid retrieval uses Spotlight's text preparation, optional resource preferences, keyword weighting, protected exact matches, and blending, with separately calibrated model-specific cutoffs. The extension still uses MiniLM and its existing `0.4` cutoff; the comparison does not deploy a candidate or change that cutoff. Scores between models are not directly comparable.

The reports include top-1 accuracy, top-5 success, recall@5, reciprocal rank, unsupported-query false positives, per-field/per-kind breakdowns, and incorrect examples. Raw nearest-neighbour retrieval always returns candidates, so its unsupported-query false-positive rate is not useful without a cutoff. Report both raw rankings and calibrated hybrid rankings to expose losses caused by thresholds and the blending policy.

Timing uses native ONNX CPU inference with one intra/inter-op thread. Warm query measurements include an embedding and scoring the 48 resources; Chrome messaging and hybrid sorting are excluded. Load and indexing timings are separate. Sampled process RSS includes Node and native runtime overhead and is not browser memory usage. Browser WASM/WebGPU profiling is a separate next step.

This dataset is too small and too synthetic to establish reliability across programs. Keep it frozen as a screening baseline; add separately reviewed real course query/resource pairs in a later dataset. Preserve independent calibration and test labels, include ambiguous cross-field words and sparse metadata, and inspect each discipline rather than choosing solely by the overall score. Do not commit private course bodies or authentication information.
