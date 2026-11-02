# Architecture and integrity

The independent repository contains a Node 24 HTTP server, SQLite database and original buildless browser interface. There is no dependency on Lumnia or REA. QR generation is the only runtime npm package. Playwright is a development dependency.

`server.mjs` owns persistence, quotes, authentication, role/zone checks, events, exports and reporting. `payment-provider.mjs` implements the server-only demo adapter (`createAttempt`, `eventFor`); it makes no network requests. `public/app.js` renders the three views, calls the shared API and reports connectivity. No browser-supplied amount or timestamp is authoritative.

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

The local filesystem remains a trust boundary: pass tokens and generated credentials are in the private data directory, not encrypted at rest. Staff registration, user administration, multi-process scaling and production identity are not implemented. Retention/backup and operational settlement reconciliation are outstanding pilot decisions.

## Research provenance

The provided handoff supplies the product-reference descriptions. This build did not execute REA, observe competitor accounts, or claim independently verified competitor internals. The implementation follows the attached specification and writes original code. Node's version-specific SQLite API was checked against its [official v24 documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html). The demo's database behavior is established by local tests, not by reference-product claims.
