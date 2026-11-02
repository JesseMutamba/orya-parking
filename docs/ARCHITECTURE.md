# Architecture and integrity

The independent repository contains a Node 24 HTTP server, SQLite database and original buildless browser interface. There is no dependency on Lumnia or REA. QR generation is the only runtime npm package. Playwright is a development dependency.

`server.mjs` owns persistence, quotes, authentication, role/zone checks, events, exports and reporting. `payment-provider.mjs` implements the server-only demo adapter (`createAttempt`, `eventFor`); it makes no network requests. `public/app.js` supplies shared UI, authentication and pass rendering; `public/driver.js` owns the driver portal and `public/admin.js` owns the default staff workspace. No browser-supplied amount or timestamp is authoritative.

## Records

- `zones` points to a versioned `tariffs` record.
- `staff` stores scrypt password hashes; `auth` stores SHA-256 hashes of random session cookies, expiring after eight hours.
- `quotes` preserves integer amount, duration, plate, tariff and server timestamp.
- `sessions` holds an immutable quote snapshot, random reference and independent 256-bit private access token, creator, activation/end times and submission fingerprint.
- `attempts` has one record per session, including persisted simulator schedule.
- `events` has a unique provider-event key and whether it changed state.
- `receipts` has a unique session constraint.
- `issues` and `audit` attribute operational changes to an actor and server time.

SQLite foreign keys, unique constraints and `BEGIN IMMEDIATE` transactions protect connected writes. Session idempotency keys are checked against quote/actor fingerprints. Repeated payments return the existing attempt. Repeated event identifiers with changed contents are rejected. A confirmation and receipt are committed atomically. Validity is derived from payment status and server time, not a mutable browser flag.

Allowed payment transitions: pending → confirmed or failed; confirmed → refunded. Other transitions are recorded as ignored events. Terminal failure/refund cannot be undone by late confirmation. Current validity is a separate field; expiry does not change confirmed payment history.

## Endpoint boundaries

Public: zone/QR, quote creation, driver session creation. Private driver token: `/api/pass`, `/api/payment`; these return no staff identities or audit trail. Authenticated staff and assigned zone: session search, assisted creation and issue flags. Manager only: CSV, metrics, payment/exception history, daily close and tariff writes. Harness: separate server opt-in plus independent secret, never a staff role.

Same-origin checks reject cross-origin writes. The server binds loopback and rejects other Host headers. Cookies are HTTP-only and SameSite=Strict (local HTTP only; production TLS is out of scope). Login attempts are rate-limited in memory. HTML is escaped, SQL uses bound values, CSV cells are quoted and neutralized against spreadsheet formulas, and CSP blocks third-party script execution. Responses are no-store with no-referrer. No analytics or external fonts/scripts are loaded.

The local filesystem remains a trust boundary: pass tokens and generated credentials are in the private data directory, not encrypted at rest. Managers can create, assign and disable attendant accounts. Driver administration, manager-account editing, multi-process scaling and production identity are not implemented. Retention/backup and operational settlement reconciliation are outstanding pilot decisions.

## Research provenance

The provided handoff supplies the product-reference descriptions. This build did not execute REA, observe competitor accounts, or claim independently verified competitor internals. The implementation follows the attached specification and writes original code. Node's version-specific SQLite API was checked against its [official v24 documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html). The demo's database behavior is established by local tests, not by reference-product claims.

## Driver portal expansion

`driver-accounts.mjs` adds `drivers`, `driver_auth`, `session_owners`, `subscriptions` and `site_details` with an additive migration. Old sessions and staff passwords are not rewritten. Driver cookies are independent of staff cookies, HTTP-only, SameSite=Strict and stored as token hashes in SQLite. New-account passwords use scrypt and authentication endpoints have a local attempt limit. Production identity, email verification and recovery are not connected.

Synthetic sites are listed publicly without plate or driver information. Public availability now uses recorded visits and unexpired arrival holds through the operations module, replacing the earlier active-pass estimate. Managers have access across sites; attendants are restricted to one assigned site.

Signed-in driver sessions receive an owner at creation inside the session transaction. Account identity is included in the idempotency fingerprint. Guest sessions can be claimed only with their private bearer token; claims are exclusive and idempotent. Plate matching never grants access. History and subscription management enforce ownership on the server.

A subscription is a fixed 30-day, 60,000 CDF demo pass (plan v1), backed by the same session/payment/receipt/audit records. It has no automatic renewal. Duplicate enrollment is rejected while that account/vehicle/site already has an unfinished or current subscription. Ending a confirmed subscription sets a separate cancellation timestamp; payment history stays confirmed, validity ends, but any physical visit remains inside until staff record departure. There is no automatic refund. A subscription failure, delayed event or duplicate event follows the existing payment state machine.

