# ATLAS CAD — Self-update (GitHub Releases)

## How it works

```
git push main ─► (manual) bump version + git tag vX.Y.Z ─► GitHub Actions
  → npm ci && npm test && npm run build
  → npx cap sync android
  → gradlew assembleDebug
  → publish app-debug.apk as a Release asset

App (ATLAS CAD → Update → Check):
  GET https://api.github.com/repos/tahershawki1/atlas-cad-mobile/releases/latest
  → compare semver with APP_VERSION (src/platform/version.ts)
  → UpdatePlugin.download(url, fileName) streams to files/updates + progress events
  → FileProvider URI → ACTION_VIEW → Android system installer (user confirms)
```

Web/PWA: `dist/sw.js` is cache-first; every build ships a new `sw.js` (new hash)
that precaches the new files and `skipWaiting`s. `version.json` (emitted at build)
carries the build number and is never cached.

## Release steps (from this phone or desktop)

1. Edit `atlas-mobile/src/platform/version.ts` → `APP_VERSION`.
2. Edit `atlas-mobile/package.json` → `version` (same number).
3. Commit, then tag:
   ```bash
   git add -A
   git commit -m "Release v1.1.0"
   git tag v1.1.0
   git push origin main v1.1.0
   ```
4. Actions run `android-release.yml` → Release `v1.1.0` with `app-debug.apk`.
5. Open the app → **Update → Check for updates → Download & install**.

Manual alternative (no tag): Actions → *Android APK (release)* → Run workflow
(artifact only), or build locally and upload `app-debug.apk` to a Release by hand.

## Permissions & limits (Android)

- The app declares `REQUEST_INSTALL_PACKAGES`. On Android 8+, the user must also
  allow “Install unknown apps” for the granting app (Files / browser / ATLAS)
  once — the app cannot request it silently.
- The installer always shows the system confirmation. Silent install needs
  device-owner (MDM) privileges and is out of scope.
- Downloads go to `files/updates/` and are shared via FileProvider
  (`${applicationId}.fileprovider`). Old APKs can be deleted from Settings →
  Apps → ATLAS CAD → Storage.

## Versioning

- `src/platform/version.ts` is the in-app current version.
- Release tag must be `vX.Y.Z` (e.g. `v1.1.0`). The update check compares
  `X.Y.Z` numerically (`compareSemver` in `src/platform/updater.ts`).
- iOS: TestFlight / App Store (manual IPA) — no in-app channel in this build.

## CAD-only scope note

This working copy (`atlas-mobile/`) is CAD-only: FTTH, field survey/notes/media,
maintenance/faults, QR/BOQ reports and their Dexie tables were removed
(DB v2 drops `ftthObjects`, `cables`, `cores`, `splitters`, `splices`, `photos`,
`notes`, `surveys`, `surveyItems`, `faults`, `maintenance`, `detectRules`).
`original/FiberLens/` is the immutable upstream archive and is never modified.
Camera/mic permissions were dropped from `AndroidManifest.xml` (field media removed).
