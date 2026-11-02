# Verification — 2026-11-02

Verified locally on macOS with Node 24.14.0, Playwright 1.56.1 and installed Chromium build 1243. These results establish local demo behavior only.

## Executed results

- `npm install`: installed 31 packages, audit reported 0 vulnerabilities.
- `npm test`: **14 passed, 0 failed** on the final backend/provider implementation.
- `npm run test:browser` with `BROWSER_EXECUTABLE` pointing to the installed Chromium executable: **16 checks passed**, no page JavaScript errors, on the final frontend.
- `node --check` for server, provider and frontend: passed.
- `npm start`: starts at `http://127.0.0.1:3040`; `/api/health` returned `{ "ok": true, "demo": true }` with the harness disabled.
- Git whitespace checks performed before commit. SQLite data, credentials, dependency folders and raw test artifacts are ignored.

API coverage includes persisted sessions across server restart, independent authenticated lookup, metrics/CSV reconciliation, assisted actor attribution, pending/failure states, duplicate and out-of-order events, immutable activation/receipt, idempotency conflicts, expiry, refunds, role/zone enforcement, driver token isolation, tariff preservation, delayed simulator restart recovery, harness isolation, invalid inputs/origins/expired quotes, issue attribution and logout invalidation.

Browser coverage includes driver quote/review/create/payment/pass, refresh and second-context retrieval, attendant lookup and assisted creation, issue flag, failed-payment display, offline stale/unknown state, staff role rejection, management stored data and filters/export, daily close, versioned tariff update, logout and responsive overflow checks.

## Visual review

Captured and inspected driver, attendant and management at **1440 px desktop**, **768 px tablet**, and **390 px phone**. Driver and management also passed **320 px** overflow checks. Reviewed confirmed driver pass, staff offline state and 320 px daily close. Responsive tables become stacked rows on phones. The final narrow-screen date input and staff search sizing were corrected and rechecked. Screenshots show no horizontal document overflow, overlapping controls or clipped primary actions in these tested states.

Representative desktop screenshots are retained in `docs/screenshots/`. Full screenshots and `browser-report.json` remain locally in ignored `test-results/`.

## Failures encountered and resolved

Initial dependency download was blocked by sandbox DNS; installation completed with network permission. Sandbox loopback restrictions blocked initial test servers; the actual suites ran with permission outside that sandbox. Tests exposed quote/payment SQL placeholder mismatches, which were fixed. A browser test raced a lookup refresh, which was corrected to wait for refresh completion; background refresh also now preserves an in-progress issue entry. A management assertion initially counted both the filter option and status chip; it was scoped to the register. Final reruns passed.

The in-app browser preview surface was unavailable. This did not prevent Chromium-based functional tests and screenshot review. No physical phone, QR-camera scan, production service, competitor account, payment provider or settlement system was tested. No deployment occurred. Test servers are stopped after verification; use the README launch command to run the demo again.

## Driver portal expansion — 2026-11-02

- API suite: **20 passed, 0 failed**. Added account persistence/login/logout, cross-account isolation, exclusive guest-token claims, estimated availability, server-owned subscription pricing, enrollment idempotency, 30-day expiry and owner-only early termination.
- Existing browser suite: **16 checks passed**, including guest parking, attendant assisted creation and management exports.
- New `npm run test:driver-browser`: **10 checks passed**, including site browsing, signup options, signed-in booking at a second site, saved wallet/history, subscription review/payment/end flow, offline state, logout/login and a second account with the same plate seeing no other account's history. No page JavaScript errors.
- New portal screenshots captured at 1440, 768, 390 and 320 px widths with no document overflow. Inspected sites and onboarding at desktop/tablet/phone, wallet desktop/phone, history phone, subscription desktop/narrow phone. They show labelled synthetic estimates and demo subscription terms.
- Initial API run was blocked by sandbox loopback restrictions; authorized rerun exposed a driver-signup INSERT placeholder mismatch. Corrected and reran successfully. The initial portal browser run failed at that signup error; the final run passed.
- Syntax and whitespace checks passed for changed scripts. Test-only databases were removed; screenshots remain in ignored test-results. No live payments, recurring billing or deployment was tested or added.
- Restarted the existing local app on port 3040 and verified `/api/sites` returns the three synthetic sites. Before restarting, created an ignored SQLite backup. Readback comparison after the additive upgrade verified all 3 prior sessions, 1 payment attempt, 1 receipt, 2 staff records and the original tariff were byte-for-byte equivalent as SQL row values. The user's local app remains running; temporary test servers were closed. This expansion is local and has not been pushed to GitHub.

