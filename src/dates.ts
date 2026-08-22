import { dueTimeHours, type ActivePerspective, type DueTimePreset, type PerspectiveAvailability, type Project, type Task } from "./model.ts";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayShort = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const weekdayLong = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type DueUrgency = "none" | "upcoming" | "dueSoon" | "overdue";
export type ForecastDayKey = "past" | "upcoming" | string;

export type ForecastDay = {
  key: string;
  weekday: string;
  date: number;
  label: string;
  title: string;
};

export function clean(value: unknown) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now = new Date()) {
  return dayKey(now);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds());
}

export function dayDelta(date: Date, now = new Date()) {
  return Math.round((startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()) / 86_400_000);
}

export function parseOmniTimestamp(raw: string): Date | undefined {
  const value = clean(raw);
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] ?? 0),
      Number(match[5] ?? 0),
      Number(match[6] ?? 0),
    );
  }
  const fallback = Date.parse(value);
  if (!Number.isNaN(fallback)) return new Date(fallback);
  return undefined;
}

export function formatClock(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${pad(minutes)} ${period}` : `${hour12}:00 ${period}`;
}

export function dateHasTime(date: Date) {
  return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
}

export function formatDueLabel(date: Date, now = new Date()) {
  const label = relativeDayLabel(date, now);
  return dateHasTime(date) ? `${label}, ${formatClock(date)}` : label;
}

function relativeDayLabel(date: Date, now: Date) {
  const delta = dayDelta(date, now);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  const month = monthNames[date.getMonth()] ?? "";
  return date.getFullYear() === now.getFullYear()
    ? `${month} ${date.getDate()}`
    : `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatOmniFocusDate(raw: string, now = new Date()): string | undefined {
  const value = clean(raw);
  if (!value) return undefined;
  const parsed = parseOmniTimestamp(value);
  if (!parsed) return value;
  return formatDueLabel(parsed, now);
}

export function formatDateLabel(date: Date, now = new Date()) {
  return relativeDayLabel(date, now);
}

export function lastIntervalDays(task: Pick<Task, "due" | "defer">, fallback: number, now = new Date()) {
  const due = parseDueLabel(task.due, now);
  const defer = parseDueLabel(task.defer, now);
  if (due && defer) {
    const days = dayDelta(due, defer);
    if (days > 0) return days;
  }
  return Math.max(1, fallback);
}

const monthIndexByName = Object.fromEntries(
  monthNames.flatMap((name, index) => [
    [name.toLowerCase(), index],
    [name.slice(0, 3).toLowerCase(), index],
  ]),
) as Record<string, number>;

function parseClockParts(hourRaw: string, minuteRaw: string | undefined, periodRaw: string | undefined) {
  let hours = Number(hourRaw);
  const minutes = Number(minuteRaw ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  if (periodRaw) {
    hours = hours % 12;
    if (periodRaw.toUpperCase() === "PM") hours += 12;
  }
  return { hours, minutes };
}

function splitDueDateAndTime(value: string): { datePart: string; hours: number; minutes: number } {
  const withMinutes = value.match(/^(.*?)(?:,?\s+)(\d{1,2}):(\d{2})(?:\s*(AM|PM))\s*$/i);
  if (withMinutes) {
    const clock = parseClockParts(withMinutes[2] ?? "", withMinutes[3], withMinutes[4]);
    if (clock) return { datePart: (withMinutes[1] ?? "").trim(), ...clock };
  }
  const ampm = value.match(/^(.*?)(?:,?\s+)(\d{1,2})\s*(AM|PM)\s*$/i);
  if (ampm) {
    const clock = parseClockParts(ampm[2] ?? "", "0", ampm[3]);
    if (clock) return { datePart: (ampm[1] ?? "").trim(), ...clock };
  }
  const twentyFour = value.match(/^(.*?)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if (twentyFour && !/,\s*\d{4}$/.test(twentyFour[1] ?? "")) {
    const clock = parseClockParts(twentyFour[2] ?? "", twentyFour[3], undefined);
    if (clock) return { datePart: (twentyFour[1] ?? "").trim(), ...clock };
  }
  return { datePart: value, hours: 0, minutes: 0 };
}

export function parseDueLabel(raw: string | undefined, now = new Date()): Date | undefined {
  if (!raw) return undefined;
  const value = clean(raw);
  if (!value) return undefined;

  const split = splitDueDateAndTime(value);
  const hours = split.hours;
  const minutes = split.minutes;
  const datePart = split.datePart;

  if (!datePart) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  }

  const named: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };
  if (datePart.toLowerCase() in named) {
    return addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes), named[datePart.toLowerCase()] ?? 0);
  }

  const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), hours, minutes);
  }

  const monthMatch = datePart.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/i);
  if (monthMatch) {
    const month = monthIndexByName[(monthMatch[1] ?? "").toLowerCase()];
    if (month !== undefined) {
      const year = monthMatch[3] ? Number(monthMatch[3]) : now.getFullYear();
      return new Date(year, month, Number(monthMatch[2]), hours, minutes);
    }
  }

  return parseOmniTimestamp(value);
}

