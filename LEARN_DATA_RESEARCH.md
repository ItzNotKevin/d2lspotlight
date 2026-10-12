# Getting LEARN data into Learn Spotlight

Research date: October 1, 2026. Assumption: this project targets University of Waterloo LEARN at `https://learn.uwaterloo.ca`, the host identified in [Waterloo's computing resources](https://uwaterloo.ca/chemical-engineering/resources-facilities/computing-facilities/remote-computing-resources).

## Recommendation

Start with a small, read-only feasibility test inside a signed-in LEARN tab: discover API versions, identify the current user, list their enrollments, and retrieve one course's table of contents. If browser-session requests succeed for a student account, that is a practical candidate for this local extension. Keep data access behind an adapter so it can later use registered OAuth access.

This recommendation is an engineering inference, not a claim that Waterloo supports third-party extensions using session authentication. No authenticated Waterloo requests were made during this research. The route must pass the validation below before we select it for implementation.

## Access options

| Approach | What it offers | Dependency / limitation |
| --- | --- | --- |
| Registered Brightspace OAuth application | Documented third-party authentication and structured course data | Waterloo registration, granted scopes, and a suitable client architecture |
| Same-origin GET requests in a signed-in LEARN tab | Potentially structured data using the user's existing session, with no separate sign-in | Must validate on Waterloo; depends on session behavior and student permissions |
| Extract visible course links from LEARN pages | Fallback for indexing resources the user visits | Incomplete coverage, dynamic rendering, and changing page structure |

### Official integration

Waterloo's [LEARN API guidance](https://uwaterloo.atlassian.net/wiki/spaces/FAST/pages/43243896883/LEARN%2BAPI) says an API app must be created through the LEARN team. It also describes institutional risk assessment and data-governance requirements for integrations. Ask the team which process applies to this student-facing extension; this research does not establish an exemption for local session access.

D2L documents registration through Manage Extensibility and an authorization-code flow using a client ID and client secret. User-context access remains subject to the user's permissions. The reviewed documentation does not establish a secret-free PKCE flow suitable for this extension. Confirm that option with D2L/Waterloo; otherwise plan a backend that holds the secret. Do not embed a client secret in the extension bundle. [D2L OAuth documentation](https://docs.valence.desire2learn.com/basic/oauth2.html)

For an institutional route, the contact is [LEARN Help](https://uwaterloo.ca/educational-technology-hub/catalogs/centrally-supported-tools/learn) (`learnhelp@uwaterloo.ca`). Ask about a read-only personal-resource search app, student access to the endpoints below, and supported extension authentication. No outreach has been sent.

### Existing browser session

A first-hand discussion on D2L's community describes GET requests working inside authenticated Brightspace widgets without separate authentication. It also identifies the XSRF-token endpoint used for writes as undocumented and unsupported. This is useful evidence for a read-only experiment, but is neither a Waterloo test nor a current extension compatibility guarantee. [D2L browser-session discussion](https://community.d2l.com/brightspace/discussion/473/what-is-the-proper-format-for-making-an-ajax-put-request)

Proposed experiment: use `fetch(relativePath, { credentials: 'same-origin', headers: { Accept: 'application/json' } })` in the LEARN tab. Let the browser attach its session cookies. Start with GET requests; this metadata workflow does not require writes or acquiring tokens through undocumented endpoints.

### DOM fallback

If the API route fails, prototype extraction of resource titles and destinations already rendered on a course Content page. This is a proposed fallback, not a researched set of working Waterloo selectors. It would initially support visited content only. It must label that coverage honestly rather than claiming all enrolled-course content has been indexed.

## Minimum API sequence

`lpVersion` and `leVersion` are independent versions negotiated with the target site. Do not copy an old tutorial's version or assume the newest documentation matches Waterloo's deployment.

| Purpose | GET path | OAuth scope where applicable |
| --- | --- | --- |
| Discover versions | `/d2l/api/versions/` | Verify access on the target site |
| Identify the current account | `/d2l/api/lp/{lpVersion}/users/whoami` | `users:own_profile:read` |
| List own enrollments | `/d2l/api/lp/{lpVersion}/enrollments/myenrollments/` | `enrollment:own_enrollment:read` |
| Read a course's content tree | `/d2l/api/le/{leVersion}/{orgUnitId}/content/toc` | `content:toc:read` |

Version discovery returns supported product versions. Select versions the adapter understands. [API properties](https://docs.valence.desire2learn.com/res/apiprop.html)

`whoami` supplies account identity for separating local indexes; a successful version request alone does not prove the user is signed in. [User API](https://docs.valence.desire2learn.com/res/user.html#get--d2l-api-lp-(version)-users-whoami)

Enrollments are paged. Follow bookmarks to completion and inspect organizational-unit type and access information to select accessible course offerings. An enrollment is not necessarily a current, accessible course. [Enrollment API](https://docs.valence.desire2learn.com/res/enroll.html#get--d2l-api-lp-(version)-enrollments-myenrollments-)

The table of contents contains nested `Modules` and `Topics`. Flatten it while retaining module breadcrumbs, topic IDs, titles, and URLs. Use the schema for this endpoint rather than assuming every content endpoint returns the same shape. Keep date-restriction overrides unset. This supplies metadata, not extracted PDF/slide text. Test actual result destinations before deciding whether to use returned URLs or LEARN content-page links. [Content API](https://docs.valence.desire2learn.com/res/content.html#get--d2l-api-le-(version)-(orgUnitId)-content-toc)

## Fit with this codebase

Proposed structure:

```text
Signed-in LEARN tab → data adapter → normalized metadata → local index → Spotlight
```

- Add a `learnClient` for bounded GET requests and response validation, plus a normalizer separate from React.
- Replace the six inline sample resources through a provider interface; retain a sample provider for `src/preview.jsx`.
- Initially synchronize only when the user invokes Spotlight on LEARN. The existing `activeTab` and `scripting` permissions support user-triggered injection into that tab. Access is temporary and does not grant access to a different LEARN tab when invoked on another site. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- For automatic synchronization or finding a LEARN tab from elsewhere, evaluate a narrowly scoped host permission for `https://learn.uwaterloo.ca/*`; add `storage` if the index persists. Start same-origin: content-script requests obey the page's origin rules, while extension-worker cross-origin requests need host permission. Host permission alone does not establish a LEARN login. [Chrome network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- Use a proposed resource key composed of host, account ID, course ID, and topic ID. Store title, course label, breadcrumb, destination, inferred resource kind, and `indexedAt`. Keep optional source timestamps nullable; indexing time is not modification time.
- Search cached metadata from other webpages. If no usable LEARN session is available, show cached results with a refresh/sign-in action.
- Bound concurrent course requests and honor `429` responses and `Retry-After`; D2L documents rate-limit headers. [API calling conventions](https://docs.valence.desire2learn.com/basic/apicall.html)

## Validation checklist before committing to session access

- [ ] In an ordinary signed-in student tab, request supported versions and choose compatible LP/LE versions.
- [ ] Verify `whoami` returns expected JSON; record only success and schema, not credentials or private account details in repository fixtures.
- [ ] Retrieve all enrollment pages and compare course coverage with LEARN's interface.
- [ ] Fetch one accessible course's ToC and compare nested modules, file topics, HTML topics, and external links with the UI.
- [ ] Confirm at least one PDF and one non-file result open correctly through the intended navigation action.
- [ ] Repeat the GET experiment from the extension's isolated content script. A successful DevTools-console call alone does not validate the extension execution context.
- [ ] Test session expiry, account changes, unavailable courses, redirects, and responses that contain login HTML despite HTTP 200. Distinguish permission failures from signed-out state; a 403 is not sufficient to identify the cause.
- [ ] Record browser/version, endpoint versions, status codes, sanitized response shapes, and coverage limitations.
- [ ] Select the session adapter only if these tests pass. Otherwise choose registered OAuth or explicitly limited DOM indexing.

Step 1 remains incomplete until this live validation and the adapter implementation are done. The next concrete milestone is one real course loaded into Spotlight with a working result link.
