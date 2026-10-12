# Waterloo Spotlight: ranked product ideas

Prepared October 11, 2026 after reviewing the current README, search code, and implementation roadmap. These are proposed features, not implemented capabilities. Rankings reflect expected student value, frequency of use, and fit with the existing extension; they are product judgments rather than measured user research.

## Direction

Make Spotlight answer three recurring questions:

1. Where is the thing I need?
2. What do I need to do next?
3. What should I review to do it?

The strongest next feature is an upcoming-assessments view with grounded preparation resources. Keep ordinary search immediate and keyboard-driven. When Spotlight opens, surface useful upcoming work; when the student types, search takes priority.

The current extension already combines local LEARN/Piazza metadata, supports source/course filters and recent history, and recognizes some Möbius links. It does not yet index assessment dates, full document contents, all tool destinations, or semantic embeddings. Piazza profile/feed indexing still needs live verification.

## Ranked ideas

Effort is relative: Small = a focused increment; Medium = several related changes; Large = new retrieval/storage/UI architecture or significant integration validation. Value ranking and build sequence differ because some high-value features need prerequisites.

| Rank | Idea | Student benefit | Effort | Dependency / first version |
| --- | --- | --- | --- | --- |
| 1 | **What's due + preparation packs** | See upcoming assignments, quizzes, and tests, with instructions, relevant notes, practice, and the submission link | Large | Verified dates and course associations; start with explicit related links |
| 2 | **Forgiving, ranked search** | Find `cs246 a2`, misspellings, abbreviations, and vague titles without remembering exact words | Medium | Improve existing matcher; exact identifiers stay strict |
| 3 | **Course tool shortcuts and link discovery** | Find Möbius, Marmoset, Crowdmark, Gradescope, Git repos, and course sites even under “click here” | Medium | Expand observed link extraction and service registry; preserve LMS launch context |
| 4 | **Search within notes, slides, and selected posts** | Find a concept inside a PDF or discussion instead of only in its filename | Large | Bounded retrieval, extraction, permissions, and larger text storage |
| 5 | **One identity per course across sources** | A course filter includes its LEARN content, Piazza class, tools, and personal links | Medium | Friendly course names, term/section identity, explicit source associations |
| 6 | **Important changes digest** | Notice deadline changes, assignment clarifications, and corrected materials | Medium–Large | Reliable refresh/version tracking; distinguish instructor updates from ordinary activity |
| 7 | **Keyboard commands and personal shortcuts** | `due`, `open mobius`, `cs246`, pinned tools, and recent resources shorten common tasks | Small–Medium | Ranked search and destination evidence; commands may resolve to multiple choices |
| 8 | **A manageable weekly work plan** | See workload clusters and create editable study/work blocks before deadlines | Medium | Dates plus user-entered effort/availability; avoid pretending to know task duration |
| 9 | **Optional reminders and calendar export** | Get useful reminders without checking every course site | Medium | Trusted deadlines and refresh status; begin with explicit export before background sync |
| 10 | **Exam hub** | Official time/location links, instructor coverage, review sheets, and practice in one place | Medium–Large | Correct course/section matching and official-source verification |
| 11 | **Add this page + personal study collections** | Include a course site, useful article, repository, or personal note that automatic indexing misses | Small–Medium | Course association and editable labels; save observed links |
| 12 | **Active review from course material** | Turn selected notes into practice prompts/flashcards and track what needs review | Large | Full-text extraction and source-linked generation; optional study workflow |
| 13 | **Hybrid semantic search** | Queries like “practice for inheritance” can find differently worded material | Large | Benchmark lexical failures first; keep immediate lexical results as fallback |
| 14 | **Study-group resource sharing** | Share a curated pack and coordinate preparation | Large | Share references/approved notes, respecting source access and private-post boundaries |
| 15 | **Optional cross-device access** | Carry bookmarks, plans, and course setup between devices | Large | Account/sync design and explicit data controls; mobile UI is a separate product surface |
| 16 | **Wider campus academic search** | Find relevant library resources, office hours, support services, and official dates | Medium–Large | Search trusted sources with academic/campus scope separate from enrolled-course content |

### Why the first five matter most

