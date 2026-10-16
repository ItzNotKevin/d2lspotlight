# Handwriting and math OCR evaluation

Version 0.8.0 connects experimental handwriting indexing to the ordinary PDF search. OCR results are labelled; recognition can make mistakes and formula transcription is not reliable.

## Extension setup

Run `npm install` and `npm run build`, reload the extension, and refresh LEARN. The normal build automatically prepares pinned public handwriting/math models (about 389 MiB combined) into ignored `ocr-assets/` and copies them into `dist/ocr-models/`. No separate OCR setup command is required. The first build needs internet for missing files; subsequent builds work offline with verified local assets. A verified benchmark cache can also restore missing or corrupt files without downloading. `npm run setup:ocr` remains an optional way to prefetch assets.

`scripts/ocr-assets.lock.json` commits the exact model revisions, required files, sizes and SHA-256 hashes. Downloads stream into temporary files, are size/hash checked, and are published atomically. Interrupted or invalid downloads are discarded and retried on the next build. Preparation runs before Vite clears the previous build; a failed download stops the build instead of silently dropping handwriting support. Only locked model files are packaged. Browser inference uses local files only; PDFs are never uploaded and no new permissions are added.

In a build with models, handwriting indexing defaults on alongside document indexing. Settings → Handwriting indexing pauses/resumes it; saved text stays searchable. Up to eight small region batches are scanned per opening in the selected indexing scope. Reopen Spotlight or use Retry document indexing to continue. Native text is cached first; each OCR batch is committed separately. Closing, changing scope or pausing cancels the active page without losing completed pages. Failures retain native text and wait for retry.

OCR scans the visible page, including mixed printed text and handwriting. Existing text boxes are not blanked: the supplied PDF has a poor text layer over handwriting, and blanking it erased the ink. Native matches take priority. OCR evidence uses the same course/source/section/instructor/recent filters and physical PDF links. A slide printed as 13 in the supplied notes is physical PDF page 5, so its destination is `#page=5`.

Prose is filtered for obvious repetition, alphabet runs, short graph labels and LaTeX noise. Formula strings are not stored as faithful transcriptions: only recognized operator aliases are retained. Native and OCR text share cache limits, course pins, replacement rules, account/revision isolation and clear controls. Page-scanned counts indicate attempted pages, not recognition completeness. Worker deadlines are three minutes per batch, with at most 40 candidate regions, bounded generation and a maximum 1600×2000 render size.

`node scripts/check-ocr-pdf.mjs <local-pdf> <physical-page>` renders a real PDF locally and checks normal page search, writing ignored diagnostics. `SPOTLIGHT_OCR_PDF=<local-pdf> npm run check:pdf:extension` additionally exercises the real models in disposable Chrome. The optional fixture expects the supplied 38-page PDF and resumes at page 5 to check handwritten Recall, saved progress and the page-5 URL. Regular Chrome checks disable OCR in the fixture.


## Local evaluation

`npm run benchmark:ocr -- <local-manifest.json> [handwriting|math|math2]`

See [the example manifest](benchmarks/ocr.example.json). Images must be local files. The script downloads public model weights and runs inference locally through the already-installed Transformers.js package. It never uploads sample images or uses a hosted inference API. Models are cached under ignored `benchmark-assets/ocr`; private manifests and reports belong under ignored `benchmark-results/`. Neither model weights nor the supplied course screenshots are committed.

