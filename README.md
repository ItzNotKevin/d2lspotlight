# Learn Spotlight

**v0.6.2 improves PDF cache management:** pin courses under Settings to protect existing text. When space runs out, the least recently opened/indexed unpinned text is replaced automatically. Index this course restores its missing text without clearing other courses up front, and per-course coverage distinguishes pending, failed and replaced files.

**v0.6.1 saves PDF indexing progress and failures:** unfinished files resume in the selected scope when Spotlight is reopened on signed-in LEARN, completed PDFs stay cached, and failed files keep their error and retry control instead of downloading again automatically.

**v0.6.0 adds a standalone search window:** toolbar or shortcut launches on restricted Chrome pages (including fresh tabs) open the same search UI in an extension-owned window. Normal webpages keep the overlay. The window shares saved course/PDF data and verifies your LEARN login before searching, and repeated launches reuse it. A system-wide shortcut for VS Code or other applications is not included.

**v0.5.5 fixes background-worker startup:** the worker and its catalog data are bundled into `dist/background.js`, avoiding raw JSON module loading in Chrome. A shortcut controller is installed on LEARN pages before first use, and toolbar launches reuse that controller. Reload the extension and refresh existing LEARN tabs to activate it.

**v0.5.4 improves search relevance and coverage feedback:** comparable topic matches modestly favor teaching material, results explain why they matched, and incomplete PDF/site coverage remains visible. Unindexed Waterloo CS host-alias candidates are deduplicated while indexed entries are retained.

**v0.5.3 adds course-specific PDF indexing:** choose courses under Settings → LEARN and PDFs, inspect indexed/pending/failed counts, retry failed files individually, or prioritize a course by clearing other courses’ cached text. Course selections persist per account.

**v0.5.2 simplifies the search window:** maintenance and source controls are under Settings, while login status and website-access prompts remain visible. Website results show their destination domain and a preview around the matching text.

**v0.5.1 verifies your LEARN login before searching saved results on any tab.** Reload the extension and webpage to enable the session gate.

**v0.5.0 adds course website search:** open a LEARN course home to detect matching Waterloo CS course/term links, then click **Include website** to index public HTML pages and search their sections. Course/source filters, section links and official-outline references are supported. See [COURSE_WEBSITE_SEARCH.md](COURSE_WEBSITE_SEARCH.md) for setup, permissions and limits.

**v0.4.1 fixes shortcut reopening:** a closing overlay can reopen immediately, and shortcut handling resolves the focused tab when Chrome omits the command's tab argument. Reload the extension once and refresh LEARN/Piazza tabs to activate the update.

**v0.4.0 adds PDF content search:** selectable text is indexed locally by page, so `permutation` can find a passage inside generic STAT 230 notes and open the matching PDF page. Course, notes-section and saved instructor filters are available. See [PDF_CONTENT_SEARCH.md](PDF_CONTENT_SEARCH.md) for setup, indexing limits and live testing. Scanned/handwritten notes still need future OCR. Older roadmap sections below describe the pre-PDF implementation.

A Chrome extension for quick course-resource search. The extension now includes an **experimental Waterloo LEARN browser-session adapter**: open Spotlight while signed in to index all accessible courses, then search their saved metadata from any normal webpage. Live Waterloo compatibility is pending user testing. The local design preview still uses sample data.

The overlay is built with React, Framer Motion, and Lucide icons. Its component structure follows the Spotlight example supplied for this project: a focused search input, animated placeholder and expanding result area, hover shortcut buttons, and icon/title/description result rows. The colours and result details are tailored to course materials.

Developer setup, artifact transfer and next tasks are in [handoff.md](handoff.md). Generated model and outline bundles are excluded from Git.

## Build and try it

1. Run `npm install` and `npm run build` in this folder.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project folder. If it is already loaded, click **Reload** instead.
3. Sign in at `https://learn.uwaterloo.ca`, then press **⌘⇧K** on Mac or **Ctrl+Shift+K** on Windows/Linux. The extension icon also opens it.
4. Indexing starts automatically. Results appear as courses load. Use **Refresh courses** to force an update.
5. Search a resource title, course code, or module name. Use ↑/↓ to move and Enter (or a click) to open the selected resource in a new tab. Esc clears the query first, then closes the overlay.

