# OmniClone handoff

This file is the memory log for later sessions. OmniClone is an OmniFocus 4 clone. Exact visual and interaction match is the goal. Keep closing UI gaps in batches of about ten.

## This pass (ten gaps closed)

1. Window title — “Projects — OmniClone”, or the focused project/folder name.
2. Print / Export TaskPaper — File → Export as TaskPaper… downloads the library; File → Print… / ⌘P opens the print dialog.
3. Attachments as URL/file links — Inspector Files tab stores URL/path attachments (CSV still cannot import binaries).
4. URL handler — Opening `omniclone://task/…`, `omniclone://perspective/…`, or `#/task/…` selects the action or switches perspective. Electron registers the `omniclone` protocol.
5. Sidebar for Inbox/Flagged — Content sidebar stays hidden in Inbox, Flagged, and Completed (Forecast calendar is unchanged).
6. Project complete-when-completing-last-action — Project inspector toggle; completing the last remaining action marks the project Done and reopens it if work returns.
7. Duplicate Project — Sidebar/outline context menu, Organize menu, and ⌘D when a project is selected (no actions).
8. Archive / dropped folder — Dropped and Done projects sit under DROPPED / COMPLETED in the Projects sidebar instead of Remaining.
9. Perspective rules — Contents rules for duration, unflagged, project type, stalled, on hold, and dropped.
10. Outline notes glyph — Hidden-notes rows use a compact `note-text-outline` glyph. Forecast flagged-without-date rows get a light flagged tint.

## Already done in earlier passes

Folders, blocked sequential rings, First Available, action status, Completed perspective, Forecast flagged-today, outline notes, inspector tag chips, stalled/skip review, convert to project, nested actions, sequential/parallel/single-action projects, estimates, simple and richer repeats, TaskPaper copy/paste, move up/down, resizable panes, undo/redo, Forecast week, Available vs Remaining, Focus, custom perspectives, multi-select, CSV import, context menus, hotkeys, notifications inspector, due times, calendar date picker, inline date editing, sidebar drop, nested tags, tag status/color, Reveal, outline columns, project column, multi-item Focus, next-review date, Await Reply, Dropped grouping in Completed, type-to-select, Inbox/Flagged empty states, toolbar customization, dark mode.

## Next UI gaps to close (priority order)

Work through these next. Prefer visible OmniFocus 4 mismatches over backend work.

1. **Keyboard: ⌘↩ new action, Escape cancel edit** — Return edits; some OF setups use ⌘Return to create. Confirm against current Mac OF 4 defaults.
2. **Forecast flagged row styling** — Flagged-without-date items on Today should read as flagged, not as due. Row tint exists; due-column/flag treatment may still drift.
3. **Import folders as first-class empty folders** — CSV Folder rows currently only count toward a warning; empty OmniFocus folders never appear until a project lives in them.
4. **Electron menu checkmarks** — Show Sidebar / Inspector / Perspectives Bar should be stateful check items.
5. **Accessibility** — VoiceOver labels on status rings (Available, Blocked, On Hold, Dropped, Completed).
6. **System notification delivery** — Inspector reminder list exists; fire local banners at due/defer.
7. **Drag onto nested tags to reparent tags** — Drop currently assigns the tag to actions, not tag hierarchy.
8. **Locations on tags** — Nearby/geofence is iOS-specific; skip unless doing a mobile clone pass.

## Implementation notes

- Domain types live in `src/model.ts`. Outline behavior is in `src/outline.ts`. Dates/Forecast/Review helpers are in `src/dates.ts`. Tag tree/status is `src/tags.ts`. Appearance tokens are `src/theme.ts`. Type-to-select is `src/typeSelect.ts`. OmniClone URLs and window titles are `src/links.ts`.
- Visible-task queries, titles, and sidebar perspective choice live in `src/perspectives/query.ts`. Badge/forecast counts are in `src/perspectives/counts.ts`.
- Library mutations (complete, await reply, duplicate action/project, last-action project completion, delete project, lingering cleanup, sidebar drop) live in `src/library/mutations.ts`.
- Navigation history is `src/navigation/history.ts` + `src/hooks/useLocationHistory.ts`. Persistence is `src/hooks/usePersistedLibrary.ts`.
- Menu/hotkey commands dispatch through `src/commands/dispatch.ts`.
- SQLite schema + migrations are in `src/db/client.ts`; persist in `src/storage.ts`. Repeat rules, notifications, and attachments are JSON columns on tasks; `complete_with_last_action` lives on projects; tag parent/color/status live on the tags table.
- Desktop UI chrome is in `src/components/` (outline, inspector, sidebar, modals). `App.tsx` wires state to those modules.
- Tests: `npm test` (import, outline, dates, selection, perspectives, library, navigation, commands, tags, type-select, links, rules) and `npm run typecheck`.
- Default perspective bar now includes Completed (`⌘6`) before Review (`⌘7`). Saved bars that still match the old default are migrated in `src/settings.ts`.
- Focus is a set: `focusedProjectIds` + `focusedFolderPaths` on `LocationState`. Folder matching uses OmniFocus-style `Parent : Child` paths.
- Outline columns and toolbar buttons persist on `AppSettings` (`outlineColumns`, `toolbarButtons`, `appearance`, `awaitReplyDays`).
- Project status includes `done` (complete with last action). Dropped/done projects are listed in sidebar archive sections, not Remaining.

## How to continue

Pick the next ten items from the list above. Keep the clone visually honest: if OmniFocus shows it in the outline, sidebar, or inspector, match that before adding new product ideas.
