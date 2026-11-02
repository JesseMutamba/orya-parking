# Kinshasa site map and synthetic day

The demo now contains eight parking sites. The five additions focus on Gombe's financial/business area and nearby neighbourhoods: Financial District, Boulevard 30 Juin, Cliniques, Socimat and Ma Campagne. Existing Gombe, Riverside and City Market records are retained.

All site pins are illustrative examples, not verified parking properties, entrances or operating partnerships. The Ministry of Finance lists the financial centre in Gombe at [1 Zongotolo](https://finances.gouv.cd/contact); this establishes the chosen district, not the location or existence of any demo parking lot. Site coordinates/names/capacity can be replaced in **Management → Site settings**. Saved coordinates are labelled configured; the software does not call them verified.

## Map experience

The driver landing page has a searchable list beside an interactive street map. Filters cover site name/code/area and available-only sites. Marker counts and list counts come from the same public inventory API. Select a list item or pin for rate, occupancy, holds, availability and the existing booking link. Gombe focus and All sites control the map extent. On phones, the map sits above a scrollable site list.

Staff have a **Site map** tab with public availability for all eight sites. Managers can open any site they manage; attendants can operate only their assigned site. Merely seeing another site's public pin does not grant access to its vehicles, payments, tickets or reports.

The layout was informed by the user's screenshot and [ParkMobile's search experience](https://app.parkmobile.io/search?parkingType=2). All Orya interface code is original; no ParkMobile code, map assets or parking inventory was copied.

All consumer and Operations maps use a clean light Positron background, pale blue water and the existing green availability pins. [OpenFreeMap](https://openfreemap.org/quick_start/) supplies the style, vector tiles, labels and sprites without an API key. The browser fetches only viewport map resources, not accounts, plates or payment data. Leaflet 1.9.4, MapLibre GL JS 6.16.0 and its Leaflet adapter 0.1.4 are bundled locally, including the same-origin map worker. Attribution remains visible for OpenFreeMap, OpenMapTiles and OpenStreetMap. External requests are restricted to `tiles.openfreemap.org` in the page security policy. Normal browser caching is retained; no offline tile download or prefetch feature is included.

The shared `public/light-basemap.js` applies the style to desktop, mobile consumer and Operations maps. Automated suites use a blank local test style and exercise the actual renderer without downloading map tiles. Live streets are reviewed separately in a visible browser. Maps require internet access and WebGL 2; the public provider does not come with a contracted uptime guarantee.

If street tiles fail to load, the app explains that the background is unavailable while retaining the site pins/list. Device geolocation, distances, driving directions, future-period booking and a production tile-service arrangement are not included. No device location permission is requested.

## A populated day

Run `npm run seed:demo-day` once with the local app stopped. This adds a tagged sample batch to the existing database. It is idempotent: running it again or restarting the server does not duplicate or reset the sample records. It never deletes, clears or changes existing sessions, vehicles, users or payments.

The batch includes different occupancy levels at each open site: unpaid ticketed walk-ins, confirmed cash/digital visits, subscription visits, an expired prepaid visit, pending/failed payment examples, completed visits, a refunded cash example, reservation holds, issue flags/resolutions and a sample cash-count discrepancy. The normal server records drive occupancy, transaction reports, receipts and exit actions; the interface is not displaying unrelated hardcoded totals.

Plates start with `SYN`, record IDs with `SYN-`, and the actor is `synthetic-day`. A banner shows when the sample day was loaded. `demo_days` and `demo_records` retain the batch and record provenance. Synthetic visits are usable in normal workflows: they can be paid/exited and issues can be resolved. They count toward recorded capacity and collections because this entire application is a local demonstration.

Existing closed sites are skipped. Current occupancy/holds and configured capacity are respected when adding active visits. No staff passwords or driver ownership are altered. The synthetic subscription belongs to a separate example account with no distributed login password.

The sample is a snapshot loaded at a recorded time, not an endless simulation. Holds/pass validity age normally; reports use transaction dates. Restarting on another day does not move yesterday's transactions to today or silently remove parked vehicles. Rebuilding or clearing sample activity is not implemented automatically.
