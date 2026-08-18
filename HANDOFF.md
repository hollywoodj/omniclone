# OmniClone handoff

This file is the memory log for later sessions. OmniClone is an OmniFocus 4 clone. Exact visual and interaction match is the goal. Keep closing UI gaps in batches of about ten.

## This pass (ten gaps closed)

1. Notifications inspector tab — Due and Defer reminder list (at event, before, start of day). Local list only.
2. Repeat from due vs completion, every-N days/weeks/months/years, and Defer Another.
3. Due times — Morning / Afternoon / Evening chips, plus times on Forecast rows.
4. Calendar date picker on Defer/Due in the inspector.
5. Inline date editing — click the outline due/defer column to edit in a calendar popover.
6. Drop on sidebar — drag actions onto Inbox (Perspectives bar), a project, a folder, or a tag.
7. Nested tags — parent/child tag tree in the Tags sidebar; parent selection includes descendants.
8. Tag status and color — Active / On Hold / Dropped tags with color in the Tag inspector. On Hold tags leave Available.
9. Show in Projects / Reveal — context menu, Organize menu, and jump to the enclosing project (or Inbox).
10. Paste TaskPaper — Edit → Paste (and outline ⌘V) parses TaskPaper outlines into nested actions.

## Already done in earlier passes

Folders, blocked sequential rings, First Available, action status, Completed perspective, Forecast flagged-today, outline notes, inspector tag chips, stalled/skip review, convert to project, nested actions, sequential/parallel/single-action projects, estimates, simple repeat, TaskPaper copy, move up/down, resizable panes, undo/redo, Forecast week, Available vs Remaining, Focus, custom perspectives, multi-select, CSV import, context menus, hotkeys.

## Next UI gaps to close (priority order)

Work through these next. Prefer visible OmniFocus 4 mismatches over backend work.

1. **Column layout** — Optional outline columns (Project, Tags, Duration, Defer, Due) with headers, not only a trailing due/flag cluster.
2. **Hide project names when grouped by project** is started; still show project as a true right-hand column in Flagged/Forecast/custom views.
3. **Focus on multiple projects/folders** — OmniFocus Focus can include several items, not only one project.
4. **Review next-review date** — Editable next review date in the project inspector, not only interval + last reviewed.
5. **Complete with last interval** — “Complete and await reply” style defer-again on complete.
6. **Dropped vs completed in Completed perspective** — Dropped items should be visually distinct (X ring already exists; grouping/filter still mixed).
7. **Type-to-select / find next** — Typing in the outline jumps to matching titles; ⌘G for next match.
8. **Empty Inbox / Flagged illustrations** — OmniFocus empty states are more specific than “All clear.”
9. **Toolbar customization** — Show/hide toolbar buttons; Quick Open vs Search placement matching OF 4.
10. **Dark mode** — OmniFocus 4 system appearance. Large visual pass.
11. **Window title** — “Projects — OmniClone” (or focused project name).
12. **Print / Export TaskPaper file** — File menu beyond clipboard copy.
13. **Attachments as URL/file links** — Notes-adjacent attachments, even if CSV cannot import binaries.
14. **Locations on tags** — Nearby/geofence is iOS-specific; skip unless doing a mobile clone pass.
15. **AppleScript / URL handler completeness** — `omniclone://task/…` copy exists; opening those links should select the action.
16. **Sidebar for Inbox/Flagged** — OF often hides the content sidebar there; Forecast calendar is done.
17. **Project complete-when-completing-last-action** — Optional project auto-complete.
18. **Duplicate Project** — Deep-copy project + actions.
19. **Archive / dropped folder** — A place for dropped projects instead of mixing them in Remaining.
20. **Perspectives: duration and flagged rules** — More Contents rules (duration, project type, stalled, on hold).
21. **Outline notes indicator vs shown notes** — When notes are hidden, OF uses a small note glyph; present, but spacing/alignment still drifts.
22. **Keyboard: ⌘↩ new action, Escape cancel edit** — Return edits; some OF setups use ⌘Return to create. Confirm against current Mac OF 4 defaults.
23. **Forecast flagged row styling** — Flagged-without-date items on Today should read as flagged, not as due.
24. **Import folders as first-class empty folders** — CSV Folder rows currently only count toward a warning; empty OmniFocus folders never appear until a project lives in them.
25. **Electron menu checkmarks** — Show Sidebar / Inspector / Perspectives Bar should be stateful check items.
26. **Accessibility** — VoiceOver labels on status rings (Available, Blocked, On Hold, Dropped, Completed).
27. **System notification delivery** — Inspector reminder list exists; fire local banners at due/defer.
28. **Drag onto nested tags to reparent tags** — Drop currently assigns the tag to actions, not tag hierarchy.

## Implementation notes

- Domain types live in `src/model.ts`. Outline behavior is in `src/outline.ts`. Dates/Forecast/Review helpers are in `src/dates.ts`. Tag tree/status is `src/tags.ts`.
- Visible-task queries, titles, and sidebar perspective choice live in `src/perspectives/query.ts`. Badge/forecast counts are in `src/perspectives/counts.ts`.
- Library mutations (complete, duplicate, delete project, lingering cleanup, sidebar drop) live in `src/library/mutations.ts`.
- Navigation history is `src/navigation/history.ts` + `src/hooks/useLocationHistory.ts`. Persistence is `src/hooks/usePersistedLibrary.ts`.
- Menu/hotkey commands dispatch through `src/commands/dispatch.ts`.
- SQLite schema + migrations are in `src/db/client.ts`; persist in `src/storage.ts`. Repeat rules and notifications are JSON columns on tasks; tag parent/color/status live on the tags table.
- Desktop UI chrome is in `src/components/` (outline, inspector, sidebar, modals). `App.tsx` wires state to those modules.
- Tests: `npm test` (import, outline, dates, selection, perspectives, library, navigation, commands, tags) and `npm run typecheck`.
- Default perspective bar now includes Completed (`⌘6`) before Review (`⌘7`). Saved bars that still match the old default are migrated in `src/settings.ts`.

## How to continue

Pick the next ten items from the list above. Keep the clone visually honest: if OmniFocus shows it in the outline, sidebar, or inspector, match that before adding new product ideas.
