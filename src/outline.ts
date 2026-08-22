import { addDays, completionBucket, formatDueLabel, isActionAvailable, parseDueLabel, startOfLocalDay } from "./dates.ts";
import { makeId, type PerspectiveAvailability, type Project, type RepeatRule, type RepeatSimple, type RepeatUnit, type TagRecord, type Task } from "./model.ts";
import { taskHasOnHoldTag } from "./tags.ts";

export type ProjectStatus = "active" | "onHold" | "dropped" | "done";
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

export function siblingMap(tasks: Task[]) {
  const index = originalIndex(tasks);
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = siblingKey(task);
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  for (const list of groups.values()) list.sort((a, b) => compareSiblings(a, b, index));
  return groups;
}

export function sortedSiblings(tasks: Task[], parentId: string | null, projectId: string | null, siblings?: Map<string, Task[]>) {
  if (siblings) return siblings.get(`${projectId ?? "inbox"}::${parentId ?? ""}`) ?? [];
  const index = originalIndex(tasks);
  return tasks
    .filter((task) => (task.parentId ?? null) === parentId && task.projectId === projectId)
    .sort((a, b) => compareSiblings(a, b, index));
}

export function tasksByProjectId(tasks: Task[]) {
  const groups = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const list = groups.get(task.projectId);
    if (list) list.push(task);
    else groups.set(task.projectId, [task]);
  }
  return groups;
}

export function tasksByTag(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    for (const tag of task.tags) {
      const list = groups.get(tag);
      if (list) list.push(task);
      else groups.set(tag, [task]);
    }
  }
  return { groups, tags: [...groups.keys()].sort() };
}

export function tasksByDueLabel(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const label = task.due ?? "No Due Date";
    const list = groups.get(label);
    if (list) list.push(task);
    else groups.set(label, [task]);
  }
  return { groups, labels: [...groups.keys()] };
}

export function tasksByFlag(tasks: Task[]) {
  const flagged: Task[] = [];
  const unflagged: Task[] = [];
  for (const task of tasks) (task.flagged ? flagged : unflagged).push(task);
  return { flagged, unflagged };
}

export function tasksByCompletionGroup(tasks: Task[], now = new Date()) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const label = completionBucket(task, now);
    const list = groups.get(label);
    if (list) list.push(task);
    else groups.set(label, [task]);
  }
  return groups;
}

export function projectByIdMap(projects: Project[]) {
  return new Map(projects.map((project) => [project.id, project]));
}

