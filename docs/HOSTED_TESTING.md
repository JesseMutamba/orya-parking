# Hosted phone testing

This deployment package serves the existing web app and both mobile interfaces from an HTTPS address. It is a browser-based test build, not a signed TestFlight or Appetize binary.

## Isolation

Use a **new Orya Parking Test project**, one new service, and a fresh persistent volume mounted at `/data`. Never target an existing project. Do not upload `.local`, credentials, SQLite files, user data or the existing local backup. A fresh hosted database generates separate attendant and manager credentials. The Docker and Railway ignore files exclude local state and development artifacts.

## Configuration

- Node 24.14.0 container, `npm ci --omit=dev`, existing lockfile.
- `PORT=8080` and `ORYA_PUBLIC_ORIGIN=https://<exact-generated-host>`.
- `ORYA_DATA_DIR=/data` on the new persistent volume.
- `ORYA_SEED_DEMO=1` only for the explicitly requested synthetic test activity. Seeding is additive and idempotent; it does not reset the database on restart.
- No `ORYA_LAN_HOST`; no simulator harness. Normal demo payments remain simulated.
- One replica for SQLite. Do not scale horizontally without a database migration.
- Set the health-check path to `/api/health` in the service settings. New Railway services no longer accept legacy `railway.toml` configuration; configure the service in its dashboard and let the Dockerfile define the image.

The service binds to `0.0.0.0` only when an explicit public HTTPS origin is configured. It validates the original Host header and the trusted reverse proxy's HTTPS indicator; untrusted forwarded-host values cannot select the origin. Cross-origin writes are rejected and sign-in cookies are Secure/HttpOnly/SameSite. `/api/health` exposes only readiness and the demo flag, including for Railway's internal health-check hostname.

Local defaults remain loopback-only and retain the existing database. No real billing or native App Store distribution is included.

## Test links after successful deployment

- `/` — web app
- `/mobile/driver` — consumer phone interface
- `/mobile/operations` — attendant/manager phone interface

On iPhone, open a link in Safari. This is not a downloaded App Store build. Testing the native wrappers later requires full Xcode, signing and a reachable HTTPS backend; TestFlight also requires developer enrollment.

## Validation and handoff

Run `npm run test:hosted`, `npm test`, `npm run test:mobile`, `npm run test:i18n` and relevant browser regressions. Verify all three URLs on the real HTTPS domain, sign in with the new test credentials, create a synthetic driver/vehicle, verify a pass and walk-in entry/exit, and inspect a narrow phone layout. Check the database survives a redeploy before claiming persistent hosted testing works.

Deployment must be confirmed from actual health responses and browser behavior, not just an upload or build status. Record the new project/service/volume IDs and URL only after creation. Keep credentials in `.local/deployments`, never in this document or Git.
