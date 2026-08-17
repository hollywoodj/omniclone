import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  createCustomPerspective,
  defaultSettings,
  makeId,
  palette,
  perspectives,
  type ActivePerspective,
  type AppSettings,
  type CustomPerspective,
  type PerspectiveId,
  type Project,
  type Task,
} from "./src/model";
import { loadDatabase, saveDatabase } from "./src/storage";
import { loadSettings, saveSettings } from "./src/settings";
import { applyOmniFocusImport, parseOmniFocusFile, type ImportMode, type OmniImportData } from "./src/importOmniFocus";
import { isTextInputTarget, matchOmniFocusHotkey, type HotkeyAction } from "./src/hotkeys";
import { ContextMenuProvider } from "./src/contextMenu";
import { MenuBar, type MenuCommand } from "./src/menuBar";
import { ViewOptionsPanel } from "./src/viewOptions";
import { PerspectivesListModal } from "./src/perspectivesList";
import { QuickOpenModal } from "./src/quickOpen";
import { compareTasks, duplicateCustomPerspective, effectiveGroupBy, normalizeCustomPerspective, taskMatchesCustomPerspective } from "./src/perspectiveRules";
import { formatShortcut, toElectronAccelerator } from "./src/shortcuts";
import {
  applyRepeat,
  convertActionToProject,
  descendantsOf,
  flattenTasks,
  indentTasks,
  insertTaskAfter,
  moveSiblings,
  outdentTasks,
  projectInFolder,
  projectIsStalled,
  renameTag,
  skipReviewTimestamp,
  taskMatchesView,
  toTaskPaper,
  withLingeringTasks,
} from "./src/outline";
import {
  dueUrgency,
  forecastWeek,
  isDueOnDay,
  isForecastItem,
  projectDueForReview,
  sameLocation,
  todayKey,
  type ForecastDayKey,
  type LocationState,
} from "./src/dates";
import {
  applyClick,
  applyMarquee,
  applyMove,
  applySelectAll,
  emptySelection,
  neighborAfterDelete,
  outlineTaskIds,
  pruneSelection,
  singleSelection,
  type SelectionModifiers,
  type SelectionState,
} from "./src/selection";
import { appStyles as styles } from "./src/styles/appStyles";
import { Icon } from "./src/components/ui/Icon";
import { TrafficLights } from "./src/components/ui/TrafficLights";
import { ToolbarButton } from "./src/components/ui/ToolbarButton";
import { PaneResizeHandle, clampPane } from "./src/components/ui/PaneResizeHandle";
import { PerspectiveRail } from "./src/components/perspective/PerspectiveRail";
import { ProjectSidebar } from "./src/components/sidebar/ProjectSidebar";
import { Outline } from "./src/components/outline/Outline";
import { MobileCustomPerspectiveItem } from "./src/components/outline/MobileCustomPerspectiveItem";
import { Inspector } from "./src/components/inspector/Inspector";
import { ProjectInspector } from "./src/components/inspector/ProjectInspector";
import { MultiSelectInspector } from "./src/components/inspector/MultiSelectInspector";
import { TagInspector } from "./src/components/inspector/TagInspector";
import { EmptyInspector } from "./src/components/inspector/EmptyInspector";
import { QuickEntryModal } from "./src/components/modals/QuickEntryModal";
import { SettingsModal } from "./src/components/modals/SettingsModal";
import { ConfirmDeleteModal } from "./src/components/modals/ConfirmDeleteModal";
import { OmniImportModal } from "./src/components/modals/OmniImportModal";
import { favoritePerspectives, projectColors } from "./src/perspectives/rail";
import { copyToClipboard } from "./src/lib/clipboard";