After changing React or CSS files, run `npm run build`, click **Reload** on the extension, and refresh the webpage. You do not need to select the folder again. If Chrome did not assign the shortcut, set one at `chrome://extensions/shortcuts`.

For a design preview without rebuilding the extension, run `npm run dev` and open the local address Vite prints. Chrome blocks the overlay on internal pages such as `chrome://extensions` and in the Chrome Web Store.

The extension bundles all code locally and uses an isolated Shadow DOM to keep webpage styles separate. Its resource requests go directly to LEARN or Piazza from the corresponding signed-in tab. It does not send course data to a third-party server or read/export your cookies. The `storage` permission saves the index and the last 100 resources opened through Spotlight in extension-local storage on this device. Closing Spotlight or restarting Chrome retains them. Use **Clear LEARN data** or **Clear Piazza data** to remove that source’s index and recent history.

Search covers all indexed courses by default; use the course picker to narrow results. Before typing, Spotlight shows up to eight recently opened resources, or initial suggestions when there is no matching history. Queries show up to 100 matches. Recent means opened through Spotlight, not overall LEARN browsing history.

Opening Spotlight on LEARN checks the account and refreshes an index older than five minutes. It loads courses sequentially and saves progress after each course; closing the overlay cancels outstanding requests. Reopen on LEARN to retry an interrupted or partial refresh. Other websites use saved results without contacting LEARN. Automatic refresh from a separate LEARN tab is not implemented.

A detected account switch replaces the previous account's index and history. An explicit expired-session response or non-JSON login page clears saved data; ambiguous permission/network failures keep the cache available with an error. Until a LEARN check runs, offline results belong to the last verified account. Partial refreshes are labelled; transient course errors retain older data, while successful refreshes remove deleted resources.

## First live test

### Combined LEARN + Piazza search

1. Reload the extension at `chrome://extensions` and refresh both website tabs.
2. Open Spotlight on signed-in LEARN and let the course refresh finish.
3. Open Spotlight in a signed-in Piazza class and leave it open while posts load. Repeat for other Piazza classes you want to include. The class ID is detected from the URL; an editable Class ID and **Refresh Piazza posts** button are available.
4. Type a title or keyword. Both sources use the same immediate local matcher, with no typing delay or per-keystroke network requests. Use the source selector for **LEARN + Piazza**, **LEARN only**, or **Piazza only**. Click or press Enter to open a selected result.
5. Open Spotlight on either site or another normal webpage to search both saved sources. Check source labels, the course filter, Recent, and the footer's saved-data size.

Piazza saves post titles (up to 300 characters), snippets or folders (up to 500 characters), and post links in a separate device-local index. It does not download attachments or full discussion threads. Search coverage therefore differs from Piazza's server search. Refresh uses `user_profile.get_profile` to verify the account, then `network.get_my_feed` in pages of 100, with a maximum of 20 pages per class. Repeated pages or a reached cap are labelled partial. Feed pagination and the profile response still need live validation; the previous server-search/token integration was confirmed working by the user.

Each refresh replaces that class's saved posts and keeps other indexed classes for the same account. Switching accounts clears that source's old index and history once detected. Clearing LEARN data and clearing Piazza data are separate actions. The indices persist across browser restarts; until a source verifies its session again, saved results belong to its last checked account. Sources refresh from their own signed-in tabs; no background cross-site session fetching is implemented.

Piazza requests read `window.CSRF_TOKEN` through a narrowly scoped MAIN-world helper using the existing activeTab/scripting permissions. The token is held in memory and never saved or included in diagnostics. If loading fails, share the message and **Show Piazza diagnostics** output, without token/header values or private post bodies.

Chrome's [local extension storage limit](https://developer.chrome.com/docs/extensions/reference/api/storage) is 10 MB on current Chrome, shared by both indices. The footer measures actual usage with `getBytesInUse`. For illustration, 2,000 entries averaging 1 KB each would use about 2 MB; actual size depends on titles and snippets. Large full-text collections would need a different storage design.

### LEARN

Follow [LEARN_TESTING.md](LEARN_TESTING.md). If connection or loading fails, use **Show diagnostics** and share that report. It contains request stages, status codes, selected API versions, and counts, without account identity, course titles, cookies, or response bodies.

