# Orya Parking: analytics and feature recommendations

Research date: 2 November 2026. **Recommendations only; this cosmetic pass does not implement the features below.** Public vendor descriptions establish what is advertised, not independently verified product performance.

## What the references suggest

[Parkify's reporting description](https://parkify.com/how-it-works) covers occupancy, available spaces, revenue, support interactions and enforcement, with views by property, location, vehicle type and time of day. Its [features page](https://parkify.com/features) also advertises demand-based rates, guest/tenant/event validations, zones and time limits. Those are useful categories for a roadmap; their automation and revenue claims should not be treated as Orya capabilities or expected outcomes.

[JustPark On-Demand](https://www.justpark.com/us/business/solutions/on-demand) describes QR/location-code payments, configurable rates and validations, with centralized reporting for revenue, utilization and activity. [ParkMobile](https://parkmobile.io/) emphasizes an accessible driver journey through location, duration, vehicle and payment.

Orya's current operating model is deliberately staffed: fast walk-in tickets, payment on exit, cash collection, and attendant approval of paid passes. Build the reporting around that model before considering unattended hardware.

## Already implemented in the local demo

| Area | Current evidence and limits |
|---|---|
| Availability | `operations.mjs` and `public/admin.js`: current capacity, vehicles inside, active arrival holds and blocked spaces. Derived from staff records, not sensors. |
| Collections | `operations.mjs` report/ledger and `public/admin.js` Daily close: confirmed digital and cash collections, refunds, transaction count and net collections for a selected Kinshasa date. |
| Cash reconciliation | Expected cash, declared opening balance, physical count, difference, required discrepancy explanation and immutable close snapshots. No assigned tills or shift-based allocation yet. |
| Multi-site operations | Managers can select and operate all sites and view an availability summary. The dashboard/report remains scoped to the selected site, not a portfolio date-range analytics engine. |
| Exceptions | Pending cash records, invalid/expired passes still inside, unresolved staff flags and open walk-in tickets; action/actor history. |
| Drivers and access | Private vehicle/pass history, 30-day demo subscriptions and immediate 15-minute arrival holds. No live billing, settlement imports or automatic renewal. |

## Recommended feature list, in implementation order

| Priority | Addition | Management question answered | Data and scope needed |
|---|---|---|---|
| 1 | **Occupancy by hour and day**, arrivals/departures and peak periods | When does each parking site fill up? | Aggregate timestamped visits. Add historical capacity/blocked-space/open-hours records before claiming accurate past utilization percentages. Show recording completeness. |
| 1 | **Date-range and site comparisons** with prior-period deltas | Which sites are improving or underused? | Server-side aggregates of the existing collection ledger and visits, filtered by site and Kinshasa dates. Normalize comparisons by usable capacity and opening hours where history exists. |
| 1 | **Dwell time and turnover** | Are long stays preventing more drivers from parking? | Completed visit durations, median and 90th percentile, entries per usable space per day. Open visits belong in a separate aging view, not completed-stay averages. |
| 1 | **Shift/till reconciliation and variance queue** | Which cash handovers need review? | Explicit shifts, assigned cash drawer, opening float, collection/refund actor, counted handover and reviewed variance. Current daily close snapshots provide a starting point, not a complete shift ledger. |
| 1 | **Exception aging and resolution** | What needs action, and how long has it waited? | Unified view of unpaid tickets, failed/pending payments, vehicles on invalid passes and unresolved issues. Add resolution reason, owner and time. Aggregate managers only; attendant actions stay site-scoped. |
| 2 | **Payment and pass mix** plus collection yield | How are drivers paying, and which products are used? | Ledger totals by cash/digital and pass type; provider method fields once connected. Count subscription purchase once, with visits reported separately. |
| 2 | **Subscription adoption, usage and renewal** | Are passes retained and used? | New versus returning purchasers, active/expiring subscriptions, visits per subscription, explicit renewal links/events. Manual purchase today does not establish automatic renewal or contractual churn. |
| 2 | **Arrival-hold conversion and turnaways** | Do held spaces convert to arrivals, and how many drivers are lost at the gate? | Held/consumed/expired/cancelled records; explicit gate turnaway event with reason. An expired 15-minute hold is not necessarily a conventional booked no-show. |
| 2 | **Business validations and tenant/staff/event permits** | Can partner businesses sponsor parking with clear limits? | New entitlements, sponsoring organization, site/time/vehicle rules, subsidy ledger and redemption history. Adds a product workflow, not just a chart. |
| 2 | **Scheduled exports and operational digests** | Can managers review performance without manually assembling reports? | Saved filters, scoped recipients, language preference and delivery audit. Email/report delivery requires an explicit configuration; none connected now. |
| 3 | **Provider settlement reconciliation** | Has confirmed digital money actually reached us? | Payment-provider and bank settlement imports, fees, batches, matching rules, unresolved differences and approval trail. Keep confirmed collections distinct from settlement. |
| 3 | **Time-based rate schedules and pricing experiments** | Would changing rates improve use or collections? | Start with manager-approved schedules, retained quoted versions and explicit measurement windows. Forecasting or automated demand pricing comes after reliable history and a controlled pilot. |
| 3 | **Assisted plate recognition and availability forecasts** | Can we reduce entry time and improve arrival planning? | Real site locations, camera/network assessment, labeled field evidence, privacy/retention decisions, correction workflow and measurement of missed entries/exits. No camera feed or prediction is implemented. |

## Metric definitions before charts

- **Recorded occupancy at time t:** visits whose `checked_in <= t` and whose departure is absent or later than t. It measures recorded presence, not directly observed presence.
- **Available now:** `max(0, capacity − blocked − inside − unexpired holds)`; closed sites show zero. A paid pass by itself does not consume a space.
- **Utilization:** occupied space-minutes divided by usable space-minutes over the same open interval. Report unknown where historical capacity or operating hours are missing; do not divide all history by today's capacity.
- **Net collections:** confirmed cash plus confirmed digital payments less confirmed refunds in the selected Kinshasa date range. This is not bank settlement, profit or recognized accounting revenue.
- **Average payment:** confirmed gross collection amount / confirmed payment count, with refunds reported separately. Do not count each subscription admission as another purchase.
- **Dwell time:** checkout minus check-in for completed visits; exclude invalid timestamps and distinguish ongoing visits.
- **Turnover:** admissions per usable space over the stated period, with a documented treatment of changing capacity. It is different from occupancy.
- **Cash variance:** physical count − (opening float + confirmed cash − cash refunds), restricted to an explicit till/shift once those entities exist.
- **Collection yield per usable space-day:** net collections / usable capacity-days for the same period. Label this a collection metric; subscriptions may cover a different service period.

All numerical aggregates should be deterministic, calculated on the server and drillable to their underlying records. Compare like time periods and identify synthetic data. Managers alone receive cross-site activity and financial comparisons; consumer and attendant availability access must not expose another site's private activity.

## First analytics release

Start with one manager-only **Performance** screen: date range, site selector, hourly occupancy, completed-stay duration, collection/payment mix, comparison table and an exception queue. Add the historical configuration and till/shift records needed for honest denominators and cash allocation first. This is a stronger foundation than adding decorative charts or unvalidated automated pricing.
