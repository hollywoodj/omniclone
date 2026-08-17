import { dueDayKey, todayKey } from "./dates.ts";
import { taskMatchesView } from "./outline.ts";
import {
  createCustomPerspective,
  makeId,
  type CustomPerspective,
  type PerspectiveAvailability,
  type PerspectiveGroupBy,
  type PerspectiveRule,
  type PerspectiveRuleKind,
  type PerspectiveSortBy,
  type Project,
  type Task,
} from "./model";

export const ruleKindLabels: Record<PerspectiveRuleKind, string> = {
  availability: "Availability",
  flagged: "Status: Flagged",
  hasDueDate: "Has a due date",
  dueToday: "Has a due date of: Today",
  noDueDate: "Has no due date",
  hasDeferDate: "Has a defer date",
  untagged: "Is untagged",
  taggedAny: "Is tagged with any of…",
  taggedAll: "Is tagged with all of…",
  inInbox: "Is in the Inbox",
  containedIn: "Is contained within project…",
  matchesSearch: "Matches search terms:",
};

export const addableRuleKinds: PerspectiveRuleKind[] = [
  "availability",
  "flagged",
  "hasDueDate",
  "dueToday",
  "noDueDate",
  "hasDeferDate",
  "untagged",
  "taggedAny",
  "taggedAll",
  "inInbox",
  "containedIn",
  "matchesSearch",
];

export function createRule(kind: PerspectiveRuleKind): PerspectiveRule {
  const rule: PerspectiveRule = { id: makeId("rule"), kind, enabled: true };
  if (kind === "availability") rule.availability = "remaining";
  if (kind === "taggedAny" || kind === "taggedAll") rule.tags = [];
  if (kind === "containedIn") rule.projectIds = [];
  if (kind === "matchesSearch") rule.search = "";
  return rule;
}

export function describeRule(rule: PerspectiveRule): string {
  if (rule.kind === "availability") {
    const labels: Record<PerspectiveAvailability, string> = {
      available: "Available",
      remaining: "Remaining",
      completed: "Completed",
      all: "All",
    };
    return `Availability: ${labels[rule.availability ?? "remaining"]}`;
  }
  return ruleKindLabels[rule.kind];
}

