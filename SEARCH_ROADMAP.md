# Spotlight search roadmap

Prepared October 3, 2026 from the current code and source research. This is an implementation plan; unchecked items are proposed work, not verified capabilities.

Latest update: v0.3.1 connects imported catalog description vectors as bounded course-relevance evidence and compares original sentences alongside topic queries. Special course/topic and professor/annotated mappings are removed. See GENERAL_SEMANTIC_SEARCH.md; real Fall 2026 outline collection and term/section-aware course-context loading are implemented; explicit week-labelled notes now use matched outline weekly topics; PDF content remains pending.

## Current embedding status and next work — October 12, 2026

This section is the current priority summary. The older milestones below remain broader planning notes; their unchecked boxes do not override the verified work recorded here.

Completed:

- [x] Collect all 6,467 entries from the current Waterloo calendars: 4,343 undergraduate and 2,124 graduate courses across 156 subjects. Every entry has a description; collection finished with zero failures.
- [x] Preserve course codes, titles, subjects, descriptions, source links, academic levels, and cross-listed identities, including professional-development and graduate suffix codes.
- [x] Generate a local baseline for every course using the pinned 384-dimensional MiniLM model. The bundle contains 6,494 chunks and 6,249 unique vectors, occupying 9.6 MB of binary vector data.
- [x] Add resumable collection, cached details, token-budget splitting, vector checksums, model/version validation, and reuse of unchanged vectors. Repeat collection reused all 6,467 details; repeat encoding reused all 6,249 vectors.
- [x] Expand the extension's bundled course title lookup and rebuild it. Existing title-based attribution can use the larger catalog.
- [x] Create a separate MATH 239 Fall 2026 outline prototype with 22 vectors covering all 13 teaching weeks and explicit reading references.
- [x] Run 148 passing tests and a successful extension build. The build still reports a large-chunk warning. Check real topic queries across several fields and record weak short-query matches rather than treating coverage as an accuracy guarantee.

Current completion: catalog and real-outline vectors are connected to live search. All 1,739 discovered Fall 2026 outlines were collected and embedded; 775 have explicit weeks and 1,123 have structured teaching plans. Matching week-labelled notes can retrieve weekly topics with provenance. 148 unit tests, native embedding checks, production build and disposable Chrome integration checks pass. These checks do not establish real-query accuracy or the user's current account integration.

Next, in priority order:

1. **Reproduce real failures.** Validate the user's probability-note query, Piazza `cs246 a2`, and Möbius launch behavior with authorized live accounts; inspect missing metadata, course/term/section ambiguity and filters before tuning scores.
2. **Evaluate retrieval.** Build a sanitized labelled query set across subjects, including no-answer and wrong-course cases; measure recall, false positives and latency.
3. **Improve remaining outline layouts.** Work from saved bounded schedule structures, classify the 473 unsupported/prose plans and add source-derived fixtures. Keep lecture/module/date numbers separate from weeks; 100 external referrals need additional source documents.
4. **Add PDF content search in stages.** Bounded selectable-text extraction with page evidence, local storage, cancellation and keyword snippets first; passage vectors only after validation. OCR remains later work.
5. **Finish artifact delivery and refresh.** Git excludes generated sources, models and vectors. Document compatible bundle transfer or regeneration, then verify a fresh clone installation. Shared hosting is not implemented.

See [handoff.md](handoff.md) for concrete starting files and acceptance checks.

## October 12 semantic setup update

Hybrid search is now the user's next development priority. The opt-in local model, extension-owned worker, account-scoped IndexedDB embeddings, topic-weighted keyword/semantic blending, and reproducible model setup are implemented. Generic resource terms act as mild preferences in subject queries, while exact titles and assignment identities retain priority. Synthetic Node and isolated Chrome checks validate the initial integration. Model selection, threshold tuning, realistic retrieval benchmarks, full-text extraction, and live course validation remain open. See [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md).

Separate query-to-course scoring, broad subject abbreviations, a bundled Waterloo calendar title lookup, preserved descriptive course names, and source-update date operators are implemented. Course scores boost eligible resources without changing their original course associations. The [catalog baseline pipeline](COURSE_CATALOG_EMBEDDINGS.md) collects all entries from the current undergraduate and graduate calendars and generates a separate local description vector bundle. Loading those precomputed vectors into live ranking and enriching them with outlines remain integration tasks. The ranking weights and course cutoff remain provisional, and realistic course/date retrieval validation is still needed.

