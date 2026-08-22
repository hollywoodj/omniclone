import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, View, type ListRenderItemInfo } from "react-native";
import { ContextMenuPressable, useContextMenuTrigger, type ContextMenuItem } from "../../contextMenu";
import {
  completionGroupOrder,
  forecastSubtitle,
  projectDueForReview,
  reviewStatusText,
  type ForecastDayKey,
} from "../../dates";
import { useMarqueeSelection, useModifierKeys } from "../../marquee";
import { palette, visibleOutlineColumns, type ActivePerspective, type AppSettings, type CustomPerspective, type Project, type Task } from "../../model";
import { effectiveGroupBy, perspectiveActsAsFlagged, perspectiveActsAsInbox, perspectiveGroupsByProject } from "../../perspectiveRules";
import { projectContextItems } from "../../perspectives/projectContextItems";
import {
  blockedSequentialIds,
  childMap,
  flattenTasks,
  projectDisplayName,
  projectInFolder,
  stalledProjectIds,
  tasksByCompletionGroup,
  tasksByDueLabel,
  tasksByFlag,
  tasksByProjectId,
  tasksByTag,
  taskDepth,
} from "../../outline";
import type { SelectionModifiers } from "../../selection";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "../ui/Icon";
import { TaskRow } from "./TaskRow";
import { shortcutLabel } from "../../shortcuts.ts";

type OutlineRowItem = (
  | { kind: "columns-header" }
  | { kind: "inbox-header"; count: number }
  | { kind: "project-header"; project: Project; count: number }
  | { kind: "tag-header"; tag: string; count: number }
  | { kind: "flag-header"; flagged: boolean; count: number }
  | { kind: "due-header"; due: string; count: number }
  | { kind: "review-header"; project: Project }
  | { kind: "completed-header"; label: string; count: number }
  | { kind: "task"; task: Task }
  | { kind: "inline-new-action"; projectId: string }
  | { kind: "migrate-state" }
  | { kind: "review-empty" }
  | { kind: "empty-state" }
) & { groupEnd?: boolean };

function outlineRowKey(item: OutlineRowItem): string {
  switch (item.kind) {
    case "columns-header": return "columns-header";
    case "inbox-header": return "header:inbox";
    case "project-header": return `header:project:${item.project.id}`;
    case "tag-header": return `header:tag:${item.tag}`;
    case "flag-header": return `header:flag:${item.flagged ? "flagged" : "unflagged"}`;
    case "due-header": return `header:due:${item.due}`;
    case "review-header": return `header:review:${item.project.id}`;
    case "completed-header": return `header:done:${item.label}`;
    case "task": return `task:${item.task.id}`;
    case "inline-new-action": return `inline:${item.projectId}`;
    case "migrate-state": return "migrate-state";
    case "review-empty": return "review-empty";
    case "empty-state": return "empty-state";
    default: return "row";
  }
}

