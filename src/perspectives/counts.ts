import { dueUrgency, forecastWeek, isDueOnDay, projectDueForReview, todayKey, taskMatchesFocus, projectMatchesFocus, emptyFocus, type FocusState } from "../dates.ts";
import { palette, type Project, type Task } from "../model.ts";

export function remainingCountForProject(tasks: Task[], projectId: string) {
  return tasks.filter((task) => task.projectId === projectId && !task.completed && (task.status ?? "active") !== "dropped").length;
}

export function remainingCountForTag(tasks: Task[], tag: string) {
  return tasks.filter((task) => task.tags.includes(tag) && !task.completed && (task.status ?? "active") !== "dropped").length;
}

export function forecastCountsFor(tasks: Task[], focus: FocusState | null = null, now = new Date(), projects: Project[] = []): Record<string, number> {
  const counts: Record<string, number> = { past: 0, upcoming: 0 };
  const weekKeys = forecastWeek(now).map((day) => day.key);
  const activeFocus = focus ?? emptyFocus();
  for (const task of tasks) {
    if (task.completed || (task.status ?? "active") === "dropped") continue;
    if (!taskMatchesFocus(task, projects, activeFocus)) continue;
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
  return {
    inbox: { count: tasks.filter((task) => task.projectId === null && !task.completed).length },
    flagged: { count: tasks.filter((task) => task.flagged && !task.completed && taskMatchesFocus(task, projects, activeFocus)).length },
    forecast: { count: tasks.filter((task) => !task.completed && dueUrgency(task.due, now) === "overdue" && taskMatchesFocus(task, projects, activeFocus)).length, color: palette.overdue },
    review: { count: projects.filter((project) => projectMatchesFocus(project, activeFocus) && projectDueForReview(project, now)).length },
  };
}