The handwriting candidate is [Xenova/trocr-small-handwritten](https://huggingface.co/Xenova/trocr-small-handwritten); the math candidates are [Xenova/texify](https://huggingface.co/Xenova/texify) and [TexTeller3 ONNX](https://huggingface.co/onnx-community/TexTeller3-ONNX). TexTeller receives its required grayscale input. Each report records the immutable model revision, q8 CPU configuration, load time, raw outputs, recognized operator aliases, per-region inference time, expected keyword hits, and any supplied absent-keyword checks. Keyword hits measure retrieval potential, not transcription or formula correctness. Reports are saved after each sample so partial runs retain evidence.

Optional crops use normalized `[left, top, right, bottom]` bounds. These are manually annotated evaluation regions, not automatic text/layout detection. Optional `threshold` preprocessing converts colored ink to black on white at a grayscale cutoff of 200. Always include full-page controls and negative examples before drawing conclusions about document-level accuracy. Model download time and browser performance require separate evaluation.

For automatic regions, add `"segment": "ink-bands"` to a whole-page sample without a crop. The bounded baseline downsizes images to at most 1600×2000, suppresses dense screenshot borders and long rules, finds ink bands, separates distant columns, and splits strong vertical whitespace valleys. It is not a learned text/formula detector: graphs, fractions, and overlapping lines remain ambiguous. `segmentationPartial` means the 40-region benchmark cap was hit; false does not establish complete page coverage. Direct segmentation supports cancellation and rejects inputs above 4 million pixels.

`node scripts/preview-ocr.mjs <local-manifest.json> <report.json> [...]` creates ignored `benchmark-results/ocr-preview.html`. Open that local file to search recognized text or operator aliases and see bounding boxes on the original screenshots. It is an offline evaluation preview, not the extension UI. Only uncropped page reports are supported. Do not publish the HTML: it embeds the supplied images and recognized text.

## Findings from the supplied screenshots — October 16, 2026

Two screenshots contain colored handwritten calculus notes and mixed printed/handwritten probability formulas. The first run tested five manually cropped regions with each model, then six regions with threshold preprocessing, then tighter handwritten math crops.

- Raw handwriting recognition was poor on colored ink; it read one black sentence but produced unrelated text for other regions.
- Thresholded handwriting recognition correctly read the calculus heading, black sentence, and green definition label. It partly read the handwritten probability conclusion but misread its abbreviation. It failed both handwritten and printed mathematical expressions.
- Thresholded Texify recognized summation and infinity in the printed formula, with mistakes elsewhere in the formula. It failed the mixed handwritten recall/formula region and produced unrelated mathematical content for prose.
- A manually isolated handwritten summation symbol produced a `\sum` token, but the surrounding generated formula was incorrect. A wider handwritten formula crop produced infinity tokens while missing summation. This is not reliable handwritten-formula recognition.
- Both thresholded full-page controls failed with the handwriting model. Correct cropped-line transcriptions cannot be extrapolated to whole pages; automatic layout segmentation is still required.

Text cleanup is promising for handwritten words. Neither tested candidate is suitable for automatic handwritten math indexing based on these samples. Single-region timings are small and must not be presented as whole-page speed; model loading, page rendering, layout detection, and many-region inference add work.

## Automatic-region follow-up

The projection baseline found 23 and 29 candidate regions on the two supplied screenshots, with no manual crops. The handwriting model recovered the calculus heading, its two-line explanatory sentence, and the green definition label. It still produced incorrect text from graphs and equations. Whole-page inference including segmentation took about 2.0 and 2.5 seconds on this machine, excluding cached model initialization and PDF rendering.

TexTeller3 detected `\sum` within an automatically selected handwritten formula region as well as the printed formula. It did not invent a summation token on the calculus control page. However, formula details remained wrong, and prose/diagram regions produced malformed or repeated LaTeX. Whole-page runs took about 13.4 and 13.3 seconds, excluding cached initialization and PDF rendering. These are two-page observations, not a general accuracy or browser performance claim.

This establishes a useful prototype for automatic handwritten keyword retrieval and operator aliases, but not trustworthy formula transcription. Recognition output must still be filtered by text/formula/diagram region quality before production indexing; raw output currently includes substantial noise. The extension now uses filtered prose and operator aliases, with explicit OCR labels; permissions are unchanged.

## Operator search foundation

`src/search/ocr/math.js` maps explicit recognized `∑` / LaTeX `\sum` to summation/sum, integrals to integral/integration, `∂` to partial derivative, and infinity to infinity/infinite. It deliberately excludes capital `Σ` / `\Sigma`, which may denote a variable. It does not infer concepts such as geometric series from arbitrary formulas. Tests cover supported notation and false aliases. Native extracted operators and OCR aliases now participate in general PDF search. Aliases cannot repair hallucinated recognition.

## Remaining accuracy and performance work

1. Test automatic page segmentation and handwritten text extraction on original PDF pages, including text-plus-annotation pages that already have a printed text layer.
2. Compare stronger math-capable local models using positive and negative examples. Require reliable operator retrieval and measure invented symbols, not just keyword hits. Any cloud alternative needs a separate decision about uploading course pages.
3. Validate browser resource use and package reproducible model assets before enabling recognition in the extension. Keep OCR in a cancellable worker with bounded page/pixel/time budgets.
4. Improve text/formula/diagram classification, confidence filtering and scheduling while retaining native text, source-aware OCR storage, page-level progress, account/revision isolation, physical page links and explicit partial coverage.

OCR must remain explicitly experimental until these gates pass. Handwriting remains explicitly experimental in the extension. The real PDF check recovered Recall from physical page 5; native extraction alone had read Recal. It also detected a summation token in the handwritten formula region after expanding math crops vertically. Printed summation symbols are separately searchable from native text and must not be mistaken for OCR validation.
