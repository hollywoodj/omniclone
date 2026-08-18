# OmniClone handoff

This file is the memory log for later sessions. OmniClone is an OmniFocus 4 clone. Exact visual and interaction match is the goal. Keep closing UI gaps in batches of about ten.

## This pass (ten gaps closed)

1. Column layout — Optional outline columns (Project, Tags, Duration, Defer, Due) with headers. Toggle in View Options and Settings → Appearance.
2. Project as a right-hand column — Hidden when grouped by project/Review; shown in Flagged, Forecast, and other ungrouped views when the Project column is on.
3. Focus on multiple projects/folders — ⌘-click sidebar items, then Focus (⇧⌘F). Focus bar names the set.
4. Review next-review date — Editable Next Review field in the project inspector (backs out last reviewed from the interval).
5. Complete and Await Reply — Completes the action and inserts a deferred follow-up using the last defer→due gap, or the settings interval.
6. Dropped vs completed — Completed perspective groups dropped actions under Dropped instead of mixing them into date buckets.
7. Type-to-select / find next — Typing in the outline jumps to matching titles; ⌘G / ⇧⌘G find next/previous.
8. Empty Inbox / Flagged illustrations — Inbox Zero and Nothing flagged copy instead of a generic All clear.
9. Toolbar customization — Show/hide toolbar buttons from Settings → Appearance or View → Customize Toolbar.
10. Dark mode — System / Light / Dark appearance; CSS variables on web/Electron.

## Already done in earlier passes

Folders, blocked sequential rings, First Available, action status, Completed perspective, Forecast flagged-today, outline notes, inspector tag chips, stalled/skip review, convert to project, nested actions, sequential/parallel/single-action projects, estimates, simple and richer repeats, TaskPaper copy/paste, move up/down, resizable panes, undo/redo, Forecast week, Available vs Remaining, Focus, custom perspectives, multi-select, CSV import, context menus, hotkeys, notifications inspector, due times, calendar date picker, inline date editing, sidebar drop, nested tags, tag status/color, Reveal.

## Next UI gaps to close (priority order)

Work through these next. Prefer visible OmniFocus 4 mismatches over backend work.

1. **Window title** — “Projects — OmniClone” (or focused project name).
2. **Print / Export TaskPaper file** — File menu beyond clipboard copy.
3. **Attachments as URL/file links** — Notes-adjacent attachments, even if CSV cannot import binaries.
4. **Locations on tags** — Nearby/geofence is iOS-specific; skip unless doing a mobile clone pass.
5. **AppleScript / URL handler completeness** — `omniclone://task/…` copy exists; opening those links should select the action.
6. **Sidebar for Inbox/Flagged** — OF often hides the content sidebar there; Forecast calendar is done.
7. **Project complete-when-completing-last-action** — Optional project auto-complete.
8. **Duplicate Project** — Deep-copy project + actions.
9. **Archive / dropped folder** — A place for dropped projects instead of mixing them in Remaining.
10. **Perspectives: duration and flagged rules** — More Contents rules (duration, project type, stalled, on hold).
11. **Outline notes indicator vs shown notes** — When notes are hidden, OF uses a small note glyph; present, but spacing/alignment still drifts.
12. **Keyboard: ⌘↩ new action, Escape cancel edit** — Return edits; some OF setups use ⌘Return to create. Confirm against current Mac OF 4 defaults.
13. **Forecast flagged row styling** — Flagged-without-date items on Today should read as flagged, not as due.
14. **Import folders as first-class empty folders** — CSV Folder rows currently only count toward a warning; empty OmniFocus folders never appear until a project lives in them.
15. **Electron menu checkmarks** — Show Sidebar / Inspector / Perspectives Bar should be stateful check items.
16. **Accessibility** — VoiceOver labels on status rings (Available, Blocked, On Hold, Dropped, Completed).
17. **System notification delivery** — Inspector reminder list exists; fire local banners at due/defer.
18. **Drag onto nested tags to reparent tags** — Drop currently assigns the tag to actions, not tag hierarchy.

## Implementation notes

- Domain types live in `src/model.ts`. Outline behavior is in `src/outline.ts`. Dates/Forecast/Review helpers are in `src/dates.ts`. Tag tree/status is `src/tags.ts`. Appearance tokens are `src/theme.ts`. Type-to-select is `src/typeSelect.ts`.
- Visible-task queries, titles, and sidebar perspective choice live in `src/perspectives/query.ts`. Badge/forecast counts are in `src/perspectives/counts.ts`.
- Library mutations (complete, await reply, duplicate, delete project, lingering cleanup, sidebar drop) live in `src/library/mutations.ts`.
- Navigation history is `src/navigation/history.ts` + `src/hooks/useLocationHistory.ts`. Persistence is `src/hooks/usePersistedLibrary.ts`.
- Menu/hotkey commands dispatch through `src/commands/dispatch.ts`.
- SQLite schema + migrations are in `src/db/client.ts`; persist in `src/storage.ts`. Repeat rules and notifications are JSON columns on tasks; tag parent/color/status live on the tags table.
- Desktop UI chrome is in `src/components/` (outline, inspector, sidebar, modals). `App.tsx` wires state to those modules.
- Tests: `npm test` (import, outline, dates, selection, perspectives, library, navigation, commands, tags, type-select) and `npm run typecheck`.
- Default perspective bar now includes Completed (`⌘6`) before Review (`⌘7`). Saved bars that still match the old default are migrated in `src/settings.ts`.
- Focus is a set: `focusedProjectIds` + `focusedFolderPaths` on `LocationState`. Folder matching uses OmniFocus-style `Parent : Child` paths.
- Outline columns and toolbar buttons persist on `AppSettings` (`outlineColumns`, `toolbarButtons`, `appearance`, `awaitReplyDays`).

## How to continue

Pick the next ten items from the list above. Keep the clone visually honest: if OmniFocus shows it in the outline, sidebar, or inspector, match that before adding new product ideas.
