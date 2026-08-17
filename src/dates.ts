import type { ActivePerspective, PerspectiveAvailability, Project, Task } from "./model";

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

function clean(value: unknown) {
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

function formatClock(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${pad(minutes)} ${period}` : `${hour12}:00 ${period}`;
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
  const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0 || parsed.getSeconds() !== 0;
  const label = relativeDayLabel(parsed, now);
  return hasTime ? `${label}, ${formatClock(parsed)}` : label;
}

export function formatDateLabel(date: Date, now = new Date()) {
  return relativeDayLabel(date, now);
}

export function parseDueLabel(raw: string | undefined, now = new Date()): Date | undefined {
  if (!raw) return undefined;
  const value = clean(raw);
  if (!value) return undefined;

  const timeMatch = value.match(/,\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let hours = 0;
  let minutes = 0;
  let datePart = value;
  if (timeMatch && timeMatch.index !== undefined) {
    const hour12 = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    const period = (timeMatch[3] ?? "AM").toUpperCase();
    hours = hour12 % 12;
    if (period === "PM") hours += 12;
    datePart = value.slice(0, timeMatch.index).trim();
  }

  const named: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };
  if (datePart.toLowerCase() in named) {
    return addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes), named[datePart.toLowerCase()] ?? 0);
  }

  const monthMatch = datePart.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (monthMatch) {
    const monthToken = monthMatch[1];
    if (!monthToken) return parseOmniTimestamp(value);
    const month = monthNames.findIndex((name) => name.toLowerCase() === monthToken.toLowerCase());
    if (month >= 0) {
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

export const completionGroupOrder = ["Today", "Yesterday", "This Week", "Last Week", "Older", "Unknown"] as const;
export type CompletionGroup = (typeof completionGroupOrder)[number];

export function completionGroupLabel(iso: string | undefined, now = new Date()): CompletionGroup {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const delta = dayDelta(date, now);
  if (delta >= 0) return "Today";
  if (delta === -1) return "Yesterday";
  if (delta > -7) return "This Week";
  if (delta > -14) return "Last Week";
  return "Older";
}

export function projectDueForReview(project: Project, now = new Date()) {
  if (!project.lastReviewedAt) return true;
  const last = new Date(project.lastReviewedAt);
  if (Number.isNaN(last.getTime())) return true;
  const next = addDays(startOfLocalDay(last), project.reviewIntervalDays);
  return startOfLocalDay(now).getTime() >= next.getTime();
}

export function reviewStatusText(project: Project, now = new Date()) {
  if (!project.lastReviewedAt) return `Never reviewed · every ${project.reviewIntervalDays} days`;
  const last = new Date(project.lastReviewedAt);
  if (Number.isNaN(last.getTime())) return `Review every ${project.reviewIntervalDays} days`;
  const ago = Math.max(0, -dayDelta(last, now));
  const lastLabel = ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`;
  return `Last reviewed ${lastLabel} · every ${project.reviewIntervalDays} days`;
}

export type LocationState = {
  perspective: ActivePerspective;
  projectFilter: string | null;
  tagFilter: string | null;
  folderFilter: string | null;
  forecastDay: ForecastDayKey;
  focusedProjectId: string | null;
};

export function sameLocation(a: LocationState, b: LocationState) {
  return a.perspective === b.perspective
    && a.projectFilter === b.projectFilter
    && a.tagFilter === b.tagFilter
    && a.folderFilter === b.folderFilter
    && a.forecastDay === b.forecastDay
    && a.focusedProjectId === b.focusedProjectId;
}
