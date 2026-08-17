import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert, Modal, Platform, SafeAreaView, View } from "react-native";
import {
  createCustomPerspective,
  defaultSettings,
  makeId,
  palette,
  type ActivePerspective,
  type CustomPerspective,
  type PerspectiveAvailability,
  type PerspectiveId,
  type Project,
  type Task,
} from "./src/model";
import { applyOmniFocusImport, parseOmniFocusFile, type ImportMode, type OmniImportData } from "./src/importOmniFocus";
import { ContextMenuProvider } from "./src/contextMenu";
import { MenuBar } from "./src/menuBar";
import { PerspectivesListModal } from "./src/perspectivesList";
import { QuickOpenModal } from "./src/quickOpen";
import { duplicateCustomPerspective, effectiveGroupBy } from "./src/perspectiveRules";
import {
  convertActionToProject,
  flattenTasks,
  indentTasks,
  insertTaskAfter,
  moveSiblings,
  outdentTasks,
  projectIsStalled,
  renameTag,
  skipReviewTimestamp,
  toTaskPaper,
} from "./src/outline";
import { todayKey, type ForecastDayKey } from "./src/dates";
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
import { PaneResizeHandle, clampPane } from "./src/components/ui/PaneResizeHandle";
import { PerspectiveRail } from "./src/components/perspective/PerspectiveRail";
import { ProjectSidebar } from "./src/components/sidebar/ProjectSidebar";
import { Outline } from "./src/components/outline/Outline";
import { InspectorPane } from "./src/components/inspector/InspectorPane";
import { Inspector } from "./src/components/inspector/Inspector";
import { ProjectInspector } from "./src/components/inspector/ProjectInspector";
import { QuickEntryModal } from "./src/components/modals/QuickEntryModal";
import { SettingsModal } from "./src/components/modals/SettingsModal";
import { ConfirmDeleteModal } from "./src/components/modals/ConfirmDeleteModal";
import { OmniImportModal } from "./src/components/modals/OmniImportModal";
import { DesktopToolbar } from "./src/components/chrome/DesktopToolbar";
import { MobileHeader } from "./src/components/chrome/MobileHeader";
import { FocusBar } from "./src/components/chrome/FocusBar";
import { SearchBar } from "./src/components/chrome/SearchBar";
import { MobileNav } from "./src/components/chrome/MobileNav";
import { ViewOptionsHost } from "./src/components/chrome/ViewOptionsHost";
import { favoritePerspectives, projectColors } from "./src/perspectives/rail";
import { defaultProjectIdFor, filterVisibleTasks, knownTagsFrom, perspectiveTitle, sidebarPerspectiveFor } from "./src/perspectives/query";
import { forecastCountsFor, perspectiveBadgesFor, remainingCountForProject } from "./src/perspectives/counts";
import {
  applyCompleteToggle,
  applyFlagToggle,
  applyMoveToProject,
  applyTaskPatch,
  deleteTaskIds,
  duplicateTasksByIds,
  extraFoldersAfterCreate,
  lingeringIdsAfterCompletion,
  lingeringIdsAfterPatch,
  pendingDeleteCopy,
  removeProjectFromLibrary,
  retainProjectsInPerspectives,
  selectionAfterProjectDelete,
} from "./src/library/mutations";
import { dispatchAppCommand, type AppCommand, type AppCommandHandlers } from "./src/commands/dispatch";
import { usePersistedLibrary } from "./src/hooks/usePersistedLibrary";
import { useLocationHistory } from "./src/hooks/useLocationHistory";
import { useUndoStack } from "./src/hooks/useUndoStack";
import { useAppLayout } from "./src/hooks/useAppLayout";
import { hasNativeMenu, useAppHotkeys } from "./src/hooks/useAppHotkeys";
import { copyToClipboard } from "./src/lib/clipboard";
import "./src/desktopBridge";

