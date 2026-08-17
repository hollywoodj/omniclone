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
  last_reviewed_at TEXT
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
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
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
  status TEXT NOT NULL,
  flagged TEXT NOT NULL,
  due TEXT NOT NULL,
  tag_match TEXT NOT NULL,
  search TEXT NOT NULL DEFAULT '',
  group_by TEXT NOT NULL,
  sort_by TEXT NOT NULL,
  project_ids TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]'
);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("omniclone.db").then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return dbPromise;
}