A local outline embedding prototype now imports supplied text or structured JSON and generates reusable course/topic/week/reading vectors. The supplied MATH 239 outline produces 22 vectors, with all 13 teaching weeks and explicit Enumeration/Graph Theory reading references. Live resource associations, bulk authenticated collection, broader real-outline validation, and shared delivery remain open. See [OUTLINE_EMBEDDINGS.md](OUTLINE_EMBEDDINGS.md).

## October 11 implementation update

Latest increment: bidirectional assignment filename aliases have regression coverage; unique
LEARN/Piazza course codes are associated automatically, with confirmation for duplicates.
Local MiniLM semantic retrieval is implemented behind a saved UI toggle, with strict filters and
asynchronous hybrid ranking. See `LOCAL_SEMANTIC_SEARCH.md` for setup and remaining browser checks.

Ranked matching, assignment/course aliases, conservative typo tolerance, and expanded tool-host recognition are now implemented. LEARN refresh performs bounded topic-detail/HTML inspection and stores direct shortcuts for verified empty ordinary link topics and single-link Möbius HTML pages. Instruction-bearing pages and LTI launches retain the LEARN route. See README for refresh/test steps. The later checklists below remain the broader roadmap; full semantic retrieval, arbitrary domains, course associations, and full-text retrieval are not implemented by this update.

## Recommendation

Add language-aware search in stages: reliable content/link discovery, ranked lexical search, typo tolerance and curated aliases, then optional semantic retrieval if evaluation shows that meaning-based queries still fail. A large language model is not required to recognize a Möbius hostname or correct a small typo. Embeddings are useful when a query and resource describe the same concept using different words, but they cannot recover a URL that was never indexed.

Keep the interaction immediate: show local matches on every keystroke. Enrichment, downloads, embeddings, and network refresh run independently of typing. Results must always point to an observed destination with course/source evidence.

## Current state and gaps

| Area | Implemented | Remaining gap |
| --- | --- | --- |
| LEARN | Enrollments, nested table of contents, local resource index, account checks, refresh | HTML page contents, navbar/tool links, external launch metadata, live edge cases |
| Piazza | Verified page-global CSRF access; feed/profile indexing code; bounded titles/snippets | New feed/profile schema and pagination still require live validation; no full-thread index |
| Combined search | Ranked lexical/hybrid matching, aliases, typo tolerance, source/course filters, recent history | Precomputed catalog/outline vector integration, threshold tuning, and broader real retrieval validation |
| Storage | Separate account-aware indices; actual byte usage displayed | Per-class coverage/refresh state, richer schema migrations, larger-data strategy |
| Navigation | LEARN context links and Piazza post links | Broader external destinations and launch validation |
| Link discovery | First pass described below | Links outside available metadata, redirects, opaque LTI launch links, other services |

The existing implementation checklist remains the record for integration, accessibility, and release work. This roadmap specifies the next search/data milestones.

## First pass implemented with this plan

- [x] Add `src/services.js` with a hostname-based Möbius recognizer for HTTPS `mapleserver.com` and its subdomains.
- [x] Recognize service destinations exposed in LEARN topic URLs, adding service aliases while preserving the existing LEARN launch URL.
- [x] Extract recognized anchors and bare URLs from available Piazza snippets before reducing their HTML to plain text. Add individual service-link results alongside their parent posts.
- [x] Include service name, aliases, and destination hostname in local search; normalize accents so `mobius` and `Möbius` match.
- [x] Permit recognized HTTPS Möbius destinations to open, with credentials and unsupported schemes rejected.
- [ ] Validate extraction against real Piazza snippets and LEARN topics after refreshing both indices.

