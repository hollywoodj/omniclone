import { makeId, type CustomPerspective, type Project, type Task } from "../model.ts";
import { applyRepeat, descendantsOf } from "../outline.ts";

export function applyTaskPatch(tasks: Task[], id: string, patch: Partial<Task>, now = new Date()): Task[] {
  return tasks.map((task) => {
    if (task.id !== id) return task;
    const next = { ...task, ...patch };
    if (patch.completed === true) next.completedAt = patch.completedAt ?? now.toISOString();
    if (patch.completed === false) next.completedAt = undefined;
    return next;
  });
}

export function applyCompleteToggle(tasks: Task[], ids: string[], now = new Date()): Task[] {
  const unique = [...new Set(ids)];
  const targets = tasks.filter((task) => unique.includes(task.id));
  if (!targets.length) return tasks;
  const nextCompleted = !targets.every((task) => task.completed);
  const completedAt = nextCompleted ? now.toISOString() : undefined;
  const next = tasks.map((task) => ({ ...task }));
  const byId = new Map(next.map((task) => [task.id, task]));
  const affected = new Set(unique);
  if (nextCompleted) {
    for (const id of unique) {
      for (const child of descendantsOf(id, next)) affected.add(child.id);
    }
  }
  for (const id of affected) {
    const task = byId.get(id);
    if (!task) continue;
    if (nextCompleted && unique.includes(id)) {
      const repeat = applyRepeat(task, now);
      if (repeat) {
        Object.assign(task, repeat);
        continue;
      }
    }
    task.completed = nextCompleted;
    task.completedAt = completedAt;
  }
  return next;
}

export function applyFlagToggle(tasks: Task[], ids: string[]): Task[] {
  const unique = [...new Set(ids)];
  const targets = tasks.filter((task) => unique.includes(task.id));
  if (!targets.length) return tasks;
  const nextFlagged = !targets.every((task) => task.flagged);
  return tasks.map((task) => unique.includes(task.id) ? { ...task, flagged: nextFlagged } : task);
}

export function applyMoveToProject(tasks: Task[], ids: string[], projectId: string | null): Task[] {
  const unique = new Set(ids);
  return tasks.map((task) => unique.has(task.id) ? { ...task, projectId } : task);
}

export function duplicateTasksByIds(
  tasks: Task[],
  ids: string[],
  idFactory: (prefix: string) => string = makeId,
  now = new Date(),
): { tasks: Task[]; copies: Task[] } {
  const copies: Task[] = [];
  const next = [...tasks];
  for (const taskId of ids) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) continue;
    const copy: Task = {
      ...task,
      id: idFactory("task"),
      importKey: undefined,
      createdAt: now.toISOString(),
      completed: false,
      completedAt: undefined,
    };
    copies.push(copy);
    const index = next.findIndex((item) => item.id === taskId);
    next.splice(index >= 0 ? index + 1 : next.length, 0, copy);
  }
  return { tasks: next, copies };
}

export function pruneProjectFromPerspectives(customPerspectives: CustomPerspective[], projectId: string): CustomPerspective[] {
  return customPerspectives.map((item) => ({
    ...item,
    rules: item.rules.map((rule) => rule.kind === "containedIn"
      ? { ...rule, projectIds: (rule.projectIds ?? []).filter((id) => id !== projectId) }
      : rule),
  }));
}

export function retainProjectsInPerspectives(customPerspectives: CustomPerspective[], retainedProjectIds: Set<string>): CustomPerspective[] {
  return customPerspectives.map((item) => ({
    ...item,
    rules: item.rules.map((rule) => rule.kind === "containedIn"
      ? { ...rule, projectIds: (rule.projectIds ?? []).filter((id) => retainedProjectIds.has(id)) }
      : rule),
  }));
}

export function removeProjectFromLibrary(
  projects: Project[],
  tasks: Task[],
  customPerspectives: CustomPerspective[],
  projectId: string,
) {
  return {
    projects: projects.filter((project) => project.id !== projectId),
    tasks: tasks.filter((task) => task.projectId !== projectId),
    customPerspectives: pruneProjectFromPerspectives(customPerspectives, projectId),
  };
}

export function deleteTaskIds(tasks: Task[], ids: string[]): { remaining: Task[]; removed: string[] } {
  const extra = ids.flatMap((id) => descendantsOf(id, tasks).map((task) => task.id));
  const removed = [...new Set([...ids, ...extra])];
  return {
    remaining: tasks.filter((task) => !removed.includes(task.id)),
    removed,
  };
}

export function selectionAfterProjectDelete(
  current: { ids: string[]; anchorId: string | null; headId: string | null },
  tasks: Task[],
  projectId: string,
) {
  const remaining = current.ids.filter((taskId) => tasks.find((task) => task.id === taskId)?.projectId !== projectId);
  if (!remaining.length) return { ids: [] as string[], anchorId: null, headId: null };
  return {
    ids: remaining,
    anchorId: current.anchorId && remaining.includes(current.anchorId) ? current.anchorId : remaining[0] ?? null,
    headId: current.headId && remaining.includes(current.headId) ? current.headId : remaining[remaining.length - 1] ?? null,
  };
}

export function lingeringIdsAfterCompletion(current: string[], ids: string[], completed: boolean): string[] {
  return completed
    ? [...new Set([...current, ...ids])]
    : current.filter((id) => !ids.includes(id));
}

export function lingeringIdsAfterPatch(
  current: string[],
  id: string,
  patch: Partial<Task>,
  previous: Task | undefined,
): string[] {
  let next = current;
  if (patch.completed === true) next = next.includes(id) ? next : [...next, id];
  if (patch.completed === false) next = next.filter((item) => item !== id);
  if (patch.projectId !== undefined && previous && previous.projectId !== patch.projectId) {
    next = next.includes(id) ? next : [...next, id];
  }
  return next;
}

export function extraFoldersAfterCreate(extraFolders: string[], name: string): string[] {
  return extraFolders.includes(name) ? extraFolders : [...extraFolders, name];
}

export function pendingDeleteCopy(options: {
  projectName?: string;
  projectActionCount: number;
  taskCount: number;
  taskTitle?: string;
  deletingProject: boolean;
}): { title: string; message?: string } {
  if (options.deletingProject) {
    const title = options.projectName ?? "this project";
    const message = options.projectActionCount
      ? `This project and ${options.projectActionCount} action${options.projectActionCount === 1 ? "" : "s"} will be permanently removed from your local database.`
      : "This project will be permanently removed from your local database.";
    return { title, message };
  }
  const title = options.taskCount > 1
    ? `${options.taskCount} actions`
    : options.taskTitle ?? "this action";
  const message = options.taskCount > 1
    ? `These ${options.taskCount} actions will be permanently removed from your local database.`
    : undefined;
  return { title, message };
}