export function childMap(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  const index = originalIndex(tasks);
  for (const task of tasks) {
    if (!task.parentId) continue;
    const list = map.get(task.parentId);
    if (list) list.push(task);
    else map.set(task.parentId, [task]);
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

function visibleGroupKey(projectId: string | null, parentId: string | null) {
  return `${projectId ?? "inbox"}::${parentId ?? ""}`;
}

function visibleSiblingMap(tasks: Task[], ids: Set<string>, index: Map<string, number>) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = visibleGroupKey(task.projectId, visibleParentId(task, ids));
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  for (const list of groups.values()) list.sort((a, b) => compareSiblings(a, b, index));
  return groups;
}

function walkVisible(groups: Map<string, Task[]>, projectId: string | null, parentId: string | null, collapsed: Set<string>, into: Task[]) {
  for (const task of groups.get(visibleGroupKey(projectId, parentId)) ?? []) {
    into.push(task);
    if (!collapsed.has(task.id)) walkVisible(groups, task.projectId, task.id, collapsed, into);
  }
}

export function flattenTasks(tasks: Task[], collapsed: Iterable<string> = []) {
  const hidden = new Set(collapsed);
  const ids = new Set(tasks.map((task) => task.id));
  const index = originalIndex(tasks);
  const groups = visibleSiblingMap(tasks, ids, index);
  const result: Task[] = [];
  const seenProjects = new Set<string | null>();
  for (const task of tasks) {
    const projectId = task.projectId;
    if (seenProjects.has(projectId)) continue;
    seenProjects.add(projectId);
    walkVisible(groups, projectId, null, hidden, result);
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

export type TaskViewContext = {
  tasks: Task[];
  projects: Project[];
  now?: Date;
  tagRecords?: TagRecord[];
  projectById?: Map<string, Project>;
  siblings?: Map<string, Task[]>;
  stalledIds?: Set<string>;
  onHoldTagKeys?: Set<string>;
};

export function projectOf(task: Pick<Task, "projectId">, context: Pick<TaskViewContext, "projects" | "projectById">) {
  if (!task.projectId) return undefined;
  return context.projectById?.get(task.projectId) ?? context.projects.find((item) => item.id === task.projectId);
}

export function isBlockedSequential(task: Task, tasks: Task[], projects: Project[], siblings?: Map<string, Task[]>, projectById?: Map<string, Project>) {
  const project = task.projectId ? (projectById?.get(task.projectId) ?? projects.find((item) => item.id === task.projectId)) : undefined;
  if (!project || (project.type ?? "parallel") !== "sequential" || task.completed) return false;
  const firstRemaining = sortedSiblings(tasks, task.parentId ?? null, task.projectId, siblings).find((item) => !item.completed && (item.status ?? "active") !== "dropped");
  return !!firstRemaining && firstRemaining.id !== task.id;
}

export function blockedSequentialIds(tasks: Task[], projects: Project[], siblings = siblingMap(tasks), projectById = projectByIdMap(projects)) {
  const blocked = new Set<string>();
  for (const list of siblings.values()) {
    const first = list[0];
    if (!first?.projectId) continue;
    const project = projectById.get(first.projectId);
    if (!project || (project.type ?? "parallel") !== "sequential") continue;
    const firstRemaining = list.find((item) => !item.completed && (item.status ?? "active") !== "dropped");
    if (!firstRemaining) continue;
    for (const item of list) {
      if (!item.completed && item.id !== firstRemaining.id) blocked.add(item.id);
    }
  }
  return blocked;
}

export function isFirstAvailable(task: Task, tasks: Task[], projects: Project[], now?: Date, context?: TaskViewContext): boolean {
  const view = context ?? { tasks, projects, now };
  if (!taskMatchesView(task, "available", view)) return false;
  const first = sortedSiblings(tasks, task.parentId ?? null, task.projectId, view.siblings).find((item) => (
    taskMatchesView(item, "available", view)
  ));
  return first?.id === task.id;
}

export function taskMatchesView(
  task: Task,
  availability: PerspectiveAvailability,
  context: TaskViewContext,
): boolean {
  const project = projectOf(task, context);
  const projectStatus = project?.status ?? "active";
  const actionStatus = task.status ?? "active";
  if (availability === "all") return true;
  if (availability === "completed") return task.completed || actionStatus === "dropped" || projectStatus === "dropped" || projectStatus === "done";
  if (task.completed || actionStatus === "dropped" || projectStatus === "dropped" || projectStatus === "done") return false;
  if (availability === "remaining") return true;
  if (projectStatus === "onHold" || actionStatus === "onHold" || taskHasOnHoldTag(task, context.tagRecords, context.onHoldTagKeys)) return false;
  if (!isActionAvailable(task, context.now)) return false;
  if (isBlockedSequential(task, context.tasks, context.projects, context.siblings, context.projectById)) return false;
  if (availability === "firstAvailable") return isFirstAvailable(task, context.tasks, context.projects, context.now, { ...context, now: context.now });
  return true;
}

export function formatEstimate(minutes?: number) {
  if (minutes == null || minutes === 0) return undefined;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function addRepeatInterval(date: Date, every: number, unit: RepeatUnit) {
  const next = new Date(date.getTime());
  if (unit === "day") next.setDate(next.getDate() + every);
  else if (unit === "week") next.setDate(next.getDate() + every * 7);
  else if (unit === "month") {
    const day = next.getDate();
    const targetMonth = next.getMonth() + every;
    const year = next.getFullYear() + Math.floor(targetMonth / 12);
    const month = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(year, month + 1, 0).getDate();
    next.setFullYear(year, month, Math.min(day, lastDay));
  } else {
    const month = next.getMonth();
    const day = next.getDate();
    next.setFullYear(next.getFullYear() + every);
    if (month === 1 && day === 29) {
      const lastDay = new Date(next.getFullYear(), 2, 0).getDate();
      if (day > lastDay) next.setDate(lastDay);
    }
  }
  return next;
}

export function simpleRepeatRule(repeat: RepeatSimple | undefined, from: RepeatRule["from"] = "dueDate"): RepeatRule | undefined {
  if (!repeat || repeat === "none") return undefined;
  return {
    every: 1,
    unit: repeat === "daily" ? "day" : repeat === "weekly" ? "week" : "month",
    from,
    deferAnother: true,
  };
}

export function resolvedRepeatRule(task: Pick<Task, "repeat" | "repeatRule">): RepeatRule | undefined {
  if (task.repeatRule && task.repeatRule.every > 0) return task.repeatRule;
  return simpleRepeatRule(task.repeat);
}

export function simpleFromRepeatRule(rule: RepeatRule | undefined): RepeatSimple {
  if (!rule) return "none";
  if (rule.every === 1 && rule.unit === "day") return "daily";
  if (rule.every === 1 && rule.unit === "week") return "weekly";
  if (rule.every === 1 && rule.unit === "month") return "monthly";
  return rule.unit === "week" ? "weekly" : rule.unit === "month" ? "monthly" : "daily";
}

export function shiftDateByRule(label: string | undefined, rule: RepeatRule, now = new Date()) {
  if (!label) return undefined;
  const date = parseDueLabel(label, now);
  if (!date) return label;
  return formatDueLabel(addRepeatInterval(date, rule.every, rule.unit), now);
}

export function applyRepeat(task: Task, now = new Date()): Partial<Task> | null {
  const rule = resolvedRepeatRule(task);
  if (!rule) return null;
  const dueDate = parseDueLabel(task.due, now);
  const deferDate = parseDueLabel(task.defer, now);
  const base = rule.from === "completionDate" ? now : (dueDate ?? now);
  const nextDueDate = addRepeatInterval(new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    dueDate?.getHours() ?? 0,
    dueDate?.getMinutes() ?? 0,
  ), rule.every, rule.unit);
  const nextDue = task.due || rule.from === "completionDate" ? formatDueLabel(nextDueDate, now) : undefined;
  let nextDefer: string | undefined;
  if (rule.deferAnother !== false && dueDate && deferDate && nextDue) {
    const gap = dueDate.getTime() - deferDate.getTime();
    nextDefer = formatDueLabel(new Date(nextDueDate.getTime() - gap), now);
  } else if (rule.deferAnother !== false && task.defer) {
    nextDefer = shiftDateByRule(task.defer, rule, now);
  } else {
    nextDefer = undefined;
  }
  return {
    completed: false,
    completedAt: undefined,
    due: nextDue ?? task.due,
    defer: nextDefer,
    repeat: simpleFromRepeatRule(rule),
    repeatRule: rule,
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
    task.repeat && task.repeat !== "none" ? `@repeat(${task.repeatRule ? `${task.repeatRule.every} ${task.repeatRule.unit}${task.repeatRule.every === 1 ? "" : "s"}` : task.repeat})` : "",
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

export type TaskPaperPasteItem = {
  title: string;
  depth: number;
  projectName?: string;
  tags: string[];
  due?: string;
  defer?: string;
  flagged: boolean;
  completed: boolean;
  note?: string;
  estimatedMinutes?: number;
  repeat?: RepeatSimple;
};

export function splitTagList(value: string) {
  return [...new Set(value.replace(/^\(|\)$/g, "").split(/[,;]+/).map((tag) => tag.trim()).filter(Boolean))];
}

export function taskPaperIndentWidth(whitespace: string) {
  return [...whitespace].reduce((total, character) => total + (character === "\t" ? 4 : 1), 0);
}

export function parseEstimateTag(raw: string) {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(m|h|min|mins|minute|minutes|hour|hours)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = (match[2] ?? "m").toLowerCase();
  return unit.startsWith("h") ? Math.round(amount * 60) : Math.round(amount);
}

function parseRepeatTag(raw: string): RepeatSimple | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "daily" || value === "day" || value === "1 day") return "daily";
  if (value === "weekly" || value === "week" || value === "1 week") return "weekly";
  if (value === "monthly" || value === "month" || value === "1 month") return "monthly";
  if (/^\d+\s*days?/.test(value)) return "daily";
  if (/^\d+\s*weeks?/.test(value)) return "weekly";
  if (/^\d+\s*months?/.test(value)) return "monthly";
  return undefined;
}

export function extractTaskPaperTags(value: string) {
  const parameters: Record<string, string | true> = {};
  const title = value.replace(/\s+@([\w-]+)(?:\(([^)]*)\))?/g, (_match, rawName: string, rawValue: string | undefined) => {
    parameters[rawName.toLowerCase()] = rawValue === undefined ? true : rawValue.trim();
    return "";
  }).trim();
  return { title, parameters };
}

function normalizePastedDate(raw: string | undefined, now: Date) {
  if (!raw) return undefined;
  const parsed = parseDueLabel(raw, now);
  return parsed ? formatDueLabel(parsed, now) : raw;
}

export function parseTaskPaperActions(text: string, now = new Date()): TaskPaperPasteItem[] {
  const items: TaskPaperPasteItem[] = [];
  let currentProject: string | undefined;
  let lastItem: TaskPaperPasteItem | null = null;
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!rawLine.trim()) continue;
    const whitespace = rawLine.match(/^[\t ]*/)?.[0] ?? "";
    const indent = taskPaperIndentWidth(whitespace);
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      const parsed = extractTaskPaperTags(line.slice(2));
      if (!parsed.title) continue;
      const tagsParameter = typeof parsed.parameters.tags === "string" ? parsed.parameters.tags : "";
      const contextParameter = typeof parsed.parameters.context === "string" ? parsed.parameters.context : "";
      const estimate = typeof parsed.parameters.estimate === "string" ? parseEstimateTag(parsed.parameters.estimate) : undefined;
      const duration = typeof parsed.parameters.duration === "string" ? parseEstimateTag(parsed.parameters.duration) : undefined;
      const repeatRaw = typeof parsed.parameters.repeat === "string" ? parsed.parameters.repeat : undefined;
      const item: TaskPaperPasteItem = {
        title: parsed.title,
        depth: indent,
        projectName: currentProject,
        tags: splitTagList(`${tagsParameter},${contextParameter}`),
        due: typeof parsed.parameters.due === "string" ? normalizePastedDate(parsed.parameters.due, now) : undefined,
        defer: typeof parsed.parameters.defer === "string" ? normalizePastedDate(parsed.parameters.defer, now) : undefined,
        flagged: parsed.parameters.flagged === true || parsed.parameters.flagged === "true",
        completed: "done" in parsed.parameters,
        estimatedMinutes: estimate ?? duration,
        repeat: repeatRaw ? parseRepeatTag(repeatRaw) : undefined,
      };
      items.push(item);
      lastItem = item;
      continue;
    }
    const parsed = extractTaskPaperTags(line);
    if (parsed.title.endsWith(":")) {
      const name = parsed.title.slice(0, -1).trim();
      if (name) currentProject = name;
      lastItem = null;
      continue;
    }
    if (lastItem) lastItem.note = [lastItem.note, line].filter(Boolean).join("\n");
  }
  if (!items.length) return items;
  const minDepth = Math.min(...items.map((item) => item.depth));
  const uniqueDepths = [...new Set(items.map((item) => item.depth))].sort((a, b) => a - b);
  return items.map((item) => ({
    ...item,
    depth: Math.max(0, uniqueDepths.indexOf(item.depth) === -1 ? item.depth - minDepth : uniqueDepths.indexOf(item.depth)),
  }));
}

