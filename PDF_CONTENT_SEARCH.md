# PDF content search — v0.4.0

Spotlight searches selectable text inside LEARN PDFs. `permutation` or `stat230 permutation notes` can find a generic `week_02.pdf`, show the matching passage and physical PDF page, and open the PDF with `#page=2`. PDF matches appear before metadata/meaning suggestions, with up to three pages per document and fifty page matches total. Queries run locally without LEARN requests or a semantic model.

## Try it

1. Run `npm install` and `npm run build`. Reload the extension and refresh the LEARN tab. Check **v0.4.1** in the footer.
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

## Course indexing controls (v0.5.3)

In Settings → LEARN and PDFs, use course checkboxes to index independently of search filters. Choices persist per account and synchronize across open tabs. All courses / follow search filters restores the original automatic scope. Unchecking a course stops new work for it without removing saved text.

Each course shows indexed, pending and failed counts and the currently reading course. Failures and individual retry controls persist across closing/reopening and browser restarts; retrying one file bypasses search filters and course selection for that request. Paused indexing must be enabled before retrying or prioritizing.

In v0.6.2, Index this course selects the course and restores missing/replaced PDF text without clearing other courses up front. Metadata links remain available. The existing 100-document and text-size limits still apply, so large courses may have pending PDFs even after prioritization. Cache capacity and cancellation are not counted as unreadable files.

## Persistent indexing progress (v0.6.1)

Completed text remains in IndexedDB. Small attempt records and errors are saved in extension local storage for the current account and PDF revision. Closing Spotlight interrupts unfinished work; reopening on signed-in LEARN resumes pending or new PDFs in the selected scope when indexing is enabled. Failed PDFs wait for an individual retry or Retry PDF indexing, avoiding repeated automatic downloads. No indexing runs while Spotlight is closed.

Successful indexing removes the saved failure. Changed/removed resources, account changes, Clear PDF text and Clear LEARN data discard obsolete progress. Refresh generations do not erase failures for unchanged PDFs, and attempt IDs prevent an older failure reply from replacing a newer retry. No PDF bytes or session credentials are stored in the progress records.

## Automatic cache replacement and pinning (v0.6.2)

Pin course protects already cached text from automatic replacement; pinning does not automatically select or download that course. Pins persist per account and synchronize across tabs. Manual Clear PDF text still clears all text, including pinned courses, while retaining the pin choices.

When inserting a PDF would exceed the document-count or text-size limit, Spotlight replaces the least recently opened/indexed unpinned text needed to fit. Older entries without timestamps are replaced first. Deletion and insertion share one IndexedDB transaction, so an insertion failure preserves existing cache contents. If pinned data leaves too little room, indexing stops with an Unpin/clear message instead of deleting pinned text.

Replaced files remain available by their metadata links and are labelled not cached in coverage. They are skipped during automatic reopening to avoid continual downloading/eviction cycles. Select their course or use Retry PDF indexing to restore them; saved failures still need an explicit retry. Changed document revisions can be indexed automatically again.
