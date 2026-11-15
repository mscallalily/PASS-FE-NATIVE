# SDK 58 package alignment — A09 follow-up

The Expo startup notice reported Expo 58.0.17 while recommending 58.0.22 and seven other packages. This source update aligns the same SDK 58 release, including React Native 0.88.1 and its Jest preset. It does not change the SDK major version.

## Reviewed direct dependency changes

| Package | Previous installed version | Reviewed installed version |
| --- | --- | --- |
| expo | 58.0.17 | 58.0.22 |
| expo-asset | 58.0.18 | 58.0.19 |
| expo-camera | 58.0.12 | 58.0.14 |
| expo-file-system | 58.0.10 | 58.0.13 |
| expo-gl | 58.0.3 | 58.0.4 |
| expo-splash-screen | 58.0.11 | 58.0.12 |
| react-native | 0.88.0 | 0.88.1 |
| jest-expo | 58.0.12 | 58.0.13 |
| @react-native/jest-preset | 0.88.0 | 0.88.1 |

The manifest also raises the lower patch bounds of expo-constants and expo-font to their already installed 58.0.14 and 58.0.11 versions. React and react-test-renderer remain matched at 19.3.0. The lock retains CLI 58.1.18, config 58.0.10 and node-forge 1.4.2, with no Zod entries and all 58 platform-specific optional package entries preserved. Associated Expo and React Native tooling updates follow their published dependency requirements. No forced major overrides are used.

## Installation and checks

Stop Metro before replacing installed packages. Run the source updater from PASS-STAGING; it checks the reviewed file versions and creates an exact source backup. Run `npm ci --ignore-scripts --no-audit --no-fund --bin-links=true` in PASS-FE-NATIVE, followed by:

```
node tools/security/Check-PassSdk58.cjs
node tools/security/Check-PassExpoTools.cjs
node tools/security/Check-PassForge.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand
```

Restart Expo with `node node_modules/expo/bin/cli start --lan --clear` after those checks pass. Use the QR from that running window. Dependency recommendation data can change after this review; an online `expo install --check` is read-only and may report newer patches. Keep this reviewed lock until another update is tested.

## Evidence and limits

Compatibility targets were read from the npm-published Expo 58.0.22 `bundledNativeModules.json` and package metadata on 2026-11-01; the downloaded package was checked against its published SHA-512 integrity. Expo's official upgrade guide calls for dependencies to match the selected SDK: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/.

Review verification: clean dependency installation, 42 installed SDK/lock checks, the existing 40 Expo tooling checks, the Forge regression check, TypeScript, all 133 native tests in 20 suites, and Android JavaScript export passed. All 24 source updater checks passed, including Windows BOM/CRLF, exact backups, rollback, concurrent-edit preservation and refusing unreviewed source changes. A synthetic stale installation was correctly rejected even when its package lock had been updated.

The review environment could not finish Expo's online recommendation query because its HTTP proxy timed out; direct requests to the Expo API were also denied. The published Expo 58.0.22 package's bundled compatibility manifest was verified locally instead. No claim is made that the remote recommendation service returned a clean result.

Installed metadata checks and JavaScript bundling do not replace running the application on the physical phone, checking the Expo Go runtime, or building a release binary. Camera, document picker, OCR, real email delivery, backend connectivity, and hardware require their separate acceptance tests.

A09 remains open for the outstanding deepmerge (Jest), glob and minimatch findings described in the backend `docs/DEPENDENCY_SECURITY_A09.md`. A deprecation warning or successful build alone does not settle a security advisory. This compatibility update is not launch clearance.

Only native package.json, package-lock.json, this guide, and Check-PassSdk58.cjs are updated. The source updater performs no package installation, database operations, environment edits, hardware changes, Git commit or push.