- **Rank 1 turns searching into action:** students open one assessment and get the small set of links needed to begin.
- **Rank 2 fixes a daily failure:** the current matcher requires every word to appear somewhere and has no relevance scoring. Better normalization, aliases, ranking, and typo tolerance have immediate value.
- **Rank 3 addresses fragmented delivery:** recognizable tool hosts and launch metadata carry useful information even when surrounding text does not.
- **Rank 4 expands coverage:** semantic search cannot retrieve a concept hidden in an unindexed document.
- **Rank 5 prevents wrong-course results:** combining sources is only dependable when their course and term identities align.

Before treating any of these as finished, validate current source coverage, account changes, refresh cancellation, storage limits, accessibility, and real link opening. These are prerequisites rather than optional feature ideas.

## Flagship feature: upcoming assessments with preparation resources

Yes, collect deadlines. Build an assessment index alongside the resource index, then associate resources with assessments. Do not infer an authoritative due date from an arbitrary date mentioned in a post.

### Student experience

The default Spotlight view shows a compact “Due soon” section for today and the next seven days, plus recent shortcuts. For example (illustrative, not real course data):

> CS 246 · Assignment 2 · due Friday at 5:00 p.m.
> Source: LEARN assignment · checked recently
> Instructions · Related lectures · Practice · Instructor clarifications · Submit

Selecting the assessment expands a preparation pack. It should distinguish explicitly linked requirements from suggested related materials. A student can pin a correct resource, remove an irrelevant suggestion, or correct an association.

“Automatically bring up resources” should mean automatically showing that pack in Spotlight. Open tabs only on the student's action; an “Open selected resources” action can open a chosen subset. Keep ordinary search available throughout.

Support natural commands such as `due this week`, `cs246 assignment 2`, and `prep for stat230 quiz`. Initially these can use a deterministic intent parser and local filtering. They do not require a language model.

### Where deadlines come from

| Source | Intended role | Validation required |
| --- | --- | --- |
| LEARN assignment/quiz details | Structured activity dates, if available to the signed-in student | Discover supported endpoints and effective fields; validate roles, pagination, overrides, and time zones |
| LEARN calendar | Another source of course event dates and references | Verify coverage, activity identity, and whether entries duplicate assignment/quiz records |
| Instructor announcements/Piazza posts | Changes, clarifications, or dates absent from structured records | Identify author role from verified metadata; retain the quoted date context and source |
| Course outlines and official course sites | Assessment schedules and coverage | Match term/section; distinguish tentative schedules from final instructions |
| Official Waterloo exam schedule | Final exam time/location where applicable | Match course/section and check updates; retain official links |
| Student-entered dates | Personal tasks, confirmed overrides, and missing deadlines | Clearly label them as user-entered and keep separate from source-derived records |

Waterloo's [LEARN organization guidance](https://uwaterloo.ca/centre-for-teaching-excellence/catalogs/tip-sheets/optimizing-your-learn-site-students) recommends schedules and calendar due dates. Its [weekly-page guidance](https://hive.uwaterloo.ca/course/open-resource-repository/390/page/supporting-student-navigation-learn/14015) also discusses pointing students to course schedules and announcements. This supports gathering dates from multiple course surfaces; it does not establish that every course fills in LEARN calendar data or that our extension can access every tool.

