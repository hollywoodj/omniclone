import { palette as themePalette, type AppearanceMode } from "./theme.ts";

export type PerspectiveId = "inbox" | "projects" | "tags" | "forecast" | "flagged" | "completed" | "review";
export type ActivePerspective = PerspectiveId | `custom:${string}`;

export type OutlineColumnId = "project" | "tags" | "duration" | "defer" | "due";
export type ToolbarButtonId =
  | "sidebar"
  | "back"
  | "forward"
  | "view"
  | "newAction"
  | "quickEntry"
  | "quickOpen"
  | "focus"
  | "settings"
  | "search"
  | "inspect";

export const outlineColumnOrder: OutlineColumnId[] = ["project", "tags", "duration", "defer", "due"];
export const outlineColumnLabels: Record<OutlineColumnId, string> = {
  project: "Project",
  tags: "Tags",
  duration: "Duration",
  defer: "Defer",
  due: "Due",
};
export const defaultOutlineColumns: OutlineColumnId[] = ["project", "due"];
export const defaultToolbarButtons: ToolbarButtonId[] = [
  "sidebar",
  "back",
  "forward",
  "view",
  "newAction",
  "quickEntry",
  "quickOpen",
  "focus",
  "settings",
  "search",
  "inspect",
];
export const toolbarButtonLabels: Record<ToolbarButtonId, string> = {
  sidebar: "Sidebar",
  back: "Back",
  forward: "Forward",
  view: "View",
  newAction: "New Action",
  quickEntry: "Quick Entry",
  quickOpen: "Quick Open",
  focus: "Focus",
  settings: "Settings",
  search: "Search",
  inspect: "Inspect",
};

export type AppSettings = {
  version: 1;
  defaultPerspective: PerspectiveId;
  showCompleted: boolean;
  openInspectorOnSelection: boolean;
  confirmBeforeDelete: boolean;
  cleanUpImmediately: boolean;
  rowDensity: "compact" | "comfortable";
  textSize: "small" | "medium" | "large";
  colorDueItems: boolean;
  strikeResolvedItems: boolean;
  showNotesInOutline: boolean;
  extraFolders: string[];
  folderSidebarOrders: Record<string, number>;
  perspectiveBarShowsTitles: boolean;
  perspectiveBarVisible: boolean;
  showSidebarCounts: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  perspectiveBarIds: string[];
  perspectiveOrderIds: string[];
  perspectiveShortcuts: Record<string, string>;
  standardAvailability: Record<PerspectiveId, PerspectiveAvailability>;
  outlineColumns: OutlineColumnId[];
  toolbarButtons: ToolbarButtonId[];
  appearance: AppearanceMode;
  awaitReplyDays: number;
};

export function visibleOutlineColumns(columns: OutlineColumnId[] | undefined, hideProject: boolean): OutlineColumnId[] {
  const enabled = new Set(columns?.length ? columns : defaultOutlineColumns);
  return outlineColumnOrder.filter((column) => enabled.has(column) && !(hideProject && column === "project"));
}

export type PerspectiveAvailability = "firstAvailable" | "available" | "remaining" | "completed" | "all";
export type PerspectiveCombinator = "all" | "any" | "none";
export type PerspectiveStructure = "flexible" | "organized";
export type PerspectiveOrganizeBy = "actions" | "projects";
export type PerspectiveGroupBy = "none" | "project" | "tag" | "flagged" | "due";
export type PerspectiveSortBy = "projects" | "title" | "due" | "flagged" | "added" | "defer";

export type PerspectiveRuleKind =
  | "availability"
  | "flagged"
  | "unflagged"
  | "hasDueDate"
  | "dueToday"
  | "noDueDate"
  | "hasDeferDate"
  | "hasDuration"
  | "noDuration"
  | "untagged"
  | "taggedAny"
  | "taggedAll"
  | "inInbox"
  | "containedIn"
  | "projectType"
  | "stalled"
  | "onHold"
  | "dropped"
  | "matchesSearch";

export type PerspectiveRule = {
  id: string;
  kind: PerspectiveRuleKind;
  enabled?: boolean;
  availability?: PerspectiveAvailability;
  tags?: string[];
  projectIds?: string[];
  search?: string;
  projectType?: "parallel" | "sequential" | "singleActions";
};

export type CustomPerspective = {
  id: string;
  name: string;
  icon: string;
  color: string;
  combinator: PerspectiveCombinator;
  rules: PerspectiveRule[];
  structure: PerspectiveStructure;
  organizeBy: PerspectiveOrganizeBy;
  groupBy: PerspectiveGroupBy;
  sortBy: PerspectiveSortBy;
  keepSidebarHidden: boolean;
  status?: "remaining" | "completed" | "all";
  flagged?: "any" | "flagged" | "unflagged";
  due?: "any" | "today" | "has-date" | "no-date";
  projectIds?: string[];
  tags?: string[];
  tagMatch?: "any" | "all";
  search?: string;
};

export type Project = {
  id: string;
  importKey?: string;
  name: string;
  folder?: string;
  color: string;
  note: string;
  reviewIntervalDays: number;
  lastReviewedAt?: string;
  status?: "active" | "onHold" | "dropped" | "done";
  type?: "parallel" | "sequential" | "singleActions";
  completeWithLastAction?: boolean;
  sidebarOrder?: number;
};

