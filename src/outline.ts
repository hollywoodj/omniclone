import { addDays, formatDateLabel, isActionAvailable, parseDueLabel } from "./dates";
import type { PerspectiveAvailability, Project, Task } from "./model";

export type RepeatRule = "none" | "daily" | "weekly" | "monthly";
export type ProjectStatus = "active" | "onHold" | "dropped";
export type ProjectType = "parallel" | "sequential" | "singleActions";

function originalIndex(tasks: Task[]) {
  return new Map(tasks.map((task, index) => [task.id, index]));
}

export function siblingKey(task: Pick<Task, "projectId" | "parentId">) {
  return `${task.projectId ?? "inbox"}::${task.parentId ?? ""}`;
}

export function compareSiblings(a: Task, b: Task, index: Map<string, number>) {
  const rank = (a.sortOrder ?? index.get(a.id) ?? 0) - (b.sortOrder ?? index.get(b.id) ?? 0);
  if (rank) return rank;
  return (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0);
}

export function sortedSiblings(tasks: Task[], parentId: string | null, projectId: string | null) {
  const index = originalIndex(tasks);
  return tasks
    .filter((task) => (task.parentId ?? null) === parentId && task.projectId === projectId)
    .sort((a, b) => compareSiblings(a, b, index));
}

export function childMap(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  const index = originalIndex(tasks);
  for (const task of tasks) {
    if (!task.parentId) continue;
    const list = map.get(task.parentId) ?? [];
    list.push(task);
    map.set(task.parentId, list);
  }
  for (const list of map.values()) list.sort((a, b) => compareSiblings(a, b, index));
  return map;
}

export function taskDepth(task: Task, byId: Map<string, Task>) {
  let depth = 0;
  let current: Task | undefined = task;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentId);
    if (!current) break;
    depth += 1;
    if (depth > 24) break;
  }
  return depth;
}

function visibleParentId(task: Task, ids: Set<string>) {
  return task.parentId && ids.has(task.parentId) ? task.parentId : null;
}

function walk(tasks: Task[], ids: Set<string>, parentId: string | null, projectId: string | null, collapsed: Set<string>, into: Task[], index: Map<string, number>) {
  const siblings = tasks
    .filter((task) => task.projectId === projectId && visibleParentId(task, ids) === parentId)
    .sort((a, b) => compareSiblings(a, b, index));
  for (const task of siblings) {
    into.push(task);
    if (!collapsed.has(task.id)) walk(tasks, ids, task.id, task.projectId, collapsed, into, index);
  }
}

export function flattenTasks(tasks: Task[], collapsed: Iterable<string> = []) {
  const hidden = new Set(collapsed);
  const ids = new Set(tasks.map((task) => task.id));
  const index = originalIndex(tasks);
  const result: Task[] = [];
  const seenProjects = new Set<string | null>();
  for (const task of tasks) {
    const projectId = task.projectId;
    if (seenProjects.has(projectId)) continue;
    seenProjects.add(projectId);
    walk(tasks, ids, null, projectId, hidden, result, index);
  }
  return result;
}

export function descendantsOf(taskId: string, tasks: Task[]) {
  const children = childMap(tasks);
  const result: Task[] = [];
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      result.push(child);
      visit(child.id);
    }
  };
  visit(taskId);
  return result;
}

export function reindexSiblings(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = siblingKey(task);
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  const index = originalIndex(tasks);
  for (const list of groups.values()) {
    list.sort((a, b) => compareSiblings(a, b, index));
    list.forEach((task, order) => {
      task.sortOrder = order;
    });
  }
  return tasks;
}

export function indentTasks(tasks: Task[], ids: string[]) {
  const next = tasks.map((task) => ({ ...task }));
  const selected = new Set(ids);
  const byId = new Map(next.map((task) => [task.id, task]));
  for (const id of flattenTasks(next).map((task) => task.id)) {
    if (!selected.has(id)) continue;
    const task = byId.get(id);
    if (!task) continue;
    const siblings = sortedSiblings(next, task.parentId ?? null, task.projectId);
    const index = siblings.findIndex((item) => item.id === id);
    const previous = index > 0 ? siblings[index - 1] : undefined;
    if (!previous || selected.has(previous.id)) continue;
    task.parentId = previous.id;
    const adopted = sortedSiblings(next, previous.id, previous.projectId);
    task.sortOrder = (adopted[adopted.length - 1]?.sortOrder ?? adopted.length - 1) + 1;
  }
  return reindexSiblings(next);
}

export function outdentTasks(tasks: Task[], ids: string[]) {
  const next = tasks.map((task) => ({ ...task }));
  const selected = new Set(ids);
  const byId = new Map(next.map((task) => [task.id, task]));
  for (const id of [...flattenTasks(next).map((task) => task.id)].reverse()) {
    if (!selected.has(id)) continue;
    const task = byId.get(id);
    if (!task?.parentId) continue;
    const parent = byId.get(task.parentId);
    if (!parent) continue;
    task.parentId = parent.parentId ?? null;
    task.projectId = parent.projectId;
    task.sortOrder = (parent.sortOrder ?? 0) + 0.5;
  }
  return reindexSiblings(next);
}