export function dueUrgency(label: string | undefined, now = new Date()): DueUrgency {
  const date = parseDueLabel(label, now);
  if (!date) return "none";
  const delta = dayDelta(date, now);
  if (delta < 0) return "overdue";
  if (delta === 0) return "dueSoon";
  return "upcoming";
}

export function dueDayKey(label: string | undefined, now = new Date()) {
  const date = parseDueLabel(label, now);
  return date ? dayKey(date) : null;
}

export function isDueOnDay(label: string | undefined, key: ForecastDayKey, now = new Date(), weekLength = 7) {
  if (key === "past") return dueUrgency(label, now) === "overdue";
  if (key === "upcoming") {
    const date = parseDueLabel(label, now);
    return !!date && dayDelta(date, now) >= weekLength;
  }
  return dueDayKey(label, now) === key;
}

export function isActionAvailable(task: Pick<Task, "completed" | "defer">, now = new Date()) {
  if (task.completed) return false;
  if (!task.defer) return true;
  const date = parseDueLabel(task.defer, now);
  if (!date) return true;
  return dayDelta(date, now) <= 0;
}

export function matchesAvailability(task: Pick<Task, "completed" | "defer">, availability: PerspectiveAvailability, now = new Date()) {
  if (availability === "all") return true;
  if (availability === "completed") return task.completed;
  if (availability === "available") return isActionAvailable(task, now);
  return !task.completed;
}

export function formatAvailableLabel(defer: string | undefined, now = new Date()) {
  if (!defer) return undefined;
  const date = parseDueLabel(defer, now);
  if (date && dayDelta(date, now) <= 0) return undefined;
  return `Available ${defer}`;
}

export function inspectorTimestamp(iso: string | undefined, now = new Date()) {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const label = relativeDayLabel(date, now);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return hasTime ? `${label}, ${formatClock(date)}` : label;
}

export function weekendDate(now = new Date()) {
  const day = now.getDay();
  if (day === 0 || day === 6) return startOfLocalDay(now);
  return addDays(startOfLocalDay(now), 6 - day);
}

export function duePresetLabel(kind: "today" | "tomorrow" | "weekend" | "nextWeek", now = new Date()) {
  if (kind === "today") return formatDateLabel(now, now);
  if (kind === "tomorrow") return formatDateLabel(addDays(now, 1), now);
  if (kind === "weekend") return formatDateLabel(weekendDate(now), now);
  return formatDateLabel(addDays(now, 7), now);
}

export type CalendarCell = {
  key: string;
  date: Date;
  day: number;
  inMonth: boolean;
};

export function calendarMonth(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      key: dayKey(date),
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

export function dueTimePreset(label: string | undefined, now = new Date()): DueTimePreset | "custom" {
  const date = parseDueLabel(label, now);
  if (!date || !dateHasTime(date)) return "none";
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === dueTimeHours.morning.hours && minutes === dueTimeHours.morning.minutes) return "morning";
  if (hours === dueTimeHours.afternoon.hours && minutes === dueTimeHours.afternoon.minutes) return "afternoon";
  if (hours === dueTimeHours.evening.hours && minutes === dueTimeHours.evening.minutes) return "evening";
  return "custom";
}

