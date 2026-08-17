import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDb } from "./db/client";
import { type CustomPerspective, type PersistedState, type Project, type Task } from "./model";
import { normalizeCustomPerspective } from "./perspectiveRules";
import { hydrateProjectFolder } from "./outline.ts";

const LEGACY_STORAGE_KEY = "omniclone.database.v1";

type ProjectRow = {
  id: string;
  import_key: string | null;
  name: string;
  color: string;
  note: string;
  review_interval_days: number;
  last_reviewed_at: string | null;
  status?: string | null;
  type?: string | null;
  folder?: string | null;
};

type TaskRow = {
  id: string;
  import_key: string | null;
  title: string;
  project_id: string | null;
  parent_id?: string | null;
  sort_order?: number | null;
  due: string | null;
  defer: string | null;
  note: string | null;
  flagged: number;
  completed: number;
  completed_at: string | null;
  created_at: string;
  estimated_minutes?: number | null;
  repeat?: string | null;
  status?: string | null;
};

type CustomPerspectiveRow = {
  id: string;
  name: string;
  icon: string;
  color: string;
  status: string;
  flagged: string;
  due: string;
  tag_match: string;
  search: string;
  group_by: string;
  sort_by: string;
  project_ids: string;
  tags: string;
  combinator?: string;
  structure?: string;
  organize_by?: string;
  keep_sidebar_hidden?: number;
  rules?: string;
};

async function migrateLegacyAsyncStorage(): Promise<PersistedState | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: number;
      projects?: Project[];
      tasks?: Task[];
      customPerspectives?: CustomPerspective[];
    };
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) return null;
    const state: PersistedState =
      parsed.version === 2 && Array.isArray(parsed.customPerspectives)
        ? (parsed as PersistedState)
        : { version: 2, projects: parsed.projects, tasks: parsed.tasks, customPerspectives: parsed.customPerspectives ?? [] };
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    return state;
  } catch {
    return null;
  }
}

export async function loadDatabase(): Promise<PersistedState | null> {
  const db = await getDb();

  const projectCount = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM projects");
  const taskCount = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM tasks");
  const isEmpty = (projectCount?.count ?? 0) === 0 && (taskCount?.count ?? 0) === 0;

  if (isEmpty) {
    const legacy = await migrateLegacyAsyncStorage();
    if (!legacy) return null;
    await saveDatabase(legacy);
    return legacy;
  }

  const [projectRows, taskRows, tagRows, perspectiveRows] = await Promise.all([
    db.getAllAsync<ProjectRow>("SELECT * FROM projects"),
    db.getAllAsync<TaskRow>("SELECT * FROM tasks ORDER BY created_at ASC"),
    db.getAllAsync<{ task_id: string; name: string }>(
      "SELECT task_tags.task_id as task_id, tags.name as name FROM task_tags JOIN tags ON tags.id = task_tags.tag_id"
    ),
    db.getAllAsync<CustomPerspectiveRow>("SELECT * FROM custom_perspectives"),
  ]);

  const tagsByTask = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByTask.get(row.task_id) ?? [];
    list.push(row.name);
    tagsByTask.set(row.task_id, list);
  }

  const projects: Project[] = projectRows.map((row) => hydrateProjectFolder({
    id: row.id,
    importKey: row.import_key ?? undefined,
    name: row.name,
    color: row.color,
    note: row.note,
    reviewIntervalDays: row.review_interval_days,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    folder: row.folder || undefined,
    status: row.status === "onHold" || row.status === "dropped" ? row.status : "active",
    type: row.type === "sequential" || row.type === "singleActions" ? row.type : "parallel",
  }));

  const tasks: Task[] = taskRows.map((row) => ({
    id: row.id,
    importKey: row.import_key ?? undefined,
    title: row.title,
    projectId: row.project_id,
    tags: tagsByTask.get(row.id) ?? [],
    due: row.due ?? undefined,
    defer: row.defer ?? undefined,
    note: row.note ?? undefined,
    flagged: !!row.flagged,
    completed: !!row.completed,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order ?? undefined,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    repeat: row.repeat === "daily" || row.repeat === "weekly" || row.repeat === "monthly" ? row.repeat : "none",
    status: row.status === "onHold" || row.status === "dropped" ? row.status : "active",
  }));

  const customPerspectives: CustomPerspective[] = perspectiveRows.map((row) => normalizeCustomPerspective({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    status: row.status as CustomPerspective["status"],
    flagged: row.flagged as CustomPerspective["flagged"],
    due: row.due as CustomPerspective["due"],
    projectIds: JSON.parse(row.project_ids) as string[],
    tags: JSON.parse(row.tags) as string[],
    tagMatch: row.tag_match as CustomPerspective["tagMatch"],
    search: row.search,
    groupBy: row.group_by as CustomPerspective["groupBy"],
    sortBy: row.sort_by as CustomPerspective["sortBy"],
    combinator: (row.combinator as CustomPerspective["combinator"] | undefined) ?? "all",
    structure: (row.structure as CustomPerspective["structure"] | undefined) ?? "flexible",
    organizeBy: (row.organize_by as CustomPerspective["organizeBy"] | undefined) ?? "actions",
    keepSidebarHidden: !!row.keep_sidebar_hidden,
    rules: parseRules(row.rules),
  }));

  return { version: 2, projects, tasks, customPerspectives };
}

