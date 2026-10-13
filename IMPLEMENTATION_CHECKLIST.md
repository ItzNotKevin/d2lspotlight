# Learn Spotlight implementation checklist


Latest update: v0.3.1 adds bundled catalog/outline evidence, explicit-week note retrieval, capture-version-4 structural schedule adapters and stale extension-context recovery. 148 tests and production/browser smoke checks pass. See [handoff.md](handoff.md) for current priorities and [OUTLINE_PARSING_RESULTS.md](OUTLINE_PARSING_RESULTS.md) for measured coverage. Earlier stages below retain historical planning context; unchecked historical items are not the current implementation inventory.

Reviewed October 1, 2026 against the README and all current source/configuration files. This is a code review, not a live LEARN integration or browser accessibility test. `npm run build` passes.

The README describes a frontend preview rather than a complete product specification. The core checklist below assumes the intended next milestone is searching real course resources and opening them. Integration choices still need validation against the target LEARN instance; optional features are listed separately.

## Already implemented

- [x] Manifest V3 extension with toolbar action and Mac/Windows/Linux shortcut (`manifest.json`, `background.js`).
- [x] Bundled React overlay injected on demand, with Shadow DOM style isolation, toggle/close behavior, cleanup, and restoration of the previously focused element (`src/content.jsx`, `src/mount.jsx`).
- [x] Animated search UI, matching-term highlights, result counts, and a no-results state (`src/Spotlight.jsx`).
- [x] Case-insensitive, all-query-word matching across sample titles, courses, paths, and resource types.
- [x] Sample all-course/course/document/recent filters, mouse selection, arrow-key navigation, Enter selection, and Escape query clearing followed by closing.
- [x] Initial input focus, dialog/combobox/listbox semantics, Tab wrapping, wheel-scroll containment, responsive styles, and partial reduced-motion handling.
- [x] Local Vite design preview and production bundle build (`index.html`, `src/preview.jsx`, `vite.config.js`).

## 1. Define and connect the LEARN data source — core blocker

Research: [LEARN data access options and validation plan](LEARN_DATA_RESEARCH.md). The browser-session approach is a candidate pending live Waterloo validation; the registered OAuth route requires coordination with the LEARN team.

Implementation update: browser-session access now feeds a persistent, versioned local index across accessible courses. Cached search works on other normal webpages; opening Spotlight on LEARN verifies the account and refreshes stale data. Recent tracks openings through Spotlight and appears before typing. Sixteen mocked tests pass; live Waterloo and browser interaction validation remain pending. Checked items below describe implemented behavior, not completed live validation.

- [ ] Confirm the supported LEARN host(s), initial resource types, and whether search should work across all enrolled courses or only courses the user has visited.
- [ ] Validate an authorized way to obtain course/content data: an available authenticated API, extraction from pages the user can access, or another supported integration. Record the chosen approach and its coverage limitations before implementing it.
- [ ] Implement connection/session detection, including a signed-out state and a clear route to sign in through LEARN. Handle expired sessions without collecting the user's password.
- [ ] Retrieve actual enrolled courses and their searchable resources, including nested modules and pagination where the chosen source requires it.
- [ ] Define a normalized resource model with stable resource/course IDs, title, course label, module path, type, destination URL, and timestamps when available. The current six sample objects have no IDs or URLs.
- [x] Separate sample fixtures and data access from `src/Spotlight.jsx`; keep the local design preview usable without a live account.
- [x] Add storage permission and serialized content-script/service-worker messaging. Refresh stays in the active LEARN tab, requiring no persistent host permission.

Completion: a signed-in user can retrieve resources from supported courses, and a signed-out user sees actionable connection guidance.

## 2. Build the resource index and refresh lifecycle

- [x] Create a searchable index from the normalized resources rather than the hardcoded `resources` array.
- [x] Decide whether the index lives only in memory or persists locally. If cached, implement a storage schema/version and reload it when the overlay opens.
- [x] Add first-load indexing, refresh, last-updated information, and loading/progress states. Avoid fetching every resource on every keystroke.
- [x] Handle incomplete fetches, offline/network failures, unavailable courses, and retry without discarding usable results unnecessarily.
- [x] Remove deleted/unavailable resources on refresh and isolate or clear cached data when the user/account changes.
- [x] Keep stale asynchronous responses from replacing newer search or connection state; clean up pending work when appropriate.

Completion: reopening Spotlight produces usable real results, with an explicit indication when data is loading, incomplete, or stale.

## 3. Wire real search and filters

- [x] Connect the existing matching UI to the real index; preserve title/course/path/type matching and highlighting.
- [x] Replace the hardcoded `demoCourse = 'MATH 239'` and its shortcut with actual course selection or current-course detection, including behavior when opened outside LEARN.
- [x] Map source resource types to consistent display labels/icons and define which types the Documents filter includes.
- [x] Define what Recent means (recently opened, recently updated, or recently added), then derive it from timestamps/history instead of sample boolean flags.
- [ ] Establish deterministic result ordering, preferably prioritizing title matches, and a result limit or pagination strategy for large course collections.
- [x] Update selection safely when asynchronous results change; use stable resource IDs for React keys and ensure `aria-activedescendant` always points to an existing option.
- [x] Replace sample-only footer, listbox labels, empty-state text, and preview notices with real connection/search states. Distinguish no matches from no indexed resources and fetch errors.

Completion: queries and combined filters return real resources from the correct courses with consistent selection and ordering.

## 4. Open selected resources — core blocker

- [x] Replace `selectResult()`'s “Preview only — links come later” notice with navigation to the selected resource's actual destination.
- [x] Define current-tab/new-tab behavior and make click and Enter use the same action. Support authenticated LEARN links and distinguish content pages from direct file URLs.
- [ ] Validate destination URLs and handle missing, removed, or inaccessible resources with useful feedback.
- [x] Decide whether Spotlight closes after successful navigation and, if Recent means recently opened, record the access locally.

