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
