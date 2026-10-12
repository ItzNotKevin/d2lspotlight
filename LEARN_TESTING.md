# Test cached search and recent resources

The extension now requests `storage` permission. Reload it at `chrome://extensions` and refresh your test tabs. Live Waterloo API access is still unverified; these checks use your signed-in Chrome profile. No credentials or DevTools scripts are needed.

## 1. Index your courses

1. Sign in at `https://learn.uwaterloo.ca` and open Spotlight with the extension icon or **⌘⇧K / Ctrl+Shift+K**.
2. Indexing should start automatically. Watch the course progress and wait for completion.
3. Search a familiar title from each of two different courses. Both should be found without loading courses manually.
4. Use the course filter to narrow results, then select All courses to restore the full index.
5. Confirm nested-module breadcrumbs and try the Documents filter.

If connection fails, open **Show diagnostics** and paste its report in this chat with the visible error. The report excludes account identity, course titles, cookies, and response bodies. A 403 can indicate session or permission restrictions.

## 2. Open resources and check Recent

1. Click a PDF result and confirm the right content opens in a new tab.
2. Open an HTML or external-link topic using arrow keys and Enter.
3. Clear the query. Those items should appear under **Recently opened**, newest first.
4. Close/reopen Spotlight. Recent items should still appear before typing.
5. Try the Recent filter with a query. Only resources opened through Spotlight should match.

On a fresh index, before anything has been opened, Spotlight shows up to eight initial suggestions instead. It does not import your overall LEARN browsing history.

## 3. Use the saved index elsewhere

1. Open Spotlight on a normal non-LEARN webpage. Cached search and recent items should work immediately.
2. Restart Chrome, reopen Spotlight, and confirm saved resources/history remain.
3. Try cached search offline. Opening the actual resource will still need connectivity and a valid LEARN login.
4. Return to LEARN and click **Refresh courses** to force a fresh index.

Refresh runs only while Spotlight is open on LEARN. It does not use another LEARN tab in the background. Account checks run each time Spotlight opens on LEARN; automatic full refreshes are skipped for complete indexes under five minutes old.

## 4. Check interrupted refresh and data clearing

- Close Spotlight during indexing. Reopen: completed-course results should remain, and a partial index should refresh again.
- If one course fails, verify the partial-refresh notice. Other courses should remain searchable. Transient errors retain older results; a course returning forbidden is removed from the refreshed index.
- Click **Clear saved data**, close, then reopen on a non-LEARN webpage. The index and Recent should be empty. Reopening on signed-in LEARN starts indexing again.
- If you switch LEARN accounts, reopen on LEARN. Once identity is verified, the old index/history should be replaced. Until this check, cached results represent the last verified account.

## Send back

```text
Indexing: success / error
Cross-course search: works / missing courses
PDF and HTML/external links: work / failure
Recent ordering and persistence: works / failure
Search from another webpage: works / failure
Diagnostics: paste report if needed
```
