# 006-home-server-deploy Evidence Results

Round 1 of infrastructure/browser evidence pass against the deployed Docker container.

- Direct app port: http://localhost:18080
- Caddy proxy: https://work-helper.localhost:18443
- OAuth callback echo server: http://localhost:8976

## Step 1: Board shows exactly four lanes in order

**Given** the app is freshly deployed with an empty board. **When** navigating to http://localhost:18080/. **Then** the board renders exactly four lanes in order: "To Do", "In Progress", "Waiting", "Done".

**Result: PASS**

The board rendered with headings "To Do", "In Progress", "Waiting", "Done" in that exact left-to-right order, each with an empty list underneath.

Screenshot: us1-board-four-lanes.png

## Step 2: Create a person via the People nav link and on-page form

**Given** the People page is reached via the app's own nav link (not the address bar). **When** filling in first name "Sam" and last name "Rivera" and submitting the on-page form. **Then** "Sam Rivera" appears in the People list.

**Result: PASS**

Clicked the "People" nav link (client-side route to /people), filled First name "Sam" and Last name "Rivera" in the on-page form, clicked "Add person". The list then showed a link "Sam Rivera" pointing to /people/1.

Screenshot: us1-person-created.png

## Step 3: Direct full-navigation to /people renders the app shell (SPA fallback)

**Given** the built Docker image serves the SPA. **When** performing a full browser navigation (page.goto, not client-side routing) directly to http://localhost:18080/people. **Then** the app shell renders (not a 404), proving the server's SPA fallback works.

**Result: PASS**

A full page.goto to http://localhost:18080/people returned the app shell with title "work-helper", the Board/People nav, the People form, and the previously created "Sam Rivera" entry still present (confirming a real server-side fallback to index.html rather than a client-side-only route).

Screenshot: us1-direct-navigation-people.png

## Step 4: Create a task on the board via the board's own UI

**Given** the board is loaded. **When** using the board's own Title field and "Add task" button to create a task titled exactly "Deployed task". **Then** the task card appears in its lane on the board.

**Result: PASS**

Typed "Deployed task" into the Title field and clicked "Add task". The task card "Deployed task" appeared in the "To Do" lane.

Screenshot: us1-task-created.png

## Step 5: OAuth connector password page renders for a pre-registered client