export function looksLikeTaskPaper(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /(?:^|\n)\s*-\s+\S/.test(trimmed) || /(?:^|\n).+:\s*(?:$|\n)/.test(trimmed);
}

export function matchPastedProject(projects: Project[], name: string | undefined) {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  return projects.find((project) => {
    const display = projectDisplayName(project).toLowerCase();
    const full = (project.folder ? `${project.folder} : ${project.name}` : project.name).toLowerCase();
    return display === needle || full === needle || project.name.toLowerCase() === needle;
  });
}

function insertionSortBase(tasks: Task[], parentId: string | null, projectId: string | null, index: number | undefined, after?: Task) {
  if (index === undefined || Number.isNaN(index)) {
    return after ? (after.sortOrder ?? 0) : tasks.length;
  }
  const siblings = sortedSiblings(tasks, parentId, projectId);
  if (!siblings.length) return 0;
  const at = index < 0 ? siblings.length + index : index;
  const clamped = Math.max(0, Math.min(siblings.length, at));
  if (clamped <= 0) return (siblings[0]?.sortOrder ?? 0) - 1;
  if (clamped >= siblings.length) return siblings[siblings.length - 1]?.sortOrder ?? siblings.length;
  const prev = siblings[clamped - 1]?.sortOrder ?? clamped - 1;
  const next = siblings[clamped]?.sortOrder ?? prev + 1;
  return (prev + next) / 2 - 0.5;
}

