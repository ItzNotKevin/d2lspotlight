# Next milestone: daily-use reliability

Current plan for v0.8.0, October 25, 2026. This replaces the priority order in the historical roadmap. PDF/Office search, semantic passages, course websites, and experimental OCR are implemented; live-account validation remains separate.

## 1. Record a real-course search baseline

- [ ] Collect 30–50 natural queries across at least three actual courses. Label expected resources before running retrieval; reserve a held-out group for validation.
- [ ] Include exact titles, assignment aliases, document-only paraphrases, wrong-course distractors, filters, and at least six no-answer queries.
- [ ] Include reported failures: `cs246 a2`, `lecture notes` for `week_05 annotated`, and the original probability-note query once its actual wording is available.
- [ ] Save private examples in ignored `benchmark-results/my-courses.json`, using the schema in [the evaluation guide](benchmarks/SEARCH_EVALUATION.md).
- [ ] Record hit@1, hit@5, recall@5, MRR@5, and no-answer false positives. Classify each miss as absent data, extraction, association, filters, or ranking before changing scores.

Acceptance: a recorded real-course baseline and classified misses, with before/after evidence for fixes. Synthetic examples remain regression aids, not evidence of real-course accuracy.

## 2. Validate live integration

Build, reload the extension, and refresh source tabs before these checks. Record version, date, actual behavior, and pass/fail for each. Use authorized accounts; keep credentials, launch tokens, and private posts out of committed reports.

| Case | Check | Pass condition |
| --- | --- | --- |
| Piazza A2 | Refresh CS246, confirm friendly label, search `cs246 a2` from both sites with filters cleared | Correct A2 opens; A12 and CS245 do not substitute |
| Möbius | Refresh course, launch observed activity by mouse and Enter | Correct authenticated activity opens; instructional pages retain instructions |
| Interrupted indexing | Close mid-scan, reopen, restart Chrome | Saved progress resumes; completed text remains searchable |
| Expired session | Sign out, search elsewhere, sign back in and check login | Clear login state and successful recovery |
| Account switch | Switch authorized accounts and refresh | Previous account results do not appear for the new account |
| Shortcut/focus | Reopen rapidly, switch tabs, use standalone window and keyboard | One usable overlay/window, correct selection and focus restoration |
| Website permission | Include a supported site in a clean browser profile | Permission and indexing work; declining leaves LEARN usable |

Use [the detailed integration notes](BUGS_AND_NEXT_STEPS.md) to investigate failures. None of these live cases is marked complete by fixture tests.

## 3. Prepare a classmate beta

- [ ] Verify fresh clone/build/install in a clean Chrome profile, including model availability and package size. Current uncached OCR setup downloads about 389 MiB.
- [ ] Walk through course selection, indexing, and a first successful search. Distinguish indexing, login needed, and no matches.
- [ ] Provide a packaged build, short installation instructions, and visible version information.
- [ ] Have 3–5 classmates attempt resource-finding tasks; record setup friction and failed queries with their permission.

After this milestone, consider an assignment preparation view joining observed submission links, relevant notes, and Piazza clarifications. Keep OCR experimental while reliability is validated.
