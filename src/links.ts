import { formatDueLabel, parseDueLabel } from "./dates.ts";
import { makeId, type Project, type TagRecord, type Task } from "./model.ts";
import { matchPastedProject, parseEstimateTag, pasteTaskPaper, projectInFolder } from "./outline.ts";
import { findTagRecord } from "./tags.ts";

export type OmniCloneOpenUrl = { kind: "task"; id: string } | { kind: "perspective"; id: string };

export type OmniCloneAddUrl = {
  kind: "add";
  name: string;
  note?: string;
  due?: string;
  defer?: string;
  flag: boolean;
  project?: string;
  context?: string;
  estimate?: string;
  autosave: boolean;
  xSuccess?: string;
};

export type OmniClonePasteTarget =
  | { type: "inbox" }
  | { type: "projects" }
  | { type: "task"; value: string }
  | { type: "folder"; value: string };

export type OmniClonePasteUrl = {
  kind: "paste";
  target: OmniClonePasteTarget;
  content?: string;
  index?: number;
};

export type OmniCloneUrl = OmniCloneOpenUrl | OmniCloneAddUrl | OmniClonePasteUrl;

export type OmniCloneAddDraft = {
  title: string;
  note?: string;
  due?: string;
  defer?: string;
  flagged: boolean;
  projectId: string | null;
  tags: string[];
  estimatedMinutes?: number;
};

function queryValue(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) return value;
  }
  return null;
}

function parseBooleanParam(raw: string | null) {
  if (raw === null) return false;
  const value = raw.trim().toLowerCase();
  if (!value) return true;
  return value === "true" || value === "1" || value === "yes";
}