Completion: clicking a result or pressing Enter opens the correct accessible course material.

## 5. Finish interaction and accessibility

- [x] Make live-search filters and the course picker keyboard accessible before typing. The standalone sample preview retains its original hover shortcuts.
- [ ] Verify focus containment and background interaction across Shadow DOM, host-page scripts, mouse, touch, and keyboard scrolling. The existing handler wraps Tab between the input and chips but does not make the underlying page inert.
- [ ] Announce result counts, loading, and errors to assistive technology, and test the combobox/listbox relationships in the injected Shadow DOM with a screen reader.
- [ ] Complete reduced-motion support for placeholder and result-row animations, which currently retain motion even though the main overlay checks `useReducedMotion()`.
- [ ] Verify short viewports, narrow windows, browser zoom, long course/resource names, and large result lists; ensure the input, results, and footer remain reachable.
- [ ] Decide how blocked-page injection failures should be surfaced. `background.js` currently logs only a console warning.

## 6. Verify and prepare a usable release

- [ ] Add meaningful automated tests for matching/filter combinations, source normalization, refresh failures, and selected-result navigation. Adapter, cache, refresh, and search tests exist; browser navigation coverage remains pending.
- [ ] Add browser-level coverage for injection, repeated toggle/cleanup, Escape behavior, keyboard selection, focus restoration, and real-result navigation.
- [ ] Manually validate an unpacked extension against the supported LEARN instance: signed-in/signed-out sessions, multiple courses, missing content, offline operation, and session expiration.
- [ ] Verify the service worker's lifecycle and any messaging/storage behavior introduced by integration.
- [x] Document the chosen connection method, supported resource types, permissions, refresh behavior, and limitations in `README.md`. Document Enter opening a resource in a new tab.
- [x] Update privacy documentation to match the implemented data flow and local retention policy. Document direct LEARN requests, local retention, and clearing saved data.
- [ ] Produce a reproducible unpacked extension/release package containing the manifest, background script, and built bundle; verify a clean build/install rather than relying on an existing `dist` folder.
- [ ] Before public distribution, add extension icons, update the preview description/version as appropriate, and prepare store metadata and any required privacy disclosures.

## Optional improvements — scope to decide after the core works

- [ ] Fuzzy matching, typo tolerance, and more advanced ranking beyond the current substring matcher.
- [ ] Search inside PDF/document/slide contents. Metadata search does not require full-text extraction; this would need a separate retrieval, extraction, and indexing design.
- [ ] Inline resource previews. Real link opening is the first milestone; a document preview is additional work.
- [ ] Favorites, query history, pinned courses, and configurable defaults.
- [ ] Dedicated settings UI for course inclusion, cache management, and navigation preferences if those controls are needed.

## Suggested build order

1. Validate the LEARN integration and resource model.
2. Retrieve one course's resources and open a real result end to end.
3. Add multi-course indexing, refresh, and failure states.
4. Connect dynamic filters and define Recent.
5. Complete accessibility, browser verification, and release documentation.

## Combined LEARN + Piazza search — October 3 update

- [x] Use the same local matcher for both sources, with no per-keystroke requests or debounce.
- [x] Combine source-labelled resources in one panel, with source/course filters and trusted links.
- [x] Store Piazza feed metadata separately from LEARN, verify account identity before refresh, and preserve recent history.
- [x] Bound feed pagination and stored title/snippet lengths; show partial feed status and actual local-storage size.
- [ ] Validate the new Piazza profile/feed schema, pagination, deleted-post refresh, and account changes in a signed-in browser.
- [ ] Verify immediate combined search, source/course filters, and link navigation in the unpacked extension.
- [ ] Discover all accessible Piazza classes automatically and provide friendly class names/course associations.
- [ ] Expand Piazza coverage beyond feed titles and snippets if full-thread search is required.

## Search intelligence and service links

Detailed staged plan: [SEARCH_ROADMAP.md](SEARCH_ROADMAP.md).

- [x] Recognize known Möbius destination hosts and add service aliases to exposed LEARN topic URLs.
- [x] Extract known service links from available Piazza snippets and create navigable link results.
- [x] Normalize accents and search service names/aliases/hosts while preserving LEARN launch context.
- [ ] Validate real link extraction after source refresh, including vague labels and LTI launch behavior.
- [ ] Add richer link evidence, selected HTML/post enrichment, other service registries, and course associations.
- [ ] Add evaluated relevance ranking, typo tolerance, assignment/course aliases, and query constraints.
- [ ] Evaluate optional local embeddings against realistic failed queries before adding semantic search.

## Ranked search and tool shortcuts — October 11 update

- [x] Rank exact title/service matches above weaker field matches; apply filters before the result cap.
- [x] Normalize course-code formats and assignment aliases, keeping numeric identifiers strict.
- [x] Add conservative typo/transposition tolerance, prepared-field caching, and fuzzy-match labels.
- [x] Recognize Marmoset, Crowdmark, Gradescope, GitHub/GitLab, and selected Waterloo CS sites alongside Möbius.
- [x] Inspect bounded accessible LEARN HTML pages to discover tool links.
- [x] Check topic details before bypassing ordinary empty tool topics; bypass single-link Möbius HTML pages only when content-free.
- [x] Preserve LEARN routes when instructions, LTI launch logic, ambiguous content, or inspection failures are present.
- [ ] Validate the direct shortcut against the user's real Möbius page and confirm its topic-detail permissions.
- [ ] Benchmark real browser rendering and a representative query set; synthetic Node timing is only a development check.
