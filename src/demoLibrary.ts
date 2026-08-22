import type { AppSettings, Project } from "./model";

const color = "#2f8de4";

function project(
  id: string,
  name: string,
  options: Partial<Project> & { folder?: string; sidebarOrder: number },
): Project {
  return {
    id,
    name,
    color,
    note: "",
    reviewIntervalDays: 7,
    type: "parallel",
    status: "active",
    ...options,
  };
}

export const demoProjects: Project[] = [
  project("home-move-downstairs", "Move Downstairs", { folder: "Home", sidebarOrder: 0 }),
  project("home-setup-basement", "Set Up Basement", { folder: "Home", sidebarOrder: 1 }),
  project("home-network", "Home Network", { folder: "Home", sidebarOrder: 2, type: "sequential", status: "onHold" }),
  project("home-lighting", "Lighting Upgrade", { folder: "Home", sidebarOrder: 3, status: "onHold" }),
  project("home-security", "Security Cameras", { folder: "Home", sidebarOrder: 4, type: "sequential", status: "onHold" }),
  project("home-stay-healthy", "Stay healthy", { folder: "Home : Personal", sidebarOrder: 0, type: "singleActions" }),
  project("home-get-organized", "Get organized", { folder: "Home : Personal", sidebarOrder: 1 }),
  project("musician-pool-party", "Hollywood Pool Party", { folder: "Musician", sidebarOrder: 1 }),
  project("musician-book-gigs", "Book Gigs", { folder: "Musician", sidebarOrder: 2 }),
  project("musician-put-music-out", "Put Music Out", { folder: "Musician", sidebarOrder: 3, status: "onHold" }),
  project("merchant-finances", "Get Finances in Order", { folder: "Merchant", sidebarOrder: 0 }),
  project("merchant-online-store", "Online Store", { folder: "Merchant", sidebarOrder: 1 }),
  project("merchant-acds", "ACDS", { folder: "Merchant", sidebarOrder: 2 }),
  project("garden-irrigation", "Irrigation System", { folder: "Garden", sidebarOrder: 0 }),
  project("garden-birdhouses", "Build Birdhouses", { folder: "Garden", sidebarOrder: 1, type: "sequential" }),
  project("garden-solar", "Set up Solar Panels", { folder: "Garden", sidebarOrder: 2 }),
  project("workshop", "Workshop", { sidebarOrder: 4 }),
  project("adventurer", "Adventurer", { sidebarOrder: 5, type: "sequential" }),
  project("stream", "Stream", { sidebarOrder: 6 }),
  project("maintenance", "Maintenance", { sidebarOrder: 7 }),
  project("miscellaneous", "Miscellaneous", { sidebarOrder: 8, type: "singleActions" }),
  project("untitled", "Untitled Project", { sidebarOrder: 9 }),
];

export const demoExtraFolders = [
  "Home",
  "Home : Personal",
  "Musician",
  "Musician : Hollywood",
  "Merchant",
  "Garden",
];

export const demoFolderSidebarOrders: Record<string, number> = {
  Home: 0,
  Musician: 1,
  Merchant: 2,
  Garden: 3,
  "Home : Personal": 5,
  "Musician : Hollywood": 0,
};

export const demoSettingsPatch: Pick<AppSettings, "extraFolders" | "folderSidebarOrders"> = {
  extraFolders: demoExtraFolders,
  folderSidebarOrders: demoFolderSidebarOrders,
};

export function isDemoLibrary(state: { projects: Project[] }) {
  return state.projects.length > 0 && state.projects.every((project) => project.id.startsWith("home-")
    || project.id.startsWith("musician-")
    || project.id.startsWith("merchant-")
    || project.id.startsWith("garden-")
    || ["workshop", "adventurer", "stream", "maintenance", "miscellaneous", "untitled"].includes(project.id));
}

export function demoLibrary() {
  return {
    version: 2 as const,
    projects: demoProjects,
    tasks: [],
    customPerspectives: [],
    tagRecords: [],
  };
}