**Given** a pre-registered OAuth client and a valid PKCE authorize request. **When** navigating to the exact pre-registered authorize URL (client_id f2838443-10d0-4057-83c3-a78bb69e565a, redirect_uri http://localhost:8976/callback, state evidence-state-3). **Then** the connector password page renders with a password field and submit button.

**Result: PASS**

Page title "work-helper connector" rendered heading "Connect to work-helper", a "Connector password" textbox, and a "Connect" button.

Screenshot: us3-password-page.png

## Step 6: Wrong password is rejected with a visible, still-usable error state

**Given** the connector password page is displayed. **When** entering password "wrong-password-attempt" and submitting. **Then** an error state is shown (e.g. "Incorrect password") and the page remains usable.

**Result: PASS**

Submitting the wrong password returned HTTP 401 and re-rendered the same page with the message "Incorrect password. Please try again." The password textbox and "Connect" button remained present and usable.

Screenshot: us3-password-rejected.png

## Step 7: Correct password completes the OAuth redirect to the real callback echo server

**Given** the connector password page (after a prior wrong attempt). **When** entering the correct password "evidence-connector-password" and submitting. **Then** the browser follows a real redirect to http://localhost:8976/callback?code=...&state=evidence-state-3, landing on the echo server's page which visibly displays the received request including code= and state=evidence-state-3.

**Result: PASS**

Submitting the correct password redirected the browser to http://localhost:8976/callback?code=273GWFgKYAFYcuOkxSY7sYInq0kQ2f1JKpBMxhyV2a8&state=evidence-state-3. The landed page's title was "OAuth callback received" and its body visibly displayed the text "Request: /callback?code=273GWFgKYAFYcuOkxSY7sYInq0kQ2f1JKpBMxhyV2a8&state=evidence-state-3", confirming both the code and the expected state=evidence-state-3 were echoed.

Screenshot: us3-password-accepted.png

## Step 8: Board loads through the real Caddy reverse proxy and shows previously created data

**Given** a real Caddy reverse proxy fronting the app at https://work-helper.localhost:18443 with a self-signed/internal-CA cert. **When** navigating to https://work-helper.localhost:18443/ (bypassing the cert warning). **Then** the board loads through the proxy and shows the "Deployed task" card created in step 4.

**Result: PASS**

Certificate errors were bypassed via a CDP Security.setIgnoreCertificateErrors override (a plain navigate hard-aborted with net::ERR_CERT_AUTHORITY_INVALID in headless Chromium, as expected). After the override, navigation to https://work-helper.localhost:18443/ succeeded (title "work-helper") and the board rendered the "Deployed task" card in the "To Do" lane, proving the proxy is forwarding to the same backing app/data as the direct port.

Screenshot: us4-board-through-caddy.png

## Step 9: Task persists across a stop/start restart cycle

**Given** the deployed stack with a task "Deployed task" created via the UI. **When** `docker compose down` followed by `docker compose up -d` is run (no rebuild, no config change). **Then** the board still shows "Deployed task".

**Result: PASS**

Fresh full-page navigation to http://localhost:18080/ after the stop/start cycle shows the board with exactly its original four lanes (To Do, In Progress, Waiting, Done) and "Deployed task" still present in the To Do lane. No fifth lane present (config not yet edited, as expected at this point).

Screenshot: us2-task-persists-after-restart.png

## Step 10: Person persists across a stop/start restart cycle

**Given** the deployed stack with a person "Sam Rivera" created on the People page. **When** `docker compose down` followed by `docker compose up -d` is run (no rebuild, no config change). **Then** the People page still shows "Sam Rivera".

**Result: PASS**

Fresh full-page navigation to http://localhost:18080/people after the stop/start cycle shows "Sam Rivera" still listed.

Screenshot: us2-person-persists-after-restart.png

## Step 11: Board shows five lanes (including newly inserted "Blocked") after a host config edit + docker compose restart, with existing data intact

**Given** the operator edited the mounted config/lanes.json on the host to insert a "Blocked" lane between "Waiting" and "Done", then ran `docker compose restart`, and confirmed via the API that the board now reports exactly five lanes in order (To Do, In Progress, Waiting, Blocked, Done). **When** performing a fresh full page navigation to http://localhost:18080/. **Then** the board renders exactly five lane headings in that exact order: "To Do", "In Progress", "Waiting", "Blocked", "Done", and "Deployed task" is still present under "To Do", proving the config reload picked up the new lane without disturbing existing data.

**Result: PASS**

A fresh full-page navigation to http://localhost:18080/ rendered exactly five lane headings, in order: "To Do", "In Progress", "Waiting", "Blocked", "Done". The "Deployed task" card (created in step 4 and confirmed persistent in step 9) was still present under "To Do". No other lanes or duplicate headings were present.

Screenshot: us6-five-lanes-after-config-edit.png

## Summary

| Step | Description | Result |
| --- | --- | --- |
| 1 | Board four lanes | PASS |
| 2 | Create person via nav + form | PASS |
| 3 | Direct navigation to /people (SPA fallback) | PASS |
| 4 | Create task on board | PASS |
| 5 | OAuth password page renders | PASS |
| 6 | Wrong password rejected | PASS |
| 7 | Correct password redirects to real callback echo server | PASS |
| 8 | Board loads through Caddy proxy | PASS |
| 9 | Task persists across down/up restart cycle | PASS |
| 10 | Person persists across down/up restart cycle | PASS |
| 11 | Board shows five lanes (incl. "Blocked") after host config edit + restart, existing data intact | PASS |

All 11 steps PASS. This concludes evidence collection for the 006-home-server-deploy feature.
