# Academic MiniLM v1

Saved October 19, 2026 from the first academic fine-tuning run completed October 13. This is the selected epoch-1 candidate, with both PyTorch/Sentence Transformers weights and the existing quantized ONNX export. Second-round training is deferred.

## Files

| Path | Purpose |
| --- | --- |
| `pytorch/` | Selected safetensors weights, tokenizer, configuration, mean-pooling and normalization modules |
| `browser/` | q8 token-output graph, tokenizer/configuration and sanitized export manifest for offline evaluation |
| `training-summary.json` | Training settings, library versions, input hashes and aggregate validation/test metrics |
| `artifact-manifest.json` | Byte sizes and SHA-256 checksums of the package files |
| `LICENSE` and `NOTICE` | Upstream license and model modification attribution |

The two large weight files use Git LFS; the JSON files and tokenizer are ordinary Git files. Retrieve the weights as described in the [parent README](../README.md). Optimizer state, raw training passages, outlines and per-query evaluation records are excluded. The redundant full-precision ONNX graph is also excluded; the original full-precision checkpoint is retained in `pytorch/`.

The model derives from [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), pinned to revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. Fine-tuning modified its weights; the ONNX file is the per-channel dynamically quantized export of those modified weights. It produces 384-dimensional, normalized mean-pooled embeddings with a 256-token limit. Candidate text uses the original `legacy-source-text-v2` representation, not the later v3 course-context policy.

## Recorded results and limits

Training used 663 usable queries from the 1,000-query academic-v2 dataset. Three epochs ran, and validation selected epoch 1. Labels were generated from captured outline text and material references and received dataset-level acceptance for an initial experiment; individual expert label audits were not recorded. References do not establish that actual LEARN files are available.

The original independent test compared the current app q8 model and this candidate on the same 156 queries:

| Raw embedding ranking | App q8 | Candidate q8 |
| --- | ---: | ---: |
| Relevant first result | 67.3% | 68.6% |
| Relevant result within five | 78.2% | 87.2% |
| nDCG@10 | 0.7170 | 0.7801 |
| Physics relevant first result, 14 queries | 100.0% | 57.1% |

The top-five gain does not establish a reliable production replacement. The subject/type regression is documented in these aggregate results. The test has since informed development and must not be reused as untouched evidence for a second training round. Browser compatibility, real-resource retrieval, no-answer behavior and full application ranking/latency have not been validated for this candidate.

The earlier native export smoke checks reached minimum PyTorch/ONNX cosine agreement of 0.99999996 for full precision and 0.98904049 for q8. They establish export parity on the probes, not browser or retrieval accuracy.

## Offline loading

Use the recorded library versions from `training-summary.json`. After fetching the LFS weights, the local Sentence Transformers checkpoint can be loaded without contacting a model hub:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("experimental-models/academic-minilm-v1/pytorch", device="cpu", local_files_only=True)
vectors = model.encode(["permutations", "statistics textbook"], normalize_embeddings=True)
```

The q8 graph returns token embeddings. Its consumer must apply attention-mask mean pooling and L2 normalization; it is not a ready-pooled sentence-vector graph. No app configuration points to this directory, and the build does not copy it into the extension. Future integration requires browser checks, a new immutable model/cache identity and regeneration of compatible query, resource, catalogue and outline embeddings. Never mix this model with vectors from the existing production encoder.
