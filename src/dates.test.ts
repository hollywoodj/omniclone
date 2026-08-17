import assert from "node:assert/strict";
import test from "node:test";
import {
  duePresetLabel,
  dueUrgency,
  forecastWeek,
  formatOmniFocusDate,
  isDueOnDay,
  parseDueLabel,
  projectDueForReview,
  reviewStatusText,
  todayKey,
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

test("matches forecast days including Past", () => {
  assert.equal(isDueOnDay("Yesterday", "past", now), true);
  assert.equal(isDueOnDay("Today", "past", now), false);
  assert.equal(isDueOnDay("Today", todayKey(now), now), true);
  assert.equal(isDueOnDay("Aug 22", todayKey(now), now), false);
});

test("builds a live forecast week from today", () => {
  const week = forecastWeek(now, 7);
  assert.equal(week.length, 7);
  assert.equal(week[0]?.key, "2026-08-17");
  assert.equal(week[0]?.weekday, "MON");
  assert.equal(week[0]?.date, 17);
  assert.equal(week[6]?.key, "2026-08-23");
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
