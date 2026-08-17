import { dueUrgency, forecastWeek, isDueOnDay, projectDueForReview, todayKey } from "../dates.ts";
import { palette, type Project, type Task } from "../model.ts";

export function remainingCountForProject(tasks: Task[], projectId: string) {
  return tasks.filter((task) => task.projectId === projectId && !task.completed && (task.status ?? "active") !== "dropped").length;
}

export function remainingCountForTag(tasks: Task[], tag: string) {
  return tasks.filter((task) => task.tags.includes(tag) && !task.completed && (task.status ?? "active") !== "dropped").length;
}

export function forecastCountsFor(tasks: Task[], focusedProjectId: string | null, now = new Date()): Record<string, number> {
  const counts: Record<string, number> = { past: 0, upcoming: 0 };
  const weekKeys = forecastWeek(now).map((day) => day.key);
  for (const task of tasks) {
    if (task.completed || (task.status ?? "active") === "dropped") continue;
    if (focusedProjectId && task.projectId !== focusedProjectId) continue;
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

export function perspectiveBadgesFor(tasks: Task[], projects: Project[], focusedProjectId: string | null, now = new Date()) {
  return {
    inbox: { count: tasks.filter((task) => task.projectId === null && !task.completed).length },
    flagged: { count: tasks.filter((task) => task.flagged && !task.completed && (!focusedProjectId || task.projectId === focusedProjectId)).length },
    forecast: { count: tasks.filter((task) => !task.completed && dueUrgency(task.due, now) === "overdue" && (!focusedProjectId || task.projectId === focusedProjectId)).length, color: palette.overdue },
    review: { count: projects.filter((project) => (!focusedProjectId || project.id === focusedProjectId) && projectDueForReview(project, now)).length },
  };
}
