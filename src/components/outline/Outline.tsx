import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
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
import { effectiveGroupBy } from "../../perspectiveRules";
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
import { Icon } from "../ui/Icon";
import { TaskRow } from "./TaskRow";
import { shortcutLabel } from "../../shortcuts.ts";

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
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const modifiersRef = useModifierKeys();
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
    setCollapsedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
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
  const renderGroupTasks = (id: string, groupTasks: Task[]) => collapsed.has(id) ? null : flattenTasks(groupTasks, collapsed).map(taskRow);

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
      <ScrollView style={styles.outlineScroll} contentContainerStyle={styles.outlineContent} keyboardShouldPersistTaps="handled">
        {!!columns.length && (
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
        )}
        {groupBy === "project" && [{ project: null as Project | null, groupTasks: groupedByProject.get(null) ?? [] }, ...projects.map((project) => ({ project, groupTasks: groupedByProject.get(project.id) ?? [] }))].map(({ project, groupTasks }) => {
          if (!groupTasks.length && !project) return null;
          return (
            <View key={project?.id ?? "inbox"} style={styles.projectGroup}>
              {project ? projectHeading(project, groupTasks.length) : (
                <Pressable onPress={() => toggleCollapsed("inbox")} style={styles.projectHeading}>
                  <Icon name={collapsed.has("inbox") ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                  <Icon name="inbox-arrow-down-outline" size={20} color={customPerspective?.color ?? palette.purple} />
                  <View style={styles.projectHeadingCopy}><Text style={styles.projectHeadingTitle}>Inbox</Text><Text numberOfLines={1} style={styles.projectHeadingNote}>Actions without a project</Text></View>
                  <Text style={styles.projectHeadingCount}>{groupTasks.length}</Text>
                </Pressable>
              )}
              {renderGroupTasks(project?.id ?? "inbox", groupTasks)}
            </View>
          );
        })}
        {groupBy === "tag" && groupedByTag.tags.map((tag) => {
          const tagged = groupedByTag.groups.get(tag) ?? [];
          return (
            <View key={tag} style={styles.projectGroup}>
              <Pressable onPress={() => toggleCollapsed(`tag:${tag}`)} style={styles.tagHeading}>
                <Icon name={collapsed.has(`tag:${tag}`) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                <Icon name="pound" size={22} color={customPerspective?.color ?? palette.purple} />
                <View><Text style={styles.projectHeadingTitle}>{tag}</Text><Text style={styles.projectHeadingNote}>{tagged.length} actions</Text></View>
              </Pressable>
              {renderGroupTasks(`tag:${tag}`, tagged)}
            </View>
          );
        })}
        {groupBy === "flagged" && [true, false].map((flagged) => {
          const groupTasks = flagged ? groupedByFlag.flagged : groupedByFlag.unflagged;
          if (!groupTasks.length) return null;
          const groupId = flagged ? "flagged" : "unflagged";
          return (
            <View key={groupId} style={styles.projectGroup}>
              <Pressable onPress={() => toggleCollapsed(groupId)} style={styles.tagHeading}>
                <Icon name={collapsed.has(groupId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                <Icon name={flagged ? "flag" : "flag-outline"} size={20} color={flagged ? palette.flag : "#8b888f"} />
                <View><Text style={styles.projectHeadingTitle}>{flagged ? "Flagged" : "Unflagged"}</Text><Text style={styles.projectHeadingNote}>{groupTasks.length} actions</Text></View>
              </Pressable>
              {renderGroupTasks(groupId, groupTasks)}
            </View>
          );
        })}
        {groupBy === "due" && groupedByDue.labels.map((due) => {
          const groupTasks = groupedByDue.groups.get(due) ?? [];
          const groupId = `due:${due}`;
          return (
            <View key={due} style={styles.projectGroup}>
              <Pressable onPress={() => toggleCollapsed(groupId)} style={styles.tagHeading}>
                <Icon name={collapsed.has(groupId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                <Icon name="calendar-month-outline" size={20} color={customPerspective?.color ?? palette.purple} />
                <View><Text style={styles.projectHeadingTitle}>{due}</Text><Text style={styles.projectHeadingNote}>{groupTasks.length} actions</Text></View>
              </Pressable>
              {renderGroupTasks(groupId, groupTasks)}
            </View>
          );
        })}
        {groupBy === "none" && flattenTasks(tasks, collapsed).map(taskRow)}
        {!customPerspective && perspective === "projects" && visibleProjects.map((project) => {
          const projectTasks = groupedByProject.get(project.id) ?? [];
          return (
            <View key={project.id} style={styles.projectGroup}>
              {projectHeading(project, projectTasks.filter((task) => !task.completed).length)}
              {renderGroupTasks(project.id, projectTasks)}
              {!collapsed.has(project.id) && (
                <Pressable onPress={() => onNewActionInProject(project.id)} style={styles.inlineNewAction} {...({ dataSet: { noMarquee: "true" } } as object)}>
                  <Icon name="plus" size={16} color={palette.purpleDark} />
                  <Text style={styles.inlineNewActionText}>New Action</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {!customPerspective && perspective === "tags" && !tagFilter && groupedByTag.tags.map((tag) => {
          const tagged = groupedByTag.groups.get(tag) ?? [];
          return (
            <View key={tag} style={styles.projectGroup}>
              <Pressable onPress={() => toggleCollapsed(`tag:${tag}`)} style={styles.tagHeading}>
                <Icon name={collapsed.has(`tag:${tag}`) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                <Icon name="pound" size={22} color={palette.purple} />
                <View><Text style={styles.projectHeadingTitle}>{tag}</Text><Text style={styles.projectHeadingNote}>{tagged.length} actions</Text></View>
              </Pressable>
              {renderGroupTasks(`tag:${tag}`, tagged)}
            </View>
          );
        })}
        {!customPerspective && perspective === "tags" && !!tagFilter && flattenTasks(tasks, collapsed).map(taskRow)}
        {!customPerspective && perspective === "review" && reviewProjects.map((project) => {
          const remaining = groupedByProject.get(project.id) ?? [];
          const reviewId = `review:${project.id}`;
          const stalled = stalledIds.has(project.id);
          return (
            <View key={project.id} style={styles.projectGroup}>
              <ContextMenuPressable items={projectContextItems(project, projectHandlers)} onPress={() => onInspectProject(project.id)} style={[styles.reviewRow, inspectedProjectId === project.id && styles.projectHeadingSelected]}>
                <Pressable accessibilityLabel={collapsed.has(reviewId) ? "Expand project" : "Collapse project"} onPress={() => toggleCollapsed(reviewId)} hitSlop={8} style={styles.collapseButton} {...({ dataSet: { noMarquee: "true" } } as object)}>
                  <Icon name={collapsed.has(reviewId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                </Pressable>
                <View style={[styles.projectHeadingRing, { borderColor: project.color }]} />
                <View style={styles.reviewCopy}><Text style={styles.projectHeadingTitle}>{projectDisplayName(project)}</Text><Text style={styles.projectHeadingNote}>{stalled ? "Stalled · no remaining actions" : reviewStatusText(project)}{remaining.length ? ` · ${remaining.length} remaining` : ""}</Text></View>
                <Pressable onPress={() => onSkipReview(project.id)} style={styles.skipButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Text style={styles.skipButtonText}>Skip</Text></Pressable>
                <Pressable onPress={() => onReviewProject(project.id)} style={styles.reviewButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Icon name="check" size={15} color="#fff" /><Text style={styles.reviewButtonText}>Reviewed</Text></Pressable>
              </ContextMenuPressable>
              {renderGroupTasks(reviewId, remaining)}
            </View>
          );
        })}
        {!customPerspective && perspective === "completed" && completionGroupOrder.map((label) => {
          const groupTasks = groupedByCompletion.get(label) ?? [];
          if (!groupTasks.length) return null;
          const groupId = `done:${label}`;
          const dropped = label === "Dropped";
          return (
            <View key={label} style={styles.projectGroup}>
              <Pressable onPress={() => toggleCollapsed(groupId)} style={styles.tagHeading}>
                <Icon name={collapsed.has(groupId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                <Icon name={dropped ? "close-circle-outline" : "check-circle-outline"} size={20} color={dropped ? palette.muted : palette.purple} />
                <View><Text style={styles.projectHeadingTitle}>{label}</Text><Text style={styles.projectHeadingNote}>{groupTasks.length} {dropped ? "dropped" : "completed"}</Text></View>
              </Pressable>
              {renderGroupTasks(groupId, groupTasks)}
            </View>
          );
        })}
        {!customPerspective && perspective !== "projects" && perspective !== "tags" && perspective !== "review" && perspective !== "completed" && flattenTasks(tasks, collapsed).map(taskRow)}
        {databaseEmpty ? (
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
        ) : !customPerspective && perspective === "review" && !reviewProjects.length ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}><Icon name="check-decagram-outline" size={26} color="#aaa7ad" /></View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyText}>No projects are waiting for review.</Text>
          </View>
        ) : !tasks.length && (perspective !== "projects" || !visibleProjects.length) && perspective !== "review" ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}>
              <Icon
                name={!customPerspective && perspective === "inbox" ? "inbox-arrow-down-outline" : !customPerspective && perspective === "flagged" ? "flag-outline" : "check"}
                size={26}
                color="#aaa7ad"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {!customPerspective && perspective === "inbox" ? "Inbox Zero" : !customPerspective && perspective === "flagged" ? "Nothing flagged" : "All clear"}
            </Text>
            <Text style={styles.emptyText}>
              {!customPerspective && perspective === "inbox"
                ? "New actions land here until you assign a project."
                : !customPerspective && perspective === "flagged"
                  ? "Flag actions to keep them in this list."
                  : "There are no remaining actions in this view."}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {overlay}
      </View>
      <Pressable onPress={onNewTask} style={styles.newActionBar}><Icon name="plus" size={20} color={palette.purpleDark} /><Text style={styles.newActionText}>New Action</Text></Pressable>
    </View>
  );
}
