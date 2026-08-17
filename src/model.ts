export type PerspectiveId = "inbox" | "projects" | "tags" | "forecast" | "flagged" | "review";
export type ActivePerspective = PerspectiveId | `custom:${string}`;

export type AppSettings = {
  version: 1;
  defaultPerspective: PerspectiveId;
  showCompleted: boolean;
  openInspectorOnSelection: boolean;
  confirmBeforeDelete: boolean;
  rowDensity: "compact" | "comfortable";
  textSize: "small" | "medium" | "large";
  colorDueItems: boolean;
  strikeResolvedItems: boolean;
  perspectiveBarShowsTitles: boolean;
  showSidebarCounts: boolean;
};

export type CustomPerspective = {
  id: string;
  name: string;
  icon: string;
  color: string;
  status: "remaining" | "completed" | "all";
  flagged: "any" | "flagged" | "unflagged";
  due: "any" | "today" | "has-date" | "no-date";
  projectIds: string[];
  tags: string[];
  tagMatch: "any" | "all";
  search: string;
  groupBy: "none" | "project" | "tag";
  sortBy: "created" | "title" | "due";
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
};

export const defaultSettings: AppSettings = {
  version: 1,
  defaultPerspective: "projects",
  showCompleted: true,
  openInspectorOnSelection: true,
  confirmBeforeDelete: true,
  rowDensity: "comfortable",
  textSize: "medium",
  colorDueItems: true,
  strikeResolvedItems: true,
  perspectiveBarShowsTitles: true,
  showSidebarCounts: true,
};

export const seedProjects: Project[] = [
  {
    id: "welcome",
    name: "Welcome to OmniFocus",
    color: "#8f57c8",
    note: "A few ideas to help you get oriented.",
    reviewIntervalDays: 7,
  },
  {
    id: "party",
    name: "Throw a party",
    color: "#2f8de4",
    note: "Everything needed for a relaxed Friday night.",
    reviewIntervalDays: 7,
  },
  {
    id: "garden",
    name: "Spring garden cleanup",
    color: "#58a65c",
    note: "Get the backyard ready for the season.",
    reviewIntervalDays: 14,
  },
];

export const seedTasks: Task[] = [
  { id: "explore", title: "Explore your new OmniFocus database", projectId: "welcome", tags: ["Tutorial"], note: "Select an action to see and edit all of its details in the Inspector.", flagged: false, completed: false, createdAt: "2026-08-15T13:00:00.000Z" },
  { id: "add-actions", title: "Add a few actions of your own", projectId: "welcome", tags: ["Tutorial"], note: "Use New Action in the toolbar, or Quick Entry from anywhere.", flagged: false, completed: false, createdAt: "2026-08-15T13:05:00.000Z" },
  { id: "plan-week", title: "Open Forecast and plan the week", projectId: "welcome", tags: ["Tutorial"], due: "Today", flagged: true, completed: false, createdAt: "2026-08-15T13:10:00.000Z" },
  { id: "cake", title: "Order a cake", projectId: "party", tags: ["Errands"], due: "Today, 5:00 PM", note: "Chocolate with vanilla frosting. Serves 12.", flagged: true, completed: false, createdAt: "2026-08-15T14:00:00.000Z" },
  { id: "ice-cream", title: "Get ice cream", projectId: "party", tags: ["Errands"], due: "Tomorrow", flagged: false, completed: false, createdAt: "2026-08-15T14:10:00.000Z" },
  { id: "playlist", title: "Make a playlist", projectId: "party", tags: ["Mac"], defer: "Today, 7:00 PM", flagged: false, completed: false, createdAt: "2026-08-15T14:20:00.000Z" },
  { id: "invitations", title: "Text invitations to friends", projectId: "party", tags: ["Phone"], flagged: false, completed: true, createdAt: "2026-08-15T14:30:00.000Z" },
  { id: "gate", title: "Repair gate", projectId: "garden", tags: ["Home"], due: "Aug 18", flagged: false, completed: false, createdAt: "2026-08-15T15:00:00.000Z" },
  { id: "sprinklers", title: "Test the sprinkler system", projectId: "garden", tags: ["Home"], due: "Aug 20", flagged: true, completed: false, createdAt: "2026-08-15T15:10:00.000Z" },
  { id: "compost", title: "Pick up compost and mulch", projectId: "garden", tags: ["Errands"], due: "Aug 21", flagged: false, completed: false, createdAt: "2026-08-15T15:20:00.000Z" },
  { id: "herb-bed", title: "Sketch new herb bed", projectId: "garden", tags: ["Home", "Mac"], flagged: false, completed: false, createdAt: "2026-08-15T15:30:00.000Z" },
  { id: "dentist", title: "Book annual dentist appointment", projectId: null, tags: ["Phone"], due: "Aug 22", flagged: false, completed: false, createdAt: "2026-08-15T16:00:00.000Z" },
  { id: "itinerary", title: "Send Maya the revised itinerary", projectId: null, tags: ["Mac"], flagged: true, completed: false, createdAt: "2026-08-15T16:10:00.000Z" },
  { id: "light-bulb", title: "Replace kitchen light bulb", projectId: null, tags: ["Home"], flagged: false, completed: false, createdAt: "2026-08-15T16:20:00.000Z" },
];

export const perspectives: Array<{ id: PerspectiveId; label: string; icon: string }> = [
  { id: "inbox", label: "Inbox", icon: "inbox-arrow-down-outline" },
  { id: "projects", label: "Projects", icon: "folder-multiple-outline" },
  { id: "tags", label: "Tags", icon: "tag-multiple-outline" },
  { id: "forecast", label: "Forecast", icon: "calendar-month-outline" },
  { id: "flagged", label: "Flagged", icon: "flag-outline" },
  { id: "review", label: "Review", icon: "check-decagram-outline" },
];

export const seedCustomPerspectives: CustomPerspective[] = [
  {
    id: "today-focus",
    name: "Today Focus",
    icon: "weather-sunny",
    color: "#d96b46",
    status: "remaining",
    flagged: "any",
    due: "today",
    projectIds: [],
    tags: [],
    tagMatch: "any",
    search: "",
    groupBy: "project",
    sortBy: "due",
  },
];

export function createCustomPerspective(): CustomPerspective {
  return {
    id: makeId("perspective"),
    name: "New Perspective",
    icon: "star-four-points-outline",
    color: palette.purple,
    status: "remaining",
    flagged: "any",
    due: "any",
    projectIds: [],
    tags: [],
    tagMatch: "any",
    search: "",
    groupBy: "project",
    sortBy: "created",
  };
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