For final exams, Waterloo directs students to the [official examination schedule and personalized Odyssey schedule](https://uwaterloo.ca/the-centre/academics/final-examinations). Do not estimate an individual exam date from the general examination period. Authenticated exam access would need separate validation; no connector is assumed here.

### What an assessment record needs

- Stable source/activity identity, source account, course, term, section where known, title, type, and separate milestone names.
- Due date, release/start date, availability/end date, and exam start/end represented distinctly. An activity closing at midnight is not automatically due at midnight.
- Source timezone, absolute timestamps where supplied, and date-only/unknown-time representation. Display in America/Toronto with daylight-saving handling; do not invent a time for date-only entries.
- Source URL, last checked time, extraction method, and status: structured, user-confirmed, text-derived candidate, conflicting, or stale.
- Observed submission/launch URL and assessment instruction references.
- Personal completion state with provenance. Opening a link is not completion or submission; manual “done” must remain distinguishable from verified submission status.

### Date trust and corrections

- Prefer verified, effective activity dates for the current student when those dates are available.
- Retain instructor changes as evidence. A newer explicit change can supersede an older instruction, but unrelated recent text cannot silently override a structured date.
- Show disagreement and the relevant sources. Ask the student to confirm unresolved conflicts rather than hiding them behind a confidence score.
- Treat personalized extensions separately from class-wide dates. If the source exposes only general dates, disclose that coverage limitation.
- Keep DD1/DD2, checkpoint/final, quiz opening/closing, and exam start as distinct milestones.
- Do not label an unindexed course “nothing due.” Say that its assessment coverage is unavailable or incomplete.
- Refresh dates before notifications where possible; clearly indicate staleness and changes.

### How corresponding resources are found

Build preparation packs in this order of evidence:

1. Links explicitly included in the assessment instructions or an associated instructor post.
2. References to exact lecture numbers, readings, topics, or review sheets.
3. Materials in the same confirmed course/week/module or assessment folder.
4. Ranked topic matches from indexed titles/tags/text.
5. Evaluated semantic similarity, later, labelled as a suggestion.

The due date decides **when to surface the pack**; it does not establish **which topics belong in it**. Do not automatically recommend all recently published notes. Keep “instructions and submission”, “required preparation”, and “suggested review” visibly distinct.

Each suggestion should explain its link, such as “Referenced in Assignment 2” or “Same topic: inheritance”. Missing coverage should produce a useful source link, not generated claims about what is on the test.

## Proposed build sequence

### Release A — Search and navigation foundation

- [ ] Validate current combined indexing and live refresh behavior.
- [ ] Add friendly course names and LEARN/Piazza course association.
- [ ] Add ranked matching, assignment/course aliases, and conservative typo tolerance.
- [ ] Expand link extraction and service support using observed destinations.
- [ ] Add assessment records with manual entry so the data/UI model can be tested before adapters are complete.

### Release B — Due soon

- [ ] Verify student-accessible LEARN assessment/calendar retrieval.
- [ ] Implement one reliable activity type first, then expand to quizzes/events.
- [ ] Add timezone-aware today/week views, source links, staleness, and duplicate reconciliation.
- [ ] Include text-derived date candidates from selected instructor posts with confirmation.
- [ ] Validate against several actual courses, including one with sparse calendar data and one with changed dates.

### Release C — Prepare for this assessment

- [ ] Extract explicit material references and submission links.
- [ ] Build course-scoped preparation packs with association explanations.
- [ ] Add pin/remove feedback and user-confirmed course/resource corrections.
- [ ] Add bounded document/post text extraction and improve topic retrieval.
- [ ] Keep packs locally available and measure search/rendering latency.

### Release D — Planning and study assistance

- [ ] Add editable weekly work blocks and optional reminders/calendar export.
- [ ] Add an exam hub using verified official/instructor sources.
- [ ] Evaluate semantic retrieval on queries the simpler matcher still misses.
- [ ] Trial optional source-linked practice generation after extraction quality is established.

## Success measures and tests

Track opening the intended resource in the top three results, time to find a tool, verified assessment coverage, correct date/time display, unresolved conflicts, useful preparation suggestions, and warm-search latency. Measure student outcomes through a small usability trial rather than treating feature count as success.

Acceptance scenarios:

- `mobius` finds a vague-label observed link while preserving its LEARN launch route.
- `cs246 a2` matches the correct assessment and not Assignment 12 or a different term.
- An instructor moves a date; the prior date and the evidence for the change are traceable.
- A record says a due date and a later closing date; both remain distinct.
- A date has no time; the UI does not invent 11:59 p.m.
- An assessment has DD1 and DD2; both appear without being merged.
- A course has no imported assessment data; the UI says coverage is missing.
- Suggested materials stay in the correct course and explain their relation.
- An assessment is near, but refresh is offline; cached results are labelled stale.
- A source account changes; private resources, dates, associations, and recent history cannot bleed across accounts.

## Features to defer

A general chat assistant, broad web crawling, automatic answer generation for coursework, predictive grades, group-chat integrations, and automatic tab opening would add substantial complexity before solving the main navigation/deadline problem. Prioritize observed resources, reliable dates, and clear actions. Keep local indexing the default; any remote processing or cross-device sharing requires a deliberate product/data-flow choice.

For the implementation detail behind search and enrichment, see [SEARCH_ROADMAP.md](SEARCH_ROADMAP.md). For existing delivery gaps, see [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).
