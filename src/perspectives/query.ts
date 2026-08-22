import type { ForecastDayKey } from "../dates.ts";
import { isForecastItem, focusedTaskProjectIds, taskMatchesFocus } from "../dates.ts";
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
import { compareTasks, effectiveGroupBy, taskMatchesCustomPerspective, taskMatchesSearch } from "../perspectiveRules.ts";
import { mergeTagRecords, onHoldTagKeys, tagKey, tagMatchKeys } from "../tags.ts";

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
  const lingering = new Set(pendingCleanupIds);
  const records = mergeTagRecords(tagRecords, tasks);
  const tagKeys = tagFilter ? tagMatchKeys(records, tagFilter) : null;
  const matchesTag = (task: Task) => !!tagKeys && task.tags.some((tag) => tagKeys.has(tagKey(tag)));
  const projectById = projectByIdMap(projects);
  const holdKeys = onHoldTagKeys(records);
  const searchNeedle = query.trim().toLowerCase();
  const matchesSearch = (task: Task) => !searchNeedle || taskMatchesSearch(task, searchNeedle);
  const viewContextFor = (slice: Task[], availability?: string) => ({
    tasks: slice,
    projects,
    tagRecords: records,
    projectById,
    siblings: availability === "available" || availability === "firstAvailable" ? siblingMap(slice) : undefined,
    onHoldTagKeys: availability === "available" || availability === "firstAvailable" ? holdKeys : undefined,
  });
  const keep = (task: Task) => lingering.has(task.id);
  let result: Task[];
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
      onHoldTagKeys: needsSequence ? holdKeys : undefined,
    };
    result = tasks.filter((task) => taskMatchesCustomPerspective(task, customPerspective, context) || keep(task));
    if (projectFilter) result = result.filter((task) => task.projectId === projectFilter || keep(task));
    if (folderFilter) {
      const allowed = new Set(projects.filter((project) => projectInFolder(project, folderFilter)).map((project) => project.id));
      result = result.filter((task) => (task.projectId && allowed.has(task.projectId)) || keep(task));
    }
    if (tagKeys) result = result.filter((task) => matchesTag(task) || keep(task));
    result.sort((a, b) => compareTasks(a, b, customPerspective.sortBy));
  } else {
    result = tasks.filter((task) => {
      if (perspective === "inbox" && task.projectId !== null && !keep(task)) return false;
      if (perspective === "projects" && task.projectId === null && !keep(task)) return false;
      if (perspective === "forecast" && !isForecastItem(task, forecastDay) && !keep(task)) return false;
      if (perspective === "flagged" && !task.flagged && !keep(task)) return false;
      if (perspective === "completed" && !task.completed && (task.status ?? "active") !== "dropped" && !keep(task)) return false;
      if (projectFilter && perspective === "projects" && task.projectId !== projectFilter && !keep(task)) return false;
      if (folderFilter && perspective === "projects") {
        const allowed = new Set(projects.filter((project) => projectInFolder(project, folderFilter)).map((project) => project.id));
        if ((!task.projectId || !allowed.has(task.projectId)) && !keep(task)) return false;
      }
      if (tagKeys && !matchesTag(task) && !keep(task)) return false;
      return true;
    });
    const availability = settings.standardAvailability[perspective as PerspectiveId] ?? (settings.showCompleted ? "all" : "remaining");
    const context = viewContextFor(result, availability);
    result = result.filter((task) => taskMatchesView(task, availability, context) || keep(task));
  }
  if (focusedProjectIds.length || focusedFolderPaths.length) {
    const focusedIds = focusedTaskProjectIds(projects, { focusedProjectIds, focusedFolderPaths });
    result = result.filter((task) => taskMatchesFocus(task, projects, { focusedProjectIds, focusedFolderPaths }, focusedIds) || keep(task));
  }
  if (searchNeedle) result = result.filter((task) => matchesSearch(task) || keep(task));
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