Waterloo lists `https://uwaterloo.mapleserver.com/` on its [student digital-assets page](https://uwaterloo.ca/math/digital-assets-students). This is the initial evidence for recognizing the service. Hostname recognition does not verify that any specific activity is accessible, current, or associated with a particular course.

Limitations: existing saved entries need a source refresh to gain these fields. Links missing from a feed snippet cannot be recovered by this first pass. The recognizer does not guess custom Möbius domains, resolve short URLs, or inspect pages inside Möbius. A recognizable destination is useful even when the label is just “here”; an opaque launch URL remains unknown until supported evidence identifies its tool.

## Milestone 0 — Establish a trustworthy baseline

Priority: immediate prerequisite for more indexing and smarter search.

- [ ] Validate `user_profile.get_profile` account identity and `network.get_my_feed` with one small and one larger class.
- [ ] Check page boundaries, pinned duplicates, repeated pages, missing post numbers, and whether short pages actually imply the end of the feed.
- [ ] Compare indexed coverage to the website. A local cap or uncertain termination must remain explicitly partial.
- [ ] Verify refresh, cancellation, account switching, deleted posts, and forbidden courses across multiple tabs.
- [ ] Confirm whether feed retrieval changes read/unread state; do not assume every retrieval has no side effects.
- [ ] Create sanitized fixtures from observed schemas without student names, private messages, or authentication values.
- [ ] Record coverage per course and source: indexed count, refresh time, partial reason, body/link coverage, and last successful refresh.
- [ ] Show usable saved results while refresh is in progress, and retain them after transient failures.

Acceptance: combined search reliably opens observed resources; uncertainty about indexing is visible rather than presented as an empty course.

## Milestone 1 — Build a resource model that retains discovery evidence

Suggested files: `src/resources/model.js`, `src/resources/migrate.js`, adapter-specific normalizers.

- [ ] Add a versioned resource schema with `source`, source account, source course ID, optional canonical course ID, kind, title, body preview, folders, tags, aliases, timestamps, service name, and destination host.
- [ ] Separate `openUrl` from descriptive destination metadata. Include `launchMode` (`direct`, `learn-context`, `source-page`) and a parent/source URL.
- [ ] Store the observed evidence for a link: parent resource, anchor text, hostname, extraction location, and classification reason.
- [ ] Retain the original title alongside a readable derived label, such as “Möbius · Assignment portal”. Do not replace a vague title with an invented assignment number.
- [ ] Namespace resource IDs by source/account/course. Keep course identity distinct from similarly named courses in another term.
- [ ] Add an explicit mapping UI for LEARN course ↔ Piazza class. Suggest candidates by name/term, but require confirmation when ambiguous.
- [ ] Make service registry entries data-driven: known hosts, aliases, category, and permitted launch behavior.
- [ ] Add migrations for existing indices; allow reindexing if old fields cannot be safely reconstructed.

Acceptance: the same activity found in two sources keeps both provenances and its correct launch path; association errors cannot silently move it to another course.

## Milestone 2 — Find useful links even when descriptions are poor

Priority: highest-value feature immediately after integration validation.

### Discovery channels

1. LEARN topic destination metadata already available in the table of contents.
2. Anchors in accessible LEARN HTML content and course landing pages.
3. Piazza snippet anchors, followed by selected full-post bodies where snippets omit important links.
4. Course navigation links and external-tool placements, after verifying how Waterloo exposes them.
5. A user-invoked “Add this page” action with a course association and editable label when no reliable automatic source exists.

Implementation checklist:

- [ ] Parse HTML into an inert document; extract anchors before flattening text. Never insert source HTML into the overlay.
- [ ] Capture anchor text and nearby heading/paragraph context, bounded in size. Use the containing assignment/week only when that relationship is explicit.
- [ ] Support bare URLs, relative links, HTML entities, and repeated anchors. Deduplicate within a course without merging distinct activities.
- [ ] Recognize additional services from documented, observed hosts: Marmoset, Crowdmark, Gradescope, Git repositories, and course websites. Each needs its own evidence and test cases.
- [ ] Treat unknown sites as ordinary external links rather than guessing their product identity.
- [ ] Handle custom institution domains through reviewed registry additions or user naming.
- [ ] Detect authentication-bearing or expiring URLs. Keep a stable source-page/LEARN launch route instead of persisting reusable session tokens.
- [ ] Never remove arbitrary query parameters merely for deduplication; they may identify the assignment. Define service-specific canonicalization rules.
- [ ] Group a link and its source post when both would otherwise clutter the results. Preserve a route back to the source.
- [ ] Show the destination hostname before navigation and validate supported schemes/hosts at opening time.

### Möbius launch behavior

Möbius supports Brightspace LTI and deep links to activities; see [DigitalEd's Brightspace integration guide](https://www.digitaled.com/support/help/admin/Content/ADMIN-CONFIG/Connect-Brightspace.htm). Preserve the LEARN content launch route for such entries. Recognizing Möbius must not replace an authenticated LMS launch with a guessed direct URL. A normal observed direct link can be offered as such; an opaque LTI link should open through its source context.

Acceptance examples:

| Observed resource | Query | Expected result |
| --- | --- | --- |
| “Click here”, link to `uwaterloo.mapleserver.com` | `mobius` | Recognized link and/or its source post |
| “Weekly practice”, known Möbius destination | `Möbius` | The observed practice link |
| Assignment 3 heading containing “here” link | `assignment 3 mobius` | That activity, with parent evidence |
| Opaque LEARN activity with verified Möbius tool metadata | `mobius` | LEARN launch route |
| “Möbius” anchor pointing at an unrelated hostname | `mobius` | Text match may remain, but no trusted Möbius classification |
| No link or tool evidence anywhere in indexed data | `mobius` | No fabricated destination; offer source refresh/add-page guidance |

## Milestone 3 — Improve matching and ranking without a model

Suggested files: `src/search/normalize.js`, `src/search/aliases.js`, `src/search/rank.js`, `src/search/index.js`.

- [ ] Normalize case, accents, whitespace, punctuation, and course-code variants (`CS246` ↔ `CS 246`). Preserve C++/C# and mathematical notation where collapsing punctuation would change meaning.
- [ ] Add explicit aliases for service names and assignment shorthand (`A2`, `assignment 2`, `assn 2`). Keep number constraints strict: assignment 2 must not become assignment 12.
- [ ] Parse high-confidence query constraints: course, service, assignment number, resource type, and date intent. Natural filler words should not cause all-word matching to reject useful candidates.
- [ ] Rank exact titles/service names and matching identifiers ahead of fuzzy/body-only matches.
- [ ] Weight title, verified service/aliases, course, tags, heading context, and snippet as separate fields. Recent usage can break relevance ties, not overwhelm an exact match.
- [ ] Add conservative typo tolerance for sufficiently long terms, with exact matching preferred for short codes, post numbers, and assignment IDs.
- [ ] Evaluate Fuse.js against a small custom token matcher before adopting a dependency. [Fuse's documentation](https://www.fusejs.io/fuzzy-search.html) explains how location and thresholds influence matching in longer fields.
- [ ] Precompute normalized fields during indexing. Avoid reparsing HTML or rebuilding a fuzzy index on each keystroke.
- [ ] Apply course/source/access filters before selecting the top results. Rank across sources before the result limit so one large index does not hide the other.
- [ ] Explain less obvious matches briefly (“Möbius link”, “Matched assignment alias”, “Similar spelling”).

Acceptance: `mobiuss`, `a2 cs246`, and common abbreviations find the intended indexed resource while unrelated short strings do not flood the list. Proposed target: p95 local matching under 50 ms for 10,000 compact resources on the agreed test laptop, measured separately from rendering.

## Milestone 4 — Evaluate semantic retrieval, then decide whether to ship it

NLP is a broad category. Normalization, aliases, and intent parsing already add useful language handling. Embedding-based semantic search adds meaning similarity: for example, “practice for inheritance” may match “Class hierarchies exercises”. It can also be wrong, particularly with short vague titles.

The [Sentence Transformers semantic-search guide](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html) describes query/document embeddings. [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) supports browser inference with WASM or WebGPU. These establish technical options, not a model choice or extension compatibility guarantee.

- [ ] First collect failed realistic queries after lexical improvements. Do not introduce a model without a measurable retrieval gap.
- [ ] Evaluate a small retrieval embedding model on the project corpus; measure model download size, warm/cold latency, memory, multilingual behavior, and accuracy.
- [ ] Embed meaningful title + course + tags + bounded context. A bare “here” should inherit observed link/service evidence before embedding.
- [ ] Generate vectors during refresh in a worker, cache by content hash and model version, and recompute only changed records.
- [ ] Show lexical results immediately. Merge semantic candidates asynchronously; discard responses from old queries and avoid moving a keyboard-selected result unexpectedly.
- [ ] Combine lexical and semantic rankings, initially using reciprocal rank fusion, with hard course/service/identifier constraints applied first.
- [ ] Keep exact identifiers above merely similar content. Use an evaluated relevance threshold and never manufacture a destination.
- [ ] Test extension Manifest V3/CSP packaging, model/runtime loading, worker lifetime, CPU fallback, and cancellation before committing to a browser-model architecture.
- [ ] Keep local inference the preferred design. Any remote search/embedding option needs explicit user-facing data-sharing controls and a separate product decision.

Decision gate: on a labelled set of at least 50 queries, improve top-5 recall for paraphrases by a proposed 15 percentage points without reducing exact-link success. Also meet a measured latency/memory budget. If it fails this gate, ship the simpler matcher and improve discovery.

## Milestone 5 — Storage, refresh, and responsiveness

- [ ] Measure actual bytes per source/course and distinguish text, metadata, model assets, and vectors.
- [ ] Keep compact metadata in extension storage; evaluate IndexedDB for larger body/vector/model caches and migrations.
- [ ] Add class removal, per-source clearing, staleness labels, and bounded retention rather than automatically requesting unlimited storage.
- [ ] Avoid truncating before link extraction. Keep extracted link evidence even when a body preview is shortened.
- [ ] Add incremental update/version handling once Piazza change markers are verified; retain bounded refresh and throttling behavior.
- [ ] Verify concurrent refreshes and clearing during a refresh cannot restore obsolete entries.
- [ ] Make rendering and indexing cancellable; avoid main-thread model computation or huge storage reads per keystroke.

For scale: 2,000 vectors × 384 dimensions × 4 bytes is 3,072,000 bytes (~2.93 MiB) of raw float32 values before metadata and serialization overhead. Chrome's [local storage quota](https://developer.chrome.com/docs/extensions/reference/api/storage) is 10 MB on current Chrome, shared by both current indices. Model files are additional. Measure real usage before choosing a storage layout.

## Milestone 6 — Deadlines and relevant preparation materials

Build this after discovery, course association, and ranking are reliable.

- [ ] Gather structured LEARN assignment/quiz/calendar dates where permitted and verified.
- [ ] Extract candidate dates from instructor Piazza announcements with evidence, year/timezone, and assessment identity.
- [ ] Treat announced changes and multiple milestones separately. Do not equate a post timestamp with a due date.
- [ ] Flag conflicting/ambiguous dates for confirmation. Store source and extraction confidence; support manual correction.
- [ ] Recommend materials using explicit assignment links, course/week context, tags, and evaluated retrieval, with an explanation of each association.
- [ ] Show upcoming assessments with a direct submission/launch link when observed and a route to the original deadline source.

Acceptance: an assignment with two deadlines produces two named milestones; related material suggestions never override authoritative course instructions.

## Evaluation and rollout

Create a sanitized benchmark spanning both sources and at least three course styles. Include exact names, typos, aliases, natural questions, vague labels, link-only entries, numbers, stale resources, LTI launches, and no-answer queries. Track top-1 destination accuracy, recall@5, wrong-course results, no-answer behavior, and p50/p95 latency.

Automated checks should cover normalization/ranking, link extraction/classification, launch URL handling, account isolation, schema migration, pagination and cancellations. Browser checks should cover real anchors, source refresh, keyboard navigation, selection during updates, multiple tabs, and launch authentication. Mock tests alone cannot confirm the internal Piazza API or Waterloo LTI behavior.

Roll out in small reviewable increments:

1. Validate combined indexing and the first-pass Möbius recognizer.
2. Add structured link evidence, selected HTML/post enrichment, and course associations.
3. Add ranked matching, aliases, and typo tolerance with benchmark results.
4. Decide on semantic search using the evaluation gate.
5. Add deadlines and grounded preparation suggestions.

The next build should prioritize an observed “click here” Möbius link and a handful of real failed queries. These give concrete acceptance cases for both better discovery and better matching.
