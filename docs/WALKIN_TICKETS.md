# Walk-in tickets and payment at exit

## At entry

The attendant opens directly on **Gate desk**. Enter the plate and select **Issue & print ticket** (or press Enter). Make/model are optional under Vehicle details. No driver account, contact, duration or upfront payment is required.

The server records the arrival time, checks site capacity, consumes a matching arrival hold, and creates one open visit with a unique `WT-…` ticket. Capacity decreases immediately. The ticket retains the tariff version and rate in effect at entry. Duplicate normalized plates already inside are rejected. Repeating a submitted request returns the same ticket rather than creating another visit.

The print window contains the site, plate, ticket number, entry timestamp, rate and a QR code containing only the ticket number. It does not contain an account password, payment token or a public lookup URL. Reprinting does not create a visit or reset its clock. If printing fails or the dialog is cancelled, the recorded visit remains: use Reprint ticket or find it in Walk-ins / exit.

## At exit

1. Open **Walk-ins / exit** in the attendant or management workspace.
2. Enter the ticket number or plate, or use a keyboard-input scanner to enter the QR's ticket number. There is no camera-scanning implementation.
3. Select **Review exit**. The server supplies entry time, actual elapsed duration, billed duration, rate and amount due. Verify the vehicle matches the plate.
4. For cash, collect the displayed amount and choose **Cash received & vehicle exited** when the vehicle departs. One transaction records cash confirmation, receipt, departure and released capacity, with the staff actor and time.
5. For digital payment, choose **Start demo digital payment**. Only the server-side demo provider can confirm it. Refresh status, then choose **Record vehicle exit** when confirmation is visible and the vehicle leaves.
6. Print the paid receipt if needed. Completed tickets remain available under **All tickets**, with the original entry and departure times.

The default list includes all walk-ins still inside: unpaid, digital payment pending, and paid awaiting departure. Search ignores spaces/hyphens in plates. Read-only views and printable tickets require an authenticated staff member with access to that site. Managers can operate all sites.

## Demo charging rule

Use the site's rate for **each started 30-minute block**, with a minimum of one block. The rate is fixed at entry. For a rate of 1,000 CDF: a stay up to and including 30 minutes costs 1,000 CDF; 30 minutes and one second costs 2,000 CDF. There is no 8-hour cap on a walk-in stay and no automatic free period or daily cap. Amounts and timestamps are calculated on the server.

Reviewing exit creates a quote valid for two minutes. An expired quote cannot be collected; refresh it. Starting digital checkout or confirming cash fixes the exit charge through the displayed cutoff time. Payment processing time after that cutoff does not add another block. Physical occupancy remains until departure is explicitly recorded. A payment confirmed later never changes the original entry time or restarts parking.

Pending digital payments block cash collection and departure to prevent double collection. A failed/refunded digital attempt may be settled in cash; late provider events cannot revive a terminal attempt. Receipts and historical events remain auditable. Extended delays after starting checkout, lost-ticket fees, grace periods, caps and manual charge overrides have no separate policy in this demo.

## Printing and verification boundary

The print styles target 80 mm paper, with separate single-page entry-ticket and receipt layouts. Use the browser print dialog to select a configured printer or save a PDF. The application opens the print dialog; it does not silently send ESC/POS commands, confirm successful paper output or open a cash drawer. Actual printer drivers, paper width/margins, QR hardware and gate devices still need device testing.

All cash and digital amounts remain demonstration records. No real payment provider is connected. New tables are additive (`walkin_tickets`, `walkin_exit_quotes`); existing prepaid visits and subscriptions keep their original flow. Existing local accounts, sessions and credentials are preserved.
