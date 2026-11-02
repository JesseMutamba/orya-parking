# Feature evidence sheet

The product descriptions below are supplied by the user-provided handoff, not independently observed in competitor accounts. No REA runtime or competitor checkout was executed. The specification was sufficient to implement the selected workflow.

| Feature | Source supplied in handoff | What is documented in the brief | Inference / unknowns | Original behavior and test |
|---|---|---|---|---|
| Zone payment | https://parkmobile.io/parking/zone-parking | Zone, plate, duration and payment flow | Actual backend design unknown; no approved CG rate | Synthetic CG-01, server quote, review and demo payment; API quote/version tests and driver browser flow |
| QR entry | https://spothero.com/sell-parking/scan2pay | On-site checkout without an installed app | CG signage, network access and authority unknown | Local QR plus manual zone code; QR renders in reviewed driver screenshots; physical phone scan untested |
| Digital pass | https://digitalsupport.parkwhiz.com/support/solutions/articles/60001131935-scan-to-pay-stp- | Pass and extension flow | Extension policies not approved | Random private pass token; cross-context retrieval and driver-enumeration tests; extensions deferred |
| Attendant lookup | https://play.google.com/store/apps/details?id=com.parkwhiz.attendantApp | Plate/pass lookup and staff operations | No private app/backend inspected | Authenticated, zone-scoped search and assisted registration; role/zone and browser tests |
| Operator register | https://operator-help.spothero.com/en/articles/9319808-control-panel-overview | Overview and operating records | CG management roles unknown | Stored-record metrics, filtered register and CSV; reconciliation tests |
| Accounting separation | https://operator-help.spothero.com/en/articles/9346467-review-active-and-upcoming-reservations | Reservation records are not a substitute for payment reconciliation in handoff synthesis | Settlement format/provider unknown | Separate attempt/event/receipt records; unmatched settlement label; daily-close and duplicate-event tests |
| Rules and prices | https://parkmobile.io/parking-providers/solutions/dashboard | Operator rules and pricing information | Local tariff/validity approvals outstanding | Versioned sample tariff and immutable quotes; preservation and stale-edit tests |

REA is optional research tooling only. The build does not use or redistribute competitor code, branding assets or private API implementations. The handoff's source descriptions are research context, not proof of production behavior or CG approval.
