# Piazza API investigation

Implementation update (October 3, 2026): both sources now render in one Spotlight panel and use the LEARN local matcher on every keystroke. The debounced server search panel was replaced by a Piazza feed index (`src/piazza/usePiazzaIndex.jsx`). The token source remains the user-verified `window.CSRF_TOKEN` read through a scoped MAIN-world helper. No new permissions were added.

The new profile/feed calls follow the linked unofficial client's `user_profile.get_profile` and `network.get_my_feed` implementations. Account identity currently requires `result.user_id`; feed parsing requires `result.feed` with numbered posts. These new response assumptions and pagination need live validation. Pages contain up to 100 posts, with at most 20 pages per class; repeated pages or the cap produce a partial index. Titles and snippets are sanitized and bounded before storage, without retrieving full post threads or attachments.

Piazza and LEARN have separate account-aware storage keys and recent histories. Their normalized results are combined for immediate search, source/course filters, and trusted destination navigation. The footer reports actual local-storage usage; current Chrome has a shared 10 MB local storage quota. A detected Piazza account switch clears its old entries without affecting LEARN. Open each class to include it; automatic all-class discovery and course associations remain future work.

To test: reload the extension, refresh the LEARN and Piazza tabs, open Spotlight on LEARN to populate its index, then open Spotlight in a Piazza class and wait for its posts to load. Type a keyword shared by both sources and verify both appear without a typing delay. Try the source selector, open links, close/reopen, and search from another page. If the new indexing call fails, share only the visible message and diagnostic output. See README for details.

Researched October 1, 2026; updated October 2 with user-supplied browser observations. Post retrieval has been observed in the signed-in website. The initial extension search failed authentication; the user confirmed the page-global token fix works; these findings establish a candidate integration, not a working connector.

## Verified website request: post retrieval

The user captured `/logic/api?method=content.get` returning HTTP 200 with `error: null` and a populated post result. Sanitized request shape (identifiers replaced):

```json
{
  "method": "content.get",
  "params": { "cid": "POST_NUMBER", "nid": "CLASS_ID", "student_view": null }
}
```

The observed `cid` is the displayed post number (returned as `nr`), while `result.id` is a separate opaque identifier. The response includes revision `history` with `subject` and HTML-containing `content`, folders, tags, children, and pinned status. Only one revision was present, so revision ordering remains unverified. Do not copy private post bodies or author identifiers into fixtures.

The user also observed `generic.sanitize_html`, which sends existing HTML for processing; that is not the post-discovery request we need. Authentication headers and any read/view-tracking side effects remain unresolved. The next observation should capture a normal website search and, for bulk indexing, feed pagination.

## Verified website request: search

Live extension follow-up: the user observed HTTP 200 with `result: null`, `error_codes: []`, and `error: "Request not valid"`. Extension diagnostics reported `csrfHeaderPresent: false`. A contemporaneous website-search response contained 33 results and `error: null`. The user subsequently confirmed the working request includes `CSRF-Token`, does not include `X-CSRF-Token`, and uses `Content-Type: application/json`. This establishes a missing header in Spotlight; it does not yet establish the correct token source or prove it is the only difference. Missing page-readable `session_id` does not prove the user lacks a valid browser session.

The user also confirmed `X-Requested-With` is absent from the successful request. Adding that header is therefore not justified by the capture.

### Repository authentication review

Reviewed both `master` and the repository's default `develop` branch of [rpc.py](https://github.com/hfaran/piazza-api/blob/develop/piazza_api/rpc.py). The relevant flow is:

1. `user_login()` fetches `/main/csrf_token` for the login form, then submits credentials to `/class` using a Python `requests.Session`.
2. `request()` takes the `session_id` cookie from that session's cookie jar and sends it as `CSRF-Token` on subsequent API requests.
3. `search()` calls `network.search` with `nid` and `query`. The transport also adds an `aid` nonce to the URL. Our observed working browser request already supplies the payload we use; nonce necessity has not been established.

The important porting gap is cookie access: the Python client reads its HTTP cookie jar, whereas Spotlight currently reads `document.cookie`. These are not equivalent. A cookie marked HttpOnly is hidden from page JavaScript; a cookie scoped to another path may also be absent there. Either is a possible explanation, not a confirmed property of this user's `session_id` cookie. The repository does not establish that the login-form token endpoint supplies the token required by authenticated search, so fetching it as an API-token fallback would be speculative.

