# Local search integration — October 12, 2026

This supersedes the earlier local-only v0.3 implementation description. The current runtime and setup are documented in [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md).

## Preserved work

The complete pre-integration local implementation is recoverable on branch `backup/local-search-2026-10-12`, commit `bcd912d`. Incoming `origin/main` at `b959e6a` includes six overlapping commits since `d744637`.

## Combined implementation

- Keep incoming topic-weighted hybrid ranking, title/context/course embeddings, persistent account-scoped IndexedDB caches, worker cancellation, pinned asset checksums, benchmark tools, catalog titles, and outline import/embedding scripts.
- Bring over bidirectional assignment aliases across filename separators, weekly/annotated-note inference, teacher/professor-note query interpretation, improved Piazza header/profile detection, and visible v0.3.0 footer.
- Automatically associate unique matching course codes; duplicates or conflicting known terms require confirmation. Confirmations are account-scoped and synchronize across tabs. UI and semantic broker use the same association rules; original source IDs/URLs remain intact.
- Latest note queries use numbered weeks within the same course before source dates; oldest retains incoming ascending-date behavior. Assessment titles do not become latest lecture-note candidates.
- Keep incoming semantic topic matching instead of adding the local hard-coded concept synonym groups to keyword ranking; this preserves the incoming benchmark's separation of lexical and semantic retrieval.
- Keep patched Vite 7.3.7 and Transformers.js 4.3.1. Semantic typing pause is 120 ms; keyword search is synchronous.
- Keep both browser checks: incoming worker/cache-persistence check and an adapted actual content-script/broker/worker/source-clear check using a disposable Chrome profile.

## Reproduce

```sh
npm ci
npm run setup:semantic
npm run build
npm test
npm run check:semantic
npm run check:semantic:extension
```

The last command defaults to installed macOS Chrome; set `SPOTLIGHT_CHROME` elsewhere. The incoming `check:semantic:browser` command requires `SEMANTIC_BROWSER_PATH` pointing to a compatible Chromium/Chrome for Testing executable. Neither check uses your personal browser profile.

Reload the extension and source tabs, refresh both sources, and enable **Meaning search**. Check CS246/A2 aliases, STAT230 annotated notes, combined course/source filters, and stale-query/keyboard behavior.

## Limits and next work

- Live Piazza friendly-name detection and the specific Möbius LTI wrapper still require signed-in verification.
- PDF content extraction is planned, not implemented. Embeddings still see metadata only.
- Incoming catalog and outline generation tools are retained. Their generated description vectors/outline bundles are ignored local artifacts, not delivered by Git or connected to live Spotlight ranking. Claims of previously generated coverage in their docs describe the friend's machine, not reproduced collections here.
- Broader course titles are bundled; known course context can help rank notes but does not establish the topics inside a particular file.
- Real student relevance, cutoff calibration, first-index latency, and multi-tab browser interaction remain to evaluate.

See [WORK_SESSION_MEMORY.md](WORK_SESSION_MEMORY.md) for user decisions and [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md) for merge evidence.
