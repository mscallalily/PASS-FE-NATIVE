# PASS Mobile web-update adaptation

This package is based on the uploaded `PASS-Mobile-Source.zip` and adapts the relevant user-facing changes described in the uploaded PASS web UI update notes.

## Included
- Added a native Expo `VehicleScreen` reachable from Profile.
- Added `My Vehicles` and `RFID Requests` tabs.
- Removed the profile's misleading sample RFID-card shortcut.
- Added clear messaging that vehicle approval and RFID assignment are separate processes.
- Kept the new screen honest about the current API gap: it does not invent vehicle records or claim to submit a real request.
- Preserved existing `AccessRecordsScreen` and its navigation.

## Not implemented as a live backend feature
The uploaded Laravel `routes/api.php` does not expose the vehicle authorization/RFID request endpoints needed for mobile to read registered vehicles or submit/review RFID requests. Therefore, this package does not pretend those operations are database-backed. To make them live, we must add and authorize API endpoints in the actual working Laravel backend and then connect the screen to them.

## Apply
Copy the files from this package over the same relative paths in your existing `C:\Users\Salen\projectsystem\PASS\frontend` folder. Keep a backup first. Then run:
```powershell
npx tsc --noEmit
```
If TypeScript passes, start Expo as usual with `npx expo start --clear`.
