# Digital and subscription entry

The local demo assigns each pass a permanent reference and associates account-owned passes with the driver, plate and permitted site. Subscription holders use the same pass reference on subsequent visits. Physical entry still requires attendant approval.

## Live QR

On a valid, confirmed digital pass, choose **Show entry QR**. The server issues a random, opaque credential valid for up to 60 seconds. The screen automatically refreshes it; refreshing invalidates the previous credential. Account-owned passes require the matching driver sign-in as well as the private pass link. Guest passes retain private-link access. Do not share guest links: possession of a guest link is access, not proof of identity.

The displayed QR contains neither the private pass URL nor driver contact/payment details. The database retains a SHA-256 digest rather than the raw credential. The staff scanner can use a camera, a hardware scanner or pasted QR contents. Camera decoding happens in the browser; frames are not uploaded. It requires HTTPS or localhost, with an explicit camera action and permission. Scanning stops after a successful decode, after 60 seconds, on navigation, or when the document is hidden.

Verification checks authenticated staff, assigned/selected site, current pass validity, ownership binding, unused credential, expiry and occupancy. The attendant reads and enters the actual arriving plate. Admission rechecks the credential and capacity and consumes it atomically with creation of the visit. An idempotent retry returns the existing visit. A single-visit pass cannot be admitted again after departure; an active subscription can issue a fresh QR for a later visit. Payment is not charged again for each subscription visit.

A QR **image can be copied**. The implementation blocks stale, replaced and already-used credentials; it does not prevent a copied current QR being presented first during its short validity window. The plate check remains essential. There is no device attestation, identity guarantee or offline admission. A compromised driver account or guest private link remains an access risk.

Walk-in paper tickets retain their existing static lookup QR and pay-on-exit workflow. They are not digital admission credentials.

## Demo payment preference

Desktop and mobile sign-up require a choice of mobile money or bank card. Existing accounts can set or change this in their wallet/account. The chosen method is copied into a payment-attempt record when payment starts, so changing a preference does not rewrite payment history. Older attempts without recorded method remain unspecified.

These are **demo preferences**, not connected funding sources. No card numbers, CVVs, wallet credentials, PINs or OTPs are collected. A real instrument setup and real payment confirmation still require a selected payment provider and its secure integration. No real billing or automatic subscription renewal is enabled.

## Verification boundaries

The security suite checks ownership, wrong-site access, token rotation/expiry, forged credentials, exact plate matching, simultaneous admission, retry safety, capacity failures, refunds/cancellation, repeated subscription visits, persistence and payment preference history. Browser tests decode the real PNG, exercise renewal and gate approval, and start/stop a synthetic Chromium camera stream. Physical cameras and an installed iOS build have not been tested.

The design follows server-side, per-operation, time-limited authorization principles in the [OWASP transaction authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html). The Operations iOS target includes a camera usage description and retains the WebKit permission prompt.
