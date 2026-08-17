import assert from "node:assert/strict";
import test from "node:test";
import { todayKey } from "../dates.ts";
import type { Project, Task } from "../model.ts";
import { forecastCountsFor, perspectiveBadgesFor, remainingCountForProject } from "./counts.ts";

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    projectId: "p1",
    tags: [],
    flagged: false,
    completed: false,
    createdAt: partial.id,
    ...partial,
  };
}

const now = new Date(2026, 7, 17, 15, 0, 0);

test("forecast counts overdue, upcoming, and flagged-without-date today", () => {
  const tasks = [
    task({ id: "a", title: "Late", due: "Yesterday" }),
    task({ id: "b", title: "Soon", due: "Aug 24" }),
    task({ id: "c", title: "Flagged", flagged: true }),
    task({ id: "d", title: "Done", due: "Yesterday", completed: true }),
  ];
  const counts = forecastCountsFor(tasks, null, now);
  assert.equal(counts.past, 1);
  assert.equal(counts.upcoming, 1);
  assert.equal(counts[todayKey(now)], 1);
});

test("perspective badges ignore completed inbox items and respect focus", () => {
  const tasks = [
    task({ id: "a", title: "Inbox", projectId: null }),
    task({ id: "b", title: "Done inbox", projectId: null, completed: true }),
    task({ id: "c", title: "Flag", flagged: true, projectId: "p2" }),
    task({ id: "d", title: "Overdue", due: "Yesterday" }),
  ];
  const projects: Project[] = [
    { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 },
    { id: "p2", name: "Home", color: "#000", note: "", reviewIntervalDays: 7, lastReviewedAt: now.toISOString() },
  ];
  const badges = perspectiveBadgesFor(tasks, projects, "p1", now);
  assert.equal(badges.inbox.count, 1);
  assert.equal(badges.flagged.count, 0);
  assert.equal(badges.forecast.count, 1);
  assert.equal(badges.review.count, 1);
});

test("remaining project counts skip completed and dropped actions", () => {
  const tasks = [
    task({ id: "a", title: "Open" }),
    task({ id: "b", title: "Done", completed: true }),
    task({ id: "c", title: "Dropped", status: "dropped" }),
    task({ id: "d", title: "Other", projectId: "p2" }),
  ];
  assert.equal(remainingCountForProject(tasks, "p1"), 1);
});