Run `npm test` for adapter tests and `npm run build` to rebuild the extension. The implementation follows the [D2L endpoint research](LEARN_DATA_RESEARCH.md); mocked tests do not verify Waterloo permissions or live session behavior.

## Search roadmap and Möbius links

Local hybrid search is available as an opt-in setup. Follow [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md) to download the pinned model, build, and enable **Meaning search**. Keyword results remain immediate; related-meaning results arrive after a typing pause. The initial implementation searches metadata locally and still needs evaluation on real courses.

See [WATERLOO_PRODUCT_IDEAS.md](WATERLOO_PRODUCT_IDEAS.md) for ranked student-facing ideas and the proposed upcoming-assessments/preparation-pack feature.

See [SEARCH_ROADMAP.md](SEARCH_ROADMAP.md) for the staged plan: data coverage, service-link discovery, ranked/fuzzy matching, optional semantic search, and deadlines/preparation material.

Ranked local search now normalizes course codes and assignment aliases (`CS 246`/`cs246`, `A2`/`assignment 2`/`assn 2`/`hw2`), tolerates conservative spelling errors, and ranks exact titles and tool names ahead of weaker matches. Assignment/course identifiers remain strict. Fields are prepared once per resource in memory; typing performs no network requests. Fuzzy matches show **Similar spelling**.

Tool recognition covers Möbius, Marmoset, Crowdmark, Gradescope, GitHub, GitLab (including Waterloo GitLab), and selected Waterloo CS course-site hosts. Refresh both indices to enrich saved entries. Piazza snippet links create tool results; LEARN refresh inspects up to 30 tool-topic details or accessible HTML pages per course, with a 256 KiB limit per HTML page. This discovers links in vague-titled HTML pages without crawling external sites or downloading full discussion threads.

**Direct Möbius opening:** a verified ordinary URL topic with an empty description opens its observed tool destination directly. An HTML page containing exactly one ordinary Möbius link, no additional text (other than a matching heading), and no form, script, or media also opens directly. These results show **Opens directly**. Pages with instructions, unknown descriptions, failed inspection, multiple destinations, or detected LTI launch URLs keep the LEARN route. The original LEARN URL remains stored as `parentUrl`. Tool links extracted from a meaningful LEARN page open that parent so its instructions remain visible.

