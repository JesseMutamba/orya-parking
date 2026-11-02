# Orya mobile apps

Two separate mobile experiences use the existing Orya server and parking ledger:

- Consumer preview: `http://127.0.0.1:3040/mobile/driver`
- Operations preview: `http://127.0.0.1:3040/mobile/operations`
- Native project: `mobile/ios/OryaMobile.xcodeproj`
- Shared Xcode schemes: **OryaParking** and **OryaOperations**.

This first version is hybrid: the iOS applications contain a SwiftUI/WebKit container, and the phone interface is served by Orya. It is not an independently rewritten SwiftUI parking frontend or an offline app. Server availability is necessary. The existing desktop portals remain available.

## Reference research and adaptation

Reviewed official product descriptions on 2 November 2026, not authenticated competitor accounts or installed binaries. No competitor artwork or source code is included.

| Reference | Observed pattern | Orya implementation |
|---|---|---|
| [SpotHero: how it works](https://blog.spothero.com/how-spothero-works) | Compare sites/rates, review a parking period, retrieve a parking pass | Map/list search, site detail sheet, server quote review, dedicated pass screen and account history |
| [ParkMobile: zone parking](https://parkmobile.io/parking/zone-parking) | Choose a nearby or posted zone, vehicle and duration, then inspect the session | Site/area/zone search, saved vehicle selector, duration selection and refreshed payment/pass status |
| Existing Orya gate workflow | Staff-controlled admission, walk-in tickets and payment at exit | Separate Operations navigation: Entry, Exit, Overview, More; manager permissions remain server enforced |

SpotHero describes future reservations and a space guarantee. Orya does not adopt that claim: its consumer reservation is an immediate **15-minute arrival hold**, starting when the server accepts it. No future interval inventory, refund policy or driving ETA is invented. ParkMobile's extensions depend on local rules; extensions are not implemented here. Orya subscriptions are the existing fixed-price, single-site 30-day demo parking passes, not a copy of ParkMobile's membership product.

## Consumer app

- Map first, with list toggle, site/area/zone search and an available-only filter.
- Site details show sample rate, recorded availability, illustrative-location notice and two distinct actions: hold a space or buy a demo pass.
- A signed-in driver can hold one space for a saved vehicle for 15 minutes, retrieve its reference/deadline and cancel before it expires or is used. Walk-in parking is still charged separately at exit.
- Saved vehicles include plate and optional make/model; the existing profile plate is retained as the first vehicle. Up to ten vehicles per account; normalized duplicate plates are rejected within an account.
- Digital pass quote review and simulated payment; pass status refreshes from the server. Receipt/reference and payment validity remain separate from physical check-in.
- My parking contains active holds and current passes. History contains owned passes and historical holds. Existing guest passes are still accessible by private link; the desktop wallet retains its guest-pass claim form.
- Subscription review, simulated payment and explicit early termination. Ending a pass never releases an occupied vehicle.
- Bottom navigation: Explore, My parking, History, Account.

Counts refresh every 30 seconds in Explore. The server makes the final admission/hold decision; a displayed count alone is not a guarantee. User location is not collected. Maps remain centered on Gombe and the illustrative Kinshasa sites.

## Operations app

- Entry: plate-first walk-in ticket, optional vehicle details, pass lookup and admission.
- Exit: pending tickets, elapsed duration, server-calculated charge, cash or simulated digital collection, receipt and explicit departure.
- Overview: available spaces, recorded occupancy, holds and manager collections.
- More: reservations, pass register, site map, issues and audit; manager-only payments, daily close, site settings and staff.
- Manager accounts work across sites; attendants keep their assigned-site restriction. Mobile navigation never grants authorization.
- Native Operations has a same-origin ticket bridge: preview the authenticated ticket, then explicitly invoke the iOS print sheet. Browser previews retain the existing browser print window. Successful paper output, Bluetooth/USB/ESC-POS printers, scanners and AirPrint hardware have not been tested.
- CSV links are part of the existing web reports. Native export/Safari cookie behavior remains a device acceptance check; the desktop workflow remains available.

## Xcode setup

The targets require iOS 16 or newer. Full Xcode and the iOS SDK are not installed/configured on this Mac at implementation time. The iOS UI has been syntax checked, but **no iOS executable, Simulator run, signed archive or TestFlight upload is verified**.

1. Install full Xcode, launch it and complete Apple's setup; install an iOS platform/runtime when prompted.
2. Start the existing server with `npm start` in this repository.
3. Open `mobile/ios/OryaMobile.xcodeproj` (or run `npm run ios:open`). No CocoaPods, npm native packages or Swift package download is required.
4. Choose **OryaParking** or **OryaOperations**, then an iPhone Simulator, and Run. Debug defaults to `http://127.0.0.1:3040` on the Mac.
5. For an actual iPhone, sign into your Apple Account in Xcode, select your Personal Team in **Signing & Capabilities**, and change the development bundle identifiers if needed. Enable Developer Mode on the phone if Xcode requests it. Choose your connected device and Run.
6. On a phone, use the test connection button to select a server reachable by that phone; its own `127.0.0.1` is not the Mac. Use the same server in both apps.

Apple permits personal-device testing with a free account, with provisioning expiration/reinstallation restrictions. See [Apple developer account overview](https://developer.apple.com/help/account/basics/about-your-developer-account). TestFlight requires paid program membership and a later signed upload. Enrollment, agreements and signing identities remain the user's actions.

### Optional private Wi-Fi preview

The default server remains loopback-only. To opt into a local phone preview, select the Mac's actual private Wi-Fi IPv4 address and use a separate port if the desktop preview is already running. For example, **replace** the example address below with the Mac's address:

```sh
ORYA_LAN_HOST=192.168.1.25 PORT=3041 npm start
```

This binds only to that private address. The server accepts the exact configured host plus its loopback defaults, retains same-origin write checks, and adds no CORS wildcard. On the same Wi-Fi, open `http://192.168.1.25:3041/mobile/driver` or `/mobile/operations` in Safari, or enter `http://192.168.1.25:3041` in the native app's test connection settings. The Mac must remain awake and running. The two local server processes share the same SQLite database using its existing WAL/transactions; stop the extra process when finished.

This HTTP option is for synthetic data on a trusted local network, not public deployment. It does not provide TLS. Debug iOS configuration permits local networking; Release has no ATS exception and the app requires HTTPS. Release hosting still needs server HTTPS/cookie/proxy configuration and deployment work; this change does not publish or expose a service. See [Apple local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

## Implementation and verification

- `public/mobile.html`, `mobile-shell.js`, `mobile-driver.js`, `mobile.css`: mobile interfaces. Operations reuses the existing `admin.js` and `walkins.js` actions.
- `mobile-services.mjs`: additive `driver_vehicles` and `driver_holds` tables. Holds use the existing `reservations` table so admission consumes them atomically without double-counting. Driver IDs bind ownership; plate matching never grants account-history access.
- `preview-network.mjs`: opt-in exact private LAN host validation. The native app independently validates test server addresses and locks navigation/printing to the selected origin. HTTPS is required in Release.
- `mobile/ios/Sources/`: native container, server setup, retry UI, persistent WebKit cookies and authenticated ticket print preview. The two bundles have separate cookie stores and icons.
- `generate-project.py` regenerates the project and schemes; it leaves signing team unset. Select the signing team after generation; regenerate only deliberately, since project build-setting edits are replaced. `generate-icons.swift` renders the original vector marks.

Checks: `npm test`, `npm run test:mobile`, `npm run test:mobile-browser`, plus the existing driver/admin/ticket/map/legacy browser suites. Browser suites use isolated temporary databases and stub the external map style and tiles. Actual street tiles are checked separately in the visible browser. Swift backend-address checks run on macOS in Debug and Release modes, independent of UIKit; they do not prove an iOS build works. Full Xcode compilation, physical-phone layout/input, print hardware and signing remain unverified.

No real payments, card storage, phone/WhatsApp verification, push notifications, camera scanning, background location or offline writes are added. Existing records and staff credentials are preserved; the pre-change SQLite backup is in ignored `.local/backups/`.