declare global {
  interface Window {
    omniclone?: {
      onMenuCommand: (cb: (command: MenuCommand) => void) => () => void;
      setPerspectivesMenu: (items: Array<{ id: string; label: string; accelerator?: string }>) => void;
    };
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const isPhone = width < 720;
  const canShowSidebar = width >= 850;
  const canShowInspector = width >= 960;
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customPerspectives, setCustomPerspectives] = useState<CustomPerspective[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [perspective, setPerspective] = useState<ActivePerspective>("projects");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [forecastDay, setForecastDay] = useState<ForecastDayKey>(todayKey());
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const locationRef = useRef<LocationState>({ perspective: "projects", projectFilter: null, tagFilter: null, folderFilter: null, forecastDay: todayKey(), focusedProjectId: null });
  const historyRef = useRef<{ stack: LocationState[]; index: number }>({ stack: [], index: -1 });
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [inspectedProjectId, setInspectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [collapseNonce, setCollapseNonce] = useState<{ action: "expand" | "collapse"; n: number } | null>(null);
  const [pendingCleanupIds, setPendingCleanupIds] = useState<string[]>([]);
  const retainInspectionIds = useRef<Set<string>>(new Set());
  const [, startSidebarTransition] = useTransition();
  const undoStack = useRef<Array<{ projects: Project[]; tasks: Task[] }>>([]);
  const redoStack = useRef<Array<{ projects: Project[]; tasks: Task[] }>>([]);
  const pushUndo = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-19), { projects, tasks }];
    redoStack.current = [];
  }, [projects, tasks]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [pendingDeleteTaskIds, setPendingDeleteTaskIds] = useState<string[]>([]);
  const [pendingDeleteDirection, setPendingDeleteDirection] = useState<"menu" | "previous" | "next">("menu");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [quickKind, setQuickKind] = useState<"task" | "project" | "folder" | null>(null);
  const [perspectivesListOpen, setPerspectivesListOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [shortcutRecordingId, setShortcutRecordingId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<OmniImportData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importGuideOpen, setImportGuideOpen] = useState(false);
  const hasNativeMenu = typeof window !== "undefined" && !!window.omniclone;

  useEffect(() => {
    Promise.all([loadDatabase(), loadSettings()]).then(([saved, savedSettings]) => {
      let nextSettings = savedSettings;
      if (saved) {
        setProjects(saved.projects);
        setTasks(saved.tasks);
        const customs = saved.customPerspectives.map((item) => normalizeCustomPerspective(item));
        setCustomPerspectives(customs);
        const extraBarIds = customs.map((item) => `custom:${item.id}`).filter((id) => !savedSettings.perspectiveBarIds.includes(id));
        if (extraBarIds.length && savedSettings.perspectiveBarIds.join() === defaultSettings.perspectiveBarIds.join()) {
          nextSettings = { ...savedSettings, perspectiveBarIds: [...savedSettings.perspectiveBarIds, ...extraBarIds] };
        }
      }
      setSettings(nextSettings);
      setPerspective(nextSettings.defaultPerspective);
      const initial: LocationState = { perspective: nextSettings.defaultPerspective, projectFilter: null, tagFilter: null, folderFilter: null, forecastDay: todayKey(), focusedProjectId: null };
      locationRef.current = initial;
      historyRef.current = { stack: [initial], index: 0 };
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveDatabase({ version: 2, projects, tasks, customPerspectives });
    }, 180);
    return () => clearTimeout(timer);
  }, [hydrated, projects, tasks, customPerspectives]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveSettings(settings);
    }, 120);
    return () => clearTimeout(timer);
  }, [hydrated, settings]);

  useEffect(() => {
    if (!canShowSidebar) setSidebarOpen(false);
  }, [canShowSidebar]);

  useEffect(() => {
    if (isPhone) setInspectorOpen(false);
  }, [isPhone]);

  const selectedTaskIds = selection.ids;
  const selectedTaskId = selection.headId ?? selection.ids[0] ?? null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
  const selectedProject = selectedTask?.projectId ? projects.find((project) => project.id === selectedTask.projectId) : undefined;
  const defaultProjectId = projectFilter ?? selectedProject?.id ?? (folderFilter ? projects.find((project) => projectInFolder(project, folderFilter))?.id ?? null : null);
  const inspectedProject = inspectedProjectId ? projects.find((project) => project.id === inspectedProjectId) : undefined;
  const marqueeBaseRef = useRef<SelectionState>(emptySelection);
  const activeCustomPerspective = perspective.startsWith("custom:") ? customPerspectives.find((item) => item.id === perspective.slice(7)) ?? null : null;
  const barItems = useMemo(() => favoritePerspectives(settings, customPerspectives), [customPerspectives, settings]);
  const knownTags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags))].sort(), [tasks]);
  const focusedProject = focusedProjectId ? projects.find((project) => project.id === focusedProjectId) : undefined;

  locationRef.current = { perspective, projectFilter, tagFilter, folderFilter, forecastDay, focusedProjectId };

  const applyLocation = useCallback((next: LocationState) => {
    locationRef.current = next;
    setPerspective(next.perspective);
    setProjectFilter(next.projectFilter);
    setTagFilter(next.tagFilter);
    setFolderFilter(next.folderFilter);
    setForecastDay(next.forecastDay);
    setFocusedProjectId(next.focusedProjectId);
  }, []);

  const syncHistoryButtons = useCallback(() => {
    const { stack, index } = historyRef.current;
    setCanGoBack(index > 0);
    setCanGoForward(index >= 0 && index < stack.length - 1);
  }, []);

  const navigate = useCallback((patch: Partial<LocationState>) => {
    const next = { ...locationRef.current, ...patch };
    if (sameLocation(locationRef.current, next)) return;
    retainInspectionIds.current = new Set();
    applyLocation(next);
    const { stack, index } = historyRef.current;
    const nextStack = [...stack.slice(0, Math.max(index, -1) + 1), next];
    historyRef.current = { stack: nextStack, index: nextStack.length - 1 };
    syncHistoryButtons();
  }, [applyLocation, syncHistoryButtons]);

  const goBack = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index <= 0) return;
    const nextIndex = index - 1;
    historyRef.current = { stack, index: nextIndex };
    applyLocation(stack[nextIndex] ?? locationRef.current);
    syncHistoryButtons();
  }, [applyLocation, syncHistoryButtons]);

  const goForward = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index >= stack.length - 1) return;
    const nextIndex = index + 1;
    historyRef.current = { stack, index: nextIndex };
    applyLocation(stack[nextIndex] ?? locationRef.current);
    syncHistoryButtons();
  }, [applyLocation, syncHistoryButtons]);

  const visibleTasks = useMemo(() => {
    let result = [...tasks];
    const lingering = new Set(pendingCleanupIds);
    if (activeCustomPerspective) {
      const custom = activeCustomPerspective;
      result = result.filter((task) => taskMatchesCustomPerspective(task, custom, { tasks, projects }) || lingering.has(task.id));
      if (projectFilter) result = result.filter((task) => task.projectId === projectFilter);
      if (folderFilter) {
        const allowed = new Set(projects.filter((project) => projectInFolder(project, folderFilter)).map((project) => project.id));
        result = result.filter((task) => task.projectId && allowed.has(task.projectId));
      }
      if (tagFilter) result = result.filter((task) => task.tags.includes(tagFilter));
      result.sort((a, b) => compareTasks(a, b, custom.sortBy));
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
      if (tagFilter) result = result.filter((task) => task.tags.includes(tagFilter));
      const availability = settings.standardAvailability[perspective as PerspectiveId] ?? (settings.showCompleted ? "all" : "remaining");
      result = result.filter((task) => taskMatchesView(task, availability, { tasks, projects }) || lingering.has(task.id));
    }
    if (focusedProjectId) result = result.filter((task) => task.projectId === focusedProjectId);
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      result = result.filter((task) => `${task.title} ${task.note ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(needle));
    }
    return withLingeringTasks(result, tasks, lingering);
  }, [tasks, projects, perspective, projectFilter, tagFilter, folderFilter, forecastDay, focusedProjectId, settings.showCompleted, settings.standardAvailability, query, activeCustomPerspective, pendingCleanupIds]);

  const orderedTaskIds = useMemo(() => outlineTaskIds({
    tasks: visibleTasks,
    projects,
    perspective,
    groupBy: activeCustomPerspective ? effectiveGroupBy(activeCustomPerspective) : null,
    projectFilter,
  }), [visibleTasks, projects, perspective, activeCustomPerspective, projectFilter]);

  useEffect(() => {
    const existing = new Set(tasks.map((task) => task.id));
    const retain = [...retainInspectionIds.current].filter((id) => existing.has(id));
    retainInspectionIds.current = new Set(retain);
    setSelection((current) => {
      const next = pruneSelection(current, orderedTaskIds, retain);
      if (next.ids.length === current.ids.length && next.ids.every((id, index) => id === current.ids[index]) && next.anchorId === current.anchorId && next.headId === current.headId) {
        return current;
      }
      return next;
    });
  }, [orderedTaskIds, tasks]);

  const perspectiveTitle = activeCustomPerspective?.name ?? (projectFilter && perspective === "projects"
    ? projects.find((project) => project.id === projectFilter)?.name ?? "Projects"
    : folderFilter && perspective === "projects"
      ? folderFilter
    : tagFilter && perspective === "tags"
      ? tagFilter
    : perspectives.find((item) => item.id === perspective)?.label ?? "Projects");

  const selectPerspective = (id: ActivePerspective) => {
    navigate({
      perspective: id,
      projectFilter: null,
      tagFilter: null,
      folderFilter: null,
      forecastDay: id === "forecast" ? todayKey() : locationRef.current.forecastDay,
    });
  };

  const openViewOptions = (id?: ActivePerspective) => {
    if (id) selectPerspective(id);
    setViewMenuOpen(true);
    setPerspectivesListOpen(false);
  };

  const addCustomPerspective = () => {
    const created = createCustomPerspective();
    setCustomPerspectives((current) => [...current, created]);
    setSettings((current) => ({ ...current, perspectiveBarIds: [...current.perspectiveBarIds, `custom:${created.id}`] }));
    navigate({ perspective: `custom:${created.id}`, projectFilter: null, tagFilter: null, folderFilter: null });
    setPerspectivesListOpen(false);
    setViewMenuOpen(true);
  };

  const patchCustomPerspective = (id: string, patch: Partial<CustomPerspective>) => {
    setCustomPerspectives((current) => current.map((item) => item.id === id ? { ...item, ...patch, name: patch.name !== undefined ? patch.name : item.name } : item));
  };

  const toggleFavorite = (id: ActivePerspective) => {
    setSettings((current) => {
      const exists = current.perspectiveBarIds.includes(id);
      return { ...current, perspectiveBarIds: exists ? current.perspectiveBarIds.filter((item) => item !== id) : [...current.perspectiveBarIds, id] };
    });
  };

  const movePerspective = (id: ActivePerspective, direction: -1 | 1) => {
    setSettings((current) => {
      const ids = [...current.perspectiveBarIds];
      const from = ids.indexOf(id);
      if (from < 0) return { ...current, perspectiveBarIds: direction === 1 ? [...ids, id] : [id, ...ids] };
      const to = Math.max(0, Math.min(ids.length - 1, from + direction));
      ids.splice(from, 1);
      ids.splice(to, 0, id);
      return { ...current, perspectiveBarIds: ids };
    });
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    setTasks((current) => current.map((task) => {
      if (task.id !== id) return task;
      const next = { ...task, ...patch };
      if (patch.completed === true) next.completedAt = patch.completedAt ?? new Date().toISOString();
      if (patch.completed === false) next.completedAt = undefined;
      return next;
    }));
    const current = tasks.find((task) => task.id === id);
    if (patch.projectId !== undefined && current && current.projectId !== patch.projectId) {
      retainInspectionIds.current = new Set([...retainInspectionIds.current, id]);
    }
    if (!settings.cleanUpImmediately) {
      if (patch.completed === true) setPendingCleanupIds((ids) => ids.includes(id) ? ids : [...ids, id]);
      if (patch.completed === false) setPendingCleanupIds((ids) => ids.filter((item) => item !== id));
      if (patch.projectId !== undefined && current && current.projectId !== patch.projectId) {
        setPendingCleanupIds((ids) => ids.includes(id) ? ids : [...ids, id]);
      }
    }
  };

  const toggleTask = (id: string) => {
    const target = tasks.find((task) => task.id === id);
    if (target) updateTask(id, { completed: !target.completed });
  };

  const idsForRow = (id: string) => (selectedTaskIds.includes(id) && selectedTaskIds.length > 1 ? selectedTaskIds : [id]);

  const toggleTasks = (ids: string[]) => {
    if (!ids.length) return;
    const targets = tasks.filter((task) => ids.includes(task.id));
    if (!targets.length) return;
    const nextCompleted = !targets.every((task) => task.completed);
    const completedAt = nextCompleted ? new Date().toISOString() : undefined;
    pushUndo();
    setTasks((current) => {
      const next = current.map((task) => ({ ...task }));
      const byId = new Map(next.map((task) => [task.id, task]));
      const affected = new Set(ids);
      if (nextCompleted) {
        for (const id of ids) {
          for (const child of descendantsOf(id, next)) affected.add(child.id);
        }
      }
      for (const id of affected) {
        const task = byId.get(id);
        if (!task) continue;
        if (nextCompleted && ids.includes(id)) {
          const repeat = applyRepeat(task);
          if (repeat) {
            Object.assign(task, repeat);
            continue;
          }
        }
        task.completed = nextCompleted;
        task.completedAt = completedAt;
      }
      return next;
    });
    if (!settings.cleanUpImmediately) {
      setPendingCleanupIds((current) => nextCompleted
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !ids.includes(id)));
    }
  };

  const toggleTaskFlags = (ids: string[]) => {
    if (!ids.length) return;
    const targets = tasks.filter((task) => ids.includes(task.id));
    if (!targets.length) return;
    const nextFlagged = !targets.every((task) => task.flagged);
    setTasks((current) => current.map((task) => ids.includes(task.id) ? { ...task, flagged: nextFlagged } : task));
  };

  const finalizeDeleteTasks = useCallback((ids: string[], direction: "menu" | "previous" | "next") => {
    const extra = ids.flatMap((id) => descendantsOf(id, tasks).map((task) => task.id));
    const unique = [...new Set([...ids, ...extra])];
    const nextId = neighborAfterDelete(orderedTaskIds, unique, direction);
    setTasks((current) => current.filter((task) => !unique.includes(task.id)));
    setPendingDeleteTaskIds([]);
    setPendingDeleteDirection("menu");
    setSelection(singleSelection(nextId));
    if (!nextId) setInspectorOpen(false);
  }, [orderedTaskIds, tasks]);

  const deleteTasks = (ids: string[], direction: "menu" | "previous" | "next" = "menu") => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;
    pushUndo();
    if (settings.confirmBeforeDelete) {
      setPendingDeleteTaskIds(unique);
      setPendingDeleteDirection(direction);
      return;
    }
    finalizeDeleteTasks(unique, direction);
  };

  const deleteTask = (id: string, direction: "menu" | "previous" | "next" = "menu") => {
    deleteTasks(idsForRow(id), direction);
  };

  const finalizeDeleteProject = (id: string) => {
    setProjects((current) => current.filter((project) => project.id !== id));
    setTasks((current) => current.filter((task) => task.projectId !== id));
    setCustomPerspectives((current) => current.map((item) => ({
      ...item,
      rules: item.rules.map((rule) => rule.kind === "containedIn"
        ? { ...rule, projectIds: (rule.projectIds ?? []).filter((projectId) => projectId !== id) }
        : rule),
    })));
    setProjectFilter((current) => current === id ? null : current);
    setInspectedProjectId((current) => current === id ? null : current);
    setSelection((current) => {
      const remaining = current.ids.filter((taskId) => tasks.find((task) => task.id === taskId)?.projectId !== id);
      if (!remaining.length) return emptySelection;
      return {
        ids: remaining,
        anchorId: current.anchorId && remaining.includes(current.anchorId) ? current.anchorId : remaining[0] ?? null,
        headId: current.headId && remaining.includes(current.headId) ? current.headId : remaining[remaining.length - 1] ?? null,
      };
    });
    setPendingDeleteProjectId(null);
  };

  const deleteProject = (id: string) => {
    if (settings.confirmBeforeDelete) {
      setPendingDeleteProjectId(id);
      return;
    }
    finalizeDeleteProject(id);
  };

  const createItem = (payload: { title: string; projectId: string | null; flagged?: boolean; due?: string; tags?: string[] }) => {
    pushUndo();
    if (quickKind === "folder") {
      const name = payload.title.trim();
      setSettings((current) => ({
        ...current,
        extraFolders: current.extraFolders.includes(name) ? current.extraFolders : [...current.extraFolders, name],
      }));
      navigate({ perspective: "projects", folderFilter: name, projectFilter: null, tagFilter: null });
    } else if (quickKind === "project") {
      const project: Project = {
        id: makeId("project"),
        name: payload.title,
        note: "",
        color: projectColors[projects.length % projectColors.length] ?? palette.purple,
        reviewIntervalDays: 7,
        folder: folderFilter ?? undefined,
      };
      setProjects((current) => [...current, project]);
      navigate({ perspective: "projects", projectFilter: project.id, tagFilter: null, folderFilter: folderFilter });
    } else {
      const task: Task = {
        id: makeId("task"),
        title: payload.title,
        projectId: payload.projectId,
        tags: payload.tags ?? [],
        due: payload.due,
        flagged: payload.flagged ?? false,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      setTasks((current) => [...current, task]);
      setSelection(singleSelection(task.id));
      setInspectedProjectId(null);
      if (payload.projectId === null) selectPerspective("inbox");
      else navigate({ perspective: "projects", projectFilter: payload.projectId, tagFilter: null, folderFilter: null });
    }
    setQuickKind(null);
  };

  const openInspector = (id: string) => {
    setInspectedProjectId(null);
    setSelection(singleSelection(id));
    setInspectorOpen(true);
  };

  const inspectProject = (id: string) => {
    setEditingTaskId(null);
    setSelection(emptySelection);
    setInspectedProjectId(id);
    setInspectorOpen(true);
  };

  const selectTask = (id: string, modifiers: SelectionModifiers = {}) => {
    retainInspectionIds.current = new Set();
    setInspectedProjectId(null);
    setEditingTaskId((current) => current === id ? current : null);
    setSelection((current) => applyClick(current, orderedTaskIds, id, modifiers));
    if (!modifiers.shift && !modifiers.toggle && (isPhone || settings.openInspectorOnSelection)) setInspectorOpen(true);
  };

  const selectAllVisible = useCallback(() => {
    setSelection(applySelectAll(orderedTaskIds));
  }, [orderedTaskIds]);

  const selectAdjacentTask = useCallback((direction: "up" | "down", extend = false) => {
    setSelection((current) => {
      const next = applyMove(current, orderedTaskIds, direction, extend);
      if (next.headId && !extend && (isPhone || settings.openInspectorOnSelection)) setInspectorOpen(true);
      return next;
    });
  }, [isPhone, orderedTaskIds, settings.openInspectorOnSelection]);

  const focusSelected = () => {
    const projectId = selectedTask?.projectId ?? projectFilter;
    if (!projectId) return;
    if (focusedProjectId === projectId) {
      navigate({ focusedProjectId: null });
      return;
    }
    navigate({ perspective: "projects", projectFilter: projectId, tagFilter: null, focusedProjectId: projectId });
  };

  const unfocus = () => {
    navigate({ focusedProjectId: null });
  };

  const focusProject = (projectId: string) => {
    navigate({ perspective: "projects", projectFilter: projectId, tagFilter: null, focusedProjectId: projectId });
  };

  const selectProject = (id: string | null) => {
    startSidebarTransition(() => {
      navigate({ perspective: "projects", projectFilter: id, tagFilter: null, folderFilter: null });
    });
  };

  const selectFolder = (folder: string | null) => {
    startSidebarTransition(() => {
      navigate({ perspective: "projects", folderFilter: folder, projectFilter: null, tagFilter: null });
    });
  };

  const selectTag = (tag: string | null) => {
    startSidebarTransition(() => {
      navigate({ perspective: "tags", tagFilter: tag, projectFilter: null, folderFilter: null });
      setInspectedProjectId(null);
      setSelection(emptySelection);
      if (tag) setInspectorOpen(true);
    });
  };

  const selectForecastDay = (day: ForecastDayKey) => {
    startSidebarTransition(() => {
      navigate({ perspective: "forecast", forecastDay: day, projectFilter: null, tagFilter: null, folderFilter: null });
    });
  };

  const insertAction = (projectId?: string | null, afterId?: string | null) => {
    pushUndo();
    const after = afterId ?? selectedTaskId;
    const created: Task = {
      id: makeId("task"),
      title: "",
      projectId: projectId ?? defaultProjectId,
      tags: [],
      flagged: false,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    const result = insertTaskAfter(tasks, after, created, projectId ?? defaultProjectId);
    setTasks(result.tasks);
    setInspectedProjectId(null);
    setSelection(singleSelection(result.created.id));
    setEditingTaskId(result.created.id);
    if ((projectId ?? result.created.projectId) === null) selectPerspective("inbox");
  };

  const newActionInProject = (projectId: string) => {
    navigate({ perspective: "projects", projectFilter: projectId, tagFilter: null, folderFilter: null });
    const last = [...flattenTasks(tasks.filter((task) => task.projectId === projectId))].pop();
    insertAction(projectId, last?.id ?? null);
  };

  const indentSelected = (id: string) => {
    pushUndo();
    setTasks(indentTasks(tasks, idsForRow(id)));
  };
  const outdentSelected = (id: string) => {
    pushUndo();
    setTasks(outdentTasks(tasks, idsForRow(id)));
  };
  const moveSelected = (id: string, direction: -1 | 1) => {
    pushUndo();
    setTasks(moveSiblings(tasks, idsForRow(id), direction));
  };
  const copySelectedTaskPaper = (id: string) => {
    const ids = new Set(idsForRow(id));
    copyToClipboard(toTaskPaper(tasks.filter((task) => ids.has(task.id)), tasks, projects));
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push({ projects, tasks });
    setProjects(previous.projects);
    setTasks(previous.tasks);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ projects, tasks });
    setProjects(next.projects);
    setTasks(next.tasks);
  };

  const toggleTaskFlag = (id: string) => {
    toggleTaskFlags(idsForRow(id));
  };

  const copyTaskLinks = (id: string) => {
    const ids = idsForRow(id);
    copyToClipboard(ids.map((item) => `omniclone://task/${item}`).join("\n"));
  };

  const duplicateTasks = (id: string) => {
    const ids = idsForRow(id);
    const copies: Task[] = [];
    pushUndo();
    setTasks((current) => {
      const next = [...current];
      for (const taskId of ids) {
        const task = current.find((item) => item.id === taskId);
        if (!task) continue;
        const copy: Task = {
          ...task,
          id: makeId("task"),
          importKey: undefined,
          createdAt: new Date().toISOString(),
          completed: false,
          completedAt: undefined,
        };
        copies.push(copy);
        const index = next.findIndex((item) => item.id === taskId);
        next.splice(index >= 0 ? index + 1 : next.length, 0, copy);
      }
      return next;
    });
    if (copies.length === 1) setSelection(singleSelection(copies[0]?.id ?? null));
    else if (copies.length) setSelection({ ids: copies.map((item) => item.id), anchorId: copies[0]?.id ?? null, headId: copies[copies.length - 1]?.id ?? null });
  };

  const moveTasks = (id: string, projectId: string | null) => {
    const ids = idsForRow(id);
    const fromInbox = tasks.filter((task) => ids.includes(task.id) && task.projectId === null);
    pushUndo();
    setTasks((current) => current.map((task) => ids.includes(task.id) ? { ...task, projectId } : task));
    if (!settings.cleanUpImmediately && projectId && fromInbox.length && perspective === "inbox") {
      setPendingCleanupIds((current) => [...new Set([...current, ...fromInbox.map((task) => task.id)])]);
    }
  };

  const commitTaskTitle = (id: string, title: string) => {
    updateTask(id, { title });
    setEditingTaskId((current) => current === id ? null : current);
  };

  const startEditTitle = (id?: string) => {
    const target = id ?? selectedTaskId;
    if (!target) return;
    setInspectedProjectId(null);
    setSelection(singleSelection(target));
    setEditingTaskId(target);
  };

  const cleanUp = () => {
    setPendingCleanupIds([]);
    setEditingTaskId(null);
  };

  const expandAll = () => setCollapseNonce((current) => ({ action: "expand", n: (current?.n ?? 0) + 1 }));
  const collapseAll = () => setCollapseNonce((current) => ({ action: "collapse", n: (current?.n ?? 0) + 1 }));

  const updateProject = (id: string, patch: Partial<Project>) => {
    setProjects((current) => current.map((project) => project.id === id ? { ...project, ...patch } : project));
  };

  const convertSelectedToProject = (id?: string) => {
    const target = id ?? selectedTaskId;
    if (!target) return;
    const color = projectColors[projects.length % projectColors.length] ?? palette.purple;
    pushUndo();
    const result = convertActionToProject(tasks, projects, target, color);
    if (!result) return;
    setProjects(result.projects);
    setTasks(result.tasks);
    setInspectedProjectId(result.project.id);
    setSelection(emptySelection);
    navigate({ perspective: "projects", projectFilter: result.project.id, tagFilter: null, folderFilter: result.project.folder ?? null });
  };

  const skipReview = (id: string) => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    updateProject(id, { lastReviewedAt: skipReviewTimestamp(project) });
  };

  const renameSelectedTag = (nextName: string) => {
    if (!tagFilter) return;
    pushUndo();
    setTasks((current) => renameTag(current, tagFilter, nextName));
    navigate({ perspective: "tags", tagFilter: nextName, projectFilter: null, folderFilter: null });
  };

  const deleteCustomPerspective = (id: string) => {
    const performDelete = () => {
      setCustomPerspectives((current) => current.filter((item) => item.id !== id));
      setSettings((current) => ({
        ...current,
        perspectiveBarIds: current.perspectiveBarIds.filter((item) => item !== `custom:${id}`),
        perspectiveShortcuts: Object.fromEntries(Object.entries(current.perspectiveShortcuts).filter(([key]) => key !== `custom:${id}`)),
      }));
      if (perspective === `custom:${id}`) navigate({ perspective: "projects" });
      setViewMenuOpen(false);
    };
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || window.confirm("Delete this perspective? Your actions and projects will not be changed.")) performDelete();
    } else {
      Alert.alert("Delete Perspective?", "The perspective will be removed. Your actions and projects will not be changed.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: performDelete }]);
    }
  };

  const duplicatePerspective = (perspectiveToCopy: CustomPerspective) => {
    const copy = duplicateCustomPerspective(perspectiveToCopy);
    setCustomPerspectives((current) => [...current, copy]);
    setSettings((current) => ({ ...current, perspectiveBarIds: [...current.perspectiveBarIds, `custom:${copy.id}`] }));
    navigate({ perspective: `custom:${copy.id}`, projectFilter: null, tagFilter: null });
    setViewMenuOpen(true);
  };

  const closeImport = () => {
    setImportPreview(null);
    setImportError(null);
    setImportSummary(null);
    setImportGuideOpen(false);
  };

  const openOmniFocusImport = () => {
    setViewMenuOpen(false);
    setImportError(null);
    setImportSummary(null);
    setImportPreview(null);
    setImportGuideOpen(true);
  };

  const chooseOmniFocusFile = async () => {
    setImportGuideOpen(false);
    setImportError(null);
    setImportSummary(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: false, copyToCacheDirectory: true, base64: false });
      if (result.canceled) {
        setImportGuideOpen(true);
        return;
      }
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 50 * 1024 * 1024) throw new Error("Choose an export smaller than 50 MB. For a very large archive, export separate folders or projects from OmniFocus.");
      const bytes = asset.file
        ? new Uint8Array(await asset.file.arrayBuffer())
        : await new ExpoFile(asset.uri).bytes();
      setImportPreview(parseOmniFocusFile(asset.name, bytes));
    } catch (error) {
      setImportPreview(null);
      setImportError(error instanceof Error ? error.message : "The selected file could not be read.");
    }
  };

  const applyImport = (mode: ImportMode) => {
    if (!importPreview) return;
    const result = applyOmniFocusImport(projects, tasks, importPreview, mode);
    setProjects(result.projects);
    setTasks(result.tasks);
    if (mode === "replace") {
      const retainedProjectIds = new Set(result.projects.map((project) => project.id));
      setCustomPerspectives((current) => current.map((item) => ({
        ...item,
        rules: item.rules.map((rule) => rule.kind === "containedIn" ? { ...rule, projectIds: (rule.projectIds ?? []).filter((id) => retainedProjectIds.has(id)) } : rule),
      })));
    }
    setSelection(singleSelection(result.tasks[0]?.id ?? null));
    navigate({ perspective: "projects", projectFilter: null, tagFilter: null, focusedProjectId: null });
    setInspectorOpen(false);
    setImportPreview(null);
    const duplicateNote = result.duplicateTasks ? ` ${result.duplicateTasks} duplicate${result.duplicateTasks === 1 ? " was" : "s were"} ignored.` : "";
    setImportSummary(`${mode === "replace" ? "Loaded" : "Added"} ${result.addedTasks} action${result.addedTasks === 1 ? "" : "s"} and ${result.addedProjects} project${result.addedProjects === 1 ? "" : "s"}.${duplicateNote}`);
  };

  const pendingDeleteProject = pendingDeleteProjectId ? projects.find((project) => project.id === pendingDeleteProjectId) : undefined;
  const pendingDeleteProjectActionCount = pendingDeleteProjectId ? tasks.filter((task) => task.projectId === pendingDeleteProjectId).length : 0;
  const pendingDeleteMessage = pendingDeleteProjectId
    ? pendingDeleteProjectActionCount
      ? `This project and ${pendingDeleteProjectActionCount} action${pendingDeleteProjectActionCount === 1 ? "" : "s"} will be permanently removed from your local database.`
      : "This project will be permanently removed from your local database."
    : pendingDeleteTaskIds.length > 1
      ? `These ${pendingDeleteTaskIds.length} actions will be permanently removed from your local database.`
      : undefined;
  const sidebarPerspective: PerspectiveId = activeCustomPerspective
    ? (activeCustomPerspective.organizeBy === "projects" || effectiveGroupBy(activeCustomPerspective) === "project" ? "projects" : effectiveGroupBy(activeCustomPerspective) === "tag" ? "tags" : "projects")
    : perspective.startsWith("custom:") ? "projects" : perspective as PerspectiveId;
  const showSidebar = !isPhone && canShowSidebar && sidebarOpen && perspective !== "inbox" && perspective !== "completed" && !activeCustomPerspective?.keepSidebarHidden;
  const showInspector = !isPhone && canShowInspector && inspectorOpen;
  const modalOpen = quickKind !== null || settingsOpen || perspectivesListOpen || quickOpenOpen || importGuideOpen || !!importPreview || !!importError || !!importSummary;
  const nativeMenuTypes = new Set(["perspective", "toggleSidebar", "toggleInspector", "toggleSearch", "openSettings", "toggleViewMenu", "addPerspective", "showPerspectivesList", "togglePerspectivesBar", "quickOpen", "newAction", "newProject", "newFolder", "selectAll", "goBack", "goForward", "cleanUp", "duplicate", "expandAll", "collapseAll", "moveRow", "undo", "redo", "copyTaskPaper", "convertToProject"]);

  const handleHotkeyAction = useCallback((action: HotkeyAction | MenuCommand) => {
    switch (action.type) {
      case "perspective":
        selectPerspective(action.id);
        break;
      case "toggleSidebar":
        if (canShowSidebar) setSidebarOpen((value) => !value);
        break;
      case "toggleInspector":
        if (canShowInspector) setInspectorOpen((value) => !value);
        break;
      case "toggleSearch":
        setSearchOpen((value) => !value);
        break;
      case "openSettings":
        setSettingsOpen(true);
        break;
      case "toggleViewMenu":
        setViewMenuOpen((value) => !value);
        break;
      case "addPerspective":
        addCustomPerspective();
        break;
      case "showPerspectivesList":
        setPerspectivesListOpen((value) => !value);
        break;
      case "togglePerspectivesBar":
        setSettings((current) => ({ ...current, perspectiveBarVisible: !current.perspectiveBarVisible }));
        break;
      case "quickOpen":
        setQuickOpenOpen(true);
        break;
      case "importOmniFocus":
        openOmniFocusImport();
        break;
      case "toggleTitles":
        setSettings((current) => ({ ...current, perspectiveBarShowsTitles: !current.perspectiveBarShowsTitles }));
        break;
      case "newAction":
        insertAction();
        break;
      case "newProject":
        setQuickKind("project");
        break;
      case "newFolder":
        setQuickKind("folder");
        break;
      case "quickEntry":
        setQuickKind("task");
        break;
      case "toggleComplete":
        if (selectedTaskIds.length) toggleTasks(selectedTaskIds);
        break;
      case "toggleFlag":
        if (selectedTaskIds.length) toggleTaskFlags(selectedTaskIds);
        break;
      case "delete":
        if (selectedTaskIds.length) deleteTasks(selectedTaskIds, action.direction);
        else if (projectFilter) deleteProject(projectFilter);
        break;
      case "focusProject":
        focusSelected();
        break;
      case "goBack":
        goBack();
        break;
      case "goForward":
        goForward();
        break;
      case "markReviewed":
        if (perspective === "review" && selectedTask?.projectId) {
          setProjects((current) => current.map((project) => project.id === selectedTask.projectId ? { ...project, lastReviewedAt: new Date().toISOString() } : project));
        }
        break;
      case "selectRow":
        selectAdjacentTask(action.direction);
        break;
      case "extendRow":
        selectAdjacentTask(action.direction, true);
        break;
      case "selectAll":
        if (typeof document !== "undefined" && isTextInputTarget(document.activeElement)) {
          const field = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
          if (typeof field.select === "function") field.select();
          else document.execCommand("selectAll");
          break;
        }
        selectAllVisible();
        break;
      case "cleanUp":
        cleanUp();
        break;
      case "duplicate":
        if (selectedTaskIds.length) duplicateTasks(selectedTaskIds[0] ?? "");
        break;
      case "editTitle":
        startEditTitle();
        break;
      case "expandAll":
        expandAll();
        break;
      case "collapseAll":
        collapseAll();
        break;
      case "indent":
        if (selectedTaskId) indentSelected(selectedTaskId);
        break;
      case "outdent":
        if (selectedTaskId) outdentSelected(selectedTaskId);
        break;
      case "moveRow":
        if (selectedTaskId) moveSelected(selectedTaskId, action.direction === "up" ? -1 : 1);
        break;
      case "undo":
        if (typeof document !== "undefined" && isTextInputTarget(document.activeElement)) {
          document.execCommand("undo");
          break;
        }
        undo();
        break;
      case "redo":
        if (typeof document !== "undefined" && isTextInputTarget(document.activeElement)) {
          document.execCommand("redo");
          break;
        }
        redo();
        break;
      case "copyTaskPaper":
        if (selectedTaskId) copySelectedTaskPaper(selectedTaskId);
        break;
      case "convertToProject":
        convertSelectedToProject();
        break;
      case "confirmDelete":
        if (pendingDeleteProjectId) finalizeDeleteProject(pendingDeleteProjectId);
        else if (pendingDeleteTaskIds.length) finalizeDeleteTasks(pendingDeleteTaskIds, pendingDeleteDirection);
        break;
      case "cancel":
        if (pendingDeleteProjectId) {
          setPendingDeleteProjectId(null);
          break;
        }
        if (pendingDeleteTaskIds.length) {
          setPendingDeleteTaskIds([]);
          setPendingDeleteDirection("menu");
          break;
        }
        if (quickKind) setQuickKind(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (perspectivesListOpen) {
          setShortcutRecordingId(null);
          setPerspectivesListOpen(false);
        }
        else if (quickOpenOpen) setQuickOpenOpen(false);
        else if (importPreview || importError || importSummary || importGuideOpen) closeImport();
        else if (viewMenuOpen) setViewMenuOpen(false);
        else if (searchOpen) {
          setQuery("");
          setSearchOpen(false);
        }
        else if (editingTaskId) setEditingTaskId(null);
        else if (selectedTaskIds.length || inspectedProjectId) {
          setSelection(emptySelection);
          setInspectedProjectId(null);
        }
        break;
    }
  }, [
    canShowInspector,
    canShowSidebar,
    closeImport,
    deleteProject,
    deleteTasks,
    finalizeDeleteProject,
    finalizeDeleteTasks,
    focusSelected,
    goBack,
    goForward,
    importError,
    importGuideOpen,
    importPreview,
    importSummary,
    pendingDeleteDirection,
    pendingDeleteProjectId,
    pendingDeleteTaskIds,
    perspective,
    perspectivesListOpen,
    quickKind,
    quickOpenOpen,
    searchOpen,
    selectAdjacentTask,
    selectAllVisible,
    selectedTask,
    selectedTaskIds,
    settingsOpen,
    viewMenuOpen,
    projectFilter,
    cleanUp,
    duplicateTasks,
    startEditTitle,
    expandAll,
    collapseAll,
    editingTaskId,
    inspectedProjectId,
    selectedTaskId,
    indentSelected,
    outdentSelected,
    moveSelected,
    undo,
    redo,
    copySelectedTaskPaper,
    insertAction,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchOmniFocusHotkey(event, {
        deleteDialogOpen: !!pendingDeleteTaskIds.length || !!pendingDeleteProjectId,
        perspectiveShortcuts: settings.perspectiveShortcuts,
        shortcutCapture: !!shortcutRecordingId,
      });
      if (!action) return;
      if (hasNativeMenu && nativeMenuTypes.has(action.type)) return;
      if (modalOpen && action.type !== "cancel" && action.type !== "confirmDelete") return;
      event.preventDefault();
      handleHotkeyAction(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleHotkeyAction, hasNativeMenu, modalOpen, pendingDeleteProjectId, pendingDeleteTaskIds, settings.perspectiveShortcuts, shortcutRecordingId]);

  useEffect(() => {
    if (!hasNativeMenu || typeof window === "undefined") return;
    window.omniclone?.setPerspectivesMenu(customPerspectives.map((item) => ({
      id: `custom:${item.id}`,
      label: item.name,
      accelerator: toElectronAccelerator(settings.perspectiveShortcuts[`custom:${item.id}`]),
    })));
  }, [customPerspectives, hasNativeMenu, settings.perspectiveShortcuts]);

  useEffect(() => {
    if (!hasNativeMenu || typeof window === "undefined") return;
    return window.omniclone?.onMenuCommand((command) => handleHotkeyAction(command));
  }, [handleHotkeyAction, hasNativeMenu]);

  const sidebarProjects = focusedProjectId ? projects.filter((project) => project.id === focusedProjectId) : projects;
  const forecastCounts = useMemo(() => {
    const counts: Record<string, number> = { past: 0, upcoming: 0 };
    const weekKeys = forecastWeek().map((day) => day.key);
    for (const task of tasks) {
      if (task.completed || (task.status ?? "active") === "dropped") continue;
      if (focusedProjectId && task.projectId !== focusedProjectId) continue;
      if (task.due) {
        if (dueUrgency(task.due) === "overdue") counts.past = (counts.past ?? 0) + 1;
        if (isDueOnDay(task.due, "upcoming")) counts.upcoming = (counts.upcoming ?? 0) + 1;
        for (const key of weekKeys) {
          if (isDueOnDay(task.due, key)) counts[key] = (counts[key] ?? 0) + 1;
        }
      } else if (task.flagged) {
        const today = todayKey();
        counts[today] = (counts[today] ?? 0) + 1;
      }
    }
    return counts;
  }, [focusedProjectId, tasks]);
  const perspectiveBadges = useMemo(() => ({
    inbox: { count: tasks.filter((task) => task.projectId === null && !task.completed).length },
    flagged: { count: tasks.filter((task) => task.flagged && !task.completed && (!focusedProjectId || task.projectId === focusedProjectId)).length },
    forecast: { count: tasks.filter((task) => !task.completed && dueUrgency(task.due) === "overdue" && (!focusedProjectId || task.projectId === focusedProjectId)).length, color: palette.overdue },
    review: { count: projects.filter((project) => (!focusedProjectId || project.id === focusedProjectId) && projectDueForReview(project)).length },
  }), [focusedProjectId, projects, tasks]);

  return (
    <ContextMenuProvider>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        {!isPhone && (
          <MenuBar
            settings={settings}
            customPerspectives={customPerspectives}
            perspectiveBarVisible={settings.perspectiveBarVisible}
            sidebarOpen={sidebarOpen}
            inspectorOpen={inspectorOpen}
            viewOptionsOpen={viewMenuOpen}
            nativeMenu={hasNativeMenu}
            onCommand={handleHotkeyAction}
          />
        )}
        {!isPhone ? (
          <View style={styles.toolbar}>
            <TrafficLights />
            <View style={styles.toolbarLeading}>
              <ToolbarButton icon="page-layout-sidebar-left" label="Sidebar" active={showSidebar} onPress={() => setSidebarOpen((value) => !value)} />
              <ToolbarButton icon="chevron-left" label="Back" disabled={!canGoBack} onPress={goBack} />
              <ToolbarButton icon="chevron-right" label="Forward" disabled={!canGoForward} onPress={goForward} />
              <ToolbarButton icon="eye-outline" label="View" active={viewMenuOpen} onPress={() => setViewMenuOpen((value) => !value)} />
            </View>
            <View style={styles.toolbarCenter}>
              <ToolbarButton icon="plus" label="New Action" onPress={() => insertAction()} />
              <ToolbarButton icon="tray-arrow-down" label="Quick Entry" onPress={() => setQuickKind("task")} />
              <ToolbarButton icon="file-find-outline" label="Quick Open" onPress={() => setQuickOpenOpen(true)} />
              <ToolbarButton icon="bullseye-arrow" label="Focus" active={!!focusedProjectId} disabled={!focusedProjectId && !selectedTask?.projectId && !projectFilter} onPress={focusSelected} />
            </View>
            <View style={styles.toolbarTrailing}>
              <ToolbarButton icon="cog-outline" label="Settings" active={settingsOpen} onPress={() => setSettingsOpen(true)} />
              <ToolbarButton icon="magnify" label="Search" active={searchOpen} onPress={() => setSearchOpen((value) => !value)} />
              <ToolbarButton icon="information-outline" label="Inspect" active={showInspector} onPress={() => setInspectorOpen((value) => !value)} />
            </View>
          </View>
        ) : (
          <View style={styles.mobileHeader}>
            <View><Text style={styles.mobileEyebrow}>OMNIFOCUS</Text><Text numberOfLines={1} style={styles.mobileTitle}>{perspectiveTitle}</Text></View>
            <View style={styles.mobileHeaderActions}>
              <Pressable accessibilityLabel="View Options" onPress={() => setViewMenuOpen(true)} style={styles.mobileCircleButton}><Icon name="eye-outline" size={18} color={palette.purpleDark} /></Pressable>
              <Pressable accessibilityLabel="More and settings" onPress={() => setSettingsOpen(true)} style={styles.mobileCircleButton}><Icon name="dots-horizontal" size={20} color={palette.purpleDark} /></Pressable>
              <Pressable onPress={() => setSearchOpen((value) => !value)} style={styles.mobileCircleButton}><Icon name="magnify" size={21} color={palette.purpleDark} /></Pressable>
              <Pressable onPress={() => insertAction()} style={styles.mobileAddButton}><Icon name="plus" size={24} color="#fff" /></Pressable>
            </View>
          </View>
        )}

        {focusedProject && (
          <View style={styles.focusBar}>
            <Icon name="bullseye-arrow" size={16} color={palette.purpleDark} />
            <Text numberOfLines={1} style={styles.focusBarText}>Focusing on {focusedProject.name}</Text>
            <Pressable accessibilityLabel="Unfocus" onPress={unfocus} style={styles.unfocusButton}>
              <Text style={styles.unfocusButtonText}>Unfocus</Text>
            </Pressable>
          </View>
        )}

        {searchOpen && (
          <View style={styles.searchBar}>
            <Icon name="magnify" size={18} color="#77747b" />
            <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search Remaining" style={styles.searchInput} />
            {!!query.trim() && <Text style={styles.searchCount}>{visibleTasks.length}</Text>}
            <Pressable onPress={() => { setQuery(""); setSearchOpen(false); }}><Text style={styles.searchDone}>Done</Text></Pressable>
          </View>
        )}

        {viewMenuOpen && !isPhone && (
          <>
            <Pressable accessibilityLabel="Close view options" onPress={() => setViewMenuOpen(false)} style={styles.menuDismissLayer} />
            <ViewOptionsPanel
              compact={false}
              perspective={perspective}
              custom={activeCustomPerspective}
              projects={projects}
              tags={knownTags}
              availability={settings.standardAvailability[perspective as PerspectiveId] ?? "remaining"}
              onChangeAvailability={(availability) => {
                if (perspective.startsWith("custom:")) return;
                setSettings((current) => ({
                  ...current,
                  standardAvailability: { ...current.standardAvailability, [perspective]: availability },
                  showCompleted: availability === "all" || availability === "completed",
                }));
              }}
              showNotes={settings.showNotesInOutline}
              onChangeShowNotes={(showNotesInOutline) => setSettings((current) => ({ ...current, showNotesInOutline }))}
              onChangeCustom={(patch) => {
                if (activeCustomPerspective) patchCustomPerspective(activeCustomPerspective.id, patch);
              }}
              onClose={() => setViewMenuOpen(false)}
            />
          </>
        )}
        {viewMenuOpen && isPhone && (
          <ViewOptionsPanel
            compact
            perspective={perspective}
            custom={activeCustomPerspective}
            projects={projects}
            tags={knownTags}
            availability={settings.standardAvailability[perspective as PerspectiveId] ?? "remaining"}
            onChangeAvailability={(availability) => {
              if (perspective.startsWith("custom:")) return;
              setSettings((current) => ({
                ...current,
                standardAvailability: { ...current.standardAvailability, [perspective]: availability },
                showCompleted: availability === "all" || availability === "completed",
              }));
            }}
            showNotes={settings.showNotesInOutline}
            onChangeShowNotes={(showNotesInOutline) => setSettings((current) => ({ ...current, showNotesInOutline }))}
            onChangeCustom={(patch) => {
              if (activeCustomPerspective) patchCustomPerspective(activeCustomPerspective.id, patch);
            }}
            onClose={() => setViewMenuOpen(false)}
          />
        )}

        <View style={[styles.workspace, !isPhone && styles.workspaceDesktop]}>
          {!isPhone && settings.perspectiveBarVisible && (
            <View style={[styles.desktopPane, styles.railPane]}>
            <PerspectiveRail
              current={perspective}
              badges={perspectiveBadges}
              items={barItems}
              showTitles={settings.perspectiveBarShowsTitles}
              shortcuts={settings.perspectiveShortcuts}
              onSelect={selectPerspective}
              onEdit={openViewOptions}
              onUnfavorite={toggleFavorite}
              onOpenList={() => setPerspectivesListOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onDelete={deleteCustomPerspective}
            />
            </View>
          )}
          {showSidebar && (
            <>
            <View style={[{ width: settings.sidebarWidth }, styles.desktopPane]}>
            <ProjectSidebar
              perspective={sidebarPerspective}
              projects={sidebarProjects}
              tasks={tasks.filter((task) => !focusedProjectId || task.projectId === focusedProjectId)}
              extraFolders={settings.extraFolders}
              selectedProjectId={projectFilter}
              selectedTag={tagFilter}
              selectedFolder={folderFilter}
              forecastDay={forecastDay}
              forecastCounts={forecastCounts}
              showCounts={settings.showSidebarCounts}
              onSelectProject={selectProject}
              onSelectTag={selectTag}
              onSelectFolder={selectFolder}
              onSelectForecastDay={selectForecastDay}
              onNewProject={() => setQuickKind("project")}
              onNewFolder={() => setQuickKind("folder")}
              onFocusProject={focusProject}
              onNewActionInProject={newActionInProject}
              onDeleteProject={deleteProject}
            />
            </View>
            <PaneResizeHandle
              onDrag={(delta) => setSettings((current) => ({
                ...current,
                sidebarWidth: clampPane(current.sidebarWidth + delta, 180, 420),
              }))}
            />
            </>
          )}
          <View style={[styles.outlinePane, !isPhone && styles.desktopPane]}>
          <Outline
            title={perspectiveTitle}
            perspective={perspective}
            customPerspective={activeCustomPerspective}
            projects={sidebarProjects}
            tasks={visibleTasks}
            selectedTaskIds={selectedTaskIds}
            inspectedProjectId={inspectedProjectId}
            editingTaskId={editingTaskId}
            collapseNonce={collapseNonce}
            projectFilter={projectFilter}
            folderFilter={folderFilter}
            tagFilter={tagFilter}
            forecastDay={forecastDay}
            settings={settings}
            onSelectTask={selectTask}
            onToggleTask={toggleTask}
            onToggleSelectedTasks={(id) => toggleTasks(idsForRow(id))}
            onInspectTask={openInspector}
            onToggleFlagTask={toggleTaskFlag}
            onDeleteTask={(id) => deleteTask(id)}
            onCopyTasks={(id) => {
              const ids = idsForRow(id);
              copyToClipboard(tasks.filter((task) => ids.includes(task.id)).map((task) => task.title).join("\n"));
            }}
            onCopyLink={copyTaskLinks}
            onDuplicateTasks={duplicateTasks}
            onMoveTasks={moveTasks}
            onIndent={indentSelected}
            onOutdent={outdentSelected}
            onMoveRow={moveSelected}
            onCopyTaskPaper={copySelectedTaskPaper}
            onStartEdit={startEditTitle}
            onCommitTitle={commitTaskTitle}
            onNewTask={() => insertAction()}
            onReviewProject={(id) => setProjects((current) => current.map((project) => project.id === id ? { ...project, lastReviewedAt: new Date().toISOString() } : project))}
            onSkipReview={skipReview}
            onConvertToProject={convertSelectedToProject}
            onOpenViewMenu={() => setViewMenuOpen(true)}
            onFocusProject={focusProject}
            onSelectProject={(id) => navigate({ perspective: "projects", projectFilter: id, tagFilter: null, folderFilter: null })}
            onInspectProject={inspectProject}
            onNewActionInProject={newActionInProject}
            onDeleteProject={deleteProject}
            onImport={openOmniFocusImport}
            onMarqueeStart={() => { marqueeBaseRef.current = selection; }}
            onMarqueeSelect={(ids, additive) => setSelection(applyMarquee(additive ? marqueeBaseRef.current : emptySelection, ids, additive))}
            onClearSelection={() => { setSelection(emptySelection); setInspectedProjectId(null); }}
            onSelectAll={selectAllVisible}
            onCleanUp={cleanUp}
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
            databaseEmpty={hydrated && projects.length === 0 && tasks.length === 0}
          />
          </View>
          {showInspector && (
            <>
            <PaneResizeHandle
              onDrag={(delta) => setSettings((current) => ({
                ...current,
                inspectorWidth: clampPane(current.inspectorWidth - delta, 260, 480),
              }))}
            />
            <View style={[{ width: settings.inspectorWidth }, styles.desktopPane]}>
          {selectedTaskIds.length > 1 && (
            <MultiSelectInspector
              count={selectedTaskIds.length}
              allCompleted={selectedTasks.length > 0 && selectedTasks.every((task) => task.completed)}
              allFlagged={selectedTasks.length > 0 && selectedTasks.every((task) => task.flagged)}
              onToggle={() => toggleTasks(selectedTaskIds)}
              onToggleFlag={() => toggleTaskFlags(selectedTaskIds)}
              onDelete={() => deleteTasks(selectedTaskIds)}
            />
          )}
          {selectedTaskIds.length === 1 && selectedTask && <Inspector task={selectedTask} projects={projects} onChange={(patch) => updateTask(selectedTask.id, patch)} onToggle={() => toggleTask(selectedTask.id)} onDelete={() => deleteTask(selectedTask.id)} />}
          {!selectedTaskIds.length && inspectedProject && (
            <ProjectInspector
              project={inspectedProject}
              remainingCount={tasks.filter((task) => task.projectId === inspectedProject.id && !task.completed && (task.status ?? "active") !== "dropped").length}
              stalled={projectIsStalled(inspectedProject, tasks)}
              onChange={(patch) => updateProject(inspectedProject.id, patch)}
              onReview={() => updateProject(inspectedProject.id, { lastReviewedAt: new Date().toISOString() })}
              onSkip={() => skipReview(inspectedProject.id)}
              onDelete={() => deleteProject(inspectedProject.id)}
              onFocus={() => focusProject(inspectedProject.id)}
            />
          )}
          {!selectedTaskIds.length && !inspectedProject && tagFilter && (
            <TagInspector
              tag={tagFilter}
              count={tasks.filter((task) => task.tags.includes(tagFilter) && !task.completed && (task.status ?? "active") !== "dropped").length}
              onRename={renameSelectedTag}
            />
          )}
          {!selectedTaskIds.length && !inspectedProject && !tagFilter && (
            <EmptyInspector
              title="No Selection"
              detail="Select an action, project, or tag to inspect it."
            />
          )}
            </View>
            </>
          )}
        </View>

        {isPhone && (
          <View style={styles.mobileNav}>
            <ScrollView style={styles.mobileNavList} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavScroll}>
              {barItems.map((item) => (
                <MobileCustomPerspectiveItem
                  key={item.id}
                  item={item}
                  selected={item.id === perspective}
                  onSelect={() => selectPerspective(item.id)}
                  onEdit={() => openViewOptions(item.id)}
                  onUnfavorite={() => toggleFavorite(item.id)}
                  onOpenList={() => setPerspectivesListOpen(true)}
                  onDelete={item.custom ? () => deleteCustomPerspective(item.custom!.id) : undefined}
                />
              ))}
              <Pressable onPress={() => setPerspectivesListOpen(true)} style={styles.mobileNavItem}><Icon name="view-list-outline" size={21} color={palette.purpleDark} /><Text style={styles.mobileNavLabel}>List</Text></Pressable>
              <Pressable accessibilityLabel="Import from OmniFocus" onPress={() => void openOmniFocusImport()} style={styles.mobileNavItem}><Icon name="database-import-outline" size={21} color={palette.purpleDark} /><Text style={styles.mobileNavLabel}>Import</Text></Pressable>
              <Pressable accessibilityLabel="Settings" onPress={() => setSettingsOpen(true)} style={styles.mobileNavItem}><Icon name="cog-outline" size={21} color={palette.purpleDark} /><Text style={styles.mobileNavLabel}>Settings</Text></Pressable>
            </ScrollView>
          </View>
        )}
      </View>

      <QuickEntryModal visible={quickKind !== null} kind={quickKind ?? "task"} projects={projects} defaultProjectId={defaultProjectId} onClose={() => setQuickKind(null)} onSave={createItem} />

      {settingsOpen && <SettingsModal settings={settings} projectCount={projects.length} taskCount={tasks.length} compact={isPhone} onChange={(patch) => {
        setSettings((current) => ({ ...current, ...patch }));
        if (patch.cleanUpImmediately) setPendingCleanupIds([]);
      }} onClose={() => setSettingsOpen(false)} onImport={() => { setSettingsOpen(false); void openOmniFocusImport(); }} onReset={() => setSettings(defaultSettings)} />}

      <PerspectivesListModal
        visible={perspectivesListOpen}
        compact={isPhone}
        settings={settings}
        customPerspectives={customPerspectives}
        current={perspective}
        recordingId={shortcutRecordingId}
        onClose={() => { setShortcutRecordingId(null); setPerspectivesListOpen(false); }}
        onOpen={(id) => { selectPerspective(id); setPerspectivesListOpen(false); }}
        onEdit={openViewOptions}
        onAdd={addCustomPerspective}
        onDuplicate={duplicatePerspective}
        onDelete={deleteCustomPerspective}
        onToggleFavorite={toggleFavorite}
        onMove={movePerspective}
        onShortcutChange={(id, shortcut) => setSettings((current) => ({ ...current, perspectiveShortcuts: { ...current.perspectiveShortcuts, [id]: shortcut } }))}
        onStartRecording={setShortcutRecordingId}
        onStopRecording={() => setShortcutRecordingId(null)}
      />

      <QuickOpenModal
        visible={quickOpenOpen}
        customPerspectives={customPerspectives}
        projects={projects}
        tags={knownTags}
        onClose={() => setQuickOpenOpen(false)}
        onSelectPerspective={selectPerspective}
        onSelectProject={(id) => navigate({ perspective: "projects", projectFilter: id, tagFilter: null, folderFilter: null })}
        onSelectTag={selectTag}
      />

      <OmniImportModal data={importPreview} error={importError} summary={importSummary} guide={importGuideOpen} onClose={closeImport} onApply={applyImport} onChooseFile={() => void chooseOmniFocusFile()} />

      <ConfirmDeleteModal
        visible={pendingDeleteTaskIds.length > 0 || !!pendingDeleteProjectId}
        title={pendingDeleteProject?.name ?? (pendingDeleteTaskIds.length > 1 ? `${pendingDeleteTaskIds.length} actions` : tasks.find((task) => task.id === pendingDeleteTaskIds[0])?.title) ?? (pendingDeleteProjectId ? "this project" : "this action")}
        message={pendingDeleteMessage}
        onCancel={() => {
          setPendingDeleteTaskIds([]);
          setPendingDeleteDirection("menu");
          setPendingDeleteProjectId(null);
        }}
        onConfirm={() => {
          if (pendingDeleteProjectId) {
            finalizeDeleteProject(pendingDeleteProjectId);
            return;
          }
          if (!pendingDeleteTaskIds.length) return;
          finalizeDeleteTasks(pendingDeleteTaskIds, pendingDeleteDirection);
        }}
      />

      {isPhone && selectedTask && (
        <Modal visible={inspectorOpen && !inspectedProjectId} animationType="slide" onRequestClose={() => setInspectorOpen(false)}>
          <SafeAreaView style={styles.safeArea}><Inspector modal task={selectedTask} projects={projects} onClose={() => setInspectorOpen(false)} onChange={(patch) => updateTask(selectedTask.id, patch)} onToggle={() => toggleTask(selectedTask.id)} onDelete={() => deleteTask(selectedTask.id)} /></SafeAreaView>
        </Modal>
      )}
      {isPhone && inspectedProject && (
        <Modal visible={inspectorOpen} animationType="slide" onRequestClose={() => setInspectorOpen(false)}>
          <SafeAreaView style={styles.safeArea}>
            <ProjectInspector
              modal
              project={inspectedProject}
              remainingCount={tasks.filter((task) => task.projectId === inspectedProject.id && !task.completed && (task.status ?? "active") !== "dropped").length}
              stalled={projectIsStalled(inspectedProject, tasks)}
              onClose={() => setInspectorOpen(false)}
              onChange={(patch) => updateProject(inspectedProject.id, patch)}
              onReview={() => updateProject(inspectedProject.id, { lastReviewedAt: new Date().toISOString() })}
              onSkip={() => skipReview(inspectedProject.id)}
              onDelete={() => deleteProject(inspectedProject.id)}
              onFocus={() => { setInspectorOpen(false); focusProject(inspectedProject.id); }}
            />
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
    </ContextMenuProvider>
  );
}