## Admin and gate expansion — 2026-11-02

- Final API suite: **30 passed, 0 failed**. Added separate cash recording/confirmation/admission, duplicate protection, concurrent last-space holds/admissions, hold expiry/consumption, capacity-edit protection, repeated subscription visits, single-visit reuse rejection, refund/expiry versus physical occupancy, staff assignment/disable, opening-cash reconciliation, missing-site validation, coordinate/site controls, issue resolution and restart persistence.
- `npm run test:admin-browser`: **11 checks passed**, including cash receipts, gate entry/exit, holds, daily reconciliation/CSV, capacity/coordinates, attendant creation/disable, issues/audit, attendant role restrictions and offline state; no page JavaScript errors.
- Existing legacy browser regression suite: **16 checks passed**. Driver portal suite: **10 checks passed**. Together with admin, **37 browser checks** passed. Legacy staff screens are explicitly selected with `?legacy=1` for comparison.
- Admin screenshots captured at 1440, 768, 390 and 320 px with no document overflow. Visually inspected the desktop overview, phone gate desk, tablet daily close and narrow-phone site settings. Responsive controls and stacked rows remain usable. Brief confirmation toasts are visible in some captures.
- Browser verification initially caught cancelled arrival holds using the subscription label “Ended”; corrected the hold label to “Cancelled” and reran successfully. Missing-site POST inputs now return 400 rather than reaching database binding. Syntax and Git whitespace checks passed.
- Backed up the existing local database to ignored `.local/backups/20261102T193900Z-before-admin.sqlite`, then replaced only the verified parking server on port 3040. Compared every pre-existing table with the backup: all prior SQL row values were unchanged, including 3 sessions, 1 payment attempt, 1 event, 1 receipt, 2 staff, 3 tariffs, 3 sites and the existing authentication row. SQLite integrity and foreign-key checks passed.
- Restarted app health, management HTML, admin JavaScript and public inventory returned 200; unauthenticated operations returned 401. The user's local app remains running at http://127.0.0.1:3040; temporary test servers closed. New work remains local and has not been pushed or deployed.
- No real cash, payment-provider confirmation, bank settlement, physical-phone access, maps, device geolocation or live parking occupancy was tested. Immediate arrival holds are implemented; driver future-period reservations remain next phase.

## Pay-on-exit walk-in tickets — 2026-11-02

- `npm test`: **37 passed, 0 failed**. Added plate-only immediate admission, capacity/hold concurrency, duplicate requests and plates, safe reprinting, elapsed-time boundaries, entry-rate preservation, stale/tampered exit quotes, atomic cash receipt/departure, digital confirmation without resetting entry, failed-digital cash fallback, authorization and restart persistence.
- Browser checks: **8 ticket + 11 admin + 10 driver + 16 legacy = 45 passed**, no reported page JavaScript errors. The new suite covers quick entry, print-dialog invocation, ticket/plate lookup, displayed elapsed/billed duration, expired quote rejection, cash checkout, completed history/receipts, digital pending-to-confirmed exit and offline state. All tests use isolated temporary databases.
- New quick-entry/exit/completed screens captured at 1440, 768, 390 and 320 px without document overflow. Visually inspected desktop quick entry and phone exit. Adjusted the mobile lookup form to give the ticket field full width and retain the ticket reference in stacked rows.
- Entry ticket and paid receipt generated as PDFs with Chromium print styles. Initial fixed paper sizing caused a second page; corrected to separate 80 mm layouts, asserted one PDF page for each, then rendered both with macOS PDFKit and visually checked the actual PDFs. QR, plate, times, tariff, receipt and amount are readable. Physical printing and scanner hardware were not tested.
- Before replacing the verified local server on port 3040, saved ignored backup `.local/backups/20261102T200031Z-before-walkin-tickets.sqlite`. All 24 pre-existing tables matched the backup exactly after restart, including the recently added driver account and session (4 sessions total). Staff credential file hash was unchanged; SQLite integrity and foreign-key checks passed. No test tickets were inserted in the user's database.
- Restarted app health, attendant HTML and new ticket assets returned 200. Ticket data without staff authentication returned 401. The user's app remains running at http://127.0.0.1:3040; temporary test servers closed. This work is local, unpushed and undeployed; payments remain simulated.

## Eight-site map and synthetic active day — 2026-11-02

