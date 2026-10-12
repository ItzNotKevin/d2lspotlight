# Bugs and next steps — developer handoff

Updated October 11, 2026. This is the current handoff; older research/checklist files include historical implementation states. Automated checks pass, but they do not establish that the user's signed-in browser integration works.

## Start here

1. Run `npm ci`, `npm test`, and `npm run build`.
2. Load the project directory as an unpacked Chrome extension. `dist/` is ignored by Git and must be built locally.
3. After changes, reload the extension at `chrome://extensions` **and reload the LEARN/Piazza tabs**. An already-injected overlay can retain the previous bundle.
4. Test with your own signed-in accounts. Never commit captured cookies, CSRF tokens, launch payloads, private posts, or local indexes.

## Priority 0: unresolved user-reported bugs

### 1. Piazza course name is still an opaque class ID

- **Observed:** searching `cs246 a2` returns nothing; the user's class label is still `mthaufbzhue5jn`.
- **Implemented but not browser-confirmed:** page-title/header course-code detection; a manual Course name field; **Save course name**, which renames cached course records and existing post resources without fetching the feed. The opaque ID remains the stable identifier, separate from the display/search name.
- **Files:** `src/piazza/course.js`, `src/piazza/usePiazzaIndex.jsx`, `src/learn/cache.js`, `background.js`, `src/search/rank.js`.
- [ ] Confirm the latest bundle is running by checking that **Save course name** appears.
- [ ] Enter `CS 246`, save, and inspect both the course record and post `course` fields. Retry with source/course/document/recent filters cleared.
- [ ] Inspect `course-index` diagnostics: friendly label, number of posts, and number of A2 titles. Determine whether the failure is name detection, missing feed coverage, stale code/cache, or filters.
- [ ] Inspect the actual Piazza course header and use its authoritative course name. Current selectors/title parsing are heuristics and may miss the real header.
- [ ] If A2 is absent from the feed, verify pagination/filter behavior against Piazza's native search and add a bounded way to retrieve missing posts.
- [ ] Verify saving a name survives reopening, browser restart, feed refresh, and searching from LEARN.
- **Acceptance:** `cs246 a2` finds the A2 post from both sites; A12 and posts from CS245 do not match.

### 2. Möbius still opens the LEARN wrapper

- **Observed destination:** `https://uwmo.mobius.cloud/lti/advantage`. Right-click copy is unavailable on the user's launch control.
- **Confirmed code gap, now patched:** service recognition previously covered `mapleserver.com` only; it now also covers `mobius.cloud`.
- **Important constraint:** `/lti/advantage` is an external LTI endpoint. Opening it as a plain URL does not reproduce LEARN's authenticated course launch. Do not replace the wrapper with that endpoint or invent launch parameters.
- **Implemented but not browser-confirmed:** direct ordinary empty tool topics, content-free single-link HTML/description detection, inspection priority for tool candidates, and a shortcut for a verified LEARN LTI quicklink with matching course `ou`, `type=lti`, and empty description.
- **Remaining gap:** if metadata supplies only the external endpoint, Spotlight still opens the topic. Embedded launches/forms, other quicklink formats, and HTML wrappers containing a LEARN launch link are not resolved automatically.
- **Files:** `src/services.js`, `src/learn/normalize.js`, `src/learn/links.js`, `src/learn/client.js`, `src/learn/sync.js`.
- [ ] Force **Refresh courses** and examine `mobius-link` diagnostics (topic lookup failure, missing inspectable HTML, context launch, remaining text/media, or inspection limit).
- [ ] Inspect the actual topic API response and the native launch control. In DevTools Network, enable Preserve log, click the native control, and identify the initial LEARN launch request, method, and whether a form/script supplies context. Keep authentication values private.
- [ ] Add support for the observed LEARN launch mechanism using the real course-bound URL/action. If a normal GET launch URL exists, open it directly; otherwise design a context-preserving launch path before bypassing the wrapper.
- [ ] Verify both mouse and Enter launch the correct class/activity and preserve login and grade integration.
- **Acceptance:** a content-free wrapper is skipped while the correct authenticated activity opens. Instruction pages retain their instructions.

## Priority 1: known limitations and validation gaps

### 3. Lecture-note aliases need real-data validation

