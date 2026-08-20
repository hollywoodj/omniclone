import type { ForecastDayKey } from "../dates.ts";
import { isForecastItem, taskMatchesFocus } from "../dates.ts";
import {
  type ActivePerspective,
  type AppSettings,
  type CustomPerspective,
  type PerspectiveId,
  type Project,
  type TagRecord,
  type Task,
  perspectives,
} from "../model.ts";
import { projectInFolder, projectByIdMap, siblingMap, stalledProjectIds, taskMatchesView, withLingeringTasks } from "../outline.ts";
import { compareTasks, effectiveGroupBy, taskMatchesCustomPerspective } from "../perspectiveRules.ts";
import { mergeTagRecords, taskHasTag } from "../tags.ts";

export type VisibleTaskQuery = {
  tasks: Task[];
  projects: Project[];
  perspective: ActivePerspective;
  projectFilter: string | null;
  tagFilter: string | null;
  folderFilter: string | null;
  forecastDay: ForecastDayKey;
  focusedProjectIds: string[];
  focusedFolderPaths: string[];
  query: string;
  settings: Pick<AppSettings, "showCompleted" | "standardAvailability">;
  customPerspective: CustomPerspective | null;
  pendingCleanupIds: string[];
  tagRecords?: TagRecord[];
};

export function filterVisibleTasks({
  tasks,
  projects,
  perspective,
  projectFilter,
  tagFilter,
  folderFilter,
  forecastDay,
  focusedProjectIds,
  focusedFolderPaths,
  query,
  settings,
  customPerspective,
  pendingCleanupIds,
  tagRecords,
}: VisibleTaskQuery): Task[] {
  let result = [...tasks];
  const lingering = new Set(pendingCleanupIds);
  const records = mergeTagRecords(tagRecords, tasks);
  const matchesTag = (task: Task, tag: string) => taskHasTag(task, tag, records);
  const projectById = projectByIdMap(projects);
  const viewContextFor = (slice: Task[], availability?: string) => ({
    tasks: slice,
    projects,
    tagRecords: records,
    projectById,
    siblings: availability === "available" || availability === "firstAvailable" ? siblingMap(slice) : undefined,
  });
  if (customPerspective) {
    const needsSequence = (customPerspective.rules ?? []).some((rule) => rule.enabled !== false && rule.kind === "availability" && (rule.availability === "available" || rule.availability === "firstAvailable"));
    const needsStalled = (customPerspective.rules ?? []).some((rule) => rule.enabled !== false && rule.kind === "stalled");
    const context = {
      tasks,
      projects,
      tagRecords: records,
      projectById,
      siblings: needsSequence ? siblingMap(tasks) : undefined,
      stalledIds: needsStalled ? stalledProjectIds(projects, tasks) : undefined,
    };
    result = result.filter((task) => taskMatchesCustomPerspective(task, customPerspective, context) || lingering.has(task.id));
    if (projectFilter) result = result.filter((task) => task.projectId === projectFilter);
    if (folderFilter) {
      const allowed = new Set(projects.filter((project) => projectInFolder(project, folderFilter)).map((project) => project.id));
      result = result.filter((task) => task.projectId && allowed.has(task.projectId));
    }
    if (tagFilter) result = result.filter((task) => matchesTag(task, tagFilter));
    result.sort((a, b) => compareTasks(a, b, customPerspective.sortBy));
  } else {
    if (perspective === "inbox") result = result.filter((task) => task.projectId === null || lingering.has(task.id));
    if (perspective === "projects") result = result.filter((task) => task.projectId !== null);
    if (perspective === "forecast") result = result.filter((task) => isForecastItem(task, forecastDay));
    if (perspective === "flagged") result = result.filter((task) => task.flagged);
    if (perspective === "completed") result = result.filter((task) => task.completed || (task.status ?? "active") === "dropped");
    if (projectFilter && perspective === "projects") result = result.filter((task) => task.projectId === projectFilter);
    if (folderFilter && perspective === "projects") {
      const allowed = new Set(projects.filter((project) => projectInFolder(project, folderFilter)).map((project) => project.id));
      result = result.filter((task) => task.projectId && allowed.has(task.projectId));
    }
    if (tagFilter) result = result.filter((task) => matchesTag(task, tagFilter));
    const availability = settings.standardAvailability[perspective as PerspectiveId] ?? (settings.showCompleted ? "all" : "remaining");
    const context = viewContextFor(result, availability);
    result = result.filter((task) => taskMatchesView(task, availability, context) || lingering.has(task.id));
  }
  if (focusedProjectIds.length || focusedFolderPaths.length) {
    result = result.filter((task) => taskMatchesFocus(task, projects, { focusedProjectIds, focusedFolderPaths }));
  }
  if (query.trim()) {
    const needle = query.trim().toLowerCase();
    result = result.filter((task) => `${task.title} ${task.note ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(needle));
  }
  return withLingeringTasks(result, tasks, lingering);
}

export function perspectiveTitle(options: {
  perspective: ActivePerspective;
  customPerspective: CustomPerspective | null;
  projects: Project[];
  projectFilter: string | null;
  folderFilter: string | null;
  tagFilter: string | null;
}): string {
  const { perspective, customPerspective, projects, projectFilter, folderFilter, tagFilter } = options;
  if (customPerspective?.name) return customPerspective.name;
  if (projectFilter && perspective === "projects") {
    return projects.find((project) => project.id === projectFilter)?.name ?? "Projects";
  }
  if (folderFilter && perspective === "projects") return folderFilter;
  if (tagFilter && perspective === "tags") return tagFilter;
  return perspectives.find((item) => item.id === perspective)?.label ?? "Projects";
}

export function sidebarPerspectiveFor(
  perspective: ActivePerspective,
  customPerspective: CustomPerspective | null,
): PerspectiveId {
  if (customPerspective) {
    if (customPerspective.organizeBy === "projects" || effectiveGroupBy(customPerspective) === "project") return "projects";
    if (effectiveGroupBy(customPerspective) === "tag") return "tags";
    return "projects";
  }
  return perspective.startsWith("custom:") ? "projects" : perspective as PerspectiveId;
}

export function defaultProjectIdFor(options: {
  projectFilter: string | null;
  folderFilter: string | null;
  selectedProjectId?: string;
  projects: Project[];
}): string | null {
  if (options.projectFilter) return options.projectFilter;
  if (options.selectedProjectId) return options.selectedProjectId;
  if (options.folderFilter) {
    return options.projects.find((project) => projectInFolder(project, options.folderFilter!))?.id ?? null;
  }
  return null;
}

export function knownTagsFrom(tasks: Task[], records: TagRecord[] = []): string[] {
  return mergeTagRecords(records, tasks).map((record) => record.name);
}
