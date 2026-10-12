# Contextual study search: research, plan, and implemented first stage


Latest update: v0.3.0 implements optional local semantic retrieval, bidirectional assignment aliases, and automatic unambiguous course associations. See [LOCAL_SEMANTIC_SEARCH.md](LOCAL_SEMANTIC_SEARCH.md) for setup, validation, and remaining work. Earlier stages below retain their planning context.

October 11, 2026. Goal: interpret the context already available in the index, so students can find resources without reproducing filenames. Outline retrieval is a later stage.

## Research and choice

| Tool / repository | What it provides | Fit here |
| --- | --- | --- |
| [winkNLP](https://github.com/winkjs/wink-nlp) | Tokenization, POS tagging, named entities, custom entity recognition | Useful if queries become grammatically complex; academic entities still need domain-specific rules. |
| [Compromise](https://github.com/spencermountain/compromise) | Browser-capable text matching, tagging, number normalization, extensible vocabulary | Useful for expanding natural-language parsing later; does not itself establish week topics or instructor authorship. |
| [FlexSearch](https://github.com/nextapps-de/flexsearch) | Browser indexing, document search, token matching, proximity-based context | Candidate for scaling full-text search. Its context feature concerns nearby terms, rather than course/week inference. |
| [Meilisearch](https://github.com/meilisearch/meilisearch) | Search server with filtering and hybrid search | Candidate for a future hosted/shared product. Adds server infrastructure beyond the present local extension. |

Decision: implement a small, explicit metadata inference and query-intent layer on top of the existing local ranker. No new runtime dependency, model download, inference service, or per-keystroke network call is required. This is rule-based contextual retrieval, not a general reasoning model. The rules and their inferred matches are visible and testable.

Course subject evidence for the initial small vocabulary:
- [Waterloo STAT 230: Introduction to Probability](https://uwaterloo.ca/scholar/dkchisho/classes/stat-230-introduction-probability).
- [Waterloo Statistics course descriptions](https://ucalendar.uwaterloo.ca/2324/COURSE/course-STAT.html) for STAT 230/231. This is a historical catalog; it supports broad subject labels, not a current term's week-by-week curriculum.

## Stage 1 — implemented

### Interpret existing metadata

`src/search/context.js` caches inferred facts for each resource:
- Course code: known broad subject aliases currently cover STAT230 → probability and STAT231 → statistics.
- Week number: filename takes priority over module path; `week_05`, `week 5`, and `wk05` are recognized.
- Study material: annotated/lecture/notes/slide evidence generates lecture-note aliases. Assessment titles are excluded from this inferred category.
- Annotation status: inferred from the title. This does not establish who made the annotations.
- Related concepts: a small explicit vocabulary covers counting/enumeration/combinatorics, inheritance/subclasses, recursion/recursive, differentiation/derivatives, and integration/integrals. These are related retrieval terms, not assertions of equivalence.

### Interpret queries

- `latest`, `newest`, `most recent`, and `this week` request the latest **available** study notes.
- `teacher's notes`, `professor notes`, and `instructor lecture notes` prefer resources marked annotated. This is a search heuristic, not verified authorship.
- Natural query connectors such as `in` and `from` do not require literal matches.
- Course and assignment identifiers continue to use the existing strict numeric matching.

### Rank and explain

- Exact title and explicit metadata matches have stronger weights than inferred subject/filename matches.
- Related-concept expansion is weaker again, so exact enumeration results outrank combinatorics matches.
- Latest intent reorders results within each course's existing result slots: highest available numbered week first; modification dates are used when neither result has a week. Numbered weeks precede undated/unnumbered materials.
- Existing filters apply before ranking and the result limit; original resource identities remain intact for recent history and opening links.
- Inferred results show **Course/file context** or **Related concept**. Latest queries show an explanation of the available-week ordering.
- No new cache migration or source refresh is necessary for inference on existing resources; a source still needs correctly indexed labels/content.

### Validate

Implemented regressions cover:
- `week_05_annotated.pdf` in STAT230 matching subject, week, and annotated-note queries.
- Latest ordering within courses, timestamp fallback, and filtering/limits.
- Exact concepts outranking related concepts.
- Strict course and assignment boundaries.
- Negative checks: generic week 5 probability notes do **not** automatically match conditional probability or combinatorics.

Manual test after rebuilding/reloading the extension and tabs:
1. `stat230 lecture notes`
2. `probability lecture notes`
3. `latest stat230 notes`
4. `stat230 week 5 annotated`
5. `professor notes stat230`
6. `enumeration` against an indexed resource explicitly mentioning combinatorics/counting.
7. `stat231 enumeration` and `cs246 a12` as negative/wrong-course checks where applicable.

## Stage 2 — improve evidence and breadth

- [ ] Gather 30–50 real student queries, relevant resource IDs, expected top results, and negative examples. Measure top-5 recall, first-result usefulness, and false positives against the lexical baseline.
- [ ] Expand course subjects from authoritative catalog/enrollment titles rather than maintaining an ever-growing guessed map. Preserve provenance and catalog/term versions.
- [ ] Share course associations across LEARN and Piazza while retaining distinct term/section IDs. Current latest ordering uses source course IDs; separately indexed sites are not assumed to be the same class.
- [ ] Normalize more evidenced naming conventions (`lecture_05`, `unit 3`, `module 4`), with distinct units rather than equating them to weeks.
- [ ] Add explicit user corrections for material type, topic, and annotation authorship. Prefer user-confirmed/source evidence over heuristics.
- [ ] Add a dedicated explanation panel if inferred labels become insufficient.

## Stage 3 — course outlines, deferred

- [ ] Retrieve the authorized/public outline for the specific course, section, instructor, and term.
- [ ] Extract week/topic associations with source citations and uncertainty. Require validation of ambiguous schedules.
- [ ] Attach outline-derived topic evidence to matching lecture resources. Do not infer a specific week topic from the catalog subject alone.
- [ ] Derive the actual teaching week only with a reliable term schedule, breaks, and explicit week numbering. Highest uploaded week may be posted ahead of teaching.
- [ ] Confirm dates against authoritative assessment sources before adding deadline recommendations.

## Stage 4 — learned semantic retrieval if evaluation justifies it

- [ ] Compare the enriched metadata baseline against embeddings on the same query set.
- [ ] Evaluate a local model for paraphrases beyond the curated vocabulary, preserving strict identifier filters and source evidence.
- [ ] Consider NLP libraries for broader intent/entity grammar if the current bounded parser becomes hard to maintain.
- [ ] Extract headings/document text only where metadata/outline evidence remains insufficient.
- [ ] Benchmark cold start, incremental refresh, memory, and keystroke latency in the actual MV3 extension before shipping a model.

## Boundaries

This stage can infer a resource's likely role and broad course subject. It cannot read an unseen PDF, establish who annotated it, know the current teaching week from a filename, or repair missing Piazza posts/course labels. Existing Piazza naming and Möbius launch integration bugs remain separate work in `BUGS_AND_NEXT_STEPS.md`.