export async function saveDatabase(state: PersistedState): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM task_tags");
    await db.runAsync("DELETE FROM tasks");
    await db.runAsync("DELETE FROM projects");
    await db.runAsync("DELETE FROM custom_perspectives");
    await db.runAsync("DELETE FROM tags");

    for (const project of state.projects) {
      await db.runAsync(
        "INSERT INTO projects (id, import_key, name, color, note, review_interval_days, last_reviewed_at, status, type, folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        project.id,
        project.importKey ?? null,
        project.name,
        project.color,
        project.note,
        project.reviewIntervalDays,
        project.lastReviewedAt ?? null,
        project.status ?? "active",
        project.type ?? "parallel",
        project.folder ?? null
      );
    }

    const tagIds = new Map<string, number>();
    const getTagId = async (name: string) => {
      const existing = tagIds.get(name);
      if (existing !== undefined) return existing;
      const result = await db.runAsync("INSERT INTO tags (name) VALUES (?)", name);
      tagIds.set(name, result.lastInsertRowId);
      return result.lastInsertRowId;
    };

    for (const task of state.tasks) {
      await db.runAsync(
        "INSERT INTO tasks (id, import_key, title, project_id, parent_id, sort_order, due, defer, note, flagged, completed, completed_at, created_at, estimated_minutes, repeat, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        task.id,
        task.importKey ?? null,
        task.title,
        task.projectId,
        task.parentId ?? null,
        task.sortOrder ?? null,
        task.due ?? null,
        task.defer ?? null,
        task.note ?? null,
        task.flagged ? 1 : 0,
        task.completed ? 1 : 0,
        task.completedAt ?? null,
        task.createdAt,
        task.estimatedMinutes ?? null,
        task.repeat ?? "none",
        task.status ?? "active"
      );
      for (const tagName of task.tags) {
        const tagId = await getTagId(tagName);
        await db.runAsync("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)", task.id, tagId);
      }
    }

    for (const perspective of state.customPerspectives) {
      const normalized = normalizeCustomPerspective(perspective);
      await db.runAsync(
        "INSERT INTO custom_perspectives (id, name, icon, color, status, flagged, due, tag_match, search, group_by, sort_by, project_ids, tags, combinator, structure, organize_by, keep_sidebar_hidden, rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        normalized.id,
        normalized.name,
        normalized.icon,
        normalized.color,
        "remaining",
        "any",
        "any",
        "any",
        "",
        normalized.groupBy,
        normalized.sortBy,
        JSON.stringify(legacyProjectIds(normalized)),
        JSON.stringify(legacyTags(normalized)),
        normalized.combinator,
        normalized.structure,
        normalized.organizeBy,
        normalized.keepSidebarHidden ? 1 : 0,
        JSON.stringify(normalized.rules)
      );
    }
  });
}

function parseRules(raw: string | undefined): CustomPerspective["rules"] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CustomPerspective["rules"];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function legacyProjectIds(perspective: CustomPerspective): string[] {
  return perspective.rules.find((rule) => rule.kind === "containedIn")?.projectIds ?? [];
}

function legacyTags(perspective: CustomPerspective): string[] {
  return perspective.rules.find((rule) => rule.kind === "taggedAny" || rule.kind === "taggedAll")?.tags ?? [];
}
