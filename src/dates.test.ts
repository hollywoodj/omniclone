import assert from "node:assert/strict";
import test from "node:test";
import {
  duePresetLabel,
  dueUrgency,
  formatAvailableLabel,
  forecastWeek,
  formatOmniFocusDate,
  inspectorTimestamp,
  isActionAvailable,
  isDueOnDay,
  isForecastItem,
  matchesAvailability,
  parseDueLabel,
  projectDueForReview,
  reviewStatusText,
  todayKey,
  completionGroupLabel,
  applyDueTimePreset,
  dueTimePreset,
  setCalendarDate,
  calendarMonth,
  outlineDueLabel,
  completionBucket,
  nextReviewDate,
  nextReviewLabel,
  lastReviewedFromNextReview,
  lastIntervalDays,
  taskMatchesFocus,
} from "./dates.ts";
import type { Project } from "./model.ts";

const now = new Date(2026, 7, 17, 15, 0, 0);

test("parses OmniFocus-style due labels back into dates", () => {
  assert.equal(parseDueLabel("Today", now)?.getDate(), 17);
  assert.equal(parseDueLabel("Tomorrow, 5:00 PM", now)?.getDate(), 18);
  assert.equal(parseDueLabel("Yesterday", now)?.getDate(), 16);
  assert.equal(parseDueLabel("Aug 22", now)?.getDate(), 22);
  assert.equal(parseDueLabel("Jun 12, 2017", now)?.getFullYear(), 2017);
});

test("classifies overdue, due soon, and upcoming dates", () => {
  assert.equal(dueUrgency("Yesterday", now), "overdue");
  assert.equal(dueUrgency("Today", now), "dueSoon");
  assert.equal(dueUrgency("Today, 5:00 PM", now), "dueSoon");
  assert.equal(dueUrgency("Tomorrow", now), "upcoming");
  assert.equal(dueUrgency(undefined, now), "none");
});

test("matches forecast days including Past and Upcoming", () => {
  assert.equal(isDueOnDay("Yesterday", "past", now), true);
  assert.equal(isDueOnDay("Today", "past", now), false);
  assert.equal(isDueOnDay("Today", todayKey(now), now), true);
  assert.equal(isDueOnDay("Aug 22", todayKey(now), now), false);
  assert.equal(isDueOnDay("Aug 22", "upcoming", now), false);
  assert.equal(isDueOnDay("Aug 24", "upcoming", now), true);
  assert.equal(isDueOnDay("Sep 1", "upcoming", now), true);
});

test("builds a live forecast week from today", () => {
  const week = forecastWeek(now, 7);
  assert.equal(week.length, 7);
  assert.equal(week[0]?.key, "2026-08-17");
  assert.equal(week[0]?.weekday, "MON");
  assert.equal(week[0]?.date, 17);
  assert.equal(week[6]?.key, "2026-08-23");
});

test("applies morning and calendar times onto due labels", () => {
  assert.equal(applyDueTimePreset("Today", "morning", now), "Today, 9:00 AM");
  assert.equal(applyDueTimePreset("Today, 9:00 AM", "evening", now), "Today, 5:00 PM");
  assert.equal(applyDueTimePreset("Tomorrow, 5:00 PM", "none", now), "Tomorrow");
  assert.equal(dueTimePreset("Today, 9:00 AM", now), "morning");
  const picked = setCalendarDate("Today, 5:00 PM", new Date(2026, 7, 22), now);
  assert.equal(picked, "Aug 22, 5:00 PM");
  const month = calendarMonth(2026, 7);
  assert.equal(month.length, 42);
  assert.equal(month[0]?.day, 26);
  assert.equal(month[6]?.day, 1);
  assert.equal(outlineDueLabel("Today, 5:00 PM", true, now), "5:00 PM");
});

test("creates Today/Tomorrow/Weekend/Next Week presets", () => {
  assert.equal(duePresetLabel("today", now), "Today");
  assert.equal(duePresetLabel("tomorrow", now), "Tomorrow");
  assert.equal(duePresetLabel("weekend", now), "Aug 22");
  assert.equal(duePresetLabel("nextWeek", now), "Aug 24");
});

