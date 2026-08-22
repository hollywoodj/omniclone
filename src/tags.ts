import { defaultTagColor, type TagRecord, type TagStatus, type Task } from "./model.ts";

export type TagNode = {
  name: string;
  path: string;
  record: TagRecord;
  children: TagNode[];
};

export function normalizeTagName(name: string) {
  return name.trim();
}

export function tagKey(name: string) {
  return normalizeTagName(name).toLowerCase();
}

export function mergeTagRecords(records: TagRecord[] | undefined, tasks: Task[]): TagRecord[] {
  const byKey = new Map<string, TagRecord>();
  for (const record of records ?? []) {
    const name = normalizeTagName(record.name);
    if (!name) continue;
    byKey.set(tagKey(name), { ...record, name });
  }
  for (const task of tasks) {
    for (const raw of task.tags) {
      const name = normalizeTagName(raw);
      if (!name || byKey.has(tagKey(name))) continue;
      byKey.set(tagKey(name), { name, status: "active", color: defaultTagColor });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findTagRecord(records: TagRecord[], name: string) {
  const key = tagKey(name);
  return records.find((record) => tagKey(record.name) === key);
}

function childrenByParent(records: TagRecord[]) {
  const map = new Map<string, TagRecord[]>();
  for (const record of records) {
    if (!record.parent) continue;
    const key = tagKey(record.parent);
    const list = map.get(key);
    if (list) list.push(record);
    else map.set(key, [record]);
  }
  return map;
}

export function descendantTagNames(records: TagRecord[], name: string): Set<string> {
  const children = childrenByParent(records);
  const names = new Set<string>();
  const visit = (parent: string) => {
    for (const record of children.get(tagKey(parent)) ?? []) {
      if (names.has(record.name)) continue;
      names.add(record.name);
      visit(record.name);
    }
  };
  visit(name);
  return names;
}

export function tagAndDescendantNames(records: TagRecord[], name: string): Set<string> {
  const names = descendantTagNames(records, name);
  const record = findTagRecord(records, name);
  names.add(record?.name ?? name);
  return names;
}

export function tagMatchKeys(records: TagRecord[], name: string) {
  return new Set([...tagAndDescendantNames(records, name)].map(tagKey));
}

export function taskHasTag(task: Pick<Task, "tags">, name: string, records: TagRecord[] = [], keys?: Set<string>) {
  const allowed = keys ?? tagMatchKeys(records, name);
  return task.tags.some((tag) => allowed.has(tagKey(tag)));
}

export function onHoldTagKeys(records: TagRecord[] = []) {
  const keys = new Set<string>();
  for (const record of records) {
    if ((record.status ?? "active") === "onHold") keys.add(tagKey(record.name));
  }
  return keys;
}

export function taskHasOnHoldTag(task: Pick<Task, "tags">, records: TagRecord[] = [], keys?: Set<string>) {
  if (!task.tags.length) return false;
  const hold = keys ?? onHoldTagKeys(records);
  if (!hold.size) return false;
  return task.tags.some((tag) => hold.has(tagKey(tag)));
}

export function buildTagTree(records: TagRecord[]): TagNode[] {
  const byKey = new Map(records.map((record) => [tagKey(record.name), record]));
  const nodes = new Map<string, TagNode>();
  const ensure = (record: TagRecord): TagNode => {
    const existing = nodes.get(tagKey(record.name));
    if (existing) return existing;
    const node: TagNode = { name: record.name, path: record.name, record, children: [] };
    nodes.set(tagKey(record.name), node);
    return node;
  };
  for (const record of records) ensure(record);
  const roots: TagNode[] = [];
  const rootKeys = new Set<string>();
  for (const record of records) {
    const node = ensure(record);
    const parentName = record.parent?.trim();
    const parent = parentName ? byKey.get(tagKey(parentName)) : undefined;
    if (parent && tagKey(parent.name) !== tagKey(record.name)) {
      let cursor: TagRecord | undefined = parent;
      let cyclic = false;
      while (cursor) {
        if (tagKey(cursor.name) === tagKey(record.name)) {
          cyclic = true;
          break;
        }
        cursor = cursor.parent ? byKey.get(tagKey(cursor.parent)) : undefined;
      }
      if (!cyclic) {
        ensure(parent).children.push(node);
        continue;
      }
    }
    const key = tagKey(record.name);
    if (!rootKeys.has(key)) {
      rootKeys.add(key);
      roots.push(node);
    }
  }
  const sortNodes = (list: TagNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of list) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

export function upsertTagRecord(records: TagRecord[], patch: TagRecord): TagRecord[] {
  const name = normalizeTagName(patch.name);
  if (!name) return records;
  const existing = findTagRecord(records, name);
  if (!existing) return mergeTagRecords([...records, { ...patch, name }], []);
  return records.map((record) => tagKey(record.name) === tagKey(name) ? { ...record, ...patch, name } : record);
}

export function renameTagRecord(records: TagRecord[], from: string, to: string): TagRecord[] {
  const nextName = normalizeTagName(to);
  if (!nextName) return records;
  return records.map((record) => {
    const renamed = tagKey(record.name) === tagKey(from) ? { ...record, name: nextName } : record;
    const parent = renamed.parent && tagKey(renamed.parent) === tagKey(from) ? nextName : renamed.parent;
    return { ...renamed, parent };
  });
}

export function setTagStatus(records: TagRecord[], name: string, status: TagStatus): TagRecord[] {
  return upsertTagRecord(records, { ...(findTagRecord(records, name) ?? { name }), name, status });
}

export function remainingCountsForTagTree(tasks: Task[], records: TagRecord[]) {
  const byKey = new Map(records.map((record) => [tagKey(record.name), record]));
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.completed || (task.status ?? "active") === "dropped") continue;
    const seen = new Set<string>();
    for (const raw of task.tags) {
      let current: string | undefined = raw;
      while (current) {
        const key = tagKey(current);
        if (!key || seen.has(key)) break;
        seen.add(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        current = byKey.get(key)?.parent;
      }
    }
  }
  return counts;
}

export function remainingCountForTagTree(tasks: Task[], name: string, records: TagRecord[]) {
  return remainingCountsForTagTree(tasks, records).get(tagKey(name)) ?? 0;
}