export function pasteTaskPaper(
  tasks: Task[],
  projects: Project[],
  text: string,
  options: {
    afterId?: string | null;
    parentId?: string | null;
    fallbackProjectId: string | null;
    index?: number;
    idFactory?: (prefix: string) => string;
    now?: Date;
  },
): { tasks: Task[]; created: Task[] } {
  const now = options.now ?? new Date();
  const idFactory = options.idFactory ?? makeId;
  const items = parseTaskPaperActions(text, now);
  if (!items.length) {
    const title = text.trim();
    if (!title) return { tasks, created: [] };
    items.push({ title, depth: 0, tags: [], flagged: false, completed: false });
  }
  const forcedParent = options.parentId ? tasks.find((task) => task.id === options.parentId) : undefined;
  const after = options.afterId ? tasks.find((task) => task.id === options.afterId) : undefined;
  const created: Task[] = [];
  const stack: Array<{ depth: number; id: string }> = [];
  const next = tasks.map((task) => ({ ...task }));
  const topParentId = forcedParent?.id ?? after?.parentId ?? null;
  const topProjectId = forcedParent?.projectId ?? after?.projectId ?? options.fallbackProjectId;
  let sortBase = insertionSortBase(next, topParentId, topProjectId, options.index, after);
  for (const item of items) {
    while (stack.length && (stack[stack.length - 1]?.depth ?? 0) >= item.depth) stack.pop();
    const parent = stack[stack.length - 1];
    const matchedProject = matchPastedProject(projects, item.projectName);
    const projectId = parent
      ? (created.find((task) => task.id === parent.id)?.projectId ?? forcedParent?.projectId ?? after?.projectId ?? options.fallbackProjectId)
      : (forcedParent?.projectId ?? matchedProject?.id ?? after?.projectId ?? options.fallbackProjectId);
    const task: Task = {
      id: idFactory("task"),
      title: item.title,
      projectId,
      parentId: parent?.id ?? (item.depth === 0 ? forcedParent?.id ?? after?.parentId ?? null : null),
      sortOrder: (sortBase += 0.5),
      tags: item.tags,
      due: item.due,
      defer: item.defer,
      note: item.note,
      flagged: item.flagged,
      completed: item.completed,
      completedAt: item.completed ? now.toISOString() : undefined,
      createdAt: now.toISOString(),
      estimatedMinutes: item.estimatedMinutes,
      repeat: item.repeat ?? "none",
      repeatRule: simpleRepeatRule(item.repeat),
    };
    created.push(task);
    next.push(task);
    stack.push({ depth: item.depth, id: task.id });
  }
  return { tasks: reindexSiblings(next), created };
}

export function idsWithDescendants(tasks: Task[], ids: string[]) {
  return [...new Set([...ids, ...ids.flatMap((id) => descendantsOf(id, tasks).map((task) => task.id))])];
}

export function projectIsStalled(project: Project, tasks: Task[]) {
  if ((project.status ?? "active") !== "active") return false;
  return !tasks.some((task) => task.projectId === project.id && !task.completed && (task.status ?? "active") !== "dropped");
}

export function stalledProjectIds(projects: Project[], tasks: Task[]) {
  const remaining = new Set<string>();
  for (const task of tasks) {
    if (task.projectId && !task.completed && (task.status ?? "active") !== "dropped") remaining.add(task.projectId);
  }
  const stalled = new Set<string>();
  for (const project of projects) {
    if ((project.status ?? "active") === "active" && !remaining.has(project.id)) stalled.add(project.id);
  }
  return stalled;
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
