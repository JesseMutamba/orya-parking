# Nearby parking — current map and next phase

Admin operations come first because a map cannot make availability reliable on its own. The completed admin controls provide capacity, blocked spaces, recorded arrivals/departures, expiring holds, open/closed state and optional verified site coordinates through the shared site inventory.

The interactive Kinshasa map and list now show eight demo sites, illustrative pins, rates and recorded availability. Search/area filters and Gombe focus work without requesting device location. Staff can also see the map. See [map implementation and sample day](SITE_MAP_AND_DEMO_DAY.md).

Next driver flow:

1. Choose **Near me** and explicitly allow a one-time location lookup, or select an area manually.
2. Show sites on a map and a list, with distance, rate, open/closed status, available recorded capacity and freshness timestamp.
3. Select a site and parking period. The server checks inventory for that interval and creates a short checkout hold atomically.
4. Complete provider-confirmed payment or select an eligible subscription; show the booking/pass and arrival deadline.
5. At arrival, the attendant matches the vehicle and booking, consumes the hold and records admission. Departure releases the physical space.

Location only helps find nearby sites. A fresh displayed count is a snapshot, not a promise for the time the driver reaches the gate. A server-confirmed reservation/hold, clear arrival deadline and disciplined gate records are needed to reduce turn-aways. If availability cannot be refreshed, show unknown/stale; do not promise a place.

Before replacing illustrative sites with a live service: obtain actual CG site addresses/coordinates and approved capacities; choose the map/tile provider and its access terms; decide permission/privacy handling, retention, location-denied fallback, future reservation intervals, grace periods and no-show policy. Straight-line distance and driving ETA must be distinguished. Use location on request and avoid collecting a background trail by default.

Not implemented in this phase: device geolocation collection, route calculation, driver-created future reservations, live occupancy sensors or a hosted multi-device pilot. No user location has been collected.
