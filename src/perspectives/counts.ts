import { dueUrgency, forecastWeek, isDueOnDay, projectDueForReview, todayKey, taskMatchesFocus, projectMatchesFocus, emptyFocus, focusedTaskProjectIds, type FocusState } from "../dates.ts";
import { palette, type Project, type Task } from "../model.ts";

export function remainingCountForProject(tasks: Task[], projectId: string) {
  let count = 0;
  for (const task of tasks) {
    if (task.projectId === projectId && !task.completed && (task.status ?? "active") !== "dropped") count += 1;
  }
  return count;
}

export function remainingCountForTag(tasks: Task[], tag: string) {
  let count = 0;
  for (const task of tasks) {
    if (task.tags.includes(tag) && !task.completed && (task.status ?? "active") !== "dropped") count += 1;
  }
  return count;
}

export function forecastCountsFor(tasks: Task[], focus: FocusState | null = null, now = new Date(), projects: Project[] = []): Record<string, number> {
  const counts: Record<string, number> = { past: 0, upcoming: 0 };
  const weekKeys = forecastWeek(now).map((day) => day.key);
  const activeFocus = focus ?? emptyFocus();
  const focusedIds = focusedTaskProjectIds(projects, activeFocus);
  for (const task of tasks) {
    if (task.completed || (task.status ?? "active") === "dropped") continue;
    if (!taskMatchesFocus(task, projects, activeFocus, focusedIds)) continue;
    if (task.due) {
      if (dueUrgency(task.due, now) === "overdue") counts.past = (counts.past ?? 0) + 1;
      if (isDueOnDay(task.due, "upcoming", now)) counts.upcoming = (counts.upcoming ?? 0) + 1;
      for (const key of weekKeys) {
        if (isDueOnDay(task.due, key, now)) counts[key] = (counts[key] ?? 0) + 1;
      }
    } else if (task.flagged) {
      const today = todayKey(now);
      counts[today] = (counts[today] ?? 0) + 1;
    }
  }
  return counts;
}

export function perspectiveBadgesFor(tasks: Task[], projects: Project[], focus: FocusState | null = null, now = new Date()) {
  const activeFocus = focus ?? emptyFocus();
  const focusedIds = focusedTaskProjectIds(projects, activeFocus);
  let inbox = 0;
  let flagged = 0;
  let forecast = 0;
  for (const task of tasks) {
    if (task.completed) continue;
    if (task.projectId === null) inbox += 1;
    if (!taskMatchesFocus(task, projects, activeFocus, focusedIds)) continue;
    if (task.flagged) flagged += 1;
    if (dueUrgency(task.due, now) === "overdue") forecast += 1;
  }
  let review = 0;
  for (const project of projects) {
    if (projectMatchesFocus(project, activeFocus) && projectDueForReview(project, now)) review += 1;
  }
  return {
    inbox: { count: inbox },
    flagged: { count: flagged },
    forecast: { count: forecast, color: palette.overdue },
    review: { count: review },
  };
}
