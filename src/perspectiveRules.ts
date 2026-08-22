import { dueDayKey, todayKey } from "./dates.ts";
import { taskMatchesView, projectIsStalled, type TaskViewContext } from "./outline.ts";
import {
  createCustomPerspective,
  makeId,
  type ActivePerspective,
  type CustomPerspective,
  type PerspectiveAvailability,
  type PerspectiveGroupBy,
  type PerspectiveRule,
  type PerspectiveRuleKind,
  type PerspectiveSortBy,
  type Project,
  type Task,
} from "./model.ts";

export const ruleKindLabels: Record<PerspectiveRuleKind, string> = {
  availability: "Availability",
  flagged: "Status: Flagged",
  unflagged: "Status: Unflagged",
  hasDueDate: "Has a due date",
  dueToday: "Has a due date of: Today",
  noDueDate: "Has no due date",
  hasDeferDate: "Has a defer date",
  hasDuration: "Has an estimated duration",
  noDuration: "Has no estimated duration",
  untagged: "Is untagged",
  taggedAny: "Is tagged with any of…",
  taggedAll: "Is tagged with all of…",
  inInbox: "Is in the Inbox",
  containedIn: "Is contained within project…",
  projectType: "Is contained in a project of type…",
  stalled: "Is in a stalled project",
  onHold: "Status: On Hold",
  dropped: "Status: Dropped",
  matchesSearch: "Matches search terms:",
};

export const addableRuleKinds: PerspectiveRuleKind[] = [
  "availability",
  "flagged",
  "unflagged",
  "hasDueDate",
  "dueToday",
  "noDueDate",
  "hasDeferDate",
  "hasDuration",
  "noDuration",
  "untagged",
  "taggedAny",
  "taggedAll",
  "inInbox",
  "containedIn",
  "projectType",
  "stalled",
  "onHold",
  "dropped",
  "matchesSearch",
];

export function createRule(kind: PerspectiveRuleKind): PerspectiveRule {
  const rule: PerspectiveRule = { id: makeId("rule"), kind, enabled: true };
  if (kind === "availability") rule.availability = "remaining";
  if (kind === "taggedAny" || kind === "taggedAll") rule.tags = [];
  if (kind === "containedIn") rule.projectIds = [];
  if (kind === "projectType") rule.projectType = "parallel";
  if (kind === "matchesSearch") rule.search = "";
  return rule;
}

export function describeRule(rule: PerspectiveRule): string {
  if (rule.kind === "availability") {
    const labels: Record<PerspectiveAvailability, string> = {
      firstAvailable: "First Available",
      available: "Available",
      remaining: "Remaining",
      completed: "Completed",
      all: "All",
    };
    return `Availability: ${labels[rule.availability ?? "remaining"]}`;
  }
  if (rule.kind === "projectType") {
    const labels = { parallel: "Parallel", sequential: "Sequential", singleActions: "Single Actions" };
    return `Project type: ${labels[rule.projectType ?? "parallel"]}`;
  }
  return ruleKindLabels[rule.kind];
}

function matchRule(task: Task, rule: PerspectiveRule, context?: TaskViewContext): boolean {
  switch (rule.kind) {
    case "availability": {
      const availability = rule.availability ?? "remaining";
      return taskMatchesView(task, availability, context ?? { tasks: [task], projects: [] });
    }
    case "flagged":
      return task.flagged;
    case "unflagged":
      return !task.flagged;
    case "hasDueDate":
      return !!task.due;
    case "dueToday":
      return dueDayKey(task.due) === todayKey();
    case "noDueDate":
      return !task.due;
    case "hasDeferDate":
      return !!task.defer;
    case "hasDuration":
      return task.estimatedMinutes != null && task.estimatedMinutes > 0;
    case "noDuration":
      return task.estimatedMinutes == null || task.estimatedMinutes === 0;
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
    case "projectType": {
      const project = task.projectId ? (context?.projectById?.get(task.projectId) ?? context?.projects.find((item) => item.id === task.projectId)) : undefined;
      return (project?.type ?? "parallel") === (rule.projectType ?? "parallel");
    }
    case "stalled": {
      const project = task.projectId ? (context?.projectById?.get(task.projectId) ?? context?.projects.find((item) => item.id === task.projectId)) : undefined;
      if (!project) return false;
      if (context?.stalledIds) return context.stalledIds.has(project.id);
      return !!context && projectIsStalled(project, context.tasks);
    }
    case "onHold": {
      const project = task.projectId ? (context?.projectById?.get(task.projectId) ?? context?.projects.find((item) => item.id === task.projectId)) : undefined;
      return (task.status ?? "active") === "onHold" || (project?.status ?? "active") === "onHold";
    }
    case "dropped": {
      const project = task.projectId ? (context?.projectById?.get(task.projectId) ?? context?.projects.find((item) => item.id === task.projectId)) : undefined;
      return (task.status ?? "active") === "dropped" || (project?.status ?? "active") === "dropped";
    }
    case "matchesSearch": {
      return taskMatchesSearch(task, rule.search ?? "");
    }
    default:
      return true;
  }
}

export function taskMatchesCustomPerspective(task: Task, perspective: CustomPerspective, context?: TaskViewContext): boolean {
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
  if (input.flagged === "unflagged") rules.push({ id: makeId("rule"), kind: "unflagged" });
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

export function taskMatchesSearch(task: Pick<Task, "title" | "note" | "tags">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${task.title} ${task.note ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(needle);
}

function enabledRules(perspective: CustomPerspective | null | undefined) {
  return (perspective?.rules ?? []).filter((rule) => rule.enabled !== false);
}

export function perspectiveActsAsInbox(perspective: ActivePerspective, custom: CustomPerspective | null): boolean {
  if (perspective === "inbox") return true;
  return enabledRules(custom).some((rule) => rule.kind === "inInbox");
}

export function perspectiveActsAsFlagged(perspective: ActivePerspective, custom: CustomPerspective | null): boolean {
  if (perspective === "flagged") return true;
  const rules = enabledRules(custom);
  return rules.some((rule) => rule.kind === "flagged") && !rules.some((rule) => rule.kind === "unflagged");
}

export function perspectiveActsAsCompleted(perspective: ActivePerspective, custom: CustomPerspective | null): boolean {
  if (perspective === "completed") return true;
  return enabledRules(custom).some((rule) => rule.kind === "availability" && rule.availability === "completed");
}

export function perspectiveHidesSidebar(perspective: ActivePerspective, custom: CustomPerspective | null): boolean {
  if (custom?.keepSidebarHidden) return true;
  return perspectiveActsAsInbox(perspective, custom)
    || perspectiveActsAsCompleted(perspective, custom)
    || perspectiveActsAsFlagged(perspective, custom);
}

export function perspectiveGroupsByProject(perspective: ActivePerspective, custom: CustomPerspective | null): boolean {
  if (!custom) return perspective === "projects";
  // TODO: when effectiveGroupBy(custom) === "project", this is also exactly the
  // condition Outline.tsx uses for its own `groupBy === "project"` branch, so a
  // custom perspective grouped by project may satisfy both of Outline's render
  // branches at once and double-render its project groups. Not confirmed reachable
  // through the perspective editor's UI constraints; needs a look. See PROJECTS.md/issue.
  return effectiveGroupBy(custom) === "project" || custom.organizeBy === "projects";
}
