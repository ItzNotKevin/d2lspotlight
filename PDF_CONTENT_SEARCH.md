# PDF content search — v0.4.0

Spotlight searches selectable text inside LEARN PDFs. `permutation` or `stat230 permutation notes` can find a generic `week_02.pdf`, show the matching passage and physical PDF page, and open the PDF with `#page=2`. PDF matches appear before metadata/meaning suggestions, with up to three pages per document and fifty page matches total. Queries run locally without LEARN requests or a semantic model.

## Try it

1. Run `npm install` and `npm run build`. Reload the extension and refresh the LEARN tab. Check **v0.4.0** in the footer.
2. Open Spotlight on signed-in LEARN. After verifying the session and loading metadata, it automatically reads PDFs sequentially. Leave the overlay open; progress reports coverage and failures. Closing cancels downloading/extraction; completed documents remain saved.
3. Select **STAT 230** in the course filter to narrow indexing and searching. Select a **notes section** to narrow to a LEARN folder path. Changing scope cancels the previous run and uses the new scope. Saved PDFs from other scopes remain searchable when filters are cleared.
4. Search `permutation`. Actual matches show **PDF page …** and a snippet. Click or press Enter to open that PDF page. Viewing requires a valid LEARN session and inline PDF viewing in Chrome. PDFs themselves are not cached. Page numbers are physical file pages, which can differ from printed page labels. Landing is at the page, not an exact highlighted paragraph.
5. To filter by instructor, choose a notes section on LEARN, enter its instructor name, and click **Save instructor**. The instructor picker now includes that name. Labels belong to the course and folder and persist through refreshes. Saving an empty name removes the label. Instructors sharing one folder cannot yet be labelled individually.
6. Search saved text from any normal website. Indexing requires LEARN. **PDF indexing: paused** stops reads and retains text. **Retry PDF indexing** retries failures when indexing is enabled. **Clear PDF text** pauses indexing and deletes text. **Clear LEARN data** clears metadata, labels, history and PDF text.

## Coverage and storage

- Selectable text only. Scans, images, diagrams and handwriting need future OCR; empty pages are counted and reported. Formula extraction and reading order depend on the PDF text layer.
- Limits: 12 MiB per file, 400 pages per document, 30,000 characters per page, 1,000,000 characters per document, 100 cached documents and 8,000,000 cached text characters. Truncation is labelled partial; oversized files are skipped with a reason. Displayed text size is approximate and excludes database overhead.
- Text uses extension-origin IndexedDB, separate from Chrome's 10 MB `storage.local` metadata budget. PDFs are downloaded transiently from same-origin LEARN content URLs or D2L's documented `file?stream=true` endpoint. PDF.js and worker/font/CMap/WASM assets are bundled locally. Private data is not sent to third-party services.
- Changed source URLs/timestamps invalidate text. Removed resources and detected account changes are excluded and pruned. An account switch, source clear or concurrent refresh prevents old extraction from committing. A verified HTTP 401 clears LEARN data; ambiguous failures retain cached results. Until LEARN is checked again, results belong to the last verified account.
- Ranking uses literal terms, simple plurals, course/assignment constraints, phrases and bounded occurrence counts. Passage embeddings and mathematical paraphrases are future work. Metadata meaning search remains separate.
- Indexing starts automatically after the LEARN check. For many PDFs, pause, select a course/section, then enable indexing again. At the cache limit, clear PDF text and select your desired scope before rebuilding.

## Validation

`npm test` covers real PDF extraction, page evidence, combined filters, rejected destinations, bounded downloads, cancellation, extraction limits, account/revision invalidation, and persistent instructor labels.

`npm run check:pdf:extension` uses disposable headless Chrome with intercepted LEARN/PDF fixtures to check automatic extraction, rendered snippets, filters, Enter opening the page URL, original-resource history, persistence after closing the parser, and data clearing. A host permission is added only to the temporary fixture copy; the shipped extension still uses activeTab. This does not establish live Waterloo access or your actual PDFs' extraction quality.

References: [D2L content file endpoint](https://docs.valence.desire2learn.com/res/content.html), [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