D2L documents the ordinary link topic kind and topic detail endpoint in its [content API reference](https://docs.valence.desire2learn.com/res/content.html). The table of contents does not supply every detail, so the extension checks topic details before treating missing descriptions as empty. This still needs validation on your live Möbius entries.

To try the update:

1. Reload the extension at `chrome://extensions`, then refresh the LEARN and Piazza tabs.
2. On LEARN, open Spotlight and click **Refresh courses**; on Piazza, refresh posts to add new tool aliases.
3. Try `cs246 a2`, a small typo such as `mobiuss`, and a tool name such as `marmoset` or `crowdmark`.
4. Click the previously empty Möbius entry; a verified shortcut should show **Opens directly** and open Möbius in a new tab. A page with instructions should still open LEARN.

Semantic search quality evaluation, full-document search, arbitrary custom tool domains, and links absent from available source content remain future work.
# Testing course names, weekly notes, and direct Möbius links

For current unresolved bugs and the next developer's priorities, see [BUGS_AND_NEXT_STEPS.md](BUGS_AND_NEXT_STEPS.md).

Version 0.3.0 adds local semantic search and automatic unique course-code associations.
Run `npm run setup:semantic` once, then `npm run build`. Reload the extension and tabs, verify
**v0.3.0** in the footer, and enable **Meaning search**. Setup downloads model files;
course content stays local during inference. See [LOCAL_SEMANTIC_SEARCH.md](LOCAL_SEMANTIC_SEARCH.md)
for installation, tests, permissions, and limitations.

Contextual search now interprets week numbers, annotated-note filenames, selected course subjects,
latest-note intent, and a small related-concept vocabulary. Try `latest stat230 notes`,
`probability lecture notes`, `stat230 annotated notes`, or a topic present in your saved metadata.
latest means the newest available numbered lecture week in each indexed course, not a verified
calendar teaching week. Research, implementation, and future outline/model stages are in
[CONTEXTUAL_SEARCH_PLAN.md](CONTEXTUAL_SEARCH_PLAN.md).

After updating, reload the extension at `chrome://extensions` and reload your LEARN and Piazza tabs.
Open Spotlight in your CS 246 Piazza class and click **Refresh Piazza posts**. The course code is detected
from the page title; if detection fails, enter `CS 246` in **Course name** and refresh again. This name
is saved with the class and its posts, so `cs246 a2` also works when searching from LEARN.

For already-indexed posts, enter the course name and click **Save course name** to correct the label
immediately without fetching the feed again. Detection also checks Piazza's course header.
If Möbius still opens its parent page, refresh LEARN and copy the `mobius-link` entries from
**Show diagnostics**. These report why the shortcut was not selected without copying link tokens.

Möbius recognition includes `mobius.cloud` (including `uwmo.mobius.cloud`). An external
`/lti/advantage` endpoint requires a launch from LEARN. When topic metadata supplies a course-bound
LEARN LTI quicklink and the description is empty, Spotlight opens that launch link directly.
When metadata only supplies the external endpoint, Spotlight retains the LEARN topic; direct
launch support for that case still needs inspection of the real launch mechanism.

Try `lecture notes`, `cs246 lecture notes`, and `week 5 annotated`. Annotated weekly filenames such as
`week_05 annotated.pdf` now receive lecture-notes aliases, and week numbers ignore leading zeroes.

On LEARN, click **Refresh courses** to replace previously saved link destinations. Tool candidates
are inspected before ordinary HTML lecture pages. Empty rich-text paragraphs and template scripts
no longer prevent an otherwise content-free Möbius page from opening directly. A single Möbius link
in a topic description is also recognized. Results that qualify show **Opens directly**.
Pages containing instructions, multiple destinations, or interactive content, and LTI launches,
still open through LEARN. Actual account-specific links require a browser check after refreshing.

## October 12 combined implementation

The current extension is **v0.3.1**. Unique LEARN/Piazza course-code pairs share a filter; duplicate candidates or conflicting known terms ask for confirmation. Assignment aliases work in both directions across filename separators. Keyword search is immediate; **Meaning search** uses the incoming persistent local worker and hybrid ranking.

See [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md) for merge choices, [WORK_SESSION_MEMORY.md](WORK_SESSION_MEMORY.md) for user decisions, and [LOCAL_SEMANTIC_SEARCH.md](LOCAL_SEMANTIC_SEARCH.md) for integrated setup. After pulling: `npm ci`, `npm run setup:semantic`, `npm run build`, then reload the extension and browser tabs. Generated catalog/outline vectors are not included in Git; PDF full-text indexing remains planned.

Latest semantic update: special STAT230/STAT231 subject rules and professor-to-annotated rewriting are removed. The model compares natural sentences and simplified topics. Optional imported public catalog description vectors now contribute bounded course relevance. See [GENERAL_SEMANTIC_SEARCH.md](GENERAL_SEMANTIC_SEARCH.md) and [OUTLINE_FORMAT_REVIEW.md](OUTLINE_FORMAT_REVIEW.md). This checkout already has the supplied catalog imported; the ignored artifacts must be shared separately with other developers.

Real term-specific outlines can be collected through your signed-in Chrome viewer with `npm run collect:outlines -- --term F26`, embedded with `npm run embed:outlines -- outline-data/collected/F26/outlines.json`, and packaged by `npm run build`. Collection resumes from local checkpoints. See [OUTLINE_EMBEDDINGS.md](OUTLINE_EMBEDDINGS.md) for browser setup, coverage and current limitations. A uniquely matching outline takes precedence over academic-calendar course context.

Outline extraction now covers 775/1,739 explicit weekly plans (44.6%) and 1,123 structured teaching plans (64.6%). See [the parsing results](OUTLINE_PARSING_RESULTS.md) for coverage definitions, remaining layouts, and offline rebuild commands.
# LEARN session verification

Spotlight checks your LEARN login before searching saved LEARN resources, PDF text, or associated website pages, including when opened on another tab. Search pauses while verification is pending or fails. Sign in through Open LEARN, then use Check LEARN login; returning to the tab also rechecks. This uses narrowly scoped host access to `https://learn.uwaterloo.ca/*` and your existing browser session, without storing passwords. Piazza keyword results retain their existing source behavior.
