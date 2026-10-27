# Learn Spotlight

A Chrome extension for searching Waterloo LEARN resources, Piazza posts, course websites, and document contents from one search window.

**Current version: 0.8.0.** Includes experimental local handwriting search, resumable scanning, and saved PDF page progress. The interface uses React, Framer Motion, and Lucide icons.

See [next steps](NEXT_STEPS.md) for the current retrieval baseline, live validation checklist, and beta milestone.

## What you can search

- **LEARN resources:** course names, resource titles, modules, and discovered service links, including Möbius, Marmoset, Crowdmark, and Gradescope.
- **Document contents:** PDF page text, PowerPoint (`.pptx`) slide text, and Word (`.docx`) paragraphs and tables. Older `.ppt` and `.doc` files remain searchable by title.
- **Handwriting in PDFs:** experimental local OCR, including handwritten additions on printed pages. Matches link to the original physical PDF page.
- **Piazza posts:** saved titles, snippets, folders, and links from classes you refresh. Attachments and full discussion threads are not indexed.
- **Course websites:** supported public Waterloo CS pages that you explicitly include.
- **Related meanings:** optional local semantic search over metadata and cached PDF/Office passages, with compatible catalog and outline bundles providing additional course context when available.

Bare course numbers such as `246 outline` search matching courses across subjects; include the subject (`cs246 outline`) to narrow them.

Keyword search supports course-code variants (`CS 246` / `cs246`), assignment aliases (`A2` / `assignment 2` / `hw2`), conservative spelling correction, and ordered topic phrases. Course and source filters narrow results; document search also supports section and saved instructor filters.

## Build and install

Use Chrome 116 or newer and a Node.js version supported by Vite 7.

```sh
npm ci
npm run build
```

The normal build automatically downloads and verifies pinned OCR models if they are missing. The first uncached build downloads about **389 MiB** and needs internet access. Later builds reuse verified local assets. No separate OCR setup command is required.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the repository root containing `manifest.json`, rather than `dist/`.
3. Sign in at `https://learn.uwaterloo.ca`.
4. Press **⌘⇧K** on Mac or **Ctrl+Shift+K** on Windows/Linux, or click the extension icon.
5. Leave Spotlight open while courses load, then search a resource title, course code, module, or document passage.

Use **Clear filters** to reset active source, course, document, recent, section, and instructor filters while keeping your search query. Settings remembers which source groups you expand on this device.

The keyboard button in the footer shows navigation keys and the default launch shortcuts. Use ↑/↓ to select a result and Enter to open it. Esc clears the query first, then closes Spotlight. If Chrome has not assigned the shortcut, configure it at `chrome://extensions/shortcuts`.

On normal webpages, Spotlight opens as an overlay. On restricted pages, including fresh tabs, the toolbar or shortcut opens a standalone extension window. Launching again reuses that window.

After rebuilding, reload the extension at `chrome://extensions` **and refresh existing webpage tabs** to replace injected code.

For a local design preview with sample data:

```sh
npm run dev
```

Open the address printed by Vite. This preview does not establish that signed-in browser integration works.

## Index courses and documents

Open Spotlight on signed-in LEARN and use **Settings → LEARN and documents → Refresh courses** to discover resources. Select the courses to index. Document indexing saves progress; reopening Spotlight on signed-in LEARN resumes unfinished work in the selected scope. A progress bar above the search results shows how many documents in the current search scope are indexed, pending, failed, or replaced, plus the file currently being processed. Expand **Failed documents** to see errors and retry individual files on signed-in LEARN. Failed files retain their error and retry controls.

Pin courses under Settings to protect cached text. When the cache fills, older unpinned text can be replaced. **Index this course** restores missing text without clearing other courses up front. Coverage distinguishes pending, failed, and replaced files.

Highlight a document result and choose **Search within document** above the results. Type a new query to search only that file, including related-meaning passages when enabled. The selected document appears above the filters; use its × button or **Clear filters** to return to broader search without losing your new query.

### Assignment packs

With your LEARN login verified, expand **Assignment packs** to create a named pack for a course. Select a search result, choose a pack and a section, then use **Save to assignment**. Packs group links into Instructions, Notes, Clarifications, and Submit. Saving the same resource again moves it to the chosen section.

Packs appear above ordinary results and can be found by their name and course using the search box and course filter. Course spacing and assignment aliases are supported: `CS 246 homework 2` finds an `A2` pack in CS246 without matching A12. Expand a pack to rename it, open or remove saved resources, or change a saved resource’s section. Section changes also work for unavailable resources. Empty packs can be deleted. Pack membership is curated manually; dates and suggested resources are not collected.

Packs stay on this device, separately for each LEARN/Piazza account combination. They save resource references rather than document text or launch URLs. Unavailable resources remain labelled until they reappear in the current index; switching accounts or losing LEARN verification hides the packs. Clearing a source index does not delete pack references.

