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
```

## Product architecture

- `App.tsx` contains the adaptive desktop, tablet, and phone experience.
- `src/model.ts` defines the task/project domain and starter database.
- `src/storage.ts` persists the database locally with AsyncStorage on every supported platform.
- `src/importOmniFocus.ts` parses OmniFocus CSV and TaskPaper exports, including UTF-8 and UTF-16 files, and performs duplicate-safe merges.
- `app.json` contains the iOS and Android identifiers and Expo native configuration.

Custom Perspectives are stored with the database. Each can define status, flag, due-date, project, tag, and text rules, plus project/tag grouping, sorting, icon, and color.

Use **View → Import from OmniFocus…** on desktop, or **Import** in the phone navigation bar, to migrate an old database. CSV is recommended and can be exported from OmniFocus Database Settings on iPhone or iPad. TaskPaper and plain-text TaskPaper exports are also supported. The preview shows record counts before offering a duplicate-safe merge or a confirmed replacement.

The current app is fully offline-capable. A sync service can be added behind the storage boundary without rewriting the native interface.
