export function findTypeSelectMatch(
  items: Array<{ id: string; title: string }>,
  query: string,
  orderedIds: string[],
  fromIndex: number,
  direction: 1 | -1 = 1,
): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle || !orderedIds.length) return null;
  const titles = new Map(items.map((item) => [item.id, item.title.toLowerCase()]));
  const count = orderedIds.length;
  const start = ((fromIndex % count) + count) % count;
  const pass = (predicate: (title: string) => boolean) => {
    for (let i = 0; i < count; i++) {
      const index = (start + i * direction + count * 8) % count;
      const id = orderedIds[index];
      if (!id) continue;
      const title = titles.get(id) ?? "";
      if (predicate(title)) return id;
    }
    return null;
  };
  return pass((title) => title.startsWith(needle)) ?? pass((title) => title.includes(needle));
}

export function nextTypeSelectQuery(previous: { query: string; at: number }, key: string, now: number, timeoutMs = 1000) {
  const nextQuery = now - previous.at > timeoutMs ? key : `${previous.query}${key}`;
  return { query: nextQuery, at: now };
}