## Operations expansion

`operations.mjs` owns site configuration, walk-in vehicles, cash records, arrival holds, physical visits, cash-count snapshots and staff access. `ops_sites` adds optional coordinates, blocked capacity and open status to `zones`/`site_details`; none of the seed coordinates are invented. Site edits use a version check. Rate edits retain the existing versioned-tariff system.

Admission, hold creation/consumption and capacity checks run in `BEGIN IMMEDIATE` transactions. A partial unique index permits at most one open visit per normalized plate across all sites. Admission checks pass/site/vehicle eligibility; a single-visit pass is consumed once, while subscriptions permit subsequent visits after checkout. Expiry, refunds and subscription cancellation do not create departure records.

Cash uses `cash_payments` with distinct recording, confirmation and refund actors/times. Confirmation and its immutable receipt are atomic; digital payment attempts are blocked for cash sessions. Digital confirmation remains provider-only. Daily reports combine applied digital events with cash confirmation/refund events by Kinshasa date. Cash counts save opening/expected/counted/difference snapshots without editing prior transactions.

`ops_requests` persists actor/action/body fingerprints and responses for retried walk-ins, holds, admissions and cash counts. Other state transitions are naturally idempotent. Server role/site checks apply to every operations route. Staff assignment/access changes invalidate existing staff sessions; manager accounts are protected. CSV output neutralizes formula prefixes. See [admin workflow](ADMIN_WORKFLOW.md) for operational limits.

## Walk-in tickets

`tickets.mjs`, called inside the authenticated operations handler, adds `walkin_tickets` and `walkin_exit_quotes`. Issuing a ticket atomically records a visit with no payment session yet, consumes an eligible hold and locks the entry tariff/rate. `visits.session` stays null until the exit charge is committed. Overview handles these unpaid visits separately from prepaid pass validity.

The server calculates whole CDF in started 30-minute blocks from the recorded entry. Exit quotes expire after two minutes. The committed charge retains both entry and cutoff times; provider confirmation must not overwrite those with prepaid activation times. Cash settlement writes the charge, cash receipt and departure atomically. Digital settlement reuses the existing provider state machine; an explicit staff exit is allowed only after confirmed payment. The general prepaid checkout endpoint cannot bypass ticket payment enforcement.

Entry/quote/charge/exit requests use the existing persisted idempotency fingerprints. A duplicate plate constraint, transaction-scoped capacity checks and payment-state checks prevent duplicate visits, overbooking and double collection. Printing is an authenticated, site-scoped read with escaped HTML and a QR containing only the ticket identifier. Browser print styles and handlers live in `public/ticket.css` and `public/ticket.js`; `public/walkins.js` owns quick entry and exit checkout.

## Site map and sample-day expansion

`site-catalog.mjs` defines eight illustrative sites. Driver-account setup adds missing catalogue sites without rewriting existing site/tariff data. Operations setup fills only untouched empty seed coordinates and records their source in `site_locations`. Manager edits mark coordinates configured (or unmapped); restart preserves those choices.

`public/site-map.js` and its CSS render a shared Leaflet map/list using only public site inventory. Leaflet's fixed-version JS/CSS is served from the local npm dependency. CSP allows OSM tile images, retains self-only scripts and allows the inline styling Leaflet needs. Tile image requests send an origin-only referrer without driver tokens or personal data. Staff operation links retain server-side role/site enforcement.

`demo-day.mjs` creates labelled synthetic records only when explicitly invoked by `seed-demo-day.mjs` or an isolated test. It uses one atomic, idempotent batch, checks available capacity before new active visits, leaves existing records untouched and attributes demo records to `demo_days`/`demo_records`. Synthetic flags in staff/session/ticket responses are derived from provenance. Default startup never regenerates sample transactions or ages them backwards.

## Separate mobile clients

`/mobile/driver` and `/mobile/operations` are phone-first interfaces over the same API. `mobile-services.mjs` adds owner-scoped vehicles and 15-minute driver holds; the latter link to `reservations` so existing walk-in/admission paths consume holds inside the capacity transaction. No money or occupancy authority moves to the client. `mobile/ios/OryaMobile.xcodeproj` contains separate SwiftUI/WebKit targets, persistent cookies per app bundle, an explicit backend-origin setting and an authenticated Operations ticket preview/print bridge. Native UI syntax and address validation are checked; full Xcode/SDK compilation and physical device testing remain pending.

The server stays loopback-only unless `ORYA_LAN_HOST` explicitly names a private IPv4 address. It binds that interface and allows the exact host; cross-origin mutations remain rejected. This optional HTTP preview is for trusted local networks and synthetic data, not public hosting. Release iOS permits only HTTPS and has no ATS exception. See [mobile implementation](MOBILE_APPS.md).
