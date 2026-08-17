# OmniClone handoff

This file is the memory log for later sessions. OmniClone is an OmniFocus 4 clone. Exact visual and interaction match is the goal. Keep closing UI gaps in batches of about ten.

## This pass (ten gaps closed)

1. Folders in the Projects sidebar (import `Folder : Project` paths, nested disclosure, New Folder / ⌥⌘N).
2. Blocked sequential status rings (dashed gray) plus On Hold pause rings.
3. First Available in View Options (and custom-perspective availability rules).
4. Action status: Active / On Hold / Dropped, including CSV import.
5. Completed built-in perspective (⌘6), grouped by Today / Yesterday / This Week / Last Week / Older.
6. Forecast Today includes flagged actions that have no due date.
7. Show notes under outline titles (View Options + Settings).
8. Inspector tag chips plus a Tag inspector when a sidebar tag is selected.
9. Stalled badges and Skip Review (postpone until tomorrow).
10. Convert to Project, plus an empty inspector when nothing is selected.

## Already done in earlier passes

Nested actions, sequential/parallel/single-action projects, project status, estimates, repeat, TaskPaper copy, move up/down, resizable panes, undo/redo, inline ⌘N, Forecast week/Upcoming, Available vs Remaining, defer labels, inline title edit, project inspector, Clean Up ⌘K, expand/collapse, Quick Entry dates/tags, Focus, back/forward, collapsible groups, inspector date presets, inspector tabs, perspective badges, custom perspectives, multi-select, CSV import, context menus, hotkeys.

## Next UI gaps to close (priority order)

Work through these next. Prefer visible OmniFocus 4 mismatches over backend work.

1. **Notifications inspector tab** — Due and Defer notifications (at due, before due, at start of day). Even a local reminder list would match the inspector.
2. **Repeat from due vs completion, and every-N rules** — OmniFocus repeats are “Repeat every N days/weeks/months, assigned dates vs completion date,” plus Defer Another. Current daily/weekly/monthly from due is too simple.
3. **Due times** — Morning / Afternoon / Evening / specific time chips, and times on Forecast rows.
4. **Calendar date picker** — Clicking Defer/Due should open a month calendar, not only presets + free text.
5. **Inline date editing** — Click the outline due/defer column to edit in place.
6. **Drop on sidebar** — Drag actions onto Inbox, a project, a folder, or a tag to assign them.
7. **Nested tags** — Tag hierarchy in the Tags sidebar, with parent/child and dropped/on-hold tags.
8. **Tag status and color** — Active / On Hold / Dropped tags with color, like OmniFocus tag inspector.
9. **Show in Projects / Reveal** — From any action, jump to the enclosing project and select it (partially present on projects, missing on actions).
10. **Paste TaskPaper** — Edit → Paste should parse TaskPaper outlines into actions (the inverse of ⇧⌘C).
11. **Column layout** — Optional outline columns (Project, Tags, Duration, Defer, Due) with headers, not only a trailing due/flag cluster.
12. **Hide project names when grouped by project** is started; still show project as a true right-hand column in Flagged/Forecast/custom views.
13. **Focus on multiple projects/folders** — OmniFocus Focus can include several items, not only one project.
14. **Review next-review date** — Editable next review date in the project inspector, not only interval + last reviewed.
15. **Complete with last interval** — “Complete and await reply” style defer-again on complete.
16. **Dropped vs completed in Completed perspective** — Dropped items should be visually distinct (X ring already exists; grouping/filter still mixed).
17. **Type-to-select / find next** — Typing in the outline jumps to matching titles; ⌘G for next match.
18. **Empty Inbox / Flagged illustrations** — OmniFocus empty states are more specific than “All clear.”
19. **Toolbar customization** — Show/hide toolbar buttons; Quick Open vs Search placement matching OF 4.
20. **Dark mode** — OmniFocus 4 system appearance. Large visual pass.
21. **Window title** — “Projects — OmniClone” (or focused project name).
22. **Print / Export TaskPaper file** — File menu beyond clipboard copy.
23. **Attachments as URL/file links** — Notes-adjacent attachments, even if CSV cannot import binaries.
24. **Locations on tags** — Nearby/geofence is iOS-specific; skip unless doing a mobile clone pass.
25. **AppleScript / URL handler completeness** — `omniclone://task/…` copy exists; opening those links should select the action.
26. **Sidebar for Inbox/Flagged** — OF often hides the content sidebar there; Forecast calendar is done.
27. **Project complete-when-completing-last-action** — Optional project auto-complete.
28. **Duplicate Project** — Deep-copy project + actions.
29. **Archive / dropped folder** — A place for dropped projects instead of mixing them in Remaining.
30. **Perspectives: duration and flagged rules** — More Contents rules (duration, project type, stalled, on hold).
31. **Outline notes indicator vs shown notes** — When notes are hidden, OF uses a small note glyph; present, but spacing/alignment still drifts.
32. **Keyboard: ⌘↩ new action, Escape cancel edit** — Return edits; some OF setups use ⌘Return to create. Confirm against current Mac OF 4 defaults.
33. **Forecast flagged row styling** — Flagged-without-date items on Today should read as flagged, not as due.
34. **Import folders as first-class empty folders** — CSV Folder rows currently only count toward a warning; empty OmniFocus folders never appear until a project lives in them.
35. **Electron menu checkmarks** — Show Sidebar / Inspector / Perspectives Bar should be stateful check items.
36. **Accessibility** — VoiceOver labels on status rings (Available, Blocked, On Hold, Dropped, Completed).

## Implementation notes

- Domain types live in `src/model.ts`. Outline behavior is in `src/outline.ts`. Dates/Forecast/Review helpers are in `src/dates.ts`.
- SQLite schema + migrations are in `src/db/client.ts`; persist in `src/storage.ts`.
- Desktop UI is mostly `App.tsx` (large). Prefer extracting outline/inspector/sidebar if the next pass needs more than a handful of edits.
- Tests: `npm test` (import, outline, dates, selection) and `npm run typecheck`.
- Default perspective bar now includes Completed (`⌘6`) before Review (`⌘7`). Saved bars that still match the old default are migrated in `src/settings.ts`.

## How to continue

Pick the next ten items from the list above. Keep the clone visually honest: if OmniFocus shows it in the outline, sidebar, or inspector, match that before adding new product ideas.
