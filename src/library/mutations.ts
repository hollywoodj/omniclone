import { formatDateLabel, lastIntervalDays, startOfLocalDay, addDays } from "../dates.ts";
import { makeId, type CustomPerspective, type Project, type Task } from "../model.ts";
import { applyRepeat, descendantsOf, idsWithDescendants, insertTaskAfter, projectInFolder, reindexSiblings } from "../outline.ts";

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

export function awaitReplyFollowUp(
  task: Task,
  days: number,
  now = new Date(),
  idFactory: (prefix: string) => string = makeId,
): Task {
  const deferDate = addDays(startOfLocalDay(now), Math.max(1, days));
  return {
    id: idFactory("task"),
    title: task.title.toLowerCase().startsWith("await reply:") ? task.title : `Await reply: ${task.title}`,
    projectId: task.projectId,
    parentId: task.parentId ?? null,
    tags: [...task.tags],
    flagged: false,
    completed: false,
    createdAt: now.toISOString(),
    defer: formatDateLabel(deferDate, now),
  };
}

export function applyCompleteAndAwaitReply(
  tasks: Task[],
  ids: string[],
  fallbackDays: number,
  now = new Date(),
  idFactory: (prefix: string) => string = makeId,
): Task[] {
  const unique = [...new Set(ids)];
  const originals = unique
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is Task => !!task && !task.completed);
  if (!originals.length) return tasks;
  let next = applyCompleteToggle(tasks, originals.map((task) => task.id), now);
  for (const original of originals) {
    const after = next.find((task) => task.id === original.id);
    if (after && !after.completed) continue;
    const follow = awaitReplyFollowUp(original, lastIntervalDays(original, fallbackDays, now), now, idFactory);
    next = insertTaskAfter(next, original.id, follow, original.projectId).tasks;
  }
  return next;
}

export function applyMoveToProject(tasks: Task[], ids: string[], projectId: string | null): Task[] {
  const unique = new Set(idsWithDescendants(tasks, ids));
  const movingRoots = [...new Set(ids)].filter((id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return false;
    return !task.parentId || !unique.has(task.parentId);
  });
  const patched = tasks.map((task) => unique.has(task.id) ? { ...task, projectId } : task);
  const movingBlock = patched.filter((task) => unique.has(task.id));
  const stationary = patched.filter((task) => !unique.has(task.id));
  let insertAt = stationary.length;
  for (let index = stationary.length - 1; index >= 0; index -= 1) {
    if (stationary[index]?.projectId === projectId) {
      insertAt = index + 1;
      break;
    }
  }
  return reindexSiblings([...stationary.slice(0, insertAt), ...movingBlock, ...stationary.slice(insertAt)]);
}

export function applyAddTag(tasks: Task[], ids: string[], tag: string): Task[] {
  const name = tag.trim();
  if (!name) return tasks;
  const unique = new Set(ids);
  return tasks.map((task) => unique.has(task.id) && !task.tags.includes(name)
    ? { ...task, tags: [...task.tags, name] }
    : task);
}

export type SidebarDropTarget =
  | { kind: "inbox" }
  | { kind: "project"; projectId: string }
  | { kind: "folder"; folder: string }
  | { kind: "tag"; tag: string };

export function applySidebarDrop(tasks: Task[], projects: Project[], ids: string[], target: SidebarDropTarget): Task[] {
  if (target.kind === "inbox") return applyMoveToProject(tasks, ids, null);
  if (target.kind === "project") return applyMoveToProject(tasks, ids, target.projectId);
  if (target.kind === "folder") {
    const project = projects.find((item) => projectInFolder(item, target.folder));
    return project ? applyMoveToProject(tasks, ids, project.id) : tasks;
  }
  return applyAddTag(tasks, ids, target.tag);
}

export function duplicateTasksByIds(
  tasks: Task[],
  ids: string[],
  idFactory: (prefix: string) => string = makeId,
  now = new Date(),
): { tasks: Task[]; copies: Task[] } {
  const copies: Task[] = [];
  const roots = [...new Set(ids)];
  const subtreeIds = new Set<string>();
  for (const taskId of roots) {
    subtreeIds.add(taskId);
    for (const child of descendantsOf(taskId, tasks)) subtreeIds.add(child.id);
  }
  const idMap = new Map([...subtreeIds].map((id) => [id, idFactory("task")]));
  let next = [...tasks];

  for (const taskId of roots) {
    const original = tasks.find((item) => item.id === taskId);
    if (!original) continue;
    const subtreeCopies: Task[] = [];
    const collect = (id: string, parentId: string | null) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return;
      const copy: Task = {
        ...task,
        id: idMap.get(task.id) ?? idFactory("task"),
        importKey: undefined,
        parentId: parentId,
        createdAt: now.toISOString(),
        completed: false,
        completedAt: undefined,
      };
      subtreeCopies.push(copy);
      copies.push(copy);
      for (const child of tasks.filter((item) => item.parentId === id)) collect(child.id, copy.id);
    };
    collect(taskId, original.parentId ?? null);
    const index = next.findIndex((item) => item.id === taskId);
    next.splice(index >= 0 ? index + 1 : next.length, 0, ...subtreeCopies);
  }
  return { tasks: reindexSiblings(next), copies };
}

export function duplicateProjectById(
  projects: Project[],
  tasks: Task[],
  projectId: string,
  idFactory: (prefix: string) => string = makeId,
  now = new Date(),
): { projects: Project[]; tasks: Task[]; project: Project } | null {
  const original = projects.find((project) => project.id === projectId);
  if (!original) return null;
  const project: Project = {
    ...original,
    id: idFactory("project"),
    importKey: undefined,
    name: `${original.name} Copy`,
  };
  const originals = tasks.filter((task) => task.projectId === projectId);
  const idMap = new Map(originals.map((task) => [task.id, idFactory("task")]));
  const copies: Task[] = originals.map((task) => ({
    ...task,
    id: idMap.get(task.id) ?? idFactory("task"),
    importKey: undefined,
    projectId: project.id,
    parentId: task.parentId ? idMap.get(task.parentId) ?? null : task.parentId,
    createdAt: now.toISOString(),
    completed: false,
    completedAt: undefined,
    attachments: task.attachments?.map((item) => ({ ...item, id: idFactory("file") })),
  }));
  const index = projects.findIndex((item) => item.id === projectId);
  const nextProjects = [...projects];
  nextProjects.splice(index >= 0 ? index + 1 : nextProjects.length, 0, project);
  return { projects: nextProjects, tasks: [...tasks, ...copies], project };
}

export function applyCompleteWithLastAction(projects: Project[], tasks: Task[]): Project[] {
  let changed = false;
  const next = projects.map((project) => {
    if (!project.completeWithLastAction) return project;
    const remaining = tasks.some((task) => task.projectId === project.id && !task.completed && (task.status ?? "active") !== "dropped");
    if ((project.status ?? "active") === "active" && !remaining) {
      changed = true;
      return { ...project, status: "done" as const };
    }
    if (project.status === "done" && remaining) {
      changed = true;
      return { ...project, status: "active" as const };
    }
    return project;
  });
  return changed ? next : projects;
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
