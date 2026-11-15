# Mobile administrator workspaces — audit A10

The Manage workspace now includes **RFID Inventory** and **Records & History**
for System Administrator and Parking Administrator accounts. Security, Parking
Staff, regular campus users and guests receive no new permissions. Laravel
continues to authorize every request and private historical document.

## RFID Inventory

- View sticker counts, current ownership, waiting vehicles and assignment history.
- Enter the UID of a real sticker, review it, and confirm registration as manual
  entry. Alternatively, use a compatible connected external reader that types a
  complete 24-character EPC followed by Enter. This does not add UHF/NFC reading
  capabilities to a phone or connect it automatically to the gate PC's USB device.
- Confirm physical hand-over, or mark a sticker lost/damaged with an explicit
  option to request a replacement. No action opens a barrier or bypasses gate rules.
- After the A11 update, the server returns one bounded page of stickers and
  waiting vehicles. Assignment history loads on request through its own paged
  endpoint. Search runs across the authorized dataset, rather than the current
  page only. See the backend's `docs/LIST_SCALABILITY_A11.md` for measured limits.

Updated web and native issue/retire requests carry `expected_assignment_id`.
The backend checks it against the current assignment inside the transaction
before writing. A changed assignment produces HTTP 409 and requires a refresh
and a new confirmation. Older direct API clients without that optional field
remain compatible; the stale-confirmation guard applies when the field is sent.

## Records & History

- Browse/search active and archived account or vehicle records using the existing
  server pagination. Archive/restore requires a reason and a confirmation.
- The backend retains identifiers, documents and history, blocks self-archiving
  and removal of the last administrator, and requires an inside vehicle to exit
  first. Restoring a record does not restore revoked access credentials. Vehicle
  restoration requires a fresh automatic OR/CR check.
- Browse saved changes with record, operation, date and text filters. Business
  activity is the default; initial snapshots and system activity can be included.
- Compare previous and updated fields, including an optional view of unchanged
  values. Secret fields and storage paths are omitted from the presentation.
  Clock times use Philippine Time; calendar dates remain calendar dates.
- Retained JPG/PNG documents use the existing authenticated, memory-only preview.
  **Historical PDF inspection/download remains on the authorized website.**
  This update does not establish complete web/mobile document-viewing parity.

Reads cancel when filters, modules or accounts change. Late results from an old
account are ignored. Drafts/dialogs are reset when authority changes. Mutations
have an immediate submission lock, preserve failed form inputs and never retry
automatically. Refresh the current record after a conflict or uncertain network
result before trying an action again.

## Validation and deployment

The work was checked with native TypeScript/Jest, web TypeScript/Node tests/build,
backend RFID/retention/authorization tests, and actual HTTP probes against private
synthetic users/files. The HTTP responses were also checked with the actual
native response parsers. No user's database, actual mail service, signing key,
RFID reader or physical barrier was contacted.

After installing the source updater:

```powershell
# PASS-FE-NATIVE
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\jest\bin\jest.js --runInBand

# PASS-FE-REACT
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vite\bin\vite.js build
```

Restart Laravel and Expo, then test on a real device with authorized test data.
Open Manage → RFID Inventory and Manage → Records & History. Confirm that other
roles lack those menu entries. Review a sticker before registering it; confirm
hand-over only after the correct owner actually receives it. Archive a disposable
test record with a reason, find it in Archived, and restore it for a fresh review.
Do not use a real production record merely as a smoke test.

Feature tests require the existing separate seeded `*_testing` database. Do not
run them against the development/production database. The updater does not run
database commands or feature tests and does not run migrations.

No dependency installation, environment edit, hardware change, Git commit or
push is required by this update. A09's remaining dependency findings and physical-device acceptance
remain separate outstanding work. A12's web layout changes are documented in
the website's `docs/HARDWARE_LAYOUT_A12.md`. Successful automated checks are not a launch
readiness declaration.