- `npm install --save-exact leaflet@1.9.4`: installed the stable, locally served map dependency; audit reported 0 vulnerabilities.
- API suite: **40 passed, 0 failed**. Added eight-site/location persistence, sample-day idempotency, preservation of existing data/driver isolation, cash reconciliation, restart behavior, closed-site handling, capacity constraints and attendant scope checks.
- Browser suites: **7 map/sample-day + 10 driver + 11 admin + 8 ticket + 16 legacy = 52 checks passed**. Map tests cover counts, search/area/availability filters, popups/booking, staff operation boundaries, populated overview/walk-ins/cash close and failed-tile fallback. Automated suites stub OSM tile requests to avoid tile-service traffic.
- Captured 1440, 768, 390 and 320 px layouts. Visual review found a grid minimum-height issue that clipped the map footer; fixed it and added a map/footer bounds check. Final map suite passed without horizontal overflow or clipped map attribution. A synthetic-driver insert placeholder mismatch was also corrected before any seeding of the user's database.
- Opened the completed app in visible Chrome and verified actual OpenStreetMap street tiles, Gombe labels, parking pins, availability popup and attribution. Repositioned the illustrative Riverside pin onto land after this review. Manager-configured coordinates are preserved; only untouched illustrative pins follow catalogue corrections.
- Backed up the local database to ignored `.local/backups/20261102T202128Z-before-map-demo-day.sqlite`. Loaded exactly one synthetic batch: **170 vehicles inside, 40 completed visits, 170 walk-in tickets, 96 payment/pass examples, 16 holds and 24 issues across eight sites**. Tickets include both inside and departed visits; these counts describe different record types and should not be added together.
- All prior rows were compared to the backup and retained unchanged, except the requested illustrative latitude/longitude values added to the original three site configurations. Existing 4 sessions, 1 driver account, ownership, payments and staff credentials were preserved. SQLite integrity and foreign-key checks passed.
- Restarted only the verified Orya process. Sample records persist without duplicating or refreshing their timestamps. The app remains local at http://127.0.0.1:3040; temporary test servers closed. No push/deployment, GPS permission, real parking property verification or payment integration occurred.

## Mobile apps — 2 November 2026

- Existing API regressions plus mobile APIs/private-host checks: **45 passed**. New checks cover vehicle ownership/normalization, hold idempotency, capacity, expiration, cancellation and gate consumption without double-counting.
- Existing browser suites: **52 passed** (driver 10, admin 11, tickets 8, map 7, legacy 16).
- New mobile browser suite: **9 passed**, including consumer map/list/detail, signup, saved vehicles, hold, simulated payment/receipt, subscription ending, manager entry/cash exit, role restrictions and stale connectivity. Checked 320/390/768 widths; manager settings, staff, payments, daily close, reservations and issues also checked at 320. No JavaScript errors. Browser tests use temporary databases and stub map tiles.
- Actual OSM street tiles and the preserved synthetic activity were separately inspected in the visible Chrome mobile preview.
- Xcode project and four Info plists pass `plutil -lint`. Shared schemes parse as XML. Swift UI source passes syntax parsing. Shared native backend-address code was compiled/run on macOS in both Debug and Release; cases include malicious host suffixes, credentials, paths and cross-origin URLs. Icons are original opaque 1024px PNGs.
- The native iOS targets have NOT been compiled with an iOS SDK, run in Simulator, signed, installed on a phone, printed to real hardware, or uploaded to TestFlight. Full Xcode is unavailable. Browser screenshots are not physical-phone acceptance.
- Before reloading the existing local server, `.local/backups/20261102T210229Z-before-mobile.sqlite` was created. All **29 pre-existing tables** and the staff credential file matched their pre-change hashes after migration; SQLite integrity was `ok`, with zero foreign-key violations. Two new mobile tables are additive.
- No public deployment, push, real payment or reseeding occurred. Optional LAN binding remains off in the running preview.

## Shared clean light map — 2026-11-02

- Replaced the standard raster background with OpenFreeMap Positron vector streets, pale blue water and the existing availability markers on consumer, attendant and management maps. MapLibre 6.16.0 and its Leaflet adapter 0.1.4 are pinned and served locally. Installation audit: zero reported vulnerabilities.
- `npm test` and `npm run test:mobile`: **45 passed**. `test:map-browser`, `test:mobile-browser` and `test:browser`: **8 + 9 + 16 checks passed**. Browser suites use temporary databases and stub map resources. The map suite also verifies that a browser launched without WebGL retains site details and can navigate away safely.
- Fixed an existing legacy test race by waiting for the pending-payment UI before applying its simulated provider event. No payment behavior was changed.
- Live provider streets, blue river, parking pins and attribution were inspected in visible Chrome for consumer and Operations. The Operations map now precedes the list on phones; at 390 px the map rendered with no fallback message or horizontal overflow. Phone-sized browser review is not an iPhone/Xcode test.
- Restarted the existing loopback preview to load asset routes/CSP. No reseeding, account changes, deployment or push. Cleared approximately 988 MB of disposable npm download cache after a disk-space error prevented installation.

