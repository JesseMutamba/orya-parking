# Orya Parking

Independent local demonstration only. Never modify Lumnia, connect real payments, deploy, or introduce cameras/AI/marketplace features under this brief.

Node 24.14+, SQLite, original HTML/CSS/JS. Run `npm ci`, `npm test`, and `npm run test:browser`. Start with `npm start`; credentials are generated in ignored `.local/access.json` (`npm run access`). Keep all secrets, databases and browser artifacts out of Git.

Server owns money, timestamps, authorization and payment events. Use integer currency units, transactions and idempotency. Preserve quoted tariff versions. Keep payment, parking validity and settlement separate. Enforce staff role AND zone on every protected endpoint. Driver bearer tokens cannot search plates or staff records. Simulator controls are an opt-in local CLI harness only.

Design: deep ink, citrus accents, cool stone and readable platform sans-serif; use the shared `public/identity.css` visual system and `docs/DESIGN_SYSTEM.md`. Preserve responsive layouts, visible demo labels, distinct payment/validity states and honest stale connectivity. Escape all untrusted text. Use semantic forms and labels.

Done means a driver session persists across restart, an authorized attendant and manager see it, assisted creation works, failure/duplicate/authorization tests pass, responsive screenshots are inspected, and remaining live-pilot decisions are documented. Report only executed checks. No deployment is implied by a GitHub push.

## Driver portal expansion (user requested)
Driver accounts, multiple synthetic site listings and fixed 30-day demo subscriptions are now in scope. Availability is explicitly an estimate (configured capacity minus active passes), never measured occupancy or a reservation. Do not add real billing/auto-renewal without authorization. Account history is linked by server ownership or explicit private-token claim, never plate/email inference. Preserve existing records with additive migrations. Run `npm run test:driver-browser` for onboarding, wallet, subscriptions and history checks.

## Admin and gate expansion (user requested)
Admin/attendant cash records, admission/departure, expiring arrival holds, site configuration, coordinates and staff access are now in scope. Public availability is based on visits plus holds, replacing active-pass estimates. Payment confirmation never substitutes for physical check-in or checkout. Preserve history and never automatically free a space when a pass expires. Managers can operate all configured sites; attendants only their assignment. Read docs/ADMIN_WORKFLOW.md for rules and limits. Run `npm run test:admin-browser` plus API regressions. Maps and driver geolocation remain the next phase; do not invent coordinates or collect background location.

## Pay-on-exit walk-ins (user requested)
Quick entry now requires only a plate; make/model are optional. Issuing a ticket explicitly records physical admission without payment. Charge on exit using the server entry timestamp and locked tariff. Keep prepaid/subscription flows separate. Payment confirmation must never reset a walk-in start time or bypass departure controls. Preserve tickets/receipts and make reprinting safe. Run `npm run test:tickets-browser` and API regressions; see docs/WALKIN_TICKETS.md.

## Kinshasa map and sample day (user requested)
Eight illustrative site pins and a shared map/list are now in scope. User explicitly authorized synthetic positions until actual sites are agreed; label them illustrative, never verified. Preserve manager-configured locations. Leaflet and MapLibre are local; OpenFreeMap vector maps require visible OpenFreeMap, OpenMapTiles and OpenStreetMap attribution and normal caching. Use the shared light basemap helper for consumer and Operations maps. Automated browser suites stub tile requests. No GPS permission or background location collection. Synthetic-day seeding is explicit, additive and idempotent; never reset existing data or automatically reseed on startup. Run test:map-browser and API regressions. See docs/SITE_MAP_AND_DEMO_DAY.md.

## Separate mobile apps (user requested)
Consumer and Operations mobile interfaces and two iOS targets are now in scope. Preserve the existing desktop workflows. Mobile arrival holds are immediate 15-minute reservations tied to authenticated driver ownership; no future-time guarantee. Saved vehicles must remain private to the owning account. Hold consumption uses existing gate admission transactions. Opt-in private-LAN preview must retain exact host and same-origin validation; default startup remains loopback-only. Release iOS requires HTTPS. Do not claim a compiled or device-tested iOS build without full Xcode validation. See docs/MOBILE_APPS.md; run test:mobile, test:mobile-browser and relevant existing regressions.

## Live entry QR and onboarding payment preference (user requested)
Digital/subscription admission now requires a short-lived, single-use server credential and the observed vehicle plate. Preserve atomic consumption, selected-site and owner checks, idempotency and the distinction between reusable subscription entitlement and one-use entry credentials. QR images are copyable; never claim device binding or uncopyable images. Walk-in static ticket lookup remains separate. Payment onboarding currently saves a demo method only, without raw financial credentials or real billing. Run test:pass-code-browser and API regressions; see docs/DIGITAL_PASSES.md.

## English and French (user requested)
Keep every app-owned message in the shared French catalog, including errors, accessible labels and print/export text. Keep names, plates, identifiers and free-text notes unchanged. Locale changes must not alter API enum values, prices, sessions or the currently displayed QR. Maintain in-place switching and input preservation; run test:i18n and test:i18n-browser. Native/system permission dialogs follow OS localization; do not claim device validation without a built app. See docs/LANGUAGES.md.

## Hosted phone test deployment (user requested)
The user authorized a new isolated test project; never deploy to or modify existing Railway projects. See `docs/HOSTED_TESTING.md`. Hosted testing uses an exact HTTPS origin, secure cookies, a fresh persistent volume and separate credentials. Never upload the local database or credentials. Keep the simulator harness disabled and retain loopback-only defaults locally. Run `test:hosted` and existing authorization regressions before upload. Deployment and native iOS build claims require separate runtime evidence.