export type ActionStatus = "active" | "onHold" | "dropped";
export type TagStatus = "active" | "onHold" | "dropped";
export type RepeatUnit = "day" | "week" | "month" | "year";
export type RepeatFrom = "dueDate" | "completionDate";
export type RepeatSimple = "none" | "daily" | "weekly" | "monthly";
export type NotificationWhen = "atEvent" | "startOfDay" | "15m" | "1h" | "1d" | "2d" | "1w";
export type DueTimePreset = "none" | "morning" | "afternoon" | "evening";

export type RepeatRule = {
  every: number;
  unit: RepeatUnit;
  from: RepeatFrom;
  deferAnother?: boolean;
};

export type TaskNotifications = {
  due: NotificationWhen[];
  defer: NotificationWhen[];
};

export type TagRecord = {
  name: string;
  parent?: string;
  color?: string;
  status?: TagStatus;
};

export type TaskAttachment = {
  id: string;
  label: string;
  url: string;
};

export type Task = {
  id: string;
  importKey?: string;
  title: string;
  projectId: string | null;
  parentId?: string | null;
  sortOrder?: number;
  tags: string[];
  due?: string;
  defer?: string;
  note?: string;
  flagged: boolean;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  estimatedMinutes?: number;
  repeat?: RepeatSimple;
  repeatRule?: RepeatRule;
  notifications?: TaskNotifications;
  attachments?: TaskAttachment[];
  status?: ActionStatus;
};

export type PersistedState = {
  version: 2;
  projects: Project[];
  tasks: Task[];
  customPerspectives: CustomPerspective[];
  tagRecords?: TagRecord[];
};

export const dueTimeHours: Record<Exclude<DueTimePreset, "none">, { hours: number; minutes: number }> = {
  morning: { hours: 9, minutes: 0 },
  afternoon: { hours: 13, minutes: 0 },
  evening: { hours: 17, minutes: 0 },
};

export const defaultTagColor = "#8e8e93";

export const palette = themePalette;

export const defaultPerspectiveShortcuts: Record<string, string> = {
  inbox: "meta+1",
  projects: "meta+2",
  tags: "meta+3",
  forecast: "meta+4",
  flagged: "meta+5",
  completed: "meta+6",
  review: "meta+7",
};

export const defaultPerspectiveBarIds = ["inbox", "projects", "tags", "forecast", "flagged", "completed", "review"];
export const legacyPerspectiveBarIds = ["inbox", "projects", "tags", "forecast", "flagged", "review"];

export const defaultSettings: AppSettings = {
  version: 1,
  defaultPerspective: "projects",
  showCompleted: true,
  openInspectorOnSelection: true,
  confirmBeforeDelete: true,
  cleanUpImmediately: true,
  rowDensity: "comfortable",
  textSize: "medium",
  colorDueItems: true,
  strikeResolvedItems: true,
  showNotesInOutline: false,
  extraFolders: [],
  folderSidebarOrders: {},
  perspectiveBarShowsTitles: true,
  perspectiveBarVisible: true,
  showSidebarCounts: true,
  sidebarWidth: 236,
  inspectorWidth: 316,
  perspectiveBarIds: defaultPerspectiveBarIds,
  perspectiveOrderIds: defaultPerspectiveBarIds,
  perspectiveShortcuts: defaultPerspectiveShortcuts,
  outlineColumns: defaultOutlineColumns,
  toolbarButtons: defaultToolbarButtons,
  appearance: "system",
  awaitReplyDays: 3,
  standardAvailability: {
    inbox: "remaining",
    projects: "remaining",
    tags: "remaining",
    forecast: "remaining",
    flagged: "remaining",
    completed: "completed",
    review: "remaining",
  },
};

export { perspectiveIconChoices } from "./perspectives/iconLibrary.ts";

export const perspectiveColorChoices = [
  "#8b4fc2",
  "#5b6cdb",
  "#2f8de4",
  "#3aa6a0",
  "#58a65c",
  "#7bb661",
  "#f0b429",
  "#f07a3a",
  "#d96b46",
  "#eb4b3f",
  "#d05475",
  "#c44b8a",
  "#8e8e93",
];


export const perspectives: Array<{ id: PerspectiveId; label: string; icon: string; color: string }> = [
  { id: "inbox", label: "Inbox", icon: "inbox-arrow-down-outline", color: "#8b4fc2" },
  { id: "projects", label: "Projects", icon: "circle-multiple", color: "#2f7de1" },
  { id: "tags", label: "Tags", icon: "tag-outline", color: "#9b59b6" },
  { id: "forecast", label: "Forecast", icon: "calendar-month-outline", color: "#e2554a" },
  { id: "flagged", label: "Flagged", icon: "flag", color: "#e8893a" },
  { id: "completed", label: "Completed", icon: "check-circle", color: "#8b4fc2" },
  { id: "review", label: "Review", icon: "coffee-outline", color: "#3b7dd8" },
];

export function createCustomPerspective(): CustomPerspective {
  return {
    id: makeId("perspective"),
    name: "New Perspective",
    icon: "star-four-points-outline",
    color: palette.purple,
    combinator: "all",
    rules: [{ id: makeId("rule"), kind: "availability", availability: "remaining" }],
    structure: "flexible",
    organizeBy: "actions",
    groupBy: "none",
    sortBy: "projects",
    keepSidebarHidden: false,
  };
}

export function customPerspectiveId(id: string): ActivePerspective {
  return `custom:${id}`;
}

export function isCustomPerspectiveId(id: ActivePerspective): id is `custom:${string}` {
  return id.startsWith("custom:");
}

export function parseCustomPerspectiveId(id: ActivePerspective): string | null {
  return isCustomPerspectiveId(id) ? id.slice(7) : null;
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