- **Previously observed:** `lecture notes` failed on `week_05 annotated` filenames.
- **Patched:** underscore normalization, week-number zero removal, and lecture-note aliases for annotated/lecture/slide metadata. Unit tests cover `week_05 annotated.pdf`.
- [ ] Verify the user's real filename is in the index and matches `lecture notes`, `cs246 lecture notes`, and `week 5 annotated`.
- [ ] Extend aliases from realistic failures; avoid classifying every PDF or assignment as lecture notes. Alias inference currently considers both title and module path, which can produce broad matches.

### 4. Piazza coverage is limited to the explicitly indexed class and feed metadata

- Titles/snippets and links exposed there are indexed; complete threads, answers, attachments, all classes, and full-text content are not.
- Pagination stops at 20 pages of 100 items or a repeating feed and marks the result partial.
- [ ] Validate feed pagination and deleted-post removal in a real browser.
- [ ] Discover accessible classes and persist friendly names/course associations automatically.
- [ ] Decide how to enrich full posts on demand before claiming full-content search.

### 5. LEARN link enrichment can silently fall back

- HTML inspection is limited to same-origin `/content/` paths ending in `.htm`/`.html`, 256 KiB per response, and 30 topic/HTML requests per course. Failed optional enrichment preserves the parent resource.
- [ ] Use actual failed examples to expand supported content retrieval paths; preserve bounded requests and account checks.
- [ ] Add selected-resource retry/enrichment so an inspection cap does not permanently block a useful shortcut.
- [ ] Expose a clear reason when a tool result needs a LEARN launch rather than displaying an unexplained wrapper destination.

### 6. Browser interaction/accessibility has no end-to-end coverage

- [ ] Test repeated injection/toggle, cleanup, Escape, focus restoration, Tab containment, arrow/Enter selection, and both launch paths.
- [ ] Validate screen-reader announcements and combobox/listbox relationships inside Shadow DOM.
- [ ] Complete reduced-motion coverage; check small windows, zoom, long labels, and large lists.
- [ ] Provide visible feedback for blocked-page injection and rejected resource destinations; current injection errors primarily go to the console.

### 7. Persistence/session behavior needs live validation

- Account isolation, serialized writes, stale refresh cancellation, and history retention have unit coverage.
- [ ] Test service-worker restart, account changes, expired sessions, offline reads, quota exhaustion, and interrupted refreshes against live sites.
- [ ] Explain that cached results on unrelated pages belong to the last verified account until the corresponding source is opened and checked again.
- [ ] Recheck dependency audit before release; the last install reported one low and two high findings, which have not been investigated here.

### 8. Documentation and release packaging need cleanup

- Earlier checklist sections still describe features as absent or unverified even where later sections record implementation. Research notes contain superseded approaches.
- [ ] Consolidate current status and separate implementation completion from live validation.
- [ ] Verify a fresh clone/build/unpacked installation; add a release package if friends should install without Node.
- [ ] Add a visible build/version identifier to distinguish stale injected bundles from current code.

## Priority 2: features after the bugs above

These are planned features, not existing regressions. See `SEARCH_ROADMAP.md` and `WATERLOO_PRODUCT_IDEAS.md` for detail.

1. **Upcoming deadlines:** obtain structured dates from LEARN assignments/quizzes/calendar; use Piazza announcements and outlines as supplementary evidence. Preserve source, timezone, revisions, and uncertainty; never silently convert ambiguous dates into confirmed deadlines.
2. **Assessment preparation:** connect each confirmed deadline to the assignment, relevant lecture notes, practice, and instructor clarifications. Show why each resource was selected.
3. **Better cross-site coverage:** course associations, class discovery, saved course websites/tool links, and user-controlled exclusions.
4. **Search quality:** collect representative queries and expected top results, improve aliases/ranking, then evaluate local semantic search against that baseline. Embeddings/NLP are not currently implemented.
5. **Full-text search:** retrieve and extract supported PDFs/documents and full Piazza threads with explicit caching limits and refresh behavior.

## Verification at handoff

- `npm test`: 59 tests pass (adapters, cache, ranking, service links, HTML classification, and token helper).
- `npm run build`: passes.
- The two user-reported integration bugs above remain unconfirmed in the actual browser. Synthetic fixtures do not close them.
- No automated browser suite exists yet. Do not mark the handoff bugs complete solely from Node tests.