export function Outline({
  title,
  perspective,
  customPerspective,
  projects,
  tasks,
  selectedTaskIds,
  inspectedProjectId,
  editingTaskId,
  collapseNonce,
  collapsedIds: collapsedIdsProp,
  onCollapsedIdsChange,
  projectFilter,
  folderFilter,
  tagFilter,
  forecastDay,
  settings,
  databaseEmpty,
  onSelectTask,
  onToggleTask,
  onToggleSelectedTasks,
  onInspectTask,
  onToggleFlagTask,
  onDeleteTask,
  onCopyTasks,
  onCopyLink,
  onDuplicateTasks,
  onMoveTasks,
  onStartEdit,
  onCommitTitle,
  onCommitTitleAndAdd,
  onCancelEdit,
  onNewTask,
  onReviewProject,
  onSkipReview,
  onOpenViewMenu,
  onFocusProject,
  onSelectProject,
  onInspectProject,
  onNewActionInProject,
  onDeleteProject,
  onDuplicateProject,
  onImport,
  onMarqueeStart,
  onMarqueeSelect,
  onClearSelection,
  onSelectAll,
  onCleanUp,
  onExpandAll,
  onCollapseAll,
  onIndent,
  onOutdent,
  onMoveRow,
  onCopyTaskPaper,
  onConvertToProject,
  onReveal,
  onChangeDates,
  onAwaitReply,
}: {
  title: string;
  perspective: ActivePerspective;
  customPerspective?: CustomPerspective | null;
  projects: Project[];
  tasks: Task[];
  selectedTaskIds: string[];
  inspectedProjectId: string | null;
  editingTaskId: string | null;
  collapseNonce: { action: "expand" | "collapse"; n: number } | null;
  collapsedIds?: string[];
  onCollapsedIdsChange?: (ids: string[]) => void;
  projectFilter: string | null;
  folderFilter: string | null;
  tagFilter: string | null;
  forecastDay: ForecastDayKey;
  settings: AppSettings;
  databaseEmpty?: boolean;
  onSelectTask: (id: string, modifiers?: SelectionModifiers) => void;
  onToggleTask: (id: string) => void;
  onToggleSelectedTasks: (id: string) => void;
  onInspectTask: (id: string) => void;
  onToggleFlagTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onCopyTasks: (id: string) => void;
  onCopyLink: (id: string) => void;
  onDuplicateTasks: (id: string) => void;
  onMoveTasks: (id: string, projectId: string | null) => void;
  onStartEdit: (id: string) => void;
  onCommitTitle: (id: string, title: string) => void;
  onCommitTitleAndAdd: (id: string, title: string) => void;
  onCancelEdit: (id: string) => void;
  onNewTask: () => void;
  onReviewProject: (id: string) => void;
  onSkipReview: (id: string) => void;
  onConvertToProject: (id: string) => void;
  onOpenViewMenu: () => void;
  onFocusProject: (id: string) => void;
  onSelectProject: (id: string) => void;
  onInspectProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject?: (id: string) => void;
  onImport: () => void;
  onMarqueeStart: () => void;
  onMarqueeSelect: (ids: string[], additive: boolean) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onCleanUp: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onMoveRow: (id: string, direction: -1 | 1) => void;
  onCopyTaskPaper: (id: string) => void;
  onReveal: (id: string) => void;
  onChangeDates: (id: string, patch: Pick<Task, "due" | "defer">) => void;
  onAwaitReply: (id: string) => void;
}) {
  const { openMenu } = useContextMenuTrigger();
  const containerRef = useRef<View>(null);
  const [marqueeReady, setMarqueeReady] = useState(false);
  const [localCollapsedIds, setLocalCollapsedIds] = useState<string[]>([]);
  const collapsedIds = collapsedIdsProp ?? localCollapsedIds;
  const setCollapsedIds = onCollapsedIdsChange ?? setLocalCollapsedIds;
  const modifiersRef = useModifierKeys(marqueeReady);
  const { registerRow, suppressClickRef, overlay } = useMarqueeSelection({
    enabled: marqueeReady,
    containerRef,
    onStart: onMarqueeStart,
    onSelect: onMarqueeSelect,
    onClear: onClearSelection,
  });
  const latestActions = useRef({
    onSelectTask, onToggleTask, onInspectTask, onToggleSelectedTasks, onToggleFlagTask, onDeleteTask, onCopyTasks, onCopyLink, onCopyTaskPaper, onDuplicateTasks, onMoveTasks, onIndent, onOutdent, onMoveRow, onStartEdit, onCommitTitle, onCommitTitleAndAdd, onCancelEdit, onConvertToProject, onReveal, onChangeDates, onAwaitReply, editingTaskId,
  });
  latestActions.current = {
    onSelectTask, onToggleTask, onInspectTask, onToggleSelectedTasks, onToggleFlagTask, onDeleteTask, onCopyTasks, onCopyLink, onCopyTaskPaper, onDuplicateTasks, onMoveTasks, onIndent, onOutdent, onMoveRow, onStartEdit, onCommitTitle, onCommitTitleAndAdd, onCancelEdit, onConvertToProject, onReveal, onChangeDates, onAwaitReply, editingTaskId,
  };
  const selectedSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const children = useMemo(() => childMap(tasks), [tasks]);
  const groupedByProject = useMemo(() => tasksByProjectId(tasks), [tasks]);
  const groupedByTag = useMemo(() => tasksByTag(tasks), [tasks]);
  const groupedByDue = useMemo(() => tasksByDueLabel(tasks), [tasks]);
  const groupedByFlag = useMemo(() => tasksByFlag(tasks), [tasks]);
  const groupedByCompletion = useMemo(() => tasksByCompletionGroup(tasks), [tasks]);
  const blockedIds = useMemo(() => blockedSequentialIds(tasks, projects), [tasks, projects]);
  const stalledIds = useMemo(() => stalledProjectIds(projects, tasks), [projects, tasks]);
  const outlineMenuItems: ContextMenuItem[] = [
    { id: "select-all", label: "Select All", icon: "select-all", shortcut: shortcutLabel("⌘A"), onPress: onSelectAll },
    { id: "clean-up", label: "Clean Up", icon: "broom", shortcut: shortcutLabel("⌘K"), onPress: onCleanUp },
    { id: "sep-outline", label: "", separator: true },
    { id: "expand", label: "Expand All", icon: "arrow-expand-vertical", shortcut: shortcutLabel("⌥⌘9"), onPress: onExpandAll },
    { id: "collapse", label: "Collapse All", icon: "arrow-collapse-vertical", shortcut: shortcutLabel("⌥⌘0"), onPress: onCollapseAll },
    { id: "view-options", label: "View Options", icon: "tune-variant", shortcut: shortcutLabel("⇧⌘V"), onPress: onOpenViewMenu },
    { id: "new-action", label: "New Action", icon: "plus", shortcut: shortcutLabel("⌘N"), onPress: onNewTask },
  ];
  const projectHandlers = { onFocusProject, onNewActionInProject, onDeleteProject, onDuplicateProject, onInspectProject, onOpenProject: onSelectProject };
  const groupBy = customPerspective ? effectiveGroupBy(customPerspective) : null;
  const hideProjectColumn = groupBy === "project" || (!customPerspective && (perspective === "projects" || perspective === "review"));
  const columns = visibleOutlineColumns(settings.outlineColumns, hideProjectColumn);
  const collapsed = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const toggleCollapsed = (id: string) => {
    const next = collapsedIds.includes(id) ? collapsedIds.filter((item) => item !== id) : [...collapsedIds, id];
    setCollapsedIds(next);
  };
  const groupIds = useMemo(() => {
    const ids: string[] = [];
    const groupBy = customPerspective ? effectiveGroupBy(customPerspective) : null;
    if (groupBy === "project" || (!customPerspective && perspective === "projects")) {
      ids.push("inbox", ...projects.map((project) => project.id));
    }
    if (groupBy === "tag" || (!customPerspective && perspective === "tags")) ids.push(...groupedByTag.tags.map((tag) => `tag:${tag}`));
    if (groupBy === "flagged") ids.push("flagged", "unflagged");
    if (groupBy === "due") ids.push(...groupedByDue.labels.map((due) => `due:${due}`));
    if (!customPerspective && perspective === "review") ids.push(...projects.map((project) => `review:${project.id}`));
    if (!customPerspective && perspective === "completed") ids.push(...completionGroupOrder.map((label) => `done:${label}`));
    return ids;
  }, [customPerspective, groupedByDue.labels, groupedByTag.tags, perspective, projects]);
  useEffect(() => {
    if (!collapseNonce) return;
    setCollapsedIds(collapseNonce.action === "expand" ? [] : groupIds);
  }, [collapseNonce]);
  const projectHeading = (project: Project, count: number) => (
    <View style={[styles.projectHeading, inspectedProjectId === project.id && styles.projectHeadingSelected]}>
      <Pressable accessibilityLabel={collapsed.has(project.id) ? "Expand project" : "Collapse project"} onPress={() => toggleCollapsed(project.id)} hitSlop={8} style={styles.collapseButton} {...({ dataSet: { noMarquee: "true" } } as object)}>
        <Icon name={collapsed.has(project.id) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
      </Pressable>
      <ContextMenuPressable items={projectContextItems(project, projectHandlers)} onPress={() => onInspectProject(project.id)} style={styles.projectHeadingMain}>
        <View style={[styles.projectHeadingRing, { borderColor: project.color }]} />
        <View style={styles.projectHeadingCopy}>
          <Text style={styles.projectHeadingTitle}>{projectDisplayName(project)}</Text>
          <Text numberOfLines={1} style={styles.projectHeadingNote}>
            {stalledIds.has(project.id) ? "Stalled · no remaining actions" : (project.note || (project.folder ? project.folder : "Project"))}
          </Text>
        </View>
        {stalledIds.has(project.id) && <Text style={styles.sidebarStatusTag}>Stalled</Text>}
        <Text style={styles.projectHeadingCount}>{count}</Text>
      </ContextMenuPressable>
    </View>
  );
  const groupHeading = (groupId: string, icon: IconName, iconSize: number, iconColor: string, headingTitle: string, subtitle: string) => (
    <Pressable onPress={() => toggleCollapsed(groupId)} style={styles.tagHeading}>
      <Icon name={collapsed.has(groupId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
      <Icon name={icon} size={iconSize} color={iconColor} />
      <View><Text style={styles.projectHeadingTitle}>{headingTitle}</Text><Text style={styles.projectHeadingNote}>{subtitle}</Text></View>
    </Pressable>
  );
  const taskRow = (task: Task) => {
    const selected = selectedSet.has(task.id);
    const bulkCount = selected && selectedTaskIds.length > 1 ? selectedTaskIds.length : 1;
    return (
      <TaskRow
        key={task.id}
        task={task}
        project={task.projectId ? projectById.get(task.projectId) : undefined}
        projects={projects}
        selected={selected}
        editing={editingTaskId === task.id}
        bulkCount={bulkCount}
        settings={settings}
        depth={taskDepth(task, byId)}
        hasChildren={!!children.get(task.id)?.length}
        collapsed={collapsed.has(task.id)}
        hideProject={hideProjectColumn}
        blocked={blockedIds.has(task.id)}
        compactDue={!customPerspective && perspective === "forecast"}
        dragIds={selected && selectedTaskIds.length > 1 ? selectedTaskIds : undefined}
        registerRow={registerRow}
        onSelect={() => {
          const current = latestActions.current;
          if (suppressClickRef.current) return;
          if (current.editingTaskId === task.id) return;
          current.onSelectTask(task.id, modifiersRef.current);
        }}
        onToggle={() => latestActions.current.onToggleTask(task.id)}
        onInspect={() => latestActions.current.onInspectTask(task.id)}
        onToggleSelected={() => latestActions.current.onToggleSelectedTasks(task.id)}
        onToggleFlag={() => latestActions.current.onToggleFlagTask(task.id)}
        onDelete={() => latestActions.current.onDeleteTask(task.id)}
        onCopy={() => latestActions.current.onCopyTasks(task.id)}
        onCopyLink={() => latestActions.current.onCopyLink(task.id)}
        onCopyTaskPaper={() => latestActions.current.onCopyTaskPaper(task.id)}
        onDuplicate={() => latestActions.current.onDuplicateTasks(task.id)}
        onMove={(projectId) => latestActions.current.onMoveTasks(task.id, projectId)}
        onIndent={() => latestActions.current.onIndent(task.id)}
        onOutdent={() => latestActions.current.onOutdent(task.id)}
        onMoveRow={(direction) => latestActions.current.onMoveRow(task.id, direction)}
        onToggleCollapse={() => toggleCollapsed(task.id)}
        onStartEdit={() => latestActions.current.onStartEdit(task.id)}
        onCommitTitle={(title) => latestActions.current.onCommitTitle(task.id, title)}
        onCommitTitleAndAdd={(title) => latestActions.current.onCommitTitleAndAdd(task.id, title)}
        onCancelEdit={() => latestActions.current.onCancelEdit(task.id)}
        onConvertToProject={() => latestActions.current.onConvertToProject(task.id)}
        onReveal={() => latestActions.current.onReveal(task.id)}
        onChangeDates={(patch) => latestActions.current.onChangeDates(task.id, patch)}
        onAwaitReply={() => latestActions.current.onAwaitReply(task.id)}
      />
    );
  };

  const visibleProjects = useMemo(() => projects.filter((project) => {
    if (projectFilter) return project.id === projectFilter;
    if (folderFilter) return projectInFolder(project, folderFilter);
    return true;
  }), [folderFilter, projectFilter, projects]);
  const reviewProjects = useMemo(
    () => projects.filter((project) => projectDueForReview(project) || stalledIds.has(project.id)),
    [projects, stalledIds],
  );
  const remainingCount = useMemo(() => tasks.filter((task) => !task.completed).length, [tasks]);
  const outlineSubtitle = perspective === "forecast"
    ? forecastSubtitle(forecastDay)
    : perspective === "review"
      ? (reviewProjects.length ? `${reviewProjects.length} project${reviewProjects.length === 1 ? "" : "s"} to review` : "All caught up")
      : `${remainingCount} action${remainingCount === 1 ? "" : "s"}${selectedTaskIds.length > 1 ? ` • ${selectedTaskIds.length} selected` : ""}${perspective === "projects" && !projectFilter ? ` • ${projects.length} projects` : ""}${tagFilter ? ` • ${tagFilter}` : ""}`;
  const showProjectGroups = perspectiveGroupsByProject(perspective, customPerspective ?? null);
  const actsAsInbox = perspectiveActsAsInbox(perspective, customPerspective ?? null);
  const actsAsFlagged = perspectiveActsAsFlagged(perspective, customPerspective ?? null);

  const rows = useMemo(() => {
    const items: OutlineRowItem[] = [];
    const pushGroupTasks = (groupId: string, groupTasks: Task[]) => {
      if (collapsed.has(groupId)) return;
      for (const task of flattenTasks(groupTasks, collapsed)) items.push({ kind: "task", task });
    };
    const markGroupEnd = () => {
      const last = items[items.length - 1];
      if (last) last.groupEnd = true;
    };

    if (columns.length) items.push({ kind: "columns-header" });

    if (groupBy === "project") {
      const groups = [{ project: null as Project | null, groupTasks: groupedByProject.get(null) ?? [] }, ...projects.map((project) => ({ project, groupTasks: groupedByProject.get(project.id) ?? [] }))];
      for (const { project, groupTasks } of groups) {
        if (!groupTasks.length && !project) continue;
        items.push(project ? { kind: "project-header", project, count: groupTasks.length } : { kind: "inbox-header", count: groupTasks.length });
        pushGroupTasks(project?.id ?? "inbox", groupTasks);
        markGroupEnd();
      }
    }
    if (groupBy === "tag") {
      for (const tag of groupedByTag.tags) {
        const tagged = groupedByTag.groups.get(tag) ?? [];
        items.push({ kind: "tag-header", tag, count: tagged.length });
        pushGroupTasks(`tag:${tag}`, tagged);
        markGroupEnd();
      }
    }
    if (groupBy === "flagged") {
      for (const flagged of [true, false]) {
        const groupTasks = flagged ? groupedByFlag.flagged : groupedByFlag.unflagged;
        if (!groupTasks.length) continue;
        items.push({ kind: "flag-header", flagged, count: groupTasks.length });
        pushGroupTasks(flagged ? "flagged" : "unflagged", groupTasks);
        markGroupEnd();
      }
    }
    if (groupBy === "due") {
      for (const due of groupedByDue.labels) {
        const groupTasks = groupedByDue.groups.get(due) ?? [];
        items.push({ kind: "due-header", due, count: groupTasks.length });
        pushGroupTasks(`due:${due}`, groupTasks);
        markGroupEnd();
      }
    }
    if (groupBy === "none") {
      for (const task of flattenTasks(tasks, collapsed)) items.push({ kind: "task", task });
    }
    if (showProjectGroups && customPerspective) {
      for (const project of projects) {
        const projectTasks = groupedByProject.get(project.id) ?? [];
        if (!projectTasks.length) continue;
        items.push({ kind: "project-header", project, count: projectTasks.filter((task) => !task.completed).length });
        pushGroupTasks(project.id, projectTasks);
        if (!collapsed.has(project.id)) items.push({ kind: "inline-new-action", projectId: project.id });
        markGroupEnd();
      }
    }
    if (!customPerspective && perspective === "projects") {
      for (const project of visibleProjects) {
        const projectTasks = groupedByProject.get(project.id) ?? [];
        items.push({ kind: "project-header", project, count: projectTasks.filter((task) => !task.completed).length });
        pushGroupTasks(project.id, projectTasks);
        if (!collapsed.has(project.id)) items.push({ kind: "inline-new-action", projectId: project.id });
        markGroupEnd();
      }
    }
    if (!customPerspective && perspective === "tags" && !tagFilter) {
      for (const tag of groupedByTag.tags) {
        const tagged = groupedByTag.groups.get(tag) ?? [];
        items.push({ kind: "tag-header", tag, count: tagged.length });
        pushGroupTasks(`tag:${tag}`, tagged);
        markGroupEnd();
      }
    }
    if (!customPerspective && perspective === "tags" && !!tagFilter) {
      for (const task of flattenTasks(tasks, collapsed)) items.push({ kind: "task", task });
    }
    if (!customPerspective && perspective === "review") {
      for (const project of reviewProjects) {
        const remaining = groupedByProject.get(project.id) ?? [];
        items.push({ kind: "review-header", project });
        pushGroupTasks(`review:${project.id}`, remaining);
        markGroupEnd();
      }
    }
    if (!customPerspective && perspective === "completed") {
      for (const label of completionGroupOrder) {
        const groupTasks = groupedByCompletion.get(label) ?? [];
        if (!groupTasks.length) continue;
        items.push({ kind: "completed-header", label, count: groupTasks.length });
        pushGroupTasks(`done:${label}`, groupTasks);
        markGroupEnd();
      }
    }
    if (!customPerspective && perspective !== "projects" && perspective !== "tags" && perspective !== "review" && perspective !== "completed") {
      for (const task of flattenTasks(tasks, collapsed)) items.push({ kind: "task", task });
    }

    if (databaseEmpty) items.push({ kind: "migrate-state" });
    else if (!customPerspective && perspective === "review" && !reviewProjects.length) items.push({ kind: "review-empty" });
    else if (!tasks.length && (perspective !== "projects" || !visibleProjects.length) && perspective !== "review") items.push({ kind: "empty-state" });

    return items;
  }, [
    collapsed, columns.length, customPerspective, databaseEmpty, groupBy, groupedByCompletion, groupedByDue,
    groupedByFlag, groupedByProject, groupedByTag, perspective, projects, reviewProjects, showProjectGroups,
    tagFilter, tasks, visibleProjects,
  ]);

  const renderOutlineRowContent = (item: OutlineRowItem) => {
    switch (item.kind) {
      case "columns-header":
        return (
          <View style={styles.outlineColumnsHeader}>
            {columns.map((column) => (
              <Text
                key={column}
                style={[
                  styles.outlineColumnHeader,
                  column === "project" && styles.outlineColumnProject,
                  column === "tags" && styles.outlineColumnTags,
                  column === "duration" && styles.outlineColumnDuration,
                  column === "defer" && styles.outlineColumnDefer,
                  column === "due" && styles.outlineColumnDue,
                ]}
              >
                {column === "project" ? "Project" : column === "tags" ? "Tags" : column === "duration" ? "Duration" : column === "defer" ? "Defer" : "Due"}
              </Text>
            ))}
          </View>
        );
      case "inbox-header":
        return (
          <Pressable onPress={() => toggleCollapsed("inbox")} style={styles.projectHeading}>
            <Icon name={collapsed.has("inbox") ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
            <Icon name="inbox-arrow-down-outline" size={20} color={customPerspective?.color ?? palette.purple} />
            <View style={styles.projectHeadingCopy}><Text style={styles.projectHeadingTitle}>Inbox</Text><Text numberOfLines={1} style={styles.projectHeadingNote}>Actions without a project</Text></View>
            <Text style={styles.projectHeadingCount}>{item.count}</Text>
          </Pressable>
        );
      case "project-header":
        return projectHeading(item.project, item.count);
      case "tag-header":
        return groupHeading(`tag:${item.tag}`, "pound", 22, customPerspective?.color ?? palette.purple, item.tag, `${item.count} actions`);
      case "flag-header":
        return groupHeading(item.flagged ? "flagged" : "unflagged", item.flagged ? "flag" : "flag-outline", 20, item.flagged ? palette.flag : "#8b888f", item.flagged ? "Flagged" : "Unflagged", `${item.count} actions`);
      case "due-header":
        return groupHeading(`due:${item.due}`, "calendar-month-outline", 20, customPerspective?.color ?? palette.purple, item.due, `${item.count} actions`);
      case "completed-header": {
        const dropped = item.label === "Dropped";
        return groupHeading(`done:${item.label}`, dropped ? "close-circle-outline" : "check-circle-outline", 20, dropped ? palette.muted : palette.purple, item.label, `${item.count} ${dropped ? "dropped" : "completed"}`);
      }
      case "review-header": {
        const project = item.project;
        const remaining = groupedByProject.get(project.id) ?? [];
        const reviewId = `review:${project.id}`;
        const stalled = stalledIds.has(project.id);
        return (
          <ContextMenuPressable items={projectContextItems(project, projectHandlers)} onPress={() => onInspectProject(project.id)} style={[styles.reviewRow, inspectedProjectId === project.id && styles.projectHeadingSelected]}>
            <Pressable accessibilityLabel={collapsed.has(reviewId) ? "Expand project" : "Collapse project"} onPress={() => toggleCollapsed(reviewId)} hitSlop={8} style={styles.collapseButton} {...({ dataSet: { noMarquee: "true" } } as object)}>
              <Icon name={collapsed.has(reviewId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
            </Pressable>
            <View style={[styles.projectHeadingRing, { borderColor: project.color }]} />
            <View style={styles.reviewCopy}><Text style={styles.projectHeadingTitle}>{projectDisplayName(project)}</Text><Text style={styles.projectHeadingNote}>{stalled ? "Stalled · no remaining actions" : reviewStatusText(project)}{remaining.length ? ` · ${remaining.length} remaining` : ""}</Text></View>
            <Pressable onPress={() => onSkipReview(project.id)} style={styles.skipButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Text style={styles.skipButtonText}>Skip</Text></Pressable>
            <Pressable onPress={() => onReviewProject(project.id)} style={styles.reviewButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Icon name="check" size={15} color="#fff" /><Text style={styles.reviewButtonText}>Reviewed</Text></Pressable>
          </ContextMenuPressable>
        );
      }
      case "task":
        return taskRow(item.task);
      case "inline-new-action":
        return (
          <Pressable onPress={() => onNewActionInProject(item.projectId)} style={styles.inlineNewAction} {...({ dataSet: { noMarquee: "true" } } as object)}>
            <Icon name="plus" size={16} color={palette.purpleDark} />
            <Text style={styles.inlineNewActionText}>New Action</Text>
          </Pressable>
        );
      case "migrate-state":
        return (
          <View style={styles.migrateState}>
            <View style={styles.migrateIcon}><Icon name="database-import-outline" size={28} color={palette.purpleDark} /></View>
            <Text style={styles.migrateTitle}>Bring in your OmniFocus database</Text>
            <Text style={styles.migrateText}>CSV is the portable OmniFocus 4 export. It keeps projects, inbox items, dates, flags, tags, and notes. Native .ofocus backups cannot be read here.</Text>
            <Pressable accessibilityLabel="Import from OmniFocus" onPress={onImport} style={styles.migrateButton}>
              <Icon name="database-import-outline" size={16} color="#fff" />
              <Text style={styles.migrateButtonText}>Import from OmniFocus</Text>
            </Pressable>
            <Text style={styles.migrateHint}>{`Or create a project with ${shortcutLabel("⇧⌘N")} and start empty.`}</Text>
          </View>
        );
      case "review-empty":
        return (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}><Icon name="check-decagram-outline" size={26} color="#aaa7ad" /></View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyText}>No projects are waiting for review.</Text>
          </View>
        );
      case "empty-state":
        return (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}>
              <Icon
                name={actsAsInbox ? "inbox-arrow-down-outline" : actsAsFlagged ? "flag-outline" : "check"}
                size={26}
                color="#aaa7ad"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {actsAsInbox ? "Inbox Zero" : actsAsFlagged ? "Nothing flagged" : "All clear"}
            </Text>
            <Text style={styles.emptyText}>
              {actsAsInbox
                ? "New actions land here until you assign a project."
                : actsAsFlagged
                  ? "Flag actions to keep them in this list."
                  : "There are no remaining actions in this view."}
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderOutlineRow = ({ item }: ListRenderItemInfo<OutlineRowItem>) => {
    const content = renderOutlineRowContent(item);
    return item.groupEnd ? <View style={styles.projectGroup}>{content}</View> : content;
  };

  return (
    <View style={styles.outline}>
      <View style={styles.outlineHeader}>
        <View style={styles.outlineHeaderCopy}>
          <Text numberOfLines={1} style={styles.outlineTitle}>{title}</Text>
          <Text style={styles.outlineSubtitle}>{outlineSubtitle}</Text>
        </View>
        <ContextMenuPressable
          accessibilityLabel="Outline options"
          items={outlineMenuItems}
          style={styles.iconButton}
          onPress={() => openMenu({ items: outlineMenuItems, fallbackPosition: { x: 640, y: 72 } })}
        >
          <Icon name="dots-horizontal" size={20} color="#77747b" />
        </ContextMenuPressable>
      </View>
      <View
        ref={(node) => {
          containerRef.current = node;
          const ready = !!node;
          if (ready !== marqueeReady) setMarqueeReady(ready);
        }}
        collapsable={false}
        style={[styles.outlineBody, Platform.OS === "web" ? { userSelect: "none" } as object : null]}
      >
      <FlatList
        style={styles.outlineScroll}
        contentContainerStyle={styles.outlineContent}
        keyboardShouldPersistTaps="handled"
        data={rows}
        keyExtractor={outlineRowKey}
        renderItem={renderOutlineRow}
        initialNumToRender={40}
        windowSize={15}
      />
      {overlay}
      </View>
      <Pressable onPress={onNewTask} style={styles.newActionBar}><Icon name="plus" size={20} color={palette.purpleDark} /><Text style={styles.newActionText}>New Action</Text></Pressable>
    </View>
  );
}
