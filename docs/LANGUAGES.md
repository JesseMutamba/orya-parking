# English and French

The **EN / FR** control is available in the desktop web app, consumer mobile view and Operations mobile view. The selected language persists in the browser and is shared across tabs on the same origin. The application keeps form values, selected machine values, focus, authentication and the displayed QR when switching. The iOS shell has a matching language control and a validated same-origin bridge to the web interface.

French covers navigation, registration (including vehicle make/model and demo payment method), maps/list controls, passes, subscriptions, QR instructions and errors, activity/history, staff and management sections, form validation, confirmations, tickets, receipts and CSV headings/statuses. Dates display in the selected language while retaining the Africa/Kinshasa time zone. CDF amounts are formatted for display without changing server calculations.

Customer-entered names, vehicle details, plates, identifiers, site names and free-text notes remain unchanged. Known synthetic training notes are translated in presentation only. Third-party proper names and map attribution remain credited. Browser/iOS permission, print and system dialogs follow the operating system's language; localized iOS camera/network purpose strings are included for English and French.

## Implementation

- `public/i18n-catalog.js`: reviewed English source messages and French translations. No runtime translation service or external text upload.
- `public/i18n-core.js`: shared message/template lookup and formatting. Backend values and records remain canonical.
- `public/i18n.js`: language selection, accessible controls, text/attribute updates in place, localized validation and tab synchronization. `translate="no"` protects user data. Option values are fixed before translating labels.
- `localization.mjs`: ticket/export language selection and CSV presentation. APIs retain stable English error keys/messages; the interface translates them for display.
- `mobile/ios/Sources/OryaApp.swift`: localized native test-server settings, connection errors, confirmation/print controls and language bridge. `en.lproj` / `fr.lproj` provide native purpose strings.

Add new interface text to the catalog. Use `privateText(value)` for personal text in generated HTML and escape all values before insertion. Avoid fragmenting sentences across markup when the French word order differs. The browser audit rejects unreviewed application text on exercised screens; identifiers and customer text are intentionally excluded.

## Local previews

- Desktop web: `http://127.0.0.1:3040/`
- Consumer mobile: `http://127.0.0.1:3040/mobile/driver`
- Operations mobile: `http://127.0.0.1:3040/mobile/operations`

These are local browser previews, not a public deployment or installed mobile build. The default server remains bound to this Mac only. See `MOBILE_APPS.md` for opt-in LAN testing and Xcode setup.

Run `npm run test:i18n`, `npm run test:i18n-browser`, and the existing browser suites after changing shared messages. Browser tests use temporary databases and stubbed map tiles. The iOS source has a parser check and property-list validation; full compilation and physical-device checks remain outstanding.