Earlier candidate, superseded by the observed frontend global: a background helper using [Chrome's cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies) to read only `session_id` for the Piazza API URL in the requesting tab's cookie store. It requires the `cookies` permission and Piazza host access. Restrict callers to this extension's Piazza content script, keep values out of storage/diagnostics, and account for the tab's cookie store/partition. A missing cookie should produce an actionable diagnostic, not another tokenless API call. This would reproduce the repository's token source more faithfully, but still needs a signed-in browser test; a changed server token scheme remains possible.

The user observed HTTP 200 for `/logic/api?method=network.search` with this sanitized payload:

```json
{
  "method": "network.search",
  "params": { "nid": "CLASS_ID", "sort": "date_desc", "query": "ass" }
}
```

Inspection of the supplied response found `error: null` and a `result` array containing 33 entries. Useful fields include `subject`, `nr`, `id`, `folders`, `tags`, `type`, `content_snipet`, `highlighted_snipet`, `modified`, and `updated`. The API spells the snippet fields with one `p` in `snipet`; preserve that spelling in the adapter. Optional fields vary between entries. Render snippets as text after sanitization rather than trusting highlighted HTML.

This establishes website search plus individual-post retrieval. The captured response has no top-level paging/count metadata beyond `result`, `error`, and `aid`; the 33 results do not establish complete class coverage or an unlimited result set. Pagination, empty-query behavior, account identity, and extension-context authentication remain untested.

Other observed calls are not needed for content discovery: `network.get_online_users` returned a user count; `user.get_refreshed_tokens` returned channels, a signature, and a timestamp. Do not copy its authentication-related values into fixtures or diagnostics. A separate request went to `r.stripe.com/b`, not the Piazza content API.

Next experiment: a bounded, explicitly triggered search from the extension in a signed-in Piazza tab, using the observed search payload. Determine required header names without collecting their secret values. Full-class local indexing additionally requires a feed/discovery mechanism and verified pagination; live search alone does not provide a complete offline index.

## How the existing LEARN connector works

`src/learn/client.js` makes GET requests to documented D2L API routes from the active LEARN tab, using `credentials: 'same-origin'`. The browser attaches its existing session credentials. The adapter reads JSON rather than scraping rendered course pages.

Opening Spotlight on LEARN checks identity and enrollments; when refresh is needed, it retrieves course tables of contents. Search itself runs against the extension's local index. There is no registered OAuth application or separate password collection. Successful live access still depends on the user's session and Waterloo's configuration.

## What was found for Piazza

The [piazza-api project](https://github.com/hfaran/piazza-api) explicitly describes itself as an unofficial client for Piazza's internal API. I did not find public Piazza documentation offering a general student-facing content API comparable to D2L's. This does not establish that no partner API exists.

The client's [RPC implementation](https://raw.githubusercontent.com/hfaran/piazza-api/master/piazza_api/rpc.py) provides concrete evidence:

| Observed method | Intended use in that client |
| --- | --- |
| `user.status` | User status and class relationships |
| `network.get_my_feed` | Class feed with limit/offset parameters |
| `content.get` | Individual post |
| `network.search` | Search within a class |

It sends JSON method/params envelopes via HTTP POST to `/logic/api`, uses session cookies, and includes a CSRF header when its session cookie is present. A POST here can retrieve data; its HTTP verb alone does not identify a content mutation. These are observations of client source, not verified current browser behavior. Exact authentication, pagination, response shape, and read-tracking effects require live inspection.

Piazza's [official LTI documentation](https://support.piazza.com/support/solutions/articles/48001191921--lti-1-3-configure-piazza-with-canvas) covers administrator-managed LMS integration. It does not document an API for this extension to search posts.

Piazza also documents instructor [export tools](https://support.piazza.com/support/solutions/articles/48001162834-instructors-export-statistics-tool), including a reference to class-content downloads through Class Statistics. Student access to a suitable export has not been established.

## Product constraint

Piazza's published [terms](https://piazza.com/legal/terms) restrict scraping without prior written consent and access/indexing through interfaces other than its published interfaces. For a distributed automatic connector, clarify the supported integration route with Piazza. Technical reachability should not be presented as official integration support. This research has not contacted Piazza or determined what institutional arrangements apply.

## Next validation: observe the normal website

In Chrome, while signed into your own Piazza class:

1. Open DevTools → Network → Fetch/XHR.
2. Reload the class page and filter requests by `api`.
3. Open one ordinary post, then use Piazza's own search for a familiar title.
4. Inspect which request paths and method names those normal actions use, whether responses are JSON, and whether search returns useful titles/post identifiers.
5. Check whether scrolling the feed triggers another request and which parameter changes.

Useful details to report: request pathname, HTTP method, RPC method name, status code, parameter **names**, and response field **names**. Do not share cookie/header values, tokens, full HAR files, account details, or private post bodies. This observation needs no copied login credentials and does not replay requests.

After observation, a bounded extension experiment would test the same-origin execution context with a known accessible class and a single search/post. Confirm that it does not alter read/unread state before describing it as read-only. Stop on authentication errors or throttling rather than attempting a class-wide crawl.

## Fit with combined Spotlight search

Proposed design, conditional on validation:

- Keep Piazza fetching in a signed-in Piazza tab, as LEARN fetching currently stays in a LEARN tab.
- Start with class feed/search metadata and direct post links; expand to post text only when needed and supported.
- Associate a Piazza class with a LEARN course explicitly; do not infer identity solely from a similar course title.
- Namespace cache entries by source, source account, class, and post. Maintain each source's refresh state so refreshing LEARN cannot delete Piazza entries.
- Add source labels and allow validated Piazza destinations. The current result handler only permits LEARN URLs, and the current cache assumes one LEARN account/index.
- Keep the normal webpage login flow; no Piazza password field in Spotlight.

Recommendation: inspect one class's live network behavior before implementing a connector or installing an unofficial client. The internal API is a plausible technical route, but current browser compatibility and a supported distribution route remain unresolved.