## Vehicle details at sign-up — 2026-11-02

- Desktop and mobile driver sign-up now accept optional make and model (up to 60 characters each). Account and initial saved vehicle are created in one transaction; existing vehicles are preserved. The details appear in mobile **Account → My vehicles**.
- API checks: **40 + 5 passed**, including trimmed vehicle details, persistence after restart, owner isolation, optional fields and rejection of invalid types/lengths before account creation. Driver, mobile and legacy browser suites: **10 + 9 + 16 passed**.
- Reviewed desktop and phone form screenshots; responsive checks passed at 320, 390, 768 and 1440 px. Saved previews in `docs/screenshots/driver-signup-vehicle.png` and `docs/screenshots/mobile-signup-vehicle.png`. Local preview restarted; no deployment or physical-phone test.

## Entry QR, payment onboarding and English/French — 2026-11-02

- Added live entry credentials for digital and subscription passes: permanent pass reference, 60-second rotating QR, assigned-site and owner checks, observed-plate match, atomic single-use admission and idempotent retry. Repeated subscription visits require fresh credentials. Static walk-in tickets remain separate.
- Desktop/mobile onboarding requires a demo mobile-money/card preference; it is editable and frozen per payment attempt. No real financial instrument or provider is connected.
- Added saved EN/FR controls to the original web app and both mobile views, translating forms, validation, errors, statuses, QR flows, management/attendant tools, receipts/tickets and CSV presentation. In-place switching preserves form input, canonical option values and the current QR. Proper names, plates, identifiers and user notes are protected. Native shell text, language bridging and OS-localized purpose strings are included.
- Backend/unit checks: **47 API + 5 mobile + 3 localization passed**. Browser checks: **16 legacy + 10 driver + 11 admin + 8 tickets + 8 maps + 9 mobile + 6 QR + 7 bilingual passed**. Chrome uses temporary databases and stubbed maps; QR decoding uses the actual generated PNG. The camera test uses a synthetic stream and checks denied-permission messaging, not physical hardware.
- French browser coverage includes registration, preserved input, customer names matching UI labels, desktop/mobile passes and history, subscriptions, all management sections, notes that must remain unchanged, staff permissions, print/receipt language switching, CSV values, persistence and cross-tab language selection. The exercised screens have no unreviewed application-owned text. Visual review covers 320, 390, 768 and 1440 px, including printed receipt fields.
- Corrected same-document mobile pass-link navigation and kept the existing session/receipt/authorization regressions green. Swift source parser and plist checks passed. Full Xcode build and physical-device camera/printing remain unverified.
- Backed up the existing preview in ignored `.local/backups/`, restarted it, and verified all **31 original tables and the credential file unchanged**. Only three additive QR/payment tables were created. No reseeding, push or deployment. All three localhost routes returned HTTP 200 and were visibly reviewed in Chrome; French selection persists across them. Loopback binding remains enabled, not LAN/public hosting.

## Orya visual identity — 2 November 2026

Cosmetic redesign across the web portal and both mobile interfaces. New shared identity stylesheet, original SVG mark, map-led driver layout, compact site directory, management tool rail and high-contrast quick ticket panel. The backend diff for this pass only adds the stylesheet to the static-file allowlist.

Executed checks: `npm test` (47), `test:i18n` (3), `test:mobile` (5), `test:browser` (16), `test:driver-browser` (10), `test:admin-browser` (11), `test:tickets-browser` (8), `test:map-browser` (8), `test:mobile-browser` (9), `test:pass-code-browser` (6), `test:i18n-browser` (7): **130 checks passed**. Browser suites used installed Chrome and temporary databases. The bilingual screen audit reported no unreviewed source strings. Three initial concurrent runners stalled after their assertions; they were stopped and rerun sequentially, with clean exit status 0.

Responsive checks cover 320, 390, 768 and 1440 px. Live Chrome review confirmed real light-map tiles, French driver search, management and phone entry. Static screenshot evidence in `docs/screenshots/identity-*.png` uses a separate synthetic database and live public map tiles; it is not a screenshot of production activity. The existing preview database was backed up before restart; fingerprints of all 34 tables and the staff credential file matched after the redesign.

No push, deployment, live payment integration, analytics implementation or native iOS compilation was performed. The prioritized analytics proposals are in `docs/ANALYTICS_ROADMAP.md`.
