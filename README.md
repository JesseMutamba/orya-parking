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

- Driver: `/` — browse eight synthetic sites on a Kinshasa map with recorded available spots; choose a site, plate and duration; review the server quote; create a session; start a test payment. By default the server confirms it after approximately two seconds.
- Attendant: `/attendant` — opens on Gate desk. Enter a plate and issue a printable walk-in ticket immediately; collect payment on departure through Walk-ins / exit. Also find prepaid/subscription passes, approve admission, create holds and report issues.
- Management: `/management` — operate every site, perform attendant tasks, manage capacity/pricing/coordinates/staff, review payments and exceptions, record cash counts/refunds, export daily transactions and inspect audit history.
- Driver accounts: `/account` — create an account with synthetic name/email/plate and a password of 12–128 characters. Choose digital passes or a demo subscription. Find your wallet and history through the driver navigation. Guest parking still works.
- Private driver passes use a random bearer token in the URL fragment. Save the URL to retrieve the pass; anyone holding it can view that session. It is not a staff login.

Use separate browser profiles or private windows for concurrent attendant/manager sessions: staff authentication is an HTTP-only cookie, so tabs in the same browser context share the staff login. The QR encodes the local zone URL. A second browser context on this computer works; scanning a loopback URL on a different physical phone does not. Network/LAN hosting is deliberately disabled.

## Demonstration rules