export function withTimeOnLabel(label: string | undefined, hours: number, minutes: number, now = new Date()) {
  const base = parseDueLabel(label, now) ?? startOfLocalDay(now);
  return formatDueLabel(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes), now);
}

export function clearTimeOnLabel(label: string | undefined, now = new Date()) {
  const date = parseDueLabel(label, now);
  if (!date) return label;
  return formatDateLabel(date, now);
}

export function applyDueTimePreset(label: string | undefined, preset: DueTimePreset, now = new Date()) {
  if (preset === "none") return clearTimeOnLabel(label, now);
  const clock = dueTimeHours[preset];
  return withTimeOnLabel(label, clock.hours, clock.minutes, now);
}

export function setCalendarDate(label: string | undefined, next: Date, now = new Date()) {
  const current = parseDueLabel(label, now);
  const hours = current && dateHasTime(current) ? current.getHours() : 0;
  const minutes = current && dateHasTime(current) ? current.getMinutes() : 0;
  return formatDueLabel(new Date(next.getFullYear(), next.getMonth(), next.getDate(), hours, minutes), now);
}

export function outlineDueLabel(label: string | undefined, compact = false, now = new Date()) {
  if (!label) return undefined;
  const date = parseDueLabel(label, now);
  if (!date) return label;
  if (!compact || !dateHasTime(date)) return formatDueLabel(date, now);
  const delta = dayDelta(date, now);
  if (delta === 0) return formatClock(date);
  return formatDueLabel(date, now);
}

export function forecastWeek(now = new Date(), count = 7): ForecastDay[] {
  const start = startOfLocalDay(now);
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(start, index);
    return {
      key: dayKey(date),
      weekday: weekdayShort[date.getDay()] ?? "",
      date: date.getDate(),
      label: `${weekdayShort[date.getDay()]}\n${date.getDate()}`,
      title: `${weekdayLong[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}`,
    };
  });
}

export function forecastSubtitle(day: ForecastDayKey, now = new Date()) {
  if (day === "past") return "Overdue";
  if (day === "upcoming") return "Upcoming";
  const match = forecastWeek(now, 14).find((item) => item.key === day);
  if (match) return match.title;
  const parsed = parseOmniTimestamp(day);
  return parsed ? `${weekdayLong[parsed.getDay()]}, ${monthNames[parsed.getMonth()]} ${parsed.getDate()}` : "Forecast";
}

export function isFlaggedOnForecastToday(task: Pick<Task, "flagged" | "due" | "completed">, day: ForecastDayKey, now = new Date()) {
  return !!task.flagged && !task.due && !task.completed && day === todayKey(now);
}

export function isForecastItem(task: Pick<Task, "flagged" | "due" | "completed">, day: ForecastDayKey, now = new Date()) {
  if (task.completed) return false;
  if (task.due && isDueOnDay(task.due, day, now)) return true;
  return isFlaggedOnForecastToday(task, day, now);
}

export const completionGroupOrder = ["Today", "Yesterday", "This Week", "Last Week", "Older", "Unknown", "Dropped"] as const;
export type CompletionGroup = (typeof completionGroupOrder)[number];

export function completionGroupLabel(iso: string | undefined, now = new Date()): CompletionGroup {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const delta = dayDelta(date, now);
  if (delta === 0) return "Today";
  if (delta === -1) return "Yesterday";
  if (delta > -7) return "This Week";
  if (delta > -14) return "Last Week";
  return "Older";
}

export function completionBucket(task: Pick<Task, "completed" | "completedAt" | "status">, now = new Date()): CompletionGroup {
  if ((task.status ?? "active") === "dropped" && !task.completed) return "Dropped";
  return completionGroupLabel(task.completedAt, now);
}

export function nextReviewDate(project: Project, now = new Date()) {
  if (!project.lastReviewedAt) return startOfLocalDay(now);
  const last = new Date(project.lastReviewedAt);
  if (Number.isNaN(last.getTime())) return startOfLocalDay(now);
  return addDays(startOfLocalDay(last), project.reviewIntervalDays);
}