export default function App() {
  const { isPhone, canShowSidebar, canShowInspector, sidebarOpen, setSidebarOpen, inspectorOpen, setInspectorOpen } = useAppLayout();
  const retainInspectionIds = useRef<Set<string>>(new Set());
  const {
    perspective,
    projectFilter,
    tagFilter,
    folderFilter,
    forecastDay,
    focusedProjectId,
    canGoBack,
    canGoForward,
    locationRef,
    setProjectFilter,
    hydrateLocation,
    navigate,
    goBack,
    goForward,
  } = useLocationHistory(() => {
    retainInspectionIds.current = new Set();
  });
  const {
    projects,
    setProjects,
    tasks,
    setTasks,
    customPerspectives,
    setCustomPerspectives,
    settings,
    setSettings,
    hydrated,
  } = usePersistedLibrary(hydrateLocation);
  const { pushUndo, undo: takeUndo, redo: takeRedo } = useUndoStack({ projects, tasks });
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [inspectedProjectId, setInspectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [collapseNonce, setCollapseNonce] = useState<{ action: "expand" | "collapse"; n: number } | null>(null);
  const [pendingCleanupIds, setPendingCleanupIds] = useState<string[]>([]);
  const [, startSidebarTransition] = useTransition();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
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
  const nativeMenu = hasNativeMenu();
  const marqueeBaseRef = useRef<SelectionState>(emptySelection);

  const selectedTaskIds = selection.ids;
  const selectedTaskId = selection.headId ?? selection.ids[0] ?? null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
  const selectedProject = selectedTask?.projectId ? projects.find((project) => project.id === selectedTask.projectId) : undefined;
  const defaultProjectId = defaultProjectIdFor({
    projectFilter,
    folderFilter,
    selectedProjectId: selectedProject?.id,
    projects,
  });
  const inspectedProject = inspectedProjectId ? projects.find((project) => project.id === inspectedProjectId) : undefined;
  const activeCustomPerspective = perspective.startsWith("custom:") ? customPerspectives.find((item) => item.id === perspective.slice(7)) ?? null : null;
  const barItems = useMemo(() => favoritePerspectives(settings, customPerspectives), [customPerspectives, settings]);
  const knownTags = useMemo(() => knownTagsFrom(tasks), [tasks]);
  const focusedProject = focusedProjectId ? projects.find((project) => project.id === focusedProjectId) : undefined;

  const visibleTasks = useMemo(() => filterVisibleTasks({
    tasks,
    projects,
    perspective,
    projectFilter,
    tagFilter,
    folderFilter,
    forecastDay,
    focusedProjectId,
    query,
    settings,
    customPerspective: activeCustomPerspective,
    pendingCleanupIds,
  }), [tasks, projects, perspective, projectFilter, tagFilter, folderFilter, forecastDay, focusedProjectId, settings, query, activeCustomPerspective, pendingCleanupIds]);

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

  const title = perspectiveTitle({
    perspective,
    customPerspective: activeCustomPerspective,
    projects,
    projectFilter,
    folderFilter,
    tagFilter,
  });

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
    setTasks((current) => applyTaskPatch(current, id, patch));
    const current = tasks.find((task) => task.id === id);
    if (patch.projectId !== undefined && current && current.projectId !== patch.projectId) {
      retainInspectionIds.current = new Set([...retainInspectionIds.current, id]);
    }
    if (!settings.cleanUpImmediately) {
      setPendingCleanupIds((ids) => lingeringIdsAfterPatch(ids, id, patch, current));
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
    pushUndo();
    setTasks((current) => applyCompleteToggle(current, ids));
    if (!settings.cleanUpImmediately) {
      setPendingCleanupIds((current) => lingeringIdsAfterCompletion(current, ids, nextCompleted));
    }
  };

  const toggleTaskFlags = (ids: string[]) => {
    if (!ids.length) return;
    setTasks((current) => applyFlagToggle(current, ids));
  };

  const finalizeDeleteTasks = useCallback((ids: string[], direction: "menu" | "previous" | "next") => {
    const { remaining, removed } = deleteTaskIds(tasks, ids);
    const nextId = neighborAfterDelete(orderedTaskIds, removed, direction);
    setTasks(remaining);
    setPendingDeleteTaskIds([]);
    setPendingDeleteDirection("menu");
    setSelection(singleSelection(nextId));
    if (!nextId) setInspectorOpen(false);
  }, [orderedTaskIds, setInspectorOpen, tasks]);

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
    const next = removeProjectFromLibrary(projects, tasks, customPerspectives, id);
    setProjects(next.projects);
    setTasks(next.tasks);
    setCustomPerspectives(next.customPerspectives);
    setProjectFilter((current) => current === id ? null : current);
    setInspectedProjectId((current) => current === id ? null : current);
    setSelection((current) => selectionAfterProjectDelete(current, tasks, id));
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
        extraFolders: extraFoldersAfterCreate(current.extraFolders, name),
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
  }, [isPhone, orderedTaskIds, setInspectorOpen, settings.openInspectorOnSelection]);

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
    const previous = takeUndo();
    if (!previous) return;
    setProjects(previous.projects);
    setTasks(previous.tasks);
  };
  const redo = () => {
    const next = takeRedo();
    if (!next) return;
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
    let copies: Task[] = [];
    pushUndo();
    setTasks((current) => {
      const result = duplicateTasksByIds(current, ids);
      copies = result.copies;
      return result.tasks;
    });
    if (copies.length === 1) setSelection(singleSelection(copies[0]?.id ?? null));
    else if (copies.length) setSelection({ ids: copies.map((item) => item.id), anchorId: copies[0]?.id ?? null, headId: copies[copies.length - 1]?.id ?? null });
  };

  const moveTasks = (id: string, projectId: string | null) => {
    const ids = idsForRow(id);
    const fromInbox = tasks.filter((task) => ids.includes(task.id) && task.projectId === null);
    pushUndo();
    setTasks((current) => applyMoveToProject(current, ids, projectId));
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
      setCustomPerspectives((current) => retainProjectsInPerspectives(current, retainedProjectIds));
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
  const pendingDelete = pendingDeleteCopy({
    projectName: pendingDeleteProject?.name,
    projectActionCount: pendingDeleteProjectActionCount,
    taskCount: pendingDeleteTaskIds.length,
    taskTitle: tasks.find((task) => task.id === pendingDeleteTaskIds[0])?.title,
    deletingProject: !!pendingDeleteProjectId,
  });
  const sidebarPerspective = sidebarPerspectiveFor(perspective, activeCustomPerspective);
  const showSidebar = !isPhone && canShowSidebar && sidebarOpen && perspective !== "inbox" && perspective !== "completed" && !activeCustomPerspective?.keepSidebarHidden;
  const showInspector = !isPhone && canShowInspector && inspectorOpen;
  const modalOpen = quickKind !== null || settingsOpen || perspectivesListOpen || quickOpenOpen || importGuideOpen || !!importPreview || !!importError || !!importSummary;

  const commandHandlersRef = useRef<AppCommandHandlers>(null!);
  commandHandlersRef.current = {
    selectPerspective,
    canShowSidebar,
    canShowInspector,
    setSidebarOpen,
    setInspectorOpen,
    setSearchOpen,
    setSettingsOpen,
    setViewMenuOpen,
    addCustomPerspective,
    setPerspectivesListOpen,
    togglePerspectivesBar: () => setSettings((current) => ({ ...current, perspectiveBarVisible: !current.perspectiveBarVisible })),
    setQuickOpenOpen,
    openOmniFocusImport,
    toggleTitles: () => setSettings((current) => ({ ...current, perspectiveBarShowsTitles: !current.perspectiveBarShowsTitles })),
    insertAction: () => insertAction(),
    setQuickKind,
    selectedTaskIds,
    toggleTasks,
    toggleTaskFlags,
    deleteTasks,
    projectFilter,
    deleteProject,
    focusSelected,
    goBack,
    goForward,
    markSelectedReviewed: () => {
      if (perspective === "review" && selectedTask?.projectId) {
        setProjects((current) => current.map((project) => project.id === selectedTask.projectId ? { ...project, lastReviewedAt: new Date().toISOString() } : project));
      }
    },
    selectAdjacentTask,
    selectAllVisible,
    cleanUp,
    duplicateSelected: () => {
      if (selectedTaskIds.length) duplicateTasks(selectedTaskIds[0] ?? "");
    },
    startEditTitle: () => startEditTitle(),
    expandAll,
    collapseAll,
    indentSelected: () => { if (selectedTaskId) indentSelected(selectedTaskId); },
    outdentSelected: () => { if (selectedTaskId) outdentSelected(selectedTaskId); },
    moveSelected: (direction) => { if (selectedTaskId) moveSelected(selectedTaskId, direction); },
    undo,
    redo,
    copySelectedTaskPaper: () => { if (selectedTaskId) copySelectedTaskPaper(selectedTaskId); },
    convertSelectedToProject: () => convertSelectedToProject(),
    confirmPendingDelete: () => {
      if (pendingDeleteProjectId) finalizeDeleteProject(pendingDeleteProjectId);
      else if (pendingDeleteTaskIds.length) finalizeDeleteTasks(pendingDeleteTaskIds, pendingDeleteDirection);
    },
    cancelTopOverlay: () => {
      if (pendingDeleteProjectId) {
        setPendingDeleteProjectId(null);
        return;
      }
      if (pendingDeleteTaskIds.length) {
        setPendingDeleteTaskIds([]);
        setPendingDeleteDirection("menu");
        return;
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
    },
  };

  const handleHotkeyAction = useCallback((action: AppCommand) => {
    dispatchAppCommand(action, commandHandlersRef.current);
  }, []);

  useAppHotkeys({
    enabled: true,
    modalOpen,
    pendingDeleteOpen: !!pendingDeleteTaskIds.length || !!pendingDeleteProjectId,
    perspectiveShortcuts: settings.perspectiveShortcuts,
    shortcutRecordingId,
    customPerspectives,
    onCommand: handleHotkeyAction,
  });

  const sidebarProjects = focusedProjectId ? projects.filter((project) => project.id === focusedProjectId) : projects;
  const forecastCounts = useMemo(() => forecastCountsFor(tasks, focusedProjectId), [focusedProjectId, tasks]);
  const perspectiveBadges = useMemo(() => perspectiveBadgesFor(tasks, projects, focusedProjectId), [focusedProjectId, projects, tasks]);

  const changeAvailability = (availability: PerspectiveAvailability) => {
    if (perspective.startsWith("custom:")) return;
    setSettings((current) => ({
      ...current,
      standardAvailability: { ...current.standardAvailability, [perspective as PerspectiveId]: availability },
      showCompleted: availability === "all" || availability === "completed",
    }));
  };

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
            nativeMenu={nativeMenu}
            onCommand={handleHotkeyAction}
          />
        )}
        {!isPhone ? (
          <DesktopToolbar
            showSidebar={showSidebar}
            showInspector={showInspector}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            viewMenuOpen={viewMenuOpen}
            settingsOpen={settingsOpen}
            searchOpen={searchOpen}
            focused={!!focusedProjectId}
            canFocus={!!focusedProjectId || !!selectedTask?.projectId || !!projectFilter}
            onToggleSidebar={() => setSidebarOpen((value) => !value)}
            onBack={goBack}
            onForward={goForward}
            onToggleView={() => setViewMenuOpen((value) => !value)}
            onNewAction={() => insertAction()}
            onQuickEntry={() => setQuickKind("task")}
            onQuickOpen={() => setQuickOpenOpen(true)}
            onFocus={focusSelected}
            onSettings={() => setSettingsOpen(true)}
            onToggleSearch={() => setSearchOpen((value) => !value)}
            onToggleInspector={() => setInspectorOpen((value) => !value)}
          />
        ) : (
          <MobileHeader
            title={title}
            onViewOptions={() => setViewMenuOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onToggleSearch={() => setSearchOpen((value) => !value)}
            onNewAction={() => insertAction()}
          />
        )}

        {focusedProject && <FocusBar name={focusedProject.name} onUnfocus={unfocus} />}
        {searchOpen && (
          <SearchBar
            query={query}
            resultCount={visibleTasks.length}
            onChangeQuery={setQuery}
            onClose={() => { setQuery(""); setSearchOpen(false); }}
          />
        )}
        {viewMenuOpen && (
          <ViewOptionsHost
            compact={isPhone}
            dismissDesktop={!isPhone}
            perspective={perspective}
            custom={activeCustomPerspective}
            projects={projects}
            tags={knownTags}
            settings={settings}
            onChangeAvailability={changeAvailability}
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
            title={title}
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
              <InspectorPane
                selectedTaskIds={selectedTaskIds}
                selectedTask={selectedTask}
                selectedTasks={selectedTasks}
                inspectedProject={inspectedProject}
                tagFilter={tagFilter}
                tasks={tasks}
                projects={projects}
                onToggleSelected={() => toggleTasks(selectedTaskIds)}
                onToggleFlagSelected={() => toggleTaskFlags(selectedTaskIds)}
                onDeleteSelected={() => deleteTasks(selectedTaskIds)}
                onChangeTask={(patch) => selectedTask && updateTask(selectedTask.id, patch)}
                onToggleTask={() => selectedTask && toggleTask(selectedTask.id)}
                onDeleteTask={() => selectedTask && deleteTask(selectedTask.id)}
                onChangeProject={(patch) => inspectedProject && updateProject(inspectedProject.id, patch)}
                onReviewProject={() => inspectedProject && updateProject(inspectedProject.id, { lastReviewedAt: new Date().toISOString() })}
                onSkipProject={() => inspectedProject && skipReview(inspectedProject.id)}
                onDeleteProject={() => inspectedProject && deleteProject(inspectedProject.id)}
                onFocusProject={() => inspectedProject && focusProject(inspectedProject.id)}
                onRenameTag={renameSelectedTag}
              />
            </View>
            </>
          )}
        </View>

        {isPhone && (
          <MobileNav
            items={barItems}
            currentId={perspective}
            onSelect={selectPerspective}
            onEdit={openViewOptions}
            onUnfavorite={toggleFavorite}
            onOpenList={() => setPerspectivesListOpen(true)}
            onDelete={deleteCustomPerspective}
            onImport={() => void openOmniFocusImport()}
            onSettings={() => setSettingsOpen(true)}
          />
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
        title={pendingDelete.title}
        message={pendingDelete.message}
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
              remainingCount={remainingCountForProject(tasks, inspectedProject.id)}
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
