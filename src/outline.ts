import { addDays, formatDateLabel, isActionAvailable, parseDueLabel, startOfLocalDay } from "./dates.ts";
import { makeId, type PerspectiveAvailability, type Project, type Task } from "./model.ts";

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
  const firstRemaining = sortedSiblings(tasks, task.parentId ?? null, task.projectId).find((item) => !item.completed && (item.status ?? "active") !== "dropped");
  return !!firstRemaining && firstRemaining.id !== task.id;
}

export function isFirstAvailable(task: Task, tasks: Task[], projects: Project[], now?: Date): boolean {
  if (!taskMatchesView(task, "available", { tasks, projects, now })) return false;
  const first = sortedSiblings(tasks, task.parentId ?? null, task.projectId).find((item) => (
    taskMatchesView(item, "available", { tasks, projects, now })
  ));
  return first?.id === task.id;
}

export function taskMatchesView(
  task: Task,
  availability: PerspectiveAvailability,
  context: { tasks: Task[]; projects: Project[]; now?: Date },
): boolean {
  const project = task.projectId ? context.projects.find((item) => item.id === task.projectId) : undefined;
  const projectStatus = project?.status ?? "active";
  const actionStatus = task.status ?? "active";
  if (availability === "all") return true;
  if (availability === "completed") return task.completed || actionStatus === "dropped" || projectStatus === "dropped";
  if (task.completed || actionStatus === "dropped" || projectStatus === "dropped") return false;
  if (availability === "remaining") return true;
  if (projectStatus === "onHold" || actionStatus === "onHold") return false;
  if (!isActionAvailable(task, context.now)) return false;
  if (isBlockedSequential(task, context.tasks, context.projects)) return false;
  if (availability === "firstAvailable") return isFirstAvailable(task, context.tasks, context.projects, context.now);
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
  return !tasks.some((task) => task.projectId === project.id && !task.completed && (task.status ?? "active") !== "dropped");
}

export function withLingeringTasks(visible: Task[], all: Task[], lingeringIds: Iterable<string>) {
  const lingering = lingeringIds instanceof Set ? lingeringIds : new Set(lingeringIds);
  if (!lingering.size) return visible;
  const seen = new Set(visible.map((task) => task.id));
  const extra = all.filter((task) => lingering.has(task.id) && !seen.has(task.id));
  return extra.length ? [...visible, ...extra] : visible;
}

export function sidebarActionCounts(tasks: Task[]) {
  const remainingByProject = new Map<string, number>();
  const remainingByTag = new Map<string, number>();
  let remainingInProjects = 0;
  let remainingTagged = 0;
  for (const task of tasks) {
    if (task.completed || (task.status ?? "active") === "dropped") continue;
    if (task.projectId) {
      remainingByProject.set(task.projectId, (remainingByProject.get(task.projectId) ?? 0) + 1);
      remainingInProjects += 1;
    }
    if (task.tags.length) remainingTagged += 1;
    for (const tag of task.tags) {
      remainingByTag.set(tag, (remainingByTag.get(tag) ?? 0) + 1);
    }
  }
  return { remainingByProject, remainingByTag, remainingInProjects, remainingTagged };
}

export function splitProjectPath(fullName: string): { folder?: string; name: string } {
  const index = fullName.lastIndexOf(" : ");
  if (index <= 0) return { name: fullName };
  return { folder: fullName.slice(0, index), name: fullName.slice(index + 3) };
}

export function hydrateProjectFolder(project: Project): Project {
  if (project.folder) return project;
  const split = splitProjectPath(project.name);
  if (!split.folder) return project;
  return { ...project, folder: split.folder, name: split.name };
}

export function projectFolder(project: Project): string | undefined {
  return hydrateProjectFolder(project).folder;
}

export function projectDisplayName(project: Project): string {
  return hydrateProjectFolder(project).name;
}

export type FolderNode = {
  name: string;
  path: string;
  projects: Project[];
  children: FolderNode[];
};

export function buildFolderTree(projects: Project[], extraFolders: string[] = []): { ungrouped: Project[]; roots: FolderNode[] } {
  const ungrouped: Project[] = [];
  const byPath = new Map<string, FolderNode>();
  const ensure = (path: string): FolderNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const parts = path.split(" : ");
    const node: FolderNode = { name: parts[parts.length - 1] ?? path, path, projects: [], children: [] };
    byPath.set(path, node);
    if (parts.length > 1) ensure(parts.slice(0, -1).join(" : ")).children.push(node);
    return node;
  };
  for (const folder of extraFolders) {
    if (folder.trim()) ensure(folder.trim());
  }
  for (const project of projects) {
    const hydrated = hydrateProjectFolder(project);
    if (!hydrated.folder) {
      ungrouped.push(hydrated);
      continue;
    }
    ensure(hydrated.folder).projects.push(hydrated);
  }
  const roots = [...byPath.values()].filter((node) => !node.path.includes(" : ") || !byPath.has(node.path.slice(0, node.path.lastIndexOf(" : "))));
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return { ungrouped, roots };
}

export function projectInFolder(project: Project, folderPath: string) {
  const folder = projectFolder(project);
  return folder === folderPath || !!folder?.startsWith(`${folderPath} : `);
}

export function skipReviewTimestamp(project: Project, now = new Date()) {
  return addDays(startOfLocalDay(now), 1 - project.reviewIntervalDays).toISOString();
}

export function renameTag(tasks: Task[], from: string, to: string) {
  const nextName = to.trim();
  if (!nextName || from.toLowerCase() === nextName.toLowerCase()) {
    return tasks.map((task) => ({ ...task, tags: task.tags.filter((tag) => tag.toLowerCase() !== from.toLowerCase() || tag === nextName) }));
  }
  return tasks.map((task) => {
    if (!task.tags.some((tag) => tag.toLowerCase() === from.toLowerCase())) return task;
    const tags = task.tags.map((tag) => tag.toLowerCase() === from.toLowerCase() ? nextName : tag);
    return { ...task, tags: [...new Set(tags)] };
  });
}

export function convertActionToProject(tasks: Task[], projects: Project[], actionId: string, color: string) {
  const action = tasks.find((task) => task.id === actionId);
  if (!action) return null;
  const parentProject = action.projectId ? projects.find((project) => project.id === action.projectId) : undefined;
  const kids = descendantsOf(actionId, tasks);
  const project: Project = {
    id: makeId("project"),
    name: action.title.trim() || "New Project",
    note: action.note ?? "",
    color,
    reviewIntervalDays: 7,
    folder: parentProject ? projectFolder(parentProject) : undefined,
  };
  const descendantIds = new Set(kids.map((task) => task.id));
  const nextTasks = tasks
    .filter((task) => task.id !== actionId)
    .map((task) => {
      if (task.parentId === actionId) return { ...task, parentId: null, projectId: project.id };
      if (descendantIds.has(task.id)) return { ...task, projectId: project.id };
      return task;
    });
  return { tasks: nextTasks, projects: [...projects, project], project };
}