- Original three synthetic sites: **CG-01, Congo Graphic · Gombe** (40 capacity; 1,000 CDF / 30 min), **DEMO-02, Orya · Riverside** (24; 800 CDF / 30 min), and **DEMO-03, Orya · City Market** (18; 600 CDF / 30 min). All use **Africa/Kinshasa** and **CDF**. Existing CG-01 tariff edits are preserved. These are configured demo capacities, not field measurements.
- Initial sample rate: **1,000 whole CDF per 30 minutes**; 30–480 minutes in 30-minute increments. Integer arithmetic only. These are proposed demonstration values, not approved tariffs.
- Quotes expire after 10 minutes. A valid quote freezes its rate version and total. Manager edits create a new tariff version without changing existing quotes or sessions.
- Prepaid parking validity starts at the **server receipt time of the first accepted confirmation**, including delayed confirmations. Walk-in tickets instead start at recorded entry, require payment at exit, and occupy a space until staff record departure.
- One payment attempt per session. Failed/refunded attempts cannot be revived; duplicate or out-of-order notifications cannot create another receipt or extend the period. To try again after failure, create a new demo session.
- Confirmed payment remains historical fact after parking expiry. Refund simulation revokes validity and suppresses the paid receipt display while retaining the audit/receipt record.
- Settlement remains **unmatched**. Cash receipts and full cash refunds are staff-recorded demo actions. There are no bank imports, real money movements, payment credentials or settlement matching.
- Daily close groups confirmations/refunds by their recorded date in Kinshasa. Cash counts reconcile opening cash plus confirmed cash less refunds against the physical count, requiring a note for discrepancies. Reports separate digital and cash; all amounts are demo amounts.

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
npm run test:driver-browser
npm run test:admin-browser
npm run test:tickets-browser
npm run test:map-browser
```

If Chromium is already installed elsewhere, set `BROWSER_EXECUTABLE` to its executable path. Browser tests create and remove their own temporary database. Screenshots and their JSON report are written to ignored `test-results/`. API tests use a controlled server clock for expiry and delayed-event checks. Tests require permission to bind temporary loopback ports and run a browser.

See [verification](docs/VERIFICATION.md), [architecture](docs/ARCHITECTURE.md), [live-pilot decisions](docs/PILOT.md) the [admin workflow](docs/ADMIN_WORKFLOW.md), [walk-in ticket workflow](docs/WALKIN_TICKETS.md), [geolocation next phase](docs/GEOLOCATION_NEXT.md) and the [original handoff](docs/HANDOFF.md).

## Limits

This is a single-process local demonstration. Managers can operate all configured sites; attendants are assigned one site. There are no real payments, settlement imports, automatic subscription billing, cameras, offline writes or hosted multi-device access. Reservations are immediate expiring arrival holds, not future time-slot bookings. Device geolocation, multiple saved vehicles, phone/WhatsApp verification and future-period reservations remain the next phase. The map already displays illustrative site pins. Lists are unpaginated. See the admin workflow for implemented controls and boundaries.

Client views mark disconnection and the last successful refresh; no persistent browser cache is used. Driver pass refresh is automatic every five seconds. The operations overview refreshes every 15 seconds; forms and registers refresh explicitly to preserve work in progress. Do not interpret a missing record as proof of nonpayment. A live service still needs approved privacy/retention policies, production identity/secret management, TLS, abuse controls, monitoring, backups, provider verification and settlement procedures.

## Driver accounts, availability and subscriptions

Driver registration and sign-in use separate HTTP-only cookies from staff. Account passwords are scrypt hashed; account history is server-scoped. The default vehicle is prefilled for new bookings. Sessions created while signed in are saved automatically; older guest sessions can be claimed only by pasting their private pass URL in My passes or Parking history. Matching a plate alone never grants access. Email verification and password recovery are not implemented; use synthetic details and a unique demo password.

Site availability is `max(0, capacity − blocked spaces − vehicles checked in − unexpired arrival holds)`; a closed site displays zero. Payment or subscription purchase alone does not consume physical capacity or reserve a bay. Checkout releases a visit; expiry/refund does not remove a vehicle still recorded inside. Counts depend on accurate staff entry/exit records. The UI labels disconnected data stale/unknown.

The subscription option is a **fixed 30-day demo pass**, priced at **60,000 CDF** for one vehicle and one selected site (sample plan v1). It uses the same payment-attempt/event/receipt machinery as other passes. The server fixes the amount and starts the 30 days only after simulated confirmation. There is no automatic billing or renewal. One unfinished/current subscription per account/plate/site is allowed; retries reuse the same pass. A driver may explicitly end a confirmed subscription early: validity ends, historical payment remains, no refund is issued. Expired/ended subscriptions stay in parking history. Renew by choosing a new demo pass after the previous one expires or ends.

Schema expansions are additive: driver/account tables and operations tables are added without rewriting prior sessions or staff credentials. Restart `npm start` after updating source to enable the new backend endpoints.

## Quick walk-ins — pay on exit

**Gate desk → plate → Issue & print ticket.** Make/model are optional. Entry records occupancy and the start time immediately; it does not require an account or payment. The unique ticket number/QR links to that visit. Print or reprint through the browser without creating another session.

**Walk-ins / exit → ticket number or plate → Review exit.** The server calculates elapsed time and the charge using the entry tariff, rounded up to started 30-minute blocks (30-minute minimum). Cash confirmation and recorded departure can be completed together; digital checkout waits for the demo provider before staff record exit. Stale quotes require refresh, and duplicate requests do not duplicate collections. Completed tickets and receipts remain searchable. See the workflow above for charge cutoff and printer limits.

## Kinshasa map and active-day examples

Five additional sites bring the total to eight, with illustrative pins around Gombe and nearby areas. Find parking opens a map and searchable list; staff have a Site map tab. Marker counts use recorded visits/holds. Actual property locations can be entered later under Site settings.

`npm run seed:demo-day` adds a one-time, labelled synthetic day without changing existing records. It fills the staff views with walk-ins, active visits, completed payments, subscriptions, holds and exceptions. Re-running it does not duplicate or refresh history. See [map and sample-day details](docs/SITE_MAP_AND_DEMO_DAY.md) for provenance, privacy, dependencies and limits. Internet is needed for the street-map background; no GPS permission is requested.

## Mobile apps

Open the phone interfaces locally: [Orya Parking](http://127.0.0.1:3040/mobile/driver) and [Orya Operations](http://127.0.0.1:3040/mobile/operations). They share the existing parking records. Consumer features include map/list discovery, saved vehicles, 15-minute arrival holds, digital passes, subscriptions and history. Staff keep the same entry/payment/exit controls and permissions.

The two native iOS targets are in `mobile/ios/OryaMobile.xcodeproj`. This is a SwiftUI/WebKit implementation that connects to the Orya server. Full Xcode compilation and phone/print-device testing are pending. See [mobile features, research and Xcode setup](docs/MOBILE_APPS.md). No deployment or TestFlight upload has occurred.

```sh
npm run test:mobile
npm run test:mobile-browser
npm run ios:open
```

### English/French and live pass QR

All three interfaces have a saved **EN / FR** toggle: [web](http://127.0.0.1:3040/), [consumer mobile](http://127.0.0.1:3040/mobile/driver), [Operations mobile](http://127.0.0.1:3040/mobile/operations). See [language behavior and verification](docs/LANGUAGES.md).

Confirmed digital passes and subscriptions can show a live entry QR. Staff verify it, match the arriving plate and approve admission. Codes expire after up to 60 seconds and are consumed on entry; subscription holders obtain fresh codes for later visits. Sign-up also requires a demo payment-method selection. These are simulated payments, not connected cards/wallets. See [digital pass rules and limits](docs/DIGITAL_PASSES.md).

## Visual identity and analytics roadmap

The web portal and both mobile interfaces share the Orya ink/citrus visual system. See [design rules](docs/DESIGN_SYSTEM.md) and the [prioritized analytics recommendations](docs/ANALYTICS_ROADMAP.md). The latter is a roadmap, not implemented functionality.
