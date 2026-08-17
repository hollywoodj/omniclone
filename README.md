# OmniClone

OmniClone is a local-first task management application modeled after the OmniFocus 4 interaction system. It is built with Expo and React Native so the same product code runs on iOS, Android, and the desktop development preview.

## Run the app

```bash
npm install
npm start
```

From the Expo terminal, press `i` on macOS to open the iOS Simulator, scan the QR code with Expo Go on a compatible device, or press `w` for the development preview.

Useful direct commands:

```bash
npm run ios
npm run android
npm run web
npm run typecheck
npm test
```

## Desktop releases

Every push to `main` automatically creates the next patch release and publishes
Windows (`.exe`) and macOS (`.dmg`) installers on GitHub Releases. Include
`[skip release]` in a commit message to suppress a release. A specific version
can also be published from **Actions → Release → Run workflow**.

Build installers locally on their target operating systems:

```bash
npm run electron:build:win
npm run electron:build:mac
```

Installers are written to `release/`.

## Product architecture

- `App.tsx` contains the adaptive desktop, tablet, and phone experience.
- `src/model.ts` defines the task/project domain. New databases start empty.
- `src/storage.ts` persists the database locally with AsyncStorage on every supported platform.
- `src/importOmniFocus.ts` parses OmniFocus CSV and TaskPaper exports, including UTF-8 and UTF-16 files, folder-prefixed projects, inbox items, and duplicate-safe merges.
- `app.json` contains the iOS and Android identifiers and Expo native configuration.

Custom Perspectives are stored with the database. Each can define OmniFocus-style Contents rules (All/Any/None of the following), Flexible or Organized structure, icon, and color. Manage favorites and keyboard shortcuts in **Perspectives → Show Perspectives List** (`⌃⌘P`). Add a perspective from that list or **Perspectives → Add Perspective…**, then edit it live in **View Options** (`⇧⌘V`).

Use **File → Import from OmniFocus…** on desktop, **Import** in the phone navigation bar, or the empty-database prompt to migrate an existing OmniFocus library. CSV is the recommended format: it is the official portable export on iPhone, iPad, and Mac, and it preserves projects, inbox items, dates, flags, tags, notes, and completion state. TaskPaper and plain-text TaskPaper exports are also supported. Native `.ofocus` backups cannot be imported.

The importer shows a preview before offering a duplicate-safe merge or a confirmed replacement. Folder names are folded into project titles (`Work : Website`), OmniFocus timestamps are converted to the same due-date labels used in Forecast, and dropped items are kept as completed.

The current app is fully offline-capable. A sync service can be added behind the storage boundary without rewriting the native interface.
