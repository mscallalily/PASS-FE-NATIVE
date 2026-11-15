# PASS mobile hardware integration — 9 November 2026

The Expo app now consumes the same sensor-aware parking data as PASS Web. Source configuration, app identifiers, native permissions, dependency versions and the user's API origin remain unchanged.

## Apply and start

Use the clean `PASS-FE-NATIVE` Git checkout whose source was supplied in the ZIP. The package updater accepts a Native-only path or all three project paths. Start with a read-only plan; see the main README.

From the updated Native project:

```powershell
npm ci --ignore-scripts
npx tsc --noEmit
npm test -- --runInBand
npx expo start
```

Use the project's existing compatible Expo Go/development client and LAN/API configuration. On a physical phone, the backend address must be reachable from that phone; keep your existing private environment files local. This patch does not select a new server, change keys or point the app to this execution environment.

The backend/web part of this package and the integrated-hardware migration must be installed to expose the new sensor-aware contract. Existing database data and runtime preparation are retained. Configuration of the four sensors and enabling the miniature servo are performed by Parking Staff in PASS Web's **Hardware & Station**, using the gate PC controller.

## What changed

- Public Home/parking summaries use the identity-redacted `/api/parking/availability-map` snapshot, including per-slot timestamps. Staff/admin maps retain the existing role-authorized `/api/parking/map` route, with the existing 403 fallback.
- Each response retains its own monotonic request-start time. HTTP delay counts toward the 12-second sensor freshness window. The app polls every five seconds while active and ages sensor readings every second.
- Backgrounding, logout, account changes and unmount cancel obsolete reads. Resume requires revalidation. Failed/stale loads do not display cached availability as a fresh green success.
- Available, occupied, maintenance and sensor-unavailable counts reconcile to configured capacity. `occupied` includes active recorded holds plus unverified sensor occupancy; it is not a count of identified vehicles inside.
- An unknown/offline unheld sensor slot is amber and unavailable for allocation. Sensor loss does not remove an active parking hold or record an exit. A detected object without a recorded hold does not produce a vehicle symbol or an identified plate.
- Public parsing/rendering strips private occupant/incident details. Operational permissions remain enforced by Laravel; admin slot controls remain read-only.
- Authorized mobile gate entry/exit and emergency release actions observe the server's command result. Pending results prevent duplicate submissions. Missing/malformed metadata, ambiguous HTTP results and unconfirmed OPENs require an explicit access-record review. The review checkbox is tied to the current notice revision.
- Notices survive navigation for the same account; an old account's reply cannot populate the next account. A serial ACK means the gate PC acknowledged a command, not that arm position or safe passage has been measured.

The phone never reads the USB serial port, uses reader/device keys, calls `/api/devices/*`, or sends local OPEN/CLOSE commands. Physical supervised CLOSE and controller REVIEW remain at the gate PC. The mobile access-record review does not clear the hardware controller's review flag.

## Acceptance checks on the user's device

1. Sign in as a regular user and compare the car/motorcycle counts with PASS Web. Verify that no other user's plate/owner/incident details appear.
2. Move an object at each mapped sensor in turn. Only that physical slot changes; channels 2–4 must work independently of channel 1.
3. Disconnect the controller or phone network. Uncertain/offline slots must become unavailable, while recorded vehicle holds remain. Background/resume must refresh before declaring the data current.
4. As authorized staff, record one approved entry. Check the same committed record and one queued/acknowledged gate command. Confirm the miniature gate physically with its operator.
5. Simulate an interrupted mobile reply or unconfirmed command. Check access records before another action; the app must not offer a blind retry. Switching accounts must clear the previous account's notice.
6. Record an authorized emergency exit only after the existing driver/license/owner checks. Its gate status uses the same shared notice and duplicate/review guard.

The Android JavaScript/assets export passed here. An APK/native device build, real phone rendering, LAN connectivity and physical hardware acceptance still need to be checked on the actual setup. The optional Expo-web export could not run because the supplied Native package does not include `react-native-web`; the separate React web project builds successfully. No new dependency was added just to enable that optional target.
