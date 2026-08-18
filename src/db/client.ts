import * as SQLite from "expo-sqlite";

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  import_key TEXT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  review_interval_days INTEGER NOT NULL DEFAULT 7,
  last_reviewed_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  type TEXT NOT NULL DEFAULT 'parallel',
  folder TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  import_key TEXT,
  title TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  due TEXT,
  defer TEXT,
  note TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  parent_id TEXT,
  sort_order INTEGER,
      estimated_minutes INTEGER,
  repeat TEXT NOT NULL DEFAULT 'none',
  repeat_rule TEXT,
  notifications TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);

CREATE TABLE IF NOT EXISTS custom_perspectives (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'remaining',
  flagged TEXT NOT NULL DEFAULT 'any',
  due TEXT NOT NULL DEFAULT 'any',
  tag_match TEXT NOT NULL DEFAULT 'any',
  search TEXT NOT NULL DEFAULT '',
  group_by TEXT NOT NULL,
  sort_by TEXT NOT NULL,
  project_ids TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  combinator TEXT NOT NULL DEFAULT 'all',
  structure TEXT NOT NULL DEFAULT 'flexible',
  organize_by TEXT NOT NULL DEFAULT 'actions',
  keep_sidebar_hidden INTEGER NOT NULL DEFAULT 0,
  rules TEXT NOT NULL DEFAULT '[]'
);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("omniclone.db").then(async (db) => {
      await db.execAsync(SCHEMA);
      await migrateCustomPerspectives(db);
      await migrateTasks(db);
      await migrateProjects(db);
      await migrateTags(db);
      return db;
    });
  }
  return dbPromise;
}

async function migrateTasks(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(tasks)");
  const names = new Set(columns.map((column) => column.name));
  const add: Array<[string, string]> = [
    ["completed_at", "TEXT"],
    ["parent_id", "TEXT"],
    ["sort_order", "INTEGER"],
    ["estimated_minutes", "INTEGER"],
    ["repeat", "TEXT NOT NULL DEFAULT 'none'"],
    ["repeat_rule", "TEXT"],
    ["notifications", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
  ];
  for (const [name, definition] of add) {
    if (!names.has(name)) await db.execAsync(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
  }
}

async function migrateProjects(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(projects)");
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("status")) await db.execAsync("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (!names.has("type")) await db.execAsync("ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'parallel'");
  if (!names.has("folder")) await db.execAsync("ALTER TABLE projects ADD COLUMN folder TEXT");
}

async function migrateTags(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(tags)");
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("parent")) await db.execAsync("ALTER TABLE tags ADD COLUMN parent TEXT");
  if (!names.has("color")) await db.execAsync("ALTER TABLE tags ADD COLUMN color TEXT");
  if (!names.has("status")) await db.execAsync("ALTER TABLE tags ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

async function migrateCustomPerspectives(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(custom_perspectives)");
  const names = new Set(columns.map((column) => column.name));
  const add: Array<[string, string]> = [
    ["combinator", "TEXT NOT NULL DEFAULT 'all'"],
    ["structure", "TEXT NOT NULL DEFAULT 'flexible'"],
    ["organize_by", "TEXT NOT NULL DEFAULT 'actions'"],
    ["keep_sidebar_hidden", "INTEGER NOT NULL DEFAULT 0"],
    ["rules", "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [name, definition] of add) {
    if (!names.has(name)) {
      await db.execAsync(`ALTER TABLE custom_perspectives ADD COLUMN ${name} ${definition}`);
    }
  }
}
