# Orya × Congo Graphic — Parking demo

An original, local-only parking MVP: driver, attendant and management views share one persistent SQLite database. Synthetic zone and sample tariff; every payment is simulated. This is neither an approved Congo Graphic scope nor a live parking/payment service.

## Run locally

Requires Node.js **24.14+ within the 24.x line** and npm. The built-in SQLite API emits an experimental warning on the verified Node 24.14 runtime.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:3040**. In another terminal in this repository:

```sh
npm run access
```

That prints the generated `attendant` and `manager` passwords. They are stored only in ignored `.local/access.json`, with owner-only file permissions. The database is `.local/parking.sqlite`; keep the entire `.local` directory private and retain it between runs. No account passwords or driver records are committed.

- Driver: `/` — choose the synthetic CG-01 zone, plate and duration; review the server quote; create a session; start a test payment. By default the server confirms it after approximately two seconds.
- Attendant: `/attendant` — sign in, search plate/reference, check payment separately from validity, flag issues, or create an assisted session. Share its private pass link so the driver can start a simulated payment.
- Management: `/management` — sign in for metrics, session filters/CSV, payment attempts, exceptions/issues, daily close, sample tariff edits and audit history.
- Private driver passes use a random bearer token in the URL fragment. Save the URL to retrieve the pass; anyone holding it can view that session. It is not a staff login.

Use separate browser profiles or private windows for concurrent attendant/manager sessions: staff authentication is an HTTP-only cookie, so tabs in the same browser context share the staff login. The QR encodes the local zone URL. A second browser context on this computer works; scanning a loopback URL on a different physical phone does not. Network/LAN hosting is deliberately disabled.

## Demonstration rules

- One synthetic zone: **CG-01, Congo Graphic · Gombe**, timezone **Africa/Kinshasa**, currency **CDF**.
- Initial sample rate: **1,000 whole CDF per 30 minutes**; 30–480 minutes in 30-minute increments. Integer arithmetic only. These are proposed demonstration values, not approved tariffs.
- Quotes expire after 10 minutes. A valid quote freezes its rate version and total. Manager edits create a new tariff version without changing existing quotes or sessions.
- Parking starts at the **server receipt time of the first accepted confirmation**, including delayed confirmations. It ends that many minutes later. Pending and failed payments grant no validity.
- One payment attempt per session. Failed/refunded attempts cannot be revived; duplicate or out-of-order notifications cannot create another receipt or extend the period. To try again after failure, create a new demo session.
- Confirmed payment remains historical fact after parking expiry. Refund simulation revokes validity and suppresses the paid receipt display while retaining the audit/receipt record.
- Settlement remains **unmatched**. There are no bank imports, real refunds, cash collection, payment credentials or settlement matching.
- Daily close groups quoted charges by session creation date and confirmed/refunded events by event receipt date in Kinshasa. Unmatched is explicitly an all-time balance, not a daily cash balance. All report amounts are demo amounts.

## Simulator harness

Ordinary staff cannot control confirmations. The normal application uses `DemoPaymentProvider` in `payment-provider.mjs`. A separate development CLI harness is disabled by default. To investigate scenarios:

```sh
ORYA_HARNESS=1 npm start
```

Harness mode delays normal confirmations by 30 seconds, allowing time to choose a scenario. Obtain an attempt ID from the manager API (`/api/manager/overview`) or the local database. Then, in another terminal:

```sh
npm run simulate -- ATTEMPT_ID pending
npm run simulate -- ATTEMPT_ID delayed
npm run simulate -- ATTEMPT_ID confirmed
npm run simulate -- ATTEMPT_ID failed
npm run simulate -- ATTEMPT_ID refunded
```

`pending` removes the automatic job; `delayed` schedules confirmation in 15 seconds. Use the same optional final `EVENT_ID` (16+ alphanumeric/hyphen/underscore characters) twice to exercise duplicate-event handling. The CLI reads a separate ignored harness secret; staff cookies grant no harness authority. Normal staff pages contain no harness controls. Pending jobs are stored in SQLite and resume after restart.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
```

If Chromium is already installed elsewhere, set `BROWSER_EXECUTABLE` to its executable path. Browser tests create and remove their own temporary database. Screenshots and their JSON report are written to ignored `test-results/`. API tests use a controlled server clock for expiry and delayed-event checks. Tests require permission to bind temporary loopback ports and run a browser.

See [verification](docs/VERIFICATION.md), [architecture](docs/ARCHITECTURE.md), [live-pilot decisions](docs/PILOT.md) and the [original handoff](docs/HANDOFF.md).

## Limits

This is a single-process local demonstration, with two generated demo staff identities and one fixed zone. No deployments, production integration, merchant onboarding, actual settlement imports, cash workflow, reservations, extensions, pass scanning, cameras, occupancy claims, AI analytics, or offline writes. Issue flags are recorded for review; resolution workflows are deferred. Staff lists are unpaginated. Zone identity/timezone are fixed; managers can version the sample rate.

Client views mark disconnection and the last successful refresh; no persistent browser cache is used. Driver pass refresh is automatic every five seconds; attendant lookup refreshes every ten seconds except while typing an issue. Management refresh is explicit. Do not interpret a missing record as proof of nonpayment. A live service still needs approved privacy/retention policies, production identity/secret management, TLS, abuse controls, monitoring, backups, provider verification and settlement procedures.
