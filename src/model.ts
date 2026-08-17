export type PerspectiveId = "inbox" | "projects" | "tags" | "forecast" | "flagged" | "review";
export type ActivePerspective = PerspectiveId | `custom:${string}`;

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
  perspectiveBarShowsTitles: boolean;
  perspectiveBarVisible: boolean;
  showSidebarCounts: boolean;
  perspectiveBarIds: string[];
  perspectiveShortcuts: Record<string, string>;
  standardAvailability: Record<PerspectiveId, PerspectiveAvailability>;
};

export type PerspectiveAvailability = "available" | "remaining" | "completed" | "all";
export type PerspectiveCombinator = "all" | "any" | "none";
export type PerspectiveStructure = "flexible" | "organized";
export type PerspectiveOrganizeBy = "actions" | "projects";
export type PerspectiveGroupBy = "none" | "project" | "tag" | "flagged" | "due";
export type PerspectiveSortBy = "projects" | "title" | "due" | "flagged" | "added" | "defer";

export type PerspectiveRuleKind =
  | "availability"
  | "flagged"
  | "hasDueDate"
  | "dueToday"
  | "noDueDate"
  | "hasDeferDate"
  | "untagged"
  | "taggedAny"
  | "taggedAll"
  | "inInbox"
  | "containedIn"
  | "matchesSearch";

export type PerspectiveRule = {
  id: string;
  kind: PerspectiveRuleKind;
  enabled?: boolean;
  availability?: PerspectiveAvailability;
  tags?: string[];
  projectIds?: string[];
  search?: string;
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
  color: string;
  note: string;
  reviewIntervalDays: number;
  lastReviewedAt?: string;
};

export type Task = {
  id: string;
  importKey?: string;
  title: string;
  projectId: string | null;
  tags: string[];
  due?: string;
  defer?: string;
  note?: string;
  flagged: boolean;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
};

export type PersistedState = {
  version: 2;
  projects: Project[];
  tasks: Task[];
  customPerspectives: CustomPerspective[];
};

export const palette = {
  purple: "#8b4fc2",
  purpleDark: "#7836b4",
  purpleSoft: "#e4d5ef",
  purpleSelection: "#ded0eb",
  text: "#232126",
  muted: "#77747c",
  line: "#d9d7dc",
  rail: "#f8f7f9",
  sidebar: "#efeff2",
  inspector: "#f6f5f7",
  canvas: "#ffffff",
  danger: "#d94b4b",
  flag: "#e2a13b",
  dueSoon: "#d4a017",
  overdue: "#d94b4b",
};

export const defaultPerspectiveShortcuts: Record<string, string> = {
  inbox: "meta+1",
  projects: "meta+2",
  tags: "meta+3",
  forecast: "meta+4",
  flagged: "meta+5",
  review: "meta+7",
};

export const defaultPerspectiveBarIds = ["inbox", "projects", "tags", "forecast", "flagged", "review"];

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
  perspectiveBarShowsTitles: true,
  perspectiveBarVisible: true,
  showSidebarCounts: true,
  perspectiveBarIds: defaultPerspectiveBarIds,
  perspectiveShortcuts: defaultPerspectiveShortcuts,
  standardAvailability: {
    inbox: "remaining",
    projects: "remaining",
    tags: "remaining",
    forecast: "remaining",
    flagged: "remaining",
    review: "remaining",
  },
};

export const perspectiveIconChoices = [
  "star-four-points-outline",
  "weather-sunny",
  "white-balance-sunny",
  "moon-waning-crescent",
  "briefcase-outline",
  "home-outline",
  "lightning-bolt-outline",
  "heart-outline",
  "target",
  "book-open-page-variant-outline",
  "flag-outline",
  "calendar-month-outline",
  "clock-outline",
  "phone-outline",
  "laptop",
  "cart-outline",
  "airplane",
  "leaf",
  "flower-outline",
  "dumbbell",
  "music-note-outline",
  "lightbulb-outline",
  "hammer-screwdriver",
  "account-outline",
  "email-outline",
  "map-marker-outline",
  "coffee-outline",
  "school-outline",
] as const;

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


export const perspectives: Array<{ id: PerspectiveId; label: string; icon: string }> = [
  { id: "inbox", label: "Inbox", icon: "inbox-arrow-down-outline" },
  { id: "projects", label: "Projects", icon: "folder-multiple-outline" },
  { id: "tags", label: "Tags", icon: "tag-multiple-outline" },
  { id: "forecast", label: "Forecast", icon: "calendar-month-outline" },
  { id: "flagged", label: "Flagged", icon: "flag-outline" },
  { id: "review", label: "Review", icon: "check-decagram-outline" },
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
