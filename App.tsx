import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert, Modal, Platform, SafeAreaView, useColorScheme, View } from "react-native";
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
  type TagRecord,
  type Task,
} from "./src/model";
import { applyOmniFocusImport, parseOmniFocusFile, type ImportMode, type OmniImportData } from "./src/importOmniFocus";
import { ContextMenuProvider } from "./src/contextMenu";
import { MenuBar } from "./src/menuBar";
import { PerspectivesListModal } from "./src/perspectivesList";
import { QuickOpenModal } from "./src/quickOpen";
import { duplicateCustomPerspective, effectiveGroupBy, perspectiveActsAsInbox, perspectiveHidesSidebar } from "./src/perspectiveRules";
import {
  convertActionToProject,
  flattenTasks,
  indentTasks,
  insertTaskAfter,
  moveSiblings,
  outdentTasks,
  pasteTaskPaper,
  projectIsStalled,
  renameTag,
  skipReviewTimestamp,
  toTaskPaper,
} from "./src/outline";
import { todayKey, emptyFocus, focusLabel, focusedTaskProjectIds, isFocusActive, projectMatchesFocus, type ForecastDayKey } from "./src/dates";
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
import { QuickEntryModal, type QuickEntryPayload } from "./src/components/modals/QuickEntryModal";
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
  applyCompleteAndAwaitReply,
  applyCompleteToggle,
  applyCompleteWithLastAction,
  applyFlagToggle,
  applyMoveToProject,
  applySidebarDrop,
  applyTaskPatch,
  deleteTaskIds,
  duplicateProjectById,
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
import { copyToClipboard, readClipboard } from "./src/lib/clipboard";
import { downloadTextFile } from "./src/lib/download";
import { addDraftFromUrl, applyOmniCloneAdd, applyOmniClonePaste, buildXSuccessUrl, documentTitle, parseOmniCloneUrl, resolveOmniCloneOpen } from "./src/links";
import { mergeTagRecords, renameTagRecord, upsertTagRecord } from "./src/tags";
import { isTextInputTarget } from "./src/hotkeys";
import { findTypeSelectMatch, nextTypeSelectQuery } from "./src/typeSelect";
import { applyDocumentTheme, resolvedScheme } from "./src/theme";
import type { SidebarDropTarget } from "./src/library/mutations";
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
    focusedProjectIds,
    focusedFolderPaths,
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
    setSidebarSelection({ projectIds: [], folderPaths: [] });
  });
  const {
    projects,
    setProjects,
    tasks,
    setTasks,
    customPerspectives,
    setCustomPerspectives,
    tagRecords,
    setTagRecords,
    settings,
    setSettings,
    hydrated,
  } = usePersistedLibrary(hydrateLocation);
  const { pushUndo, undo: takeUndo, redo: takeRedo } = useUndoStack({ projects, tasks });
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [outlineCollapsedIds, setOutlineCollapsedIds] = useState<string[]>([]);
  const [inspectedProjectId, setInspectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // A row inserted by New Action that has never been given a title. Cancelling or
  // clicking away discards it, the way OmniFocus does, instead of leaving an
  // empty action behind in the database.
  const [unnamedTaskId, setUnnamedTaskId] = useState<string | null>(null);
  const [collapseNonce, setCollapseNonce] = useState<{ action: "expand" | "collapse"; n: number } | null>(null);
  const [pendingCleanupIds, setPendingCleanupIds] = useState<string[]>([]);
  const [, startSidebarTransition] = useTransition();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "tasks"; ids: string[]; direction: "menu" | "previous" | "next" }
    | { kind: "project"; id: string }
    | null
  >(null);
  const [quickKind, setQuickKind] = useState<"task" | "project" | "folder" | null>(null);
  const [quickDraft, setQuickDraft] = useState<QuickEntryPayload | null>(null);
  const pendingXSuccessRef = useRef<string | undefined>(undefined);
  const [perspectivesListOpen, setPerspectivesListOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [shortcutRecordingId, setShortcutRecordingId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<OmniImportData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importGuideOpen, setImportGuideOpen] = useState(false);
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const [sidebarSelection, setSidebarSelection] = useState<{ projectIds: string[]; folderPaths: string[] }>({ projectIds: [], folderPaths: [] });
  const typeSelectRef = useRef({ query: "", at: 0 });
  const nativeMenu = hasNativeMenu();
  const marqueeBaseRef = useRef<SelectionState>(emptySelection);

  const selectedTaskIds = selection.ids;
  const selectedTaskId = selection.headId ?? selection.ids[0] ?? null;
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, tasks]);
  const selectedIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const selectedTasks = useMemo(() => selectedIdSet.size ? tasks.filter((task) => selectedIdSet.has(task.id)) : [], [selectedIdSet, tasks]);
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
  const knownTagRecords = useMemo(() => mergeTagRecords(tagRecords, tasks), [tagRecords, tasks]);
  const knownTags = useMemo(() => knownTagsFrom(tasks, knownTagRecords), [knownTagRecords, tasks]);
  const focused = useMemo(() => ({ focusedProjectIds, focusedFolderPaths }), [focusedFolderPaths, focusedProjectIds]);
  const focusedName = focusLabel(projects, focused);
  const systemScheme = useColorScheme();
  const colorScheme = resolvedScheme(settings.appearance, systemScheme === "dark" ? "dark" : "light");
  useEffect(() => {
    applyDocumentTheme(colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    const interval = window.setInterval(() => setCalendarNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setOutlineCollapsedIds([]);
  }, [perspective, projectFilter, folderFilter, tagFilter, activeCustomPerspective?.id]);

  useEffect(() => {
    if (!hydrated) return;
    setProjects((current) => applyCompleteWithLastAction(current, tasks));
  }, [hydrated, setProjects, tasks]);

  const visibleTasks = useMemo(() => filterVisibleTasks({
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
    customPerspective: activeCustomPerspective,
    pendingCleanupIds,
    tagRecords: knownTagRecords,
  }), [tasks, projects, perspective, projectFilter, tagFilter, folderFilter, forecastDay, focusedProjectIds, focusedFolderPaths, settings, query, activeCustomPerspective, pendingCleanupIds, knownTagRecords]);

  const orderedTaskIds = useMemo(() => outlineTaskIds({
    tasks: visibleTasks,
    projects,
    perspective,
    groupBy: activeCustomPerspective ? effectiveGroupBy(activeCustomPerspective) : null,
    projectFilter,
    collapsedIds: outlineCollapsedIds,
  }), [visibleTasks, projects, perspective, activeCustomPerspective, projectFilter, outlineCollapsedIds]);

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

  useEffect(() => {
    const next = documentTitle(title, focusedName);
    if (typeof document !== "undefined") document.title = next;
    if (typeof window !== "undefined") window.omniclone?.setWindowTitle?.(next);
  }, [focusedName, title]);

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
    pushUndo();
    setTasks((current) => {
      const previous = current.find((task) => task.id === id);
      if (patch.projectId !== undefined && previous && previous.projectId !== patch.projectId) {
        retainInspectionIds.current = new Set([...retainInspectionIds.current, id]);
      }
      if (patch.tags) {
        setTagRecords((records) => patch.tags!.reduce((next, tag) => upsertTagRecord(next, { name: tag }), records));
      }
      if (!settings.cleanUpImmediately) {
        setPendingCleanupIds((ids) => lingeringIdsAfterPatch(ids, id, patch, previous));
      }
      return applyTaskPatch(current, id, patch);
    });
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

  const completeAndAwaitReply = (ids: string[]) => {
    if (!ids.length) return;
    const targets = tasks.filter((task) => ids.includes(task.id) && !task.completed);
    if (!targets.length) return;
    pushUndo();
    setTasks((current) => applyCompleteAndAwaitReply(current, ids, settings.awaitReplyDays));
    if (!settings.cleanUpImmediately) {
      setPendingCleanupIds((current) => lingeringIdsAfterCompletion(current, ids, true));
    }
  };

  const typeSelect = (key: string) => {
    const next = nextTypeSelectQuery(typeSelectRef.current, key, Date.now());
    typeSelectRef.current = next;
    const from = orderedTaskIds.indexOf(selectedTaskId ?? "") + 1;
    const match = findTypeSelectMatch(visibleTasks, next.query, orderedTaskIds, from);
    if (match) setSelection(singleSelection(match));
  };

  const findTypeSelect = (direction: 1 | -1) => {
    const query = typeSelectRef.current.query;
    if (!query) return;
    const current = orderedTaskIds.indexOf(selectedTaskId ?? "");
    const from = current + direction;
    const match = findTypeSelectMatch(visibleTasks, query, orderedTaskIds, from, direction);
    if (match) setSelection(singleSelection(match));
  };

  const toggleTaskFlags = (ids: string[]) => {
    if (!ids.length) return;
    pushUndo();
    setTasks((current) => applyFlagToggle(current, ids));
  };

  const finalizeDeleteTasks = useCallback((ids: string[], direction: "menu" | "previous" | "next") => {
    pushUndo();
    const { remaining, removed } = deleteTaskIds(tasks, ids);
    const nextId = neighborAfterDelete(orderedTaskIds, removed, direction);
    setTasks(remaining);
    setPendingDelete(null);
    setSelection(singleSelection(nextId));
    if (!nextId) setInspectorOpen(false);
  }, [orderedTaskIds, pushUndo, setInspectorOpen, tasks]);

  const deleteTasks = (ids: string[], direction: "menu" | "previous" | "next" = "menu") => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;
    if (settings.confirmBeforeDelete) {
      setPendingDelete({ kind: "tasks", ids: unique, direction });
      return;
    }
    finalizeDeleteTasks(unique, direction);
  };

  const deleteTask = (id: string, direction: "menu" | "previous" | "next" = "menu") => {
    deleteTasks(idsForRow(id), direction);
  };

  const finalizeDeleteProject = (id: string) => {
    pushUndo();
    const next = removeProjectFromLibrary(projects, tasks, customPerspectives, id);
    setProjects(next.projects);
    setTasks(next.tasks);
    setCustomPerspectives(next.customPerspectives);
    setProjectFilter((current) => current === id ? null : current);
    setInspectedProjectId((current) => current === id ? null : current);
    setSelection((current) => selectionAfterProjectDelete(current, tasks, id));
    setPendingDelete(null);
  };

  const deleteProject = (id: string) => {
    if (settings.confirmBeforeDelete) {
      setPendingDelete({ kind: "project", id });
      return;
    }
    finalizeDeleteProject(id);
  };

  const closeQuickEntry = () => {
    pendingXSuccessRef.current = undefined;
    setQuickDraft(null);
    setQuickKind(null);
  };

  const startQuickEntry = (kind: "task" | "project" | "folder" | null) => {
    pendingXSuccessRef.current = undefined;
    setQuickDraft(null);
    setQuickKind(kind);
  };

  const openCallbackUrl = (url: string) => {
    if (typeof window !== "undefined" && window.omniclone?.openExternal) {
      window.omniclone.openExternal(url);
      return;
    }
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
  };

  const revealCreatedTasks = (created: Task[]) => {
    if (!created.length) return;
    const first = created[0];
    if (!first) return;
    retainInspectionIds.current = new Set([...retainInspectionIds.current, ...created.map((item) => item.id)]);
    if (created.length === 1) setSelection(singleSelection(first.id));
    else {
      setSelection({
        ids: created.map((item) => item.id),
        anchorId: first.id,
        headId: created[created.length - 1]?.id ?? first.id,
      });
    }
    setInspectedProjectId(null);
    setInspectorOpen(true);
    if (first.projectId === null) selectPerspective("inbox");
    else navigate({ perspective: "projects", projectFilter: first.projectId, tagFilter: null, folderFilter: null, ...emptyFocus() });
  };

  const rememberCreatedTags = (created: Task[]) => {
    const tags = created.flatMap((item) => item.tags);
    if (!tags.length) return;
    setTagRecords((current) => tags.reduce((records, tag) => upsertTagRecord(records, { name: tag }), current));
  };

  const createItem = (payload: QuickEntryPayload) => {
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
        defer: payload.defer,
        note: payload.note,
        flagged: payload.flagged ?? false,
        completed: false,
        createdAt: new Date().toISOString(),
        estimatedMinutes: payload.estimatedMinutes,
      };
      setTasks((current) => [...current, task]);
      rememberCreatedTags([task]);
      revealCreatedTasks([task]);
      const callback = pendingXSuccessRef.current;
      if (callback) openCallbackUrl(buildXSuccessUrl(callback, task.id));
    }
    pendingXSuccessRef.current = undefined;
    setQuickDraft(null);
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
    const projectIds = sidebarSelection.projectIds.length
      ? sidebarSelection.projectIds
      : [selectedTask?.projectId ?? projectFilter].filter((id): id is string => !!id);
    const folderPaths = sidebarSelection.folderPaths.length
      ? sidebarSelection.folderPaths
      : folderFilter ? [folderFilter] : [];
    if (!projectIds.length && !folderPaths.length) return;
    const already = isFocusActive(focused)
      && projectIds.length === focusedProjectIds.length
      && projectIds.every((id) => focusedProjectIds.includes(id))
      && folderPaths.length === focusedFolderPaths.length
      && folderPaths.every((path) => focusedFolderPaths.includes(path));
    if (already) {
      navigate(emptyFocus());
      return;
    }
    navigate({
      perspective: "projects",
      projectFilter: projectIds.length === 1 ? projectIds[0] ?? null : null,
      folderFilter: folderPaths.length === 1 && !projectIds.length ? folderPaths[0] ?? null : null,
      tagFilter: null,
      focusedProjectIds: projectIds,
      focusedFolderPaths: folderPaths,
    });
  };

  const unfocus = () => {
    navigate(emptyFocus());
  };

  const focusProject = (projectId: string) => {
    setSidebarSelection({ projectIds: [projectId], folderPaths: [] });
    navigate({ perspective: "projects", projectFilter: projectId, tagFilter: null, focusedProjectIds: [projectId], focusedFolderPaths: [] });
  };

  const selectProject = (id: string | null, modifiers?: { toggle?: boolean }) => {
    if (modifiers?.toggle && id) {
      setSidebarSelection((current) => ({
        projectIds: current.projectIds.includes(id) ? current.projectIds.filter((item) => item !== id) : [...current.projectIds, id],
        folderPaths: current.folderPaths,
      }));
      return;
    }
    setSidebarSelection({ projectIds: id ? [id] : [], folderPaths: [] });
    startSidebarTransition(() => {
      navigate({ perspective: "projects", projectFilter: id, tagFilter: null, folderFilter: null });
    });
  };

  const selectFolder = (folder: string | null, modifiers?: { toggle?: boolean }) => {
    if (modifiers?.toggle && folder) {
      setSidebarSelection((current) => ({
        projectIds: current.projectIds,
        folderPaths: current.folderPaths.includes(folder) ? current.folderPaths.filter((item) => item !== folder) : [...current.folderPaths, folder],
      }));
      return;
    }
    setSidebarSelection({ projectIds: [], folderPaths: folder ? [folder] : [] });
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

  /**
   * Insert a new action.
   *
   * `prePatch` is applied to the existing task in the same state update. Return
   * in the outline commits the current title and opens the next row, and doing
   * those as two separate updates let the insert overwrite the title with a
   * stale snapshot of the task list.
   */
  const insertAction = (
    projectId?: string | null,
    afterId?: string | null,
    prePatch?: { id: string; patch: Partial<Task> }
  ) => {
    pushUndo();
    const after = afterId ?? selectedTaskId;
    const afterTask = after ? tasks.find((task) => task.id === after) : undefined;
    const resolvedProjectId = projectId ?? afterTask?.projectId ?? defaultProjectId;
    const created: Task = {
      id: makeId("task"),
      title: "",
      projectId: resolvedProjectId,
      tags: [],
      flagged: false,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTasks((current) => {
      const base = prePatch ? applyTaskPatch(current, prePatch.id, prePatch.patch) : current;
      return insertTaskAfter(base, after, created, resolvedProjectId).tasks;
    });
    setInspectedProjectId(null);
    setSelection(singleSelection(created.id));
    setEditingTaskId(created.id);
    setUnnamedTaskId(created.id);
    if (resolvedProjectId === null) selectPerspective("inbox");
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
  const pasteTaskPaperText = (text: string) => {
    if (!text.trim()) return;
    pushUndo();
    const result = pasteTaskPaper(tasks, projects, text, {
      afterId: selectedTaskId,
      fallbackProjectId: defaultProjectId,
    });
    setTasks(result.tasks);
    rememberCreatedTags(result.created);
    if (result.created.length) revealCreatedTasks(result.created);
  };
  const pasteFromClipboard = async () => {
    const text = await readClipboard();
    pasteTaskPaperText(text);
  };
  const revealInProjects = (id?: string) => {
    const task = tasks.find((item) => item.id === (id ?? selectedTaskId));
    if (!task) return;
    if (!task.projectId) {
      navigate({ perspective: "inbox", projectFilter: null, tagFilter: null, folderFilter: null, ...emptyFocus() });
    } else {
      const project = projects.find((item) => item.id === task.projectId);
      navigate({
        perspective: "projects",
        projectFilter: task.projectId,
        tagFilter: null,
        folderFilter: project?.folder ?? null,
        ...emptyFocus(),
      });
    }
    setInspectedProjectId(null);
    setSelection(singleSelection(task.id));
    setInspectorOpen(true);
  };
  const dropOnSidebar = (ids: string[], target: SidebarDropTarget) => {
    pushUndo();
    setTasks(applySidebarDrop(tasks, projects, ids.length ? ids : selectedTaskIds, target));
    if (target.kind === "tag") setTagRecords((current) => upsertTagRecord(current, { name: target.tag }));
  };
  const changeSelectedTag = (patch: Partial<TagRecord>) => {
    if (!tagFilter) return;
    setTagRecords((current) => upsertTagRecord(current, { ...(knownTagRecords.find((item) => item.name === tagFilter) ?? { name: tagFilter }), ...patch, name: tagFilter }));
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

  const duplicateProject = (projectId?: string) => {
    const targetId = projectId ?? projectFilter ?? inspectedProjectId ?? selectedTask?.projectId;
    if (!targetId) return;
    const result = duplicateProjectById(projects, tasks, targetId);
    if (!result) return;
    pushUndo();
    setProjects(result.projects);
    setTasks(result.tasks);
    navigate({ perspective: "projects", projectFilter: result.project.id, tagFilter: null, folderFilter: null });
    setInspectedProjectId(result.project.id);
    setSelection(emptySelection);
  };

  const exportTaskPaper = () => {
    const paper = toTaskPaper(tasks, tasks, projects);
    const slug = (focusedName || title || "OmniClone").replace(/[\\/:*?"<>|]+/g, "-");
    downloadTextFile(`${slug}.taskpaper`, paper);
  };

  const printDocument = () => {
    if (typeof window !== "undefined") window.print();
  };

  const openOmniCloneUrl = useCallback((raw: string) => {
    const parsed = parseOmniCloneUrl(raw);
    if (!parsed) return;
    if (parsed.kind === "task" || parsed.kind === "perspective") {
      const resolved = resolveOmniCloneOpen(raw, tasks);
      if (!resolved) return;
      if (resolved.kind === "perspective") {
        selectPerspective(resolved.id as ActivePerspective);
        return;
      }
      retainInspectionIds.current = new Set([...retainInspectionIds.current, resolved.id]);
      navigate({
        perspective: resolved.projectId ? "projects" : "inbox",
        projectFilter: resolved.projectId,
        tagFilter: null,
        folderFilter: null,
        ...emptyFocus(),
      });
      setSelection(singleSelection(resolved.id));
      setInspectedProjectId(null);
      setInspectorOpen(true);
      return;
    }
    if (parsed.kind === "add") {
      const draft = addDraftFromUrl(parsed, projects, knownTagRecords);
      if (!parsed.autosave) {
        pendingXSuccessRef.current = parsed.xSuccess;
        setQuickDraft({
          title: draft.title,
          projectId: draft.projectId,
          flagged: draft.flagged,
          due: draft.due,
          defer: draft.defer,
          note: draft.note,
          tags: draft.tags,
          estimatedMinutes: draft.estimatedMinutes,
        });
        setQuickKind("task");
        return;
      }
      if (!draft.title) return;
      pushUndo();
      const result = applyOmniCloneAdd(tasks, projects, parsed, knownTagRecords);
      setTasks(result.tasks);
      rememberCreatedTags([result.task]);
      revealCreatedTasks([result.task]);
      if (parsed.xSuccess) openCallbackUrl(buildXSuccessUrl(parsed.xSuccess, result.task.id));
      return;
    }
    if (parsed.kind === "paste") {
      void (async () => {
        const content = parsed.content?.trim() ? parsed.content : await readClipboard();
        if (!content.trim()) return;
        pushUndo();
        const result = applyOmniClonePaste(tasks, projects, { ...parsed, content }, { clipboard: content });
        if (!result.created.length) return;
        setTasks(result.tasks);
        rememberCreatedTags(result.created);
        revealCreatedTasks(result.created);
      })();
    }
  }, [knownTagRecords, navigate, projects, pushUndo, selectPerspective, setInspectorOpen, tasks]);
  const openOmniCloneUrlRef = useRef(openOmniCloneUrl);
  openOmniCloneUrlRef.current = openOmniCloneUrl;

  const moveTasks = (id: string, projectId: string | null) => {
    const ids = idsForRow(id);
    pushUndo();
    setTasks((current) => {
      const fromInbox = current.filter((task) => ids.includes(task.id) && task.projectId === null);
      const next = applyMoveToProject(current, ids, projectId);
      if (!settings.cleanUpImmediately && projectId && fromInbox.length && perspectiveActsAsInbox(perspective, activeCustomPerspective)) {
        setPendingCleanupIds((pending) => [...new Set([...pending, ...fromInbox.map((task) => task.id)])]);
      }
      return next;
    });
  };

  /**
   * Drop a never-named New Action row. Bypasses deleteTasks so discarding a row
   * the user never filled in does not raise the delete confirmation.
   */
  const discardUnnamedTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    setUnnamedTaskId((current) => (current === id ? null : current));
    setEditingTaskId((current) => (current === id ? null : current));
    setSelection((current) => (current.ids.includes(id) ? emptySelection : current));
  };

  const commitTaskTitle = (id: string, title: string) => {
    if (!title.trim() && id === unnamedTaskId) {
      discardUnnamedTask(id);
      return;
    }
    if (title.trim()) setUnnamedTaskId((current) => (current === id ? null : current));
    updateTask(id, { title });
    setEditingTaskId((current) => current === id ? null : current);
  };

  /** Return in the outline: commit this title, then open a fresh sibling row. */
  const commitTaskTitleAndAdd = (id: string, title: string) => {
    if (!title.trim()) {
      if (id === unnamedTaskId) discardUnnamedTask(id);
      else setEditingTaskId((current) => (current === id ? null : current));
      return;
    }
    const task = tasks.find((item) => item.id === id);
    setUnnamedTaskId((current) => (current === id ? null : current));
    insertAction(task?.projectId ?? null, id, { id, patch: { title } });
  };

  const cancelTaskEdit = (id: string) => {
    if (id === unnamedTaskId) discardUnnamedTask(id);
    else setEditingTaskId((current) => (current === id ? null : current));
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
    setTagRecords((current) => renameTagRecord(current, tagFilter, nextName));
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
    pushUndo();
    const result = applyOmniFocusImport(projects, tasks, importPreview, mode);
    setProjects(result.projects);
    setTasks(result.tasks);
    if (mode === "replace") {
      const retainedProjectIds = new Set(result.projects.map((project) => project.id));
      setCustomPerspectives((current) => retainProjectsInPerspectives(current, retainedProjectIds));
    }
    setSelection(singleSelection(result.tasks[0]?.id ?? null));
    navigate({ perspective: "projects", projectFilter: null, tagFilter: null, ...emptyFocus() });
    setInspectorOpen(false);
    setImportPreview(null);
    const duplicateNote = result.duplicateTasks ? ` ${result.duplicateTasks} duplicate${result.duplicateTasks === 1 ? " was" : "s were"} ignored.` : "";
    setImportSummary(`${mode === "replace" ? "Loaded" : "Added"} ${result.addedTasks} action${result.addedTasks === 1 ? "" : "s"} and ${result.addedProjects} project${result.addedProjects === 1 ? "" : "s"}.${duplicateNote}`);
  };

  const pendingDeleteProject = pendingDelete?.kind === "project" ? projects.find((project) => project.id === pendingDelete.id) : undefined;
  const pendingDeleteProjectActionCount = pendingDelete?.kind === "project" ? tasks.filter((task) => task.projectId === pendingDelete.id).length : 0;
  const pendingDeleteDialog = pendingDeleteCopy({
    projectName: pendingDeleteProject?.name,
    projectActionCount: pendingDeleteProjectActionCount,
    taskCount: pendingDelete?.kind === "tasks" ? pendingDelete.ids.length : 0,
    taskTitle: pendingDelete?.kind === "tasks" ? tasks.find((task) => task.id === pendingDelete.ids[0])?.title : undefined,
    deletingProject: pendingDelete?.kind === "project",
  });
  const sidebarPerspective = sidebarPerspectiveFor(perspective, activeCustomPerspective);
  const showSidebar = !isPhone && canShowSidebar && sidebarOpen && !perspectiveHidesSidebar(perspective, activeCustomPerspective);
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
    setQuickKind: startQuickEntry,
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
      else duplicateProject();
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
    pasteTaskPaper: () => {
      if (typeof document !== "undefined" && isTextInputTarget(document.activeElement)) return;
      void pasteFromClipboard();
    },
    convertSelectedToProject: () => convertSelectedToProject(),
    revealInProjects: () => revealInProjects(),
    awaitReply: () => { if (selectedTaskIds.length) completeAndAwaitReply(selectedTaskIds); },
    findNext: () => findTypeSelect(1),
    findPrevious: () => findTypeSelect(-1),
    typeSelect: (key) => typeSelect(key),
    customizeToolbar: () => {
      setSettingsOpen(true);
      setViewMenuOpen(false);
    },
    exportTaskPaper,
    print: printDocument,
    duplicateProject: () => duplicateProject(),
    confirmPendingDelete: () => {
      if (pendingDelete?.kind === "project") finalizeDeleteProject(pendingDelete.id);
      else if (pendingDelete?.kind === "tasks") finalizeDeleteTasks(pendingDelete.ids, pendingDelete.direction);
    },
    cancelTopOverlay: () => {
      if (pendingDelete) {
        setPendingDelete(null);
        return;
      }
      if (quickKind) closeQuickEntry();
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
      else if (editingTaskId) {
        if (editingTaskId === unnamedTaskId) discardUnnamedTask(editingTaskId);
        else setEditingTaskId(null);
      }
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
    pendingDeleteOpen: !!pendingDelete,
    perspectiveShortcuts: settings.perspectiveShortcuts,
    shortcutRecordingId,
    customPerspectives,
    onCommand: handleHotkeyAction,
  });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onPaste = (event: ClipboardEvent) => {
      if (modalOpen || isTextInputTarget(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      event.preventDefault();
      pasteTaskPaperText(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [modalOpen, selectedTaskId, tasks, projects, defaultProjectId]);

  useEffect(() => {
    if (!hydrated || Platform.OS !== "web" || typeof window === "undefined") return;
    const open = (raw: string) => openOmniCloneUrlRef.current(raw);
    const onHash = () => {
      if (window.location.hash) open(window.location.hash);
    };
    const onClick = (event: MouseEvent) => {
      const href = (event.target as HTMLElement | null)?.closest?.("a")?.getAttribute("href");
      if (!href || !parseOmniCloneUrl(href)) return;
      event.preventDefault();
      open(href);
    };
    if (window.location.hash) open(window.location.hash);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("click", onClick);
    const unsub = window.omniclone?.onOpenUrl?.(open);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("click", onClick);
      unsub?.();
    };
  }, [hydrated]);

  const sidebarProjects = useMemo(
    () => isFocusActive(focused) ? projects.filter((project) => projectMatchesFocus(project, focused)) : projects,
    [focused, projects],
  );
  const sidebarTasks = useMemo(() => {
    const focusedIds = focusedTaskProjectIds(projects, focused);
    if (!focusedIds) return tasks;
    return tasks.filter((task) => task.projectId && focusedIds.has(task.projectId));
  }, [focused, projects, tasks]);
  const forecastCounts = useMemo(() => forecastCountsFor(tasks, focused, calendarNow, projects), [calendarNow, focused, projects, tasks]);
  const perspectiveBadges = useMemo(() => perspectiveBadgesFor(tasks, projects, focused, calendarNow), [calendarNow, focused, projects, tasks]);

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
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
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
            focused={isFocusActive(focused)}
            canFocus={isFocusActive(focused) || !!selectedTask?.projectId || !!projectFilter || !!folderFilter || !!sidebarSelection.projectIds.length || !!sidebarSelection.folderPaths.length}
            visibleButtons={settings.toolbarButtons}
            onToggleSidebar={() => setSidebarOpen((value) => !value)}
            onBack={goBack}
            onForward={goForward}
            onToggleView={() => setViewMenuOpen((value) => !value)}
            onNewAction={() => insertAction()}
            onQuickEntry={() => startQuickEntry("task")}
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

        {isFocusActive(focused) && <FocusBar name={focusedName} onUnfocus={unfocus} />}
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
            onChangeOutlineColumns={(outlineColumns) => setSettings((current) => ({ ...current, outlineColumns }))}
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
              onDropInbox={(ids) => dropOnSidebar(ids, { kind: "inbox" })}
            />
            </View>
          )}
          {showSidebar && (
            <>
            <View style={[{ width: settings.sidebarWidth }, styles.desktopPane]}>
            <ProjectSidebar
              perspective={sidebarPerspective}
              projects={sidebarProjects}
              tasks={sidebarTasks}
              extraFolders={settings.extraFolders}
              selectedProjectId={projectFilter}
              selectedProjectIds={sidebarSelection.projectIds}
              selectedTag={tagFilter}
              selectedFolder={folderFilter}
              selectedFolderPaths={sidebarSelection.folderPaths}
              forecastDay={forecastDay}
              forecastCounts={forecastCounts}
              showCounts={settings.showSidebarCounts}
              onSelectProject={selectProject}
              onSelectTag={selectTag}
              onSelectFolder={selectFolder}
              onSelectForecastDay={selectForecastDay}
              onNewProject={() => startQuickEntry("project")}
              onNewFolder={() => startQuickEntry("folder")}
              onFocusProject={focusProject}
              onNewActionInProject={newActionInProject}
              onDeleteProject={deleteProject}
              onDuplicateProject={duplicateProject}
              tagRecords={knownTagRecords}
              onDropOnSidebar={dropOnSidebar}
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
            collapsedIds={outlineCollapsedIds}
            onCollapsedIdsChange={setOutlineCollapsedIds}
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
            onCommitTitleAndAdd={commitTaskTitleAndAdd}
            onCancelEdit={cancelTaskEdit}
            onNewTask={() => insertAction()}
            onReviewProject={(id) => setProjects((current) => current.map((project) => project.id === id ? { ...project, lastReviewedAt: new Date().toISOString() } : project))}
            onSkipReview={skipReview}
            onConvertToProject={convertSelectedToProject}
            onReveal={revealInProjects}
            onChangeDates={(id, patch) => updateTask(id, patch)}
            onAwaitReply={(id) => completeAndAwaitReply(idsForRow(id))}
            onOpenViewMenu={() => setViewMenuOpen(true)}
            onFocusProject={focusProject}
            onSelectProject={(id) => navigate({ perspective: "projects", projectFilter: id, tagFilter: null, folderFilter: null })}
            onInspectProject={inspectProject}
            onNewActionInProject={newActionInProject}
            onDeleteProject={deleteProject}
            onDuplicateProject={duplicateProject}
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
                onChangeTag={changeSelectedTag}
                tagRecords={knownTagRecords}
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

      <QuickEntryModal visible={quickKind !== null} kind={quickKind ?? "task"} projects={projects} defaultProjectId={defaultProjectId} initial={quickDraft} onClose={closeQuickEntry} onSave={createItem} />

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
        visible={!!pendingDelete}
        title={pendingDeleteDialog.title}
        message={pendingDeleteDialog.message}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete?.kind === "project") finalizeDeleteProject(pendingDelete.id);
          else if (pendingDelete?.kind === "tasks") finalizeDeleteTasks(pendingDelete.ids, pendingDelete.direction);
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
