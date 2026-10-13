# Outline format review — October 12, 2026

## Files actually inspected

The supplied Downloads manifest and `vectors-b048e7fdb156ff05ef24.f32` are a **course-catalog** bundle: 6,467 courses, 6,494 chunks, and 6,249 unique vectors. They contain catalog descriptions, publication/effective metadata, and course identities, not term-specific weekly teaching schedules. Catalog `effectiveFrom` dates are not lecture or assessment dates.

The imported files are preserved locally under ignored `outline-data/catalog-embeddings/`. Binary SHA-256 and dimensions pass; model asset hash matches the installed pinned model. Before authenticated collection, no real outline bundle/source text was present in this checkout. The earlier MATH239 prototype was described in incoming documentation but its ignored source/artifacts were not delivered by Git. We cannot generalize from those docs to all courses.

## Real viewer collection

The current-term collector discovered 1,739 unique outline URLs across 156 calendar subjects. Real STAT 230 section 001–004 data has 13 teaching weeks, with combined labels such as `Week 1(Sept. 9 - 11)`. Week 5 explicitly covers discrete random variables, probability mass functions, cumulative distribution functions, and functions of a random variable. This is evidence from the outline, not a guess from the filename. Section 081 has a different outline.

Other collected courses use week-only tables, prose plans, date-based schedules, or instructions to consult LEARN. Unparsed schedules are retained and flagged; they do not create inferred week mappings. The completed version-4 collection has 1,739 outlines: 775 have explicit parsed weeks (44.6%), and 1,123 have structured teaching plans (64.6%). Of these, 1,089 contain topic text. Retained residual schedule text exists in 1,542 outlines and can coexist with successful extraction. See the generated coverage report for details. Dates remain literal source labels, not normalized deadlines.

## Current parser and fixtures

The outline parser already supports **week number plus optional date labels**:

- Vertical schedule fixture: Week 1, `Sep 9, 11`, topic, readings; Week 2, `Sep 14, 16, 18`.
- Tabular fixture: `Week | Topics | Readings | Dates`, with Week 2 and `Jan 12`.
- Markdown table or `Week 1: ...` list without dates.
- Explicit publication dates are stored separately from teaching dates.

Normalized schedule entries contain `{ week, topics, dateLabels, references, evidence }`. Both weeks and dates can coexist. Week numbers and date labels stay in metadata, not in topic embedding text.

## Limitations

- Structured import supports explicit weeks, lectures, modules, units, chapters, dates, and thematic topic lists. Complex prose and ambiguous layouts remain unsupported; none receive guessed week numbers.
- Date labels remain source strings. They are not normalized calendar intervals and do not infer missing years/timezones, reading-week shifts, or the current teaching week.
- User queries saying “this week” are currently a newest-indexed-note shortcut, not verified calendar mapping.
- Source modification dates are different from publication, teaching, and due dates.
- Live matching course/term/section outlines now replace calendar context in the course-relevance boost; explicit outline-week-to-note associations are now implemented. A calendar course description alone cannot establish what week_05 teaches.

Next: improve remaining complex prose/layouts, normalize unambiguous calendar ranges, and associate nonweek entry kinds with resources using explicit course/term/section evidence. Ask about genuinely ambiguous dates rather than assuming Week 1 means a fixed September date.

Verified alternative formats include CS 697’s date-based meetings (September 11 and September 18, without week numbers), MATH 145’s content-thread/problem-set plan, and HEALTH 107’s `Weeks` / `Lecture Topic` / `Tutorial Topic` table. The HEALTH table includes a Week 0 orientation and colon-form date labels; orientation is skipped, and teaching weeks retain separate lecture topics and dates. These are real source formats, rather than synthetic examples.

ACTSC 363 (`nc3jfs`) uses a headerless two-column table with `W2 - Sep 14 & 16` labels and blank-week continuation rows. The updated parser extracts W2–W12, merges W2/W4 continuation topics, and retains cancelled W1, reading week and the unnumbered December 7 makeup session separately. All stored outlines have since been recollected with capture version 4.

See [OUTLINE_PARSING_STRATEGY.md](OUTLINE_PARSING_STRATEGY.md) for the subsequent nine-page manual review and prioritized adapter strategy.

The implemented adapters and final measured coverage are recorded in [OUTLINE_PARSING_RESULTS.md](OUTLINE_PARSING_RESULTS.md).
