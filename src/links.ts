export function parseOmniCloneUrl(raw: string): { kind: "task"; id: string } | { kind: "perspective"; id: string } | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const match = value.match(/^(?:omniclone:\/\/|omniclone:\/?\/?|#\/?)(task|perspective)[/:](.+)$/i);
  if (!match) return null;
  const kind = match[1]?.toLowerCase();
  const id = decodeURIComponent((match[2] ?? "").split(/[?#]/)[0] ?? "").trim();
  if (!id) return null;
  if (kind === "task") return { kind: "task", id };
  if (kind === "perspective") return { kind: "perspective", id };
  return null;
}

export function resolveOmniCloneOpen(
  raw: string,
  tasks: Array<{ id: string; projectId: string | null }>,
): { kind: "perspective"; id: string } | { kind: "task"; id: string; projectId: string | null } | null {
  const parsed = parseOmniCloneUrl(raw);
  if (!parsed) return null;
  if (parsed.kind === "perspective") return parsed;
  const task = tasks.find((item) => item.id === parsed.id);
  if (!task) return null;
  return { kind: "task", id: task.id, projectId: task.projectId };
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