function parseOptionalNumber(raw: string | null) {
  if (raw === null || !raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function decodePathSegment(raw: string) {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function canonicalizeOmniCloneHref(raw: string) {
  const value = String(raw ?? "").trim();
  if (/^omniclone:/i.test(value)) return value.replace(/^(omniclone:\/+)/i, "omniclone:///");
  return value;
}

function pathAndQuery(raw: string): { parts: string[]; params: URLSearchParams } | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("#")) {
    const inner = value.replace(/^#\/?/, "");
    const queryIndex = inner.search(/[?]/);
    const path = queryIndex >= 0 ? inner.slice(0, queryIndex) : inner.split(/[#]/)[0] ?? inner;
    const search = queryIndex >= 0 ? inner.slice(queryIndex + 1) : "";
    return {
      parts: path.split("/").filter(Boolean).map(decodePathSegment),
      params: new URLSearchParams(search),
    };
  }
  if (!/^omniclone:/i.test(value)) return null;
  try {
    const parsed = new URL(canonicalizeOmniCloneHref(value));
    return {
      parts: parsed.pathname.split("/").filter(Boolean).map(decodePathSegment),
      params: parsed.searchParams,
    };
  } catch {
    const stripped = canonicalizeOmniCloneHref(value).replace(/^omniclone:\/+/i, "");
    const queryIndex = stripped.search(/[?]/);
    const path = queryIndex >= 0 ? stripped.slice(0, queryIndex) : stripped.split(/[#]/)[0] ?? stripped;
    const search = queryIndex >= 0 ? stripped.slice(queryIndex + 1) : "";
    return {
      parts: path.split("/").filter(Boolean).map(decodePathSegment),
      params: new URLSearchParams(search),
    };
  }
}

export function parsePasteTarget(raw: string | null | undefined): OmniClonePasteTarget {
  const value = String(raw ?? "").trim();
  if (!value || /^inbox$/i.test(value)) return { type: "inbox" };
  if (/^projects?$/i.test(value)) return { type: "projects" };
  const cleaned = value.replace(/^\/+/, "");
  const slash = cleaned.indexOf("/");
  const kind = (slash >= 0 ? cleaned.slice(0, slash) : cleaned).trim();
  const rest = decodePathSegment(slash >= 0 ? cleaned.slice(slash + 1) : "");
  if (/^task$/i.test(kind) && rest) return { type: "task", value: rest };
  if (/^folder$/i.test(kind) && rest) return { type: "folder", value: rest };
  return { type: "inbox" };
}

export function parseOmniCloneUrl(raw: string): OmniCloneUrl | null {
  const parsed = pathAndQuery(raw);
  if (!parsed) return null;
  const parts = parsed.parts.map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  if ((parts[0] ?? "").toLowerCase() === "x-callback-url") parts.shift();
  if (!parts.length) return null;
  const head = (parts[0] ?? "").toLowerCase();
  const action = head;
  if (action === "add") {
    const name = queryValue(parsed.params, "name") ?? "";
    const note = queryValue(parsed.params, "note") ?? undefined;
    const due = queryValue(parsed.params, "due") ?? undefined;
    const defer = queryValue(parsed.params, "defer") ?? undefined;
    const project = queryValue(parsed.params, "project") ?? undefined;
    const context = queryValue(parsed.params, "context") ?? undefined;
    const estimate = queryValue(parsed.params, "estimate") ?? undefined;
    const xSuccess = queryValue(parsed.params, "x-success") ?? undefined;
    return {
      kind: "add",
      name,
      note: note?.trim() ? note : undefined,
      due: due?.trim() ? due : undefined,
      defer: defer?.trim() ? defer : undefined,
      flag: parseBooleanParam(queryValue(parsed.params, "flag", "flagged")),
      project: project?.trim() ? project : undefined,
      context: context?.trim() ? context : undefined,
      estimate: estimate?.trim() ? estimate : undefined,
      autosave: parseBooleanParam(queryValue(parsed.params, "autosave")),
      xSuccess: xSuccess?.trim() ? xSuccess : undefined,
    };
  }
  if (action === "paste") {
    const content = queryValue(parsed.params, "content");
    return {
      kind: "paste",
      target: parsePasteTarget(queryValue(parsed.params, "target")),
      content: content === null ? undefined : content,
      index: parseOptionalNumber(queryValue(parsed.params, "index")),
    };
  }
  if (head === "task" || head === "perspective") {
    const id = decodePathSegment(parts.slice(1).join("/").split(/[?#]/)[0] ?? "");
    if (!id) return null;
    return { kind: head, id };
  }
  return null;
}

export function resolveOmniCloneOpen(
  raw: string,
  tasks: Array<{ id: string; projectId: string | null }>,
): { kind: "perspective"; id: string } | { kind: "task"; id: string; projectId: string | null } | null {
  const parsed = parseOmniCloneUrl(raw);
  if (!parsed) return null;
  if (parsed.kind === "perspective") return parsed;
  if (parsed.kind !== "task") return null;
  const task = tasks.find((item) => item.id === parsed.id);
  if (!task) return null;
  return { kind: "task", id: task.id, projectId: task.projectId };
}

export function taskUrl(id: string) {
  return `omniclone:///task/${id}`;
}

export function buildXSuccessUrl(successUrl: string, taskId: string) {
  const result = taskUrl(taskId);
  try {
    const parsed = new URL(successUrl);
    parsed.searchParams.set("result", result);
    return parsed.toString();
  } catch {
    const encoded = encodeURIComponent(result);
    if (/[?]/.test(successUrl)) {
      const joiner = /[?&]$/.test(successUrl) ? "" : "&";
      return `${successUrl}${joiner}result=${encoded}`;
    }
    return `${successUrl}?result=${encoded}`;
  }
}

export function formatUrlDate(raw: string | undefined, now = new Date()) {
  if (!raw?.trim()) return undefined;
  const parsed = parseDueLabel(raw, now);
  return parsed ? formatDueLabel(parsed, now) : raw.trim();
}

export function addDraftFromUrl(
  add: OmniCloneAddUrl,
  projects: Project[],
  tagRecords: TagRecord[] = [],
  now = new Date(),
): OmniCloneAddDraft {
  const project = add.project ? matchPastedProject(projects, add.project) : undefined;
  const context = add.context?.trim();
  const tags = context ? [findTagRecord(tagRecords, context)?.name ?? context] : [];
  return {
    title: add.name.trim(),
    note: add.note?.trim() || undefined,
    due: formatUrlDate(add.due, now),
    defer: formatUrlDate(add.defer, now),
    flagged: add.flag,
    projectId: project?.id ?? null,
    tags,
    estimatedMinutes: add.estimate ? parseEstimateTag(add.estimate) : undefined,
  };
}

export function createTaskFromAddUrl(
  add: OmniCloneAddUrl,
  projects: Project[],
  tagRecords: TagRecord[] = [],
  options: { idFactory?: (prefix: string) => string; now?: Date } = {},
): Task {
  const now = options.now ?? new Date();
  const idFactory = options.idFactory ?? makeId;
  const draft = addDraftFromUrl(add, projects, tagRecords, now);
  return {
    id: idFactory("task"),
    title: draft.title,
    projectId: draft.projectId,
    tags: draft.tags,
    due: draft.due,
    defer: draft.defer,
    note: draft.note,
    flagged: draft.flagged,
    completed: false,
    createdAt: now.toISOString(),
    estimatedMinutes: draft.estimatedMinutes,
  };
}

export function applyOmniCloneAdd(
  tasks: Task[],
  projects: Project[],
  add: OmniCloneAddUrl,
  tagRecords: TagRecord[] = [],
  options: { idFactory?: (prefix: string) => string; now?: Date } = {},
): { tasks: Task[]; task: Task } {
  const task = createTaskFromAddUrl(add, projects, tagRecords, options);
  return { tasks: [...tasks, task], task };
}

function matchFolderName(projects: Project[], name: string) {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  const folders = [...new Set(projects.map((project) => project.folder).filter((folder): folder is string => !!folder))];
  return folders.find((folder) => {
    const lower = folder.toLowerCase();
    return lower === needle || lower.endsWith(` : ${needle}`) || lower.split(" : ").pop() === needle;
  });
}

export function resolvePasteDestination(
  target: OmniClonePasteTarget,
  tasks: Task[],
  projects: Project[],
): { fallbackProjectId: string | null; parentId?: string | null } {
  if (target.type === "inbox" || target.type === "projects") return { fallbackProjectId: null };
  if (target.type === "folder") {
    const folder = matchFolderName(projects, target.value);
    const project = folder ? projects.find((item) => projectInFolder(item, folder)) : undefined;
    return { fallbackProjectId: project?.id ?? null };
  }
  const byId = tasks.find((task) => task.id === target.value);
  if (byId) return { fallbackProjectId: byId.projectId, parentId: byId.id };
  const project = matchPastedProject(projects, target.value);
  if (project) return { fallbackProjectId: project.id };
  const needle = target.value.trim().toLowerCase();
  const byName = tasks.find((task) => task.title.trim().toLowerCase() === needle);
  if (byName) return { fallbackProjectId: byName.projectId, parentId: byName.id };
  return { fallbackProjectId: null };
}

export function applyOmniClonePaste(
  tasks: Task[],
  projects: Project[],
  paste: OmniClonePasteUrl,
  options: { idFactory?: (prefix: string) => string; now?: Date; clipboard?: string } = {},
): { tasks: Task[]; created: Task[] } {
  const content = (paste.content?.trim() ? paste.content : options.clipboard ?? "").replace(/^\uFEFF/, "");
  if (!content.trim()) return { tasks, created: [] };
  const destination = resolvePasteDestination(paste.target, tasks, projects);
  return pasteTaskPaper(tasks, projects, content, {
    fallbackProjectId: destination.fallbackProjectId,
    parentId: destination.parentId,
    index: paste.index,
    idFactory: options.idFactory,
    now: options.now,
  });
}

export function documentTitle(label: string, focusName?: string) {
  const head = (focusName ?? "").trim() || label.trim() || "OmniClone";
  return head.includes("OmniClone") ? head : `${head} — OmniClone`;
}

export function attachmentLabelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

export function normalizeAttachmentUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (value.startsWith("/") || value.startsWith(".")) return value;
  return `https://${value}`;
}
