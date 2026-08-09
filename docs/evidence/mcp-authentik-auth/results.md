# MCP Authentik Auth (010) — Browser Test Evidence

Base URLs: dev server API http://localhost:3010 (also reached directly at http://127.0.0.1:3010 for Scenario 3), outpost simulator http://127.0.0.1:9400 (proxies to the dev server, injecting `X-authentik-jwt` for username "tyler" on every proxied request)
Date: 2026-08-09
Tester: browser-tester agent (Playwright)
Registered test OAuth client: client_id `c65e1877-0887-40b9-94a7-419d692a6c1a`, redirect_uri `http://localhost:8976/callback` (not a running server — connection-refused after redirect is expected)
PKCE code_challenge used throughout: `TOcnGOI60fcimkKJyY3LNdpNEITSejBLaCydqWYx9Sc` (method S256)

All three scenarios were driven live in a real browser session against the running dev server and the running outpost simulator. No application code was modified.

---

## Scenario 1 (US1/FR-002) — approval page names the verified username, no password field

**Given** a verified Authentik identity is attached to the request (via the outpost simulator on port 9400), **When** I open an authorize URL for the registered client through the sim, **Then** the page shows an approval prompt naming the username "tyler" and contains no password input field anywhere.

**Result: PASS**

- Navigated to `http://127.0.0.1:9400/oauth/authorize?response_type=code&client_id=c65e1877-0887-40b9-94a7-419d692a6c1a&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Fcallback&code_challenge=TOcnGOI60fcimkKJyY3LNdpNEITSejBLaCydqWYx9Sc&code_challenge_method=S256&state=evidence-approve` (page title "work-helper connector — approve").
- Accessibility snapshot showed a heading "Connect to work-helper" and the paragraph "**Browser Evidence Test Client** wants to connect as **tyler**." with "Deny" and "Approve" buttons.
- `document.body.innerText` confirmed to contain the substring "tyler": `"Connect to work-helper\n\nBrowser Evidence Test Client wants to connect as tyler.\n\nDeny\nApprove"`.
- `document.querySelectorAll('input[type="password"]').length` was checked programmatically and returned `0` — zero password-type inputs anywhere on the page.
- Screenshot: `01-approval-page-names-tyler.png`.

---

## Scenario 2 (US3) — declining redirects with error=access_denied

**Given** the same approval page is open (freshly reloaded — reloading the same URL issues a new one-time approval ticket, which is expected and fine), **When** I click the "Deny" button, **Then** the app responds with a redirect whose target URL contains `error=access_denied` and no `code` parameter.

**Result: PASS**

- Reloaded the authorize URL (same query string, state=evidence-approve) to obtain a fresh one-time approval ticket, confirmed the same approval prompt was showing (heading "Connect to work-helper", "Browser Evidence Test Client wants to connect as tyler.", Deny/Approve buttons).
- Clicked the "Deny" button. `browser_network_requests` captured the full sequence:
  1. `GET http://127.0.0.1:9400/oauth/authorize?...` → `200 OK` (initial page load)
  2. `POST http://127.0.0.1:9400/oauth/authorize` → `302 Found` (the Deny submission)
  3. `GET http://localhost:8976/callback?error=access_denied&state=evidence-approve` → `FAILED net::ERR_CONNECTION_REFUSED` (expected — that redirect target isn't a running server)
- Pulled the full response headers for request #2 directly via `browser_network_request`: `location: http://localhost:8976/callback?error=access_denied&state=evidence-approve`. The Location header contains `error=access_denied` and contains no `code=` parameter.
- The browser then showed Chrome's "This site can't be reached … localhost refused to connect … ERR_CONNECTION_REFUSED" page, which is the expected downstream effect of following that 302 to a non-running redirect target — not a failure of the OAuth flow itself. Screenshot: `02-deny-response.png`.

---

## Scenario 3 (US2) — direct hit bypassing the outpost is rejected

**Given** no identity assertion is attached (browsing directly to the app's own port, bypassing the outpost simulator entirely), **When** I open the same kind of authorize URL directly against port 3010 instead of the sim's port 9400, **Then** the app shows a 403 rejection page that states the request must be reached through the deployment's Authentik sign-in, and there is no password field and no redirect.

**Result: PASS**

- Navigated directly to `http://127.0.0.1:3010/oauth/authorize?response_type=code&client_id=c65e1877-0887-40b9-94a7-419d692a6c1a&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Fcallback&code_challenge=TOcnGOI60fcimkKJyY3LNdpNEITSejBLaCydqWYx9Sc&code_challenge_method=S256&state=evidence-bypass`, bypassing the outpost simulator entirely.
- Navigation result reported `HTTP status: 403 Forbidden` and page title "work-helper connector — rejected". `browser_network_requests` independently confirmed a single request: `GET http://127.0.0.1:3010/oauth/authorize?... => [403] Forbidden`.
- Accessibility snapshot showed heading "Connection request rejected" and paragraph text "This request must be reached through the deployment's Authentik sign-in." — the page explicitly names Authentik as required.
- `document.body.innerText.toLowerCase().includes('authentik')` returned `true`; `document.querySelectorAll('input[type="password"]').length` returned `0`.
- Only one network request was recorded for the whole navigation (no follow-up redirect requests), and the final Page URL after navigation remained the original `http://127.0.0.1:3010/oauth/authorize?...` — confirming no redirect occurred.
- Screenshot: `03-bypass-403-rejection.png`.

---

## Summary

3/3 scenarios PASS.

- Scenario 1 (approval page names verified username "tyler", no password field): PASS — `01-approval-page-names-tyler.png`.
- Scenario 2 (Deny redirects with `error=access_denied`, no `code`): PASS — `02-deny-response.png`, Location header captured via `browser_network_request`.
- Scenario 3 (direct hit bypassing the outpost gets a 403 Authentik-sign-in rejection, no password field, no redirect): PASS — `03-bypass-403-rejection.png`.

## Notes

- No application code, configuration, or tests were modified during this evidence run.