PDF matches open the physical PDF page. PowerPoint matches show a slide number, and Word matches show a paragraph range; both open the original LEARN viewer without automatic navigation to that location.

### Experimental handwriting search

Handwriting indexing runs locally alongside document indexing. Under Settings:

- Use **Handwriting indexing** to pause or resume scanning. Saved matches remain searchable.
- Use **Continue handwriting scan** on signed-in LEARN to process another batch without reopening Spotlight.
- Inspect saved region and physical page progress. A region is part of a page; scanned-page counts indicate attempted pages, rather than complete recognition.

Each run processes up to eight small region batches. Completed batches are saved, so closing Spotlight or pausing preserves completed work. OCR can misread words and symbols, and formula transcription is unreliable. Verify OCR matches against the original PDF page.

See [OCR setup and evaluation](OCR_EVALUATION.md), [PDF content search](PDF_CONTENT_SEARCH.md), and [Office document search](DOCUMENT_CONTENT_SEARCH.md) for coverage, limits, and validation details.

## Add Piazza and course websites

For Piazza, open Spotlight in a signed-in class and leave it open while posts load. Repeat for each class you want to include. If the course label is wrong, enter a friendly name such as `CS 246` in **Course name** and choose **Save course name**. Use **Refresh Piazza posts** to fetch updates.

Piazza refresh saves bounded titles, snippets or folders, and post links. Feed pagination is capped, and incomplete coverage is labelled. Search the combined saved index from other webpages using the source and course filters. Piazza live-session behavior still needs validation across real classes; see [Piazza research](PIAZZA_DATA_RESEARCH.md).

For course websites, visit a LEARN course home to detect supported Waterloo CS course links, then choose **Include website** and grant access when prompted. Only supported public HTML pages are indexed. See [Course website search](COURSE_WEBSITE_SEARCH.md).

## Enable optional meaning search

```sh
npm run setup:semantic
npm run build
```

Reload the extension and webpage tabs. **Meaning search** defaults on when the model is installed; a previously saved off preference is preserved and can be changed in Settings. Keyword matches appear immediately; related-meaning results arrive after a typing pause. Models run locally, and course content stays on the device during inference.

Generated semantic models, catalog vectors, and outline bundles are excluded from Git. A fresh clone does not include another developer’s generated corpus. Obtain compatible artifacts separately or regenerate them using the linked guides:

- [Local semantic search](LOCAL_SEMANTIC_SEARCH.md)
- [Course catalog embeddings](COURSE_CATALOG_EMBEDDINGS.md)
- [Outline embeddings](OUTLINE_EMBEDDINGS.md)
- [Outline parsing results and limitations](OUTLINE_PARSING_RESULTS.md)

Outline-derived topics are schedule evidence, distinct from text extracted from a document. Search quality still needs evaluation on real courses.

## Privacy and sessions

Resource requests use your signed-in LEARN or Piazza browser session. The extension does not export cookies or send course content to a third-party inference server. Code and inference models run locally. Course website indexing requests the public pages you include.

Saved indexes and recent history persist on this device. Recent results track resources opened through Spotlight, rather than your overall browser history. Document text uses a local IndexedDB cache; metadata and preferences use extension storage. **Clear LEARN data** and **Clear Piazza data** remove their respective saved indexes and history.

Spotlight checks your LEARN login before searching saved LEARN resources, document text, or associated website pages, including from another tab. Search pauses while verification is pending or fails. Use **Open LEARN** to sign in, then **Check LEARN login**. Account changes replace the previous account’s data when detected. Piazza keyword results retain their separate session behavior.

Service shortcuts preserve context: verified ordinary links can open directly, while instruction pages and context-dependent LTI launches retain the LEARN route. Live Möbius launch behavior still needs account-specific validation.

For a repeatable local search check, start with the [24-query evaluation set and guide](benchmarks/SEARCH_EVALUATION.md). Replace its synthetic examples with your own queries in an ignored local file.

## Development and validation

```sh
npm test
npm run build
git diff --check
```

GitHub Actions runs `npm ci`, `npm test`, and whitespace checks on pull requests and pushes to `main`, using Node.js 24. Model-dependent evaluation and browser checks run separately after local setup.

Additional browser checks are available after building:

```sh
npm run check:semantic:extension
npm run check:pdf:extension
```

Automated tests and fixture browser checks do not establish compatibility with every live Waterloo course or Piazza class. Follow [LEARN testing](LEARN_TESTING.md) for signed-in validation. Use **Copy report** beside an expanded diagnostics report to copy its displayed text. If clipboard access is blocked, the report is selected for manual copying. Diagnostics should be shared without cookies, CSRF tokens, private post bodies, or launch credentials.

[Developer handoff](handoff.md), [integration notes](INTEGRATION_REPORT.md), and [bugs and next steps](BUGS_AND_NEXT_STEPS.md) preserve earlier implementation history and live-validation tasks. Their older version references and planned-feature statements may have been superseded by the current features described above.