test("review is due when never reviewed or interval has elapsed", () => {
  const project: Project = { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 };
  assert.equal(projectDueForReview(project, now), true);
  assert.match(reviewStatusText(project, now), /Never reviewed/);

  const reviewedToday = { ...project, lastReviewedAt: now.toISOString() };
  assert.equal(projectDueForReview(reviewedToday, now), false);

  const stale = { ...project, lastReviewedAt: new Date(2026, 7, 1).toISOString() };
  assert.equal(projectDueForReview(stale, now), true);
  assert.match(reviewStatusText(stale, now), /Last reviewed 16 days ago/);
});

test("keeps imported date formatting for Forecast labels", () => {
  assert.equal(formatOmniFocusDate("2026-08-17 00:00:00 -0400", now), "Today");
  assert.equal(formatOmniFocusDate("2026-08-22 00:00:00 -0400", now), "Aug 22");
});

test("Available hides deferred actions until their date arrives", () => {
  const remaining = { completed: false as const, defer: "Tomorrow" };
  const availableToday = { completed: false as const, defer: "Today" };
  const overdueDefer = { completed: false as const, defer: "Yesterday" };
  const done = { completed: true as const, defer: undefined };
  assert.equal(isActionAvailable(remaining, now), false);
  assert.equal(isActionAvailable(availableToday, now), true);
  assert.equal(isActionAvailable(overdueDefer, now), true);
  assert.equal(matchesAvailability(remaining, "available", now), false);
  assert.equal(matchesAvailability(remaining, "remaining", now), true);
  assert.equal(matchesAvailability(done, "remaining", now), false);
  assert.equal(matchesAvailability(done, "completed", now), true);
  assert.equal(formatAvailableLabel("Tomorrow", now), "Available Tomorrow");
  assert.equal(formatAvailableLabel("Today", now), undefined);
});

test("formats inspector added and completed timestamps", () => {
  assert.equal(inspectorTimestamp("2026-08-17T15:00:00", now), "Today, 3:00 PM");
  assert.equal(inspectorTimestamp("2026-08-16T00:00:00", now), "Yesterday");
});

test("Forecast Today includes flagged actions that have no due date", () => {
  const flagged = { flagged: true, due: undefined, completed: false };
  const dated = { flagged: true, due: "Tomorrow", completed: false };
  assert.equal(isForecastItem(flagged, todayKey(now), now), true);
  assert.equal(isForecastItem(flagged, "past", now), false);
  assert.equal(isForecastItem(dated, todayKey(now), now), false);
  assert.equal(completionGroupLabel(now.toISOString(), now), "Today");
  assert.equal(completionGroupLabel(new Date(2026, 7, 16).toISOString(), now), "Yesterday");
});

test("dropped actions sit in their own Completed group", () => {
  assert.equal(completionBucket({ completed: true, completedAt: now.toISOString(), status: "active" }, now), "Today");
  assert.equal(completionBucket({ completed: false, status: "dropped" }, now), "Dropped");
});

test("next review date can be edited by backing out last reviewed", () => {
  const project: Project = { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7, lastReviewedAt: new Date(2026, 7, 10).toISOString() };
  assert.equal(nextReviewLabel(project, now), "Today");
  const last = lastReviewedFromNextReview(project, "Aug 24", now);
  assert.equal(nextReviewDate({ ...project, lastReviewedAt: last }, now).getDate(), 24);
});

test("last interval falls back when defer and due are missing", () => {
  assert.equal(lastIntervalDays({ due: "Aug 20", defer: "Aug 17" }, 3, now), 3);
  assert.equal(lastIntervalDays({}, 5, now), 5);
});

test("focus includes descendant folder projects", () => {
  const projects: Project[] = [
    { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 },
    { id: "p2", name: "Home", folder: "Personal", color: "#000", note: "", reviewIntervalDays: 7 },
  ];
  const focus = { focusedProjectIds: [], focusedFolderPaths: ["Personal"] };
  assert.equal(taskMatchesFocus({ projectId: "p2" }, projects, focus), true);
  assert.equal(taskMatchesFocus({ projectId: "p1" }, projects, focus), false);
});
