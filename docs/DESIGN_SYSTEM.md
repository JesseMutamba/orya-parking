# Orya Parking visual identity

Implemented locally, 2 November 2026. Shared by the consumer web portal, consumer mobile interface and Operations mobile interface. The iOS wrappers load those same mobile screens; this is not a compiled or device-tested native release.

## Direction: a clear place in the city

Orya keeps its own name and original parking-bay mark. The UI takes cues from the clarity of ParkMobile's driver journey, JustPark's strong navigation and Parkify's centralized operator workspace, without copying their artwork, claims or branding.

- **Ink / `#142d36`**: navigation, primary actions, gate entry and key totals.
- **Citrus / `#d6f37c`**: brand mark, selected mobile navigation and the gate's ticket action. Dark text only on citrus.
- **Stone / `#f3f5f6`**: application background. White work surfaces, quiet `#dce3e7` dividers.
- **Typography**: platform sans-serif, strong headings, compact labels and tabular numbers. No decorative serif headings or remote font dependency.
- **Shape**: 7–10 px control/panel radii; restrained shadows. Availability, payment and pass states keep distinct text labels as well as colors.
- **Iconography**: original inline SVG mark and a consistent stroke icon set. Decorative SVGs are hidden from assistive technology.

## Application hierarchy

**Consumer web:** task navigation and account controls share one toolbar. A short location heading leads straight into search, availability filters, site list and the light street map. Compact site cards replace the large decorative parking illustrations; their bars show the current available share of configured capacity. An account panel introduces passes and history after the useful inventory.

**Management web:** a tool rail groups existing operations beside the selected site's workspace. Four existing metrics, the inside-vehicle register and handover exceptions have distinct visual priority. No new metrics or charts were invented for this redesign.

**Gate:** the plate field and ticket action sit on a dark panel with a citrus submit button. Make/model remain optional; printing, payment and admission behavior are unchanged.

**Mobile:** the same identity in a compact header, map/list controls, site rows, pass cards and bottom navigation. Controls retain phone touch targets. English and French share the same layout; added copy is in the existing translation catalog.

## Implementation

`public/identity.css` is the shared final stylesheet, loaded after the existing feature styles. `public/index.html` and `public/mobile.html` contain the original SVG mark. Structural presentation changes are in `public/driver.js` and `public/admin.js`; mobile search uses SVG in `public/mobile-driver.js`. Existing element IDs, API requests and permissions remain in place. The server change only exposes the stylesheet through the existing static allowlist.

The existing styles remain as feature/layout foundations, including receipt and print behavior. Use the shared identity tokens for future app surfaces. Do not introduce additional visual themes in feature-specific files.

## References reviewed

- [ParkMobile](https://parkmobile.io/) — clear driver actions and product navigation.
- [Parkify landing page](https://parkify.com/landing-home) — centralized operator product and analytics presentation.
- [JustPark On-Demand](https://www.justpark.com/us/business/solutions/on-demand) — strong contrast, direct payment/access messaging.

This was a public website review, not access to authenticated competitor products.
