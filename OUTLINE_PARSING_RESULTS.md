# Outline parsing results — October 12, 2026

All 1,739 discovered Fall 2026 viewer records were recollected using capture version 4, across 156 subjects and 1,682 course codes. There were zero capture failures. The scope is this term's discovered viewer records, not all historical Waterloo outlines.

| Measure | Before | After |
| --- | ---: | ---: |
| Outlines with explicit parsed weeks | 497 (28.58%) | 775 (44.57%) |
| Outlines with structured teaching entries of any supported kind | Not measured | 1,123 (64.58%) |
| Structured plans containing teaching-topic text | Not measured | 1,089 (62.62%) |
| Weekly plans containing teaching-topic text | Not measured | 743 (42.73%) |

278 outlines gained explicit weeks; none of the previously weekly-parsed outlines lost all their weeks. This is a coverage comparison, not proof that every extracted topic is correct. Reference-only entries count as structured plans but do not create topic vectors. There are 32 weekly plans with references only, and 34 reference-only plans across all kinds.

## Implemented changes

- Preserve bounded schedule structure, paragraph boundaries, links, and table rowspan/colspan geometry so offline adapters can reparse without another authenticated collection.
- Parse explicit week/date labels, Unicode bullets, ranges, Roman/spelled numbers under appropriate headers, French week labels, partial headers, multiple topic columns and constrained headerless layouts.
- Extract lecture, module, unit, chapter, dated/calendar and thematic teaching entries with literal dates and source evidence. These labels do not become invented week numbers.
- Keep identifiable references, assessment events and external schedule referrals separately. Suppress empty/punctuation-only teaching topics and reference-only topic embeddings.
- Embed nonweek teaching text as schedule chunks for course context. Resource-number inference remains restricted to explicit weeks and matching course/term/section evidence.

Source-derived review cases include STAT 202 (12 weeks), STAT 850 (12 weeks), STAT 331 (13 weeks), STAT 330 (12 reference-only weeks), CS 246 (24 teaching lectures), PHYS 121 (6 modules), CHEM 120 (20 dated entries), ENGL 109 (6 units) and MATH 135 (external schedule referral). Their source links and layout descriptions are in [the format strategy](OUTLINE_PARSING_STRATEGY.md).

## Remaining coverage

These categories are exclusive:

| Classification | Outlines |
| --- | ---: |
| Explicit weeks | 775 |
| Other structured teaching plan | 348 |
| Unsupported layout or prose | 473 |
| External schedule referral | 100 |
| No plan found | 43 |

Schedule kinds overlap: 66 outlines contain lecture entries, 70 modules, 22 units, 24 chapters, 175 dated entries and 69 thematic topic entries. Residual text remains in 1,542 outlines, including successfully parsed plans; it can contain introductions, references, events or additional unsupported content.

Dense cells can still mix teaching topics with tutorial/administrative wording (for example STAT 850's inline tutorial details). Date labels remain source strings, not normalized deadlines or evidence of the current teaching week. Calendar entries that only name a module do not establish that module's detailed topic. External referrals need additional source documents to improve coverage; parser changes cannot recover absent information. Nonweek filename associations and PDF-content verification remain future work.

## Rebuilt artifacts and validation

The complete outline bundle contains 36,812 unique 384-dimensional vectors (56,543,232 bytes): 16,395 generated and 20,417 reused. All 1,739 outlines were embedded and packaged in the production build. Source structures, coverage reports and generated bundles remain in ignored `outline-data/`; parser code, tests and documentation are tracked in Git. See [handoff.md](handoff.md) for transferring or regenerating the artifacts on another machine.

148 unit tests pass, including eight source-derived structural adapter tests. Native cross-field embedding and token-limit checks pass. The production build passes. Disposable Chrome confirms dialog rendering, simulated stale-context recovery, broker/offscreen/worker inference, cache cleanup and real STAT 230 outline evidence: `probability mass functions notes` ranks the Week 5 fixture at 0.6194 versus Week 6 at 0.4393. This uses fixture resources with real outline vectors; it does not verify the user's currently saved resources. Full browser extension reload remains unverified; the deterministic stale-root recovery test passes.

To reapply adapters and refresh packaged search evidence:

```sh
npm run reparse:outlines
npm run report:outlines
npm run embed:outlines -- outline-data/collected/F26/outlines.json
npm run build
```

Reload Spotlight in `chrome://extensions`, then refresh existing LEARN/Piazza tabs to use the rebuilt bundle and extension-context fixes.
