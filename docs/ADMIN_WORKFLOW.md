# Admin and gate operations

This implements the user's agreed responsibility split as a local demo. No real provider, cash drawer, sensor or settlement integration is connected.

| Side | Responsibilities |
|---|---|
| Driver portal | Account and pass wallet/history already work. Multi-vehicle profiles, map discovery, phone/WhatsApp verification and driver-selected reservation periods are the next phase. |
| Attendant interface | Issue plate-only walk-in tickets for payment at exit; optionally record make/model; find passes and holds; confirm recorded cash; approve admission; record departures; report problems. |
| Management dashboard | All attendant actions across sites, capacity and pricing, site coordinates, staff assignment/access, daily collections, cash counts/refunds, issue resolution and audit history. |

## Admission and space counts

Payment/pass validity and physical visits are separate. A payment never checks a vehicle in automatically. For prepaid/subscription passes, the attendant inspects the arriving vehicle and explicitly selects **Approve admission & check in**. For pay-on-exit walk-ins, **Issue & print ticket** explicitly records admission without payment. The server verifies the site's access, pass validity, capacity, duplicate vehicle constraints and reservation before saving the visit. **Record exit** closes that visit and releases its space.

A subscription permits repeated visits at its allowed site during its validity period, with at most one active visit for that vehicle across the system. A single-visit pass cannot be reused after checkout. An expired/refunded/ended pass does not release a car that is still physically recorded inside; the dashboard highlights its revoked/expired entitlement until departure is recorded.

Public availability is now `max(0, capacity − blocked spaces − vehicles checked in − unexpired arrival holds)`; closed sites show zero available. It is based on staff records, not measured occupancy. Old paid passes are not silently migrated into physical visits. They require a new explicit gate check-in if still valid. The site list and operations dashboard read the same counts.

## Reservations

The admin/attendant can place an immediate, one-space arrival hold for 5–120 minutes (UI choices: 15, 30, 60 or 120). Holds reduce available capacity, expire by server time, can be cancelled, and are consumed atomically when the matching plate checks in at the site. Only one active hold per normalized plate is allowed. Full sites reject holds and unreserved admissions under the same database transaction.

This is an arrival-hold workflow, not a future time-slot booking engine. Driver-selected dates/durations, arrival grace periods, cancellation/no-show fees and inventory over future intervals remain next-phase decisions. Admission cannot guarantee a space if staff fail to record actual occupancy accurately.

## Cash, digital and subscription responsibilities

- **Prepaid cash:** server calculates immutable charge; staff register a cash record, explicitly confirm the exact amount received, then separately admit the vehicle. Confirmation creates a unique cash receipt. Managers can record a full cash refund with a reason. Refunds retain history and do not fabricate vehicle departure.
- **Digital:** the existing server-side simulator confirms payment. Staff have no manual provider-confirmation endpoint. They inspect the vehicle and approve admission against the confirmed pass.
- **Subscription:** the server verifies payment, expiry/cancellation, permitted site and vehicle. Each arrival creates a distinct visit; purchasing a subscription no longer consumes capacity by itself. Its purchase is counted once in collections, not on every visit.

Cash is labelled as a staff record, distinct from digital events. The simulator cannot start a digital payment for a cash session. Cash approval, provider events, holds, admission and cash counts are protected against duplicate submissions.

For the default walk-in flow, a ticket records entry first and the server calculates the charge on exit. Cash collection and departure are explicitly confirmed together; digital checkout still requires provider confirmation before departure. See [walk-in tickets](WALKIN_TICKETS.md).

## Collections and reconciliation

Daily reports use Africa/Kinshasa confirmation/refund dates and whole CDF amounts. They separate digital confirmations, cash confirmations, refunds, gross and net collections, transaction count and CSV rows. "Net collections" is not an assertion of earned accounting revenue or bank settlement. Settlement remains unimplemented.

A cash count records the declared opening balance, expected balance (opening + confirmed cash − cash refunds), physical count, difference, explanatory note, actor and time. Discrepancies require a note. Counts are immutable snapshots; later transactions can change the day's balance, so a new count may be recorded. There is no automatic bank reconciliation, shift-based till allocation or partial-refund workflow.

## Site and staff controls

Managers can create sites; edit name/address/area/description, capacity, blocked spaces, open/closed admission status and optional latitude/longitude; and create versioned tariffs. Existing charges retain their tariff/amount. A site cannot reduce usable capacity below current visits plus holds. Coordinates must be supplied as a valid pair; none are invented for the synthetic seed sites.

Managers can create attendants, assign one site, disable/re-enable access and resolve issues with notes. Changes to an attendant invalidate existing sign-in sessions. Manager accounts cannot be edited through this screen. Individual production identity, password recovery and broader organization-level permissions are not implemented.

## Data preservation

The operations module adds tables rather than rebuilding old data: ops_sites, vehicles, cash_payments, reservations, visits, ops_requests, staff_access and cash_closes. There are no deletion controls for financial history. The local database and credentials stay ignored by Git. Legacy screens remain reachable with `?legacy=1` for regression comparisons; the default staff screens are now the operations workspace.
