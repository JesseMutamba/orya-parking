# Orya Parking

Independent local demonstration only. Never modify Lumnia, connect real payments, deploy, or introduce cameras/AI/marketplace features under this brief.

Node 24.14+, SQLite, original HTML/CSS/JS. Run `npm ci`, `npm test`, and `npm run test:browser`. Start with `npm start`; credentials are generated in ignored `.local/access.json` (`npm run access`). Keep all secrets, databases and browser artifacts out of Git.

Server owns money, timestamps, authorization and payment events. Use integer currency units, transactions and idempotency. Preserve quoted tariff versions. Keep payment, parking validity and settlement separate. Enforce staff role AND zone on every protected endpoint. Driver bearer tokens cannot search plates or staff records. Simulator controls are an opt-in local CLI harness only.

Design: warm ivory, forest green, readable system sans-serif, responsive layouts, visible demo labels, distinct payment/validity states, honest stale connectivity. Escape all untrusted text. Use semantic forms and labels.

Done means a driver session persists across restart, an authorized attendant and manager see it, assisted creation works, failure/duplicate/authorization tests pass, responsive screenshots are inspected, and remaining live-pilot decisions are documented. Report only executed checks. No deployment is implied by a GitHub push.
