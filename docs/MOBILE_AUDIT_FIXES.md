# PASS mobile audit fixes A02–A06 — 30 October 2026

This source update aligns native forms and permissions with the reviewed Laravel API. It does not change server authorization or automatically approve documents on the phone.

- Vehicles: capture both OR and CR, read and compare their fields, confirm uncertain values, retain rejected submissions for correction, and resubmit to the existing vehicle. A separate vehicle photo is optional. Laravel performs the final document checks. Collect an assigned RFID sticker before using it for entry.
- Visitors: capture the actual driver's details, license and visible-plate photographs, and passenger count. Existing visitor records can be reused. Staff can file and inspect requests. An administrator must load both images and explicitly confirm the review before approval. Gate staff still verify the actual arriving driver and vehicle.
- Roles: native menus recognize the backend's administrator and security roles, including legacy parking_admin. Emergency release is available to vehicle owners and authorized staff. Administrator gate mutations remain restricted by Laravel. Retired manual campus-vehicle approval buttons are removed.
- Networking: timeouts include the complete response body; malformed successful responses are errors. A timed-out write is uncertain: refresh the relevant list before submitting it again. Private image downloads and image decoding have finite deadlines.
- Sessions: saved tokens survive transient outages, with Retry before protected content is shown. An explicitly invalid/revoked session is cleared. A late old request cannot replace a newer session or display another account's license.

## Local checks

Run in PASS-FE-NATIVE after installing the updater:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\jest\bin\jest.js --runInBand
node .\node_modules\expo\bin\cli start --lan --clear
```

Keep Laravel running at the API URL already configured for the mobile app. The updater preserves environment files and dependencies. It does not run migrations, reset data, change hardware configuration, commit, or push.

## Verification boundary

Automated native component, request-lifecycle, multipart and session tests are included. The actual Expo multipart encoder was exercised against an isolated Laravel/MariaDB instance using synthetic accounts and images. Blank OR/CR fixture photos were rejected by the document checks; visitor evidence upload and administrator review were tested separately. An Android JavaScript export is a bundle check, not an APK, physical-device test, issuer authenticity check or guarantee of OCR accuracy on a real document.

The remaining whole-system audit findings still apply: shared-network registration limits, website type checking, dependency advisories, incomplete mobile inventory/record-history parity, and deployment/load verification. This update alone does not make PASS ready to launch.