export function moveSiblings(tasks: Task[], ids: string[], direction: -1 | 1) {
  const next = tasks.map((task) => ({ ...task }));
  const selected = new Set(ids);
  const seen = new Set<string>();
  for (const task of next) {
    const key = siblingKey(task);
    if (seen.has(key)) continue;
    seen.add(key);
    const siblings = sortedSiblings(next, task.parentId ?? null, task.projectId);
    const selectedIndexes = siblings.map((item, index) => selected.has(item.id) ? index : -1).filter((index) => index >= 0);
    if (!selectedIndexes.length) continue;
    const start = selectedIndexes[0] ?? 0;
    const end = selectedIndexes[selectedIndexes.length - 1] ?? 0;
    const block = siblings.slice(start, end + 1);
    if (block.length !== selectedIndexes.length || block.some((item) => !selected.has(item.id))) continue;
    if (direction < 0) {
      if (start === 0) continue;
      const previous = siblings[start - 1];
      if (!previous) continue;
      const reordered = [...siblings.slice(0, start - 1), ...block, previous, ...siblings.slice(end + 1)];
      reordered.forEach((item, index) => {
        item.sortOrder = index;
      });
    } else {
      if (end >= siblings.length - 1) continue;
      const following = siblings[end + 1];
      if (!following) continue;
      const reordered = [...siblings.slice(0, start), following, ...block, ...siblings.slice(end + 2)];
      reordered.forEach((item, index) => {
        item.sortOrder = index;
      });
    }
  }
  return next;
}

export function insertTaskAfter(tasks: Task[], afterId: string | null, task: Task, fallbackProjectId: string | null) {
  const next = tasks.map((item) => ({ ...item }));
  const after = afterId ? next.find((item) => item.id === afterId) : undefined;
  const created: Task = {
    ...task,
    projectId: after ? after.projectId : fallbackProjectId,
    parentId: after?.parentId ?? null,
    sortOrder: after ? (after.sortOrder ?? 0) + 0.5 : next.length,
  };
  next.push(created);
  return { tasks: reindexSiblings(next), created };
}

export function isBlockedSequential(task: Task, tasks: Task[], projects: Project[]) {
  const project = task.projectId ? projects.find((item) => item.id === task.projectId) : undefined;
  if (!project || (project.type ?? "parallel") !== "sequential" || task.completed) return false;
  const firstRemaining = sortedSiblings(tasks, task.parentId ?? null, task.projectId).find((item) => !item.completed);
  return !!firstRemaining && firstRemaining.id !== task.id;
}

export function taskMatchesView(
  task: Task,
  availability: PerspectiveAvailability,
  context: { tasks: Task[]; projects: Project[]; now?: Date },
) {
  const project = task.projectId ? context.projects.find((item) => item.id === task.projectId) : undefined;
  const status = project?.status ?? "active";
  if (availability === "all") return true;
  if (availability === "completed") return task.completed || status === "dropped";
  if (task.completed || status === "dropped") return false;
  if (availability === "remaining") return true;
  if (status === "onHold") return false;
  if (!isActionAvailable(task, context.now)) return false;
  if (isBlockedSequential(task, context.tasks, context.projects)) return false;
  return true;
}

export function formatEstimate(minutes?: number) {
  if (!minutes) return undefined;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function shiftDateLabel(label: string | undefined, days: number, now = new Date()) {
  if (!label) return undefined;
  const date = parseDueLabel(label, now);
  if (!date) return label;
  const next = addDays(date, days);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  const text = formatDateLabel(next, now);
  if (!hasTime) return text;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  const clock = minutes ? `${hour12}:${String(minutes).padStart(2, "0")} ${period}` : `${hour12}:00 ${period}`;
  return `${text}, ${clock}`;
}

export function applyRepeat(task: Task, now = new Date()): Partial<Task> | null {
  const repeat = task.repeat ?? "none";
  if (repeat === "none") return null;
  const days = repeat === "daily" ? 1 : repeat === "weekly" ? 7 : 30;
  return {
    completed: false,
    completedAt: undefined,
    due: shiftDateLabel(task.due, days, now) ?? task.due,
    defer: shiftDateLabel(task.defer, days, now),
  };
}

function taskPaperLine(task: Task, depth: number) {
  const tags = [
    task.due ? `@due(${task.due})` : "",
    task.defer ? `@defer(${task.defer})` : "",
    task.flagged ? "@flagged" : "",
    task.completed ? "@done" : "",
    task.estimatedMinutes ? `@estimate(${formatEstimate(task.estimatedMinutes)})` : "",
    task.tags.length ? `@tags(${task.tags.join(", ")})` : "",
    task.repeat && task.repeat !== "none" ? `@repeat(${task.repeat})` : "",
  ].filter(Boolean);
  const indent = "\t".repeat(depth);
  const line = `${indent}- ${task.title}${tags.length ? ` ${tags.join(" ")}` : ""}`;
  if (!task.note?.trim()) return line;
  return `${line}\n${indent}\t${task.note.replace(/\n/g, `\n${indent}\t`)}`;
}

export function toTaskPaper(tasks: Task[], allTasks: Task[], projects: Project[]) {
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const selected = new Set(tasks.map((task) => task.id));
  const ordered = flattenTasks(allTasks).filter((task) => selected.has(task.id));
  const lines: string[] = [];
  let lastProject: string | null | undefined;
  for (const task of ordered) {
    if (task.projectId !== lastProject) {
      lastProject = task.projectId;
      const project = projects.find((item) => item.id === task.projectId);
      if (project) lines.push(`${project.name}:`);
    }
    lines.push(taskPaperLine(task, taskDepth(task, byId) + (task.projectId ? 1 : 0)));
  }
  return lines.join("\n");
}

export function projectIsStalled(project: Project, tasks: Task[]) {
  if ((project.status ?? "active") !== "active") return false;
  return !tasks.some((task) => task.projectId === project.id && !task.completed);
}