function matchRule(task: Task, rule: PerspectiveRule, context?: { tasks: Task[]; projects: Project[] }): boolean {
  switch (rule.kind) {
    case "availability": {
      const availability = rule.availability ?? "remaining";
      return taskMatchesView(task, availability, context ?? { tasks: [task], projects: [] });
    }
    case "flagged":
      return task.flagged;
    case "hasDueDate":
      return !!task.due;
    case "dueToday":
      return dueDayKey(task.due) === todayKey();
    case "noDueDate":
      return !task.due;
    case "hasDeferDate":
      return !!task.defer;
    case "untagged":
      return task.tags.length === 0;
    case "taggedAny":
      if (!rule.tags?.length) return true;
      return rule.tags.some((tag) => task.tags.some((item) => item.toLowerCase() === tag.toLowerCase()));
    case "taggedAll":
      if (!rule.tags?.length) return true;
      return rule.tags.every((tag) => task.tags.some((item) => item.toLowerCase() === tag.toLowerCase()));
    case "inInbox":
      return task.projectId === null;
    case "containedIn":
      if (!rule.projectIds?.length) return true;
      return !!task.projectId && rule.projectIds.includes(task.projectId);
    case "matchesSearch": {
      const needle = rule.search?.trim().toLowerCase() ?? "";
      if (!needle) return true;
      return `${task.title} ${task.note ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(needle);
    }
    default:
      return true;
  }
}

export function taskMatchesCustomPerspective(task: Task, perspective: CustomPerspective, context?: { tasks: Task[]; projects: Project[] }): boolean {
  const rules = (perspective.rules ?? []).filter((rule) => rule.enabled !== false);
  if (!rules.length) return true;
  const results = rules.map((rule) => matchRule(task, rule, context));
  if (perspective.combinator === "any") return results.some(Boolean);
  if (perspective.combinator === "none") return !results.some(Boolean);
  return results.every(Boolean);
}

export function compareTasks(a: Task, b: Task, sortBy: PerspectiveSortBy): number {
  if (sortBy === "title") return a.title.localeCompare(b.title);
  if (sortBy === "due") return (a.due ?? "zzzz").localeCompare(b.due ?? "zzzz");
  if (sortBy === "flagged") return Number(b.flagged) - Number(a.flagged);
  if (sortBy === "defer") return (a.defer ?? "zzzz").localeCompare(b.defer ?? "zzzz");
  if (sortBy === "added") return b.createdAt.localeCompare(a.createdAt);
  return a.createdAt.localeCompare(b.createdAt);
}

export function effectiveGroupBy(perspective: CustomPerspective): PerspectiveGroupBy {
  if (perspective.structure === "flexible") return "none";
  return perspective.groupBy;
}

export function normalizeCustomPerspective(input: Partial<CustomPerspective> & { id: string; name: string }): CustomPerspective {
  const defaults = createCustomPerspective();
  const migrated = migrateLegacyRules(input);
  return {
    ...defaults,
    ...input,
    combinator: input.combinator ?? "all",
    rules: migrated,
    structure: input.structure ?? (input.groupBy && input.groupBy !== "none" ? "organized" : "flexible"),
    organizeBy: input.organizeBy ?? "actions",
    groupBy: (input.groupBy as PerspectiveGroupBy | undefined) ?? "none",
    sortBy: normalizeSort(input.sortBy),
    keepSidebarHidden: input.keepSidebarHidden ?? false,
    icon: input.icon ?? defaults.icon,
    color: input.color ?? defaults.color,
  };
}

function normalizeSort(sortBy: CustomPerspective["sortBy"] | "created" | undefined): PerspectiveSortBy {
  if (sortBy === "created") return "added";
  if (sortBy === "title" || sortBy === "due" || sortBy === "flagged" || sortBy === "added" || sortBy === "defer" || sortBy === "projects") return sortBy;
  return "projects";
}

function migrateLegacyRules(input: Partial<CustomPerspective>): PerspectiveRule[] {
  if (Array.isArray(input.rules) && input.rules.length) {
    return input.rules.map((rule) => ({ ...rule, id: rule.id || makeId("rule") }));
  }

  const rules: PerspectiveRule[] = [];
  const status = input.status ?? "remaining";
  rules.push({ id: makeId("rule"), kind: "availability", availability: status === "all" ? "all" : status === "completed" ? "completed" : "remaining" });
  if (input.flagged === "flagged") rules.push({ id: makeId("rule"), kind: "flagged" });
  if (input.due === "today") rules.push({ id: makeId("rule"), kind: "dueToday" });
  if (input.due === "has-date") rules.push({ id: makeId("rule"), kind: "hasDueDate" });
  if (input.due === "no-date") rules.push({ id: makeId("rule"), kind: "noDueDate" });
  if (input.projectIds?.length) rules.push({ id: makeId("rule"), kind: "containedIn", projectIds: input.projectIds });
  if (input.tags?.length) rules.push({ id: makeId("rule"), kind: input.tagMatch === "all" ? "taggedAll" : "taggedAny", tags: input.tags });
  if (input.search?.trim()) rules.push({ id: makeId("rule"), kind: "matchesSearch", search: input.search });
  return rules;
}

export function duplicateCustomPerspective(perspective: CustomPerspective): CustomPerspective {
  return {
    ...perspective,
    id: makeId("perspective"),
    name: `${perspective.name} Copy`,
    rules: perspective.rules.map((rule) => ({ ...rule, id: makeId("rule"), tags: rule.tags ? [...rule.tags] : undefined, projectIds: rule.projectIds ? [...rule.projectIds] : undefined })),
  };
}