export function nextReviewLabel(project: Project, now = new Date()) {
  return formatDueLabel(nextReviewDate(project, now), now);
}

export function lastReviewedFromNextReview(project: Project, nextLabel: string | undefined, now = new Date()) {
  const next = parseDueLabel(nextLabel, now);
  if (!next) return project.lastReviewedAt;
  return addDays(startOfLocalDay(next), -project.reviewIntervalDays).toISOString();
}

export function projectDueForReview(project: Project, now = new Date()) {
  return startOfLocalDay(now).getTime() >= startOfLocalDay(nextReviewDate(project, now)).getTime();
}

export function reviewStatusText(project: Project, now = new Date()) {
  if (!project.lastReviewedAt) return `Never reviewed · next ${nextReviewLabel(project, now)} · every ${project.reviewIntervalDays} days`;
  const last = new Date(project.lastReviewedAt);
  if (Number.isNaN(last.getTime())) return `Review every ${project.reviewIntervalDays} days`;
  const ago = Math.max(0, -dayDelta(last, now));
  const lastLabel = ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`;
  return `Last reviewed ${lastLabel} · next ${nextReviewLabel(project, now)} · every ${project.reviewIntervalDays} days`;
}

export type FocusState = {
  focusedProjectIds: string[];
  focusedFolderPaths: string[];
};

export const emptyFocus = (): FocusState => ({ focusedProjectIds: [], focusedFolderPaths: [] });

export function isFocusActive(focus: FocusState) {
  return focus.focusedProjectIds.length > 0 || focus.focusedFolderPaths.length > 0;
}

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function folderMatchesFocus(folder: string | undefined, paths: string[]) {
  if (!folder || !paths.length) return false;
  return paths.some((path) => folder === path || folder.startsWith(`${path} : `));
}

export function focusedTaskProjectIds(projects: Project[], focus: FocusState): Set<string> | null {
  if (!isFocusActive(focus)) return null;
  const ids = new Set(focus.focusedProjectIds);
  if (focus.focusedFolderPaths.length) {
    for (const project of projects) {
      if (folderMatchesFocus(project.folder, focus.focusedFolderPaths)) ids.add(project.id);
    }
  }
  return ids;
}

export function projectMatchesFocus(project: Project, focus: FocusState) {
  if (!isFocusActive(focus)) return true;
  if (focus.focusedProjectIds.includes(project.id)) return true;
  return folderMatchesFocus(project.folder, focus.focusedFolderPaths);
}

export function taskMatchesFocus(task: Pick<Task, "projectId">, projects: Project[], focus: FocusState, projectIds?: Set<string> | null) {
  if (!isFocusActive(focus)) return true;
  const allowed = projectIds === undefined ? focusedTaskProjectIds(projects, focus) : projectIds;
  if (!allowed) return true;
  return !!task.projectId && allowed.has(task.projectId);
}

export function focusLabel(projects: Project[], focus: FocusState) {
  const names = [
    ...focus.focusedFolderPaths,
    ...focus.focusedProjectIds.map((id) => projects.find((project) => project.id === id)?.name).filter((name): name is string => !!name),
  ];
  if (!names.length) return "";
  if (names.length <= 2) return names.join(" & ");
  return `${names.length} items`;
}

export type LocationState = {
  perspective: ActivePerspective;
  projectFilter: string | null;
  tagFilter: string | null;
  folderFilter: string | null;
  forecastDay: ForecastDayKey;
  focusedProjectIds: string[];
  focusedFolderPaths: string[];
};

export function sameLocation(a: LocationState, b: LocationState) {
  return a.perspective === b.perspective
    && a.projectFilter === b.projectFilter
    && a.tagFilter === b.tagFilter
    && a.folderFilter === b.folderFilter
    && a.forecastDay === b.forecastDay
    && sameIdSet(a.focusedProjectIds, b.focusedProjectIds)
    && sameIdSet(a.focusedFolderPaths, b.focusedFolderPaths);
}
