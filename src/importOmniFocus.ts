import type { Project, Task } from "./model";
import { clean, formatOmniFocusDate, parseOmniTimestamp } from "./dates.ts";
import { extractTaskPaperTags, hydrateProjectFolder, splitProjectPath, splitTagList, taskPaperIndentWidth } from "./outline.ts";

export { formatOmniFocusDate, parseOmniTimestamp } from "./dates.ts";

export type OmniImportFormat = "OmniFocus CSV" | "OmniFocus TaskPaper";

export type OmniImportData = {
  sourceName: string;
  format: OmniImportFormat;
  projects: Project[];
  tasks: Task[];
  extraFolders: string[];
  skipped: number;
  warnings: string[];
};

export type ImportMode = "merge" | "replace";

const importColors = ["#8f57c8", "#2f8de4", "#58a65c", "#dd7c38", "#d65774", "#4b9b91", "#7b77d6"];

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeHeader(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function leafName(value: string) {
  const parts = value.split(/\s*[:/]\s*/).filter(Boolean);
  return parts[parts.length - 1] ?? value;
}

function decodeBytes(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new Error("OmniFocus backup packages are not portable exports. In OmniFocus, export the database as CSV or TaskPaper, then choose that file here.");
  }
  const signature = new TextDecoder("utf-8").decode(bytes.slice(0, 20));
  if (signature.startsWith("SQLite format 3")) {
    throw new Error("This is an OmniFocus database backup. Export it from OmniFocus as CSV or TaskPaper before importing it here.");
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.slice(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.slice(2));
  const sample = bytes.slice(0, Math.min(bytes.length, 200));
  const evenNulls = sample.filter((value, index) => index % 2 === 0 && value === 0).length;
  const oddNulls = sample.filter((value, index) => index % 2 === 1 && value === 0).length;
  if (oddNulls > sample.length / 8) return new TextDecoder("utf-16le").decode(bytes);
  if (evenNulls > sample.length / 8) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function formatDuration(raw: string) {
  const value = clean(raw);
  if (!value || value === "0") return "";
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return `Estimated duration: ${value}`;
  if (minutes < 60) return `Estimated duration: ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `Estimated duration: ${hours} hour${hours === 1 ? "" : "s"}`;
  return `Estimated duration: ${hours}h ${remainder}m`;
}

function joinNotes(...parts: Array<string | undefined>) {
  return parts.map((part) => clean(part)).filter(Boolean).join("\n\n") || undefined;
}

function projectRecord(name: string, index: number, note = "", folder?: string): Project {
  const split = folder ? { folder, name } : splitProjectPath(name);
  const normalized = `${split.folder ? `${split.folder} : ` : ""}${split.name}`.toLowerCase();
  return {
    id: `of-project-${hashText(normalized)}`,
    importKey: `omnifocus:project:${normalized}`,
    name: split.name,
    folder: split.folder,
    color: importColors[index % importColors.length] ?? "#8f57c8",
    note,
    reviewIntervalDays: 7,
  };
}

function projectFullName(project: Project) {
  return project.folder ? `${project.folder} : ${project.name}` : project.name;
}

function folderAncestors(path: string) {
  const parts = path.split(" : ").filter(Boolean);
  const paths: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    paths.push(parts.slice(0, index).join(" : "));
  }
  return paths;
}

function collectFolderPathsFromProjects(projects: Project[]) {
  const paths = new Set<string>();
  for (const project of projects) {
    if (!project.folder) continue;
    paths.add(project.folder);
    for (const ancestor of folderAncestors(project.folder)) paths.add(ancestor);
  }
  return [...paths];
}

export function mergeExtraFolders(current: string[], incoming: string[]) {
  const merged = new Set(current.map((path) => path.trim()).filter(Boolean));
  for (const path of incoming) {
    const trimmed = path.trim();
    if (trimmed) merged.add(trimmed);
  }
  return [...merged];
}

function parentFolderPath(container: string, folderPathByName: Map<string, string>) {
  if (!container) return undefined;
  return folderPathByName.get(container)
    ?? folderPathByName.get(leafName(container).toLowerCase())
    ?? folderPathByName.get(leafName(container))
    ?? container;
}

function registerFolderPath(name: string, container: string | undefined, folderPathByName: Map<string, string>, extraFolders: Set<string>) {
  const parentPath = container ? parentFolderPath(container, folderPathByName) : undefined;
  const path = parentPath && leafName(parentPath).toLowerCase() !== name.toLowerCase()
    ? `${parentPath} : ${name}`
    : name;
  folderPathByName.set(name, path);
  folderPathByName.set(name.toLowerCase(), path);
  folderPathByName.set(leafName(name), path);
  folderPathByName.set(leafName(name).toLowerCase(), path);
  extraFolders.add(path);
  for (const ancestor of folderAncestors(path)) extraFolders.add(ancestor);
  return path;
}

function addProjectAlias(aliases: Map<string, string>, alias: string, id: string) {
  const key = clean(alias).toLowerCase();
  if (key) aliases.set(key, id);
}

function parseOmniCsv(sourceName: string, text: string, now: Date): OmniImportData {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV file does not contain any OmniFocus records.");
  const headerRow = rows[0];
  if (!headerRow) throw new Error("The CSV file does not contain a header row.");
  const headers = headerRow.map(normalizeHeader);
  const value = (row: string[], ...names: string[]) => {
    const index = names.map(normalizeHeader).map((name) => headers.indexOf(name)).find((candidate) => candidate >= 0);
    return index === undefined ? "" : clean(row[index]);
  };
  if (!headers.includes("name") && !headers.includes("title")) {
    throw new Error("This CSV is missing an OmniFocus Name or Title column.");
  }

  const projects: Project[] = [];
  const projectAliases = new Map<string, string>();
  const folderPathByName = new Map<string, string>();
  const extraFolderPaths = new Set<string>();
  const rawTasks: Array<{ row: string[]; projectName: string; inbox: boolean }> = [];
  let skipped = 0;
  let folderCount = 0;
  let droppedCount = 0;
  let onHoldCount = 0;

  const ensureProject = (name: string, note = "") => {
    const normalized = name.toLowerCase();
    const existingId = projectAliases.get(normalized);
    const existing = existingId ? projects.find((project) => project.id === existingId) : undefined;
    if (existing) {
      if (note && !existing.note) existing.note = note;
      return existing;
    }
    const project = projectRecord(name, projects.length, note);
    projects.push(project);
    addProjectAlias(projectAliases, name, project.id);
    addProjectAlias(projectAliases, leafName(name), project.id);
    addProjectAlias(projectAliases, project.name, project.id);
    addProjectAlias(projectAliases, projectFullName(project), project.id);
    return project;
  };

  const body = rows.slice(1);
  for (const row of body) {
    const type = value(row, "Type", "Task Type").toLowerCase();
    const name = value(row, "Name", "Title");
    if (!name) continue;
    if (type.includes("folder")) {
      const container = value(row, "Project", "Project Name", "Container", "Folder");
      registerFolderPath(name, container || undefined, folderPathByName, extraFolderPaths);
      folderCount += 1;
      continue;
    }
    if (type.includes("project")) {
      const container = value(row, "Project", "Project Name", "Container", "Folder");
      const fullName = container && leafName(container).toLowerCase() !== name.toLowerCase()
        ? `${container} : ${name}`
        : name;
      const note = value(row, "Notes", "Note");
      const review = Number(value(row, "Review Interval", "Review", "Repeat Interval"));
      const project = ensureProject(fullName, note);
      if (Number.isFinite(review) && review > 0) project.reviewIntervalDays = review;
      addProjectAlias(projectAliases, name, project.id);
    }
  }

  for (const row of body) {
    const type = value(row, "Type", "Task Type").toLowerCase();
    const name = value(row, "Name", "Title");
    if (!name) {
      skipped += 1;
      continue;
    }
    if (type === "tag" || type === "context" || type === "perspective" || type.includes("folder") || type.includes("project")) {
      if (type === "tag" || type === "context" || type === "perspective") skipped += 1;
      continue;
    }
    const inbox = type === "inbox" || type.includes("inbox item");
    const projectName = inbox ? "" : value(row, "Project", "Project Name", "Container");
    if (projectName) ensureProject(projectName);
    rawTasks.push({ row, projectName, inbox });
  }

  const warnings: string[] = [];
  const importedAt = now.getTime();
  const tasks: Task[] = rawTasks.map(({ row, projectName, inbox }, index) => {
    const title = value(row, "Name", "Title");
    const status = value(row, "Status", "State").toLowerCase();
    const completion = value(row, "Completion Date", "Completed", "Completed Date");
    const completedAt = parseOmniTimestamp(completion);
    const sourceId = value(row, "Task ID", "ID", "Identifier");
    const due = formatOmniFocusDate(value(row, "Due Date", "Due"), now);
    const defer = formatOmniFocusDate(value(row, "Start Date", "Defer Date", "Defer Until", "Defer"), now);
    const addedAt = parseOmniTimestamp(value(row, "Added", "Added Date", "Creation Date", "Created"));
    const note = value(row, "Notes", "Note");
    const duration = formatDuration(value(row, "Duration", "Estimated Duration", "Estimated Time"));
    const tagValues = [...splitTagList(value(row, "Tags")), ...splitTagList(value(row, "Context", "Contexts"))];
    const tags = [...new Set(tagValues)];
    const dropped = status.includes("dropped");
    const onHold = status.includes("hold") || status.includes("on-hold");
    if (dropped) droppedCount += 1;
    if (onHold) onHoldCount += 1;
    const signature = `${projectName}|${title}|${due ?? ""}|${defer ?? ""}|${note}`.toLowerCase();
    const projectId = inbox || !projectName ? null : projectAliases.get(projectName.toLowerCase()) ?? projectAliases.get(leafName(projectName).toLowerCase()) ?? null;
    return {
      id: `of-task-${hashText(sourceId || signature)}`,
      importKey: sourceId ? `omnifocus:task:${sourceId}` : `omnifocus:task:${hashText(signature)}`,
      title,
      projectId,
      tags,
      due,
      defer,
      note: joinNotes(note, duration),
      flagged: /^(1|true|yes|y|flagged|★)$/i.test(value(row, "Flagged", "Flag")),
      completed: !!completedAt || status === "completed" || status === "done" || /\bcompleted?\b/.test(status),
      completedAt: completedAt?.toISOString(),
      createdAt: addedAt?.toISOString() ?? new Date(importedAt + index).toISOString(),
      status: dropped ? "dropped" : onHold ? "onHold" : "active",
    };
  });
  for (const path of collectFolderPathsFromProjects(projects)) extraFolderPaths.add(path);
  const extraFolders = [...extraFolderPaths].sort((a, b) => a.localeCompare(b));
  if (folderCount) warnings.push(`${folderCount} folder${folderCount === 1 ? " was" : "s were"} imported as sidebar folders.`);
  if (droppedCount) warnings.push(`${droppedCount} dropped item${droppedCount === 1 ? " was" : "s were"} kept with Dropped status.`);
  if (onHoldCount) warnings.push(`${onHoldCount} on-hold item${onHoldCount === 1 ? " was" : "s were"} kept with On Hold status.`);
  return { sourceName, format: "OmniFocus CSV", projects, tasks, extraFolders, skipped, warnings };
}

function parseTaskPaper(sourceName: string, text: string, now: Date): OmniImportData {
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const projectAtIndent = new Map<number, Project>();
  const projectByPath = new Map<string, Project>();
  let lastTask: Task | null = null;
  let skipped = 0;
  const importedAt = now.getTime();

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!rawLine.trim()) continue;
    const whitespace = rawLine.match(/^[\t ]*/)?.[0] ?? "";
    const indent = taskPaperIndentWidth(whitespace);
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      const parsed = extractTaskPaperTags(line.slice(2));
      if (!parsed.title) {
        skipped += 1;
        continue;
      }
      const project = [...projectAtIndent.entries()].filter(([level]) => level < indent).sort((a, b) => b[0] - a[0])[0]?.[1] ?? null;
      const tagsParameter = typeof parsed.parameters.tags === "string" ? parsed.parameters.tags : "";
      const contextParameter = typeof parsed.parameters.context === "string" ? parsed.parameters.context : "";
      const tags = splitTagList(`${tagsParameter},${contextParameter}`);
      const due = typeof parsed.parameters.due === "string" ? formatOmniFocusDate(parsed.parameters.due, now) : undefined;
      const defer = typeof parsed.parameters.defer === "string" ? formatOmniFocusDate(parsed.parameters.defer, now) : undefined;
      const duration = typeof parsed.parameters.duration === "string" ? formatDuration(parsed.parameters.duration) : "";
      const signature = `${project?.name ?? ""}|${parsed.title}|${due ?? ""}|${defer ?? ""}`.toLowerCase();
      const task: Task = {
        id: `of-task-${hashText(signature)}`,
        importKey: `omnifocus:task:${hashText(signature)}`,
        title: parsed.title,
        projectId: project?.id ?? null,
        tags,
        due,
        defer,
        note: duration || undefined,
        flagged: parsed.parameters.flagged === true || parsed.parameters.flagged === "true",
        completed: "done" in parsed.parameters,
        completedAt: "done" in parsed.parameters ? new Date(importedAt + tasks.length).toISOString() : undefined,
        createdAt: new Date(importedAt + tasks.length).toISOString(),
      };
      tasks.push(task);
      lastTask = task;
      continue;
    }
    const parsed = extractTaskPaperTags(line);
    if (parsed.title.endsWith(":")) {
      const rawName = parsed.title.slice(0, -1).trim();
      if (!rawName) continue;
      const parent = [...projectAtIndent.entries()].filter(([level]) => level < indent).sort((a, b) => b[0] - a[0])[0]?.[1];
      const parentFullName = parent ? projectFullName(parent) : undefined;
      const name = parentFullName && !rawName.toLowerCase().startsWith(`${parentFullName.toLowerCase()} :`)
        ? `${parentFullName} : ${rawName}`
        : rawName;
      const pathKey = name.toLowerCase();
      const existing = projectByPath.get(pathKey);
      const selected = existing ?? projectRecord(name, projects.length);
      if (!existing) {
        projects.push(selected);
        projectByPath.set(pathKey, selected);
      }
      [...projectAtIndent.keys()].filter((level) => level > indent).forEach((level) => projectAtIndent.delete(level));
      projectAtIndent.set(indent, selected);
      lastTask = null;
      continue;
    }
    if (lastTask && indent > 0) lastTask.note = joinNotes(lastTask.note, line);
    else skipped += 1;
  }
  if (!tasks.length && !projects.length) throw new Error("The TaskPaper file does not contain any projects or actions.");
  const hydrated = projects.map((project) => hydrateProjectFolder(project));
  const used = new Set(tasks.map((task) => task.projectId));
  const folderNames = new Set(hydrated.map((project) => project.folder).filter((folder): folder is string => !!folder));
  const kept = hydrated.filter((project) => used.has(project.id) || !folderNames.has(project.name) || !!project.folder);
  const extraFolders = collectFolderPathsFromProjects(kept);
  return { sourceName, format: "OmniFocus TaskPaper", projects: kept, tasks, extraFolders, skipped, warnings: [] };
}

function looksLikeCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes(",") && /task\s*id|type|name|title|project/i.test(firstLine);
}

export function parseOmniFocusFile(sourceName: string, bytes: Uint8Array, now = new Date()): OmniImportData {
  const lowerName = sourceName.toLowerCase();
  if (lowerName.endsWith(".ofocus") || lowerName.endsWith(".ofocus-backup") || lowerName.includes(".ofocus.")) {
    throw new Error("OmniFocus backup packages cannot be imported directly. Export the old database as CSV (recommended) or TaskPaper first.");
  }
  const text = decodeBytes(bytes);
  if (lowerName.endsWith(".csv") || looksLikeCsv(text)) return parseOmniCsv(sourceName, text, now);
  if (lowerName.endsWith(".taskpaper") || lowerName.endsWith(".txt")) return parseTaskPaper(sourceName, text, now);
  if (/^\s*(?:-|.+:)/m.test(text)) return parseTaskPaper(sourceName, text, now);
  throw new Error("Choose an OmniFocus CSV, TaskPaper, or plain-text TaskPaper export.");
}

function taskSignature(task: Task, projectName: string) {
  return `${projectName}|${task.title}|${task.due ?? ""}|${task.defer ?? ""}`.toLowerCase();
}

export function applyOmniFocusImport(currentProjects: Project[], currentTasks: Task[], imported: OmniImportData, mode: ImportMode) {
  if (mode === "replace") {
    return {
      projects: imported.projects,
      tasks: imported.tasks,
      extraFolders: imported.extraFolders,
      addedProjects: imported.projects.length,
      addedTasks: imported.tasks.length,
      duplicateTasks: 0,
    };
  }
  const projects = [...currentProjects];
  const projectIdMap = new Map<string, string>();
  const projectIds = new Set(projects.map((project) => project.id));
  let addedProjects = 0;
  for (const incoming of imported.projects) {
    const existing = projects.find((project) => project.importKey === incoming.importKey || project.name.toLowerCase() === incoming.name.toLowerCase() || leafName(project.name).toLowerCase() === leafName(incoming.name).toLowerCase());
    if (existing) {
      projectIdMap.set(incoming.id, existing.id);
      if (incoming.note && !existing.note) existing.note = incoming.note;
    } else {
      let id = incoming.id;
      while (projectIds.has(id)) id = `${incoming.id}-${addedProjects + 1}`;
      projectIds.add(id);
      projects.push({ ...incoming, id });
      projectIdMap.set(incoming.id, id);
      addedProjects += 1;
    }
  }
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const existingKeys = new Set(currentTasks.map((task) => task.importKey).filter(Boolean));
  const existingSignatures = new Set(currentTasks.map((task) => taskSignature(task, task.projectId ? projectNameById.get(task.projectId) ?? "" : "")));
  const tasks = [...currentTasks];
  const taskIds = new Set(tasks.map((task) => task.id));
  let addedTasks = 0;
  let duplicateTasks = 0;
  for (const incoming of imported.tasks) {
    const projectId = incoming.projectId ? projectIdMap.get(incoming.projectId) ?? null : null;
    const signature = taskSignature(incoming, projectId ? projectNameById.get(projectId) ?? "" : "");
    if ((incoming.importKey && existingKeys.has(incoming.importKey)) || existingSignatures.has(signature)) {
      duplicateTasks += 1;
      continue;
    }
    let id = incoming.id;
    while (taskIds.has(id)) id = `${incoming.id}-${addedTasks + 1}`;
    taskIds.add(id);
    tasks.push({ ...incoming, id, projectId });
    if (incoming.importKey) existingKeys.add(incoming.importKey);
    existingSignatures.add(signature);
    addedTasks += 1;
  }
  return { projects, tasks, extraFolders: mergeExtraFolders([], imported.extraFolders), addedProjects, addedTasks, duplicateTasks };
}
