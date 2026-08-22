import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ContextMenuPressable, useContextMenuTrigger, type ContextMenuItem } from "../../contextMenu";
import { forecastWeek, todayKey, type ForecastDayKey } from "../../dates";
import { useModifierKeys } from "../../marquee";
import { defaultTagColor, palette, perspectives, type PerspectiveId, type Project, type TagRecord, type Task } from "../../model";
import { projectContextItems } from "../../perspectives/projectContextItems";
import { buildFolderTree, orderedSidebarSiblings, projectDisplayName, sidebarActionCounts } from "../../outline";
import { buildTagTree, remainingCountsForTagTree, tagKey } from "../../tags";
import type { SidebarDropTarget } from "../../library/mutations";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { ProjectTypeIcon, projectTypeIconColor } from "../ui/ProjectTypeIcon";
import { SidebarRow } from "../ui/SidebarRow";

export function ProjectSidebar({
  perspective,
  projects,
  tasks,
  extraFolders,
  folderSidebarOrders = {},
  selectedProjectId,
  selectedProjectIds,
  selectedTag,
  selectedFolder,
  selectedFolderPaths,
  forecastDay,
  forecastCounts,
  showCounts,
  onSelectProject,
  onSelectTag,
  onSelectFolder,
  onSelectForecastDay,
  onNewProject,
  onNewFolder,
  onFocusProject,
  onNewActionInProject,
  onDeleteProject,
  onDuplicateProject,
  tagRecords,
  onDropOnSidebar,
}: {
  perspective: PerspectiveId;
  projects: Project[];
  tasks: Task[];
  extraFolders: string[];
  folderSidebarOrders?: Record<string, number>;
  selectedProjectId: string | null;
  selectedProjectIds?: string[];
  selectedTag: string | null;
  selectedFolder: string | null;
  selectedFolderPaths?: string[];
  forecastDay: ForecastDayKey;
  forecastCounts: Record<string, number>;
  showCounts: boolean;
  onSelectProject: (id: string | null, modifiers?: { toggle?: boolean }) => void;
  onSelectTag: (tag: string | null) => void;
  onSelectFolder: (folder: string | null, modifiers?: { toggle?: boolean }) => void;
  onSelectForecastDay: (day: ForecastDayKey) => void;
  onNewProject: () => void;
  onNewFolder: () => void;
  onFocusProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject?: (id: string) => void;
  tagRecords?: TagRecord[];
  onDropOnSidebar?: (ids: string[], target: SidebarDropTarget) => void;
}) {
  const modifiersRef = useModifierKeys();
  const selectedProjects = new Set(selectedProjectIds?.length ? selectedProjectIds : (selectedProjectId ? [selectedProjectId] : []));
  const selectedFolders = new Set(selectedFolderPaths?.length ? selectedFolderPaths : (selectedFolder ? [selectedFolder] : []));
  const tags = useMemo(() => buildTagTree(tagRecords ?? []), [tagRecords]);
  const counts = useMemo(() => sidebarActionCounts(tasks), [tasks]);
  const tagCounts = useMemo(() => remainingCountsForTagTree(tasks, tagRecords ?? []), [tagRecords, tasks]);
  const title = perspectives.find((item) => item.id === perspective)?.label ?? "Projects";
  const { openMenu } = useContextMenuTrigger();
  const sidebarMenuItems: ContextMenuItem[] = [
    { id: "new-project", label: "New Project", icon: "plus", onPress: onNewProject },
    { id: "new-folder", label: "New Folder", icon: "folder-plus-outline", onPress: onNewFolder },
  ];
  const remainingProjects = useMemo(
    () => projects.filter((project) => {
      const status = project.status ?? "active";
      return status === "active" || status === "onHold";
    }),
    [projects],
  );
  const droppedProjects = useMemo(() => projects.filter((project) => project.status === "dropped"), [projects]);
  const doneProjects = useMemo(() => projects.filter((project) => project.status === "done"), [projects]);
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setCalendarNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const week = useMemo(() => forecastWeek(calendarNow), [calendarNow]);
  const tree = useMemo(() => buildFolderTree(remainingProjects, extraFolders, folderSidebarOrders), [extraFolders, folderSidebarOrders, remainingProjects]);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const [collapsedTags, setCollapsedTags] = useState<string[]>([]);
  const toggleFolder = (path: string) => {
    setCollapsedFolders((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  };
  const toggleTag = (name: string) => {
    setCollapsedTags((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };
  const remainingIn = (projectId: string) => counts.remainingByProject.get(projectId) ?? 0;
  const projectRow = (project: Project, depth: number) => {
    const stalled = (project.status ?? "active") === "active" && remainingIn(project.id) === 0;
    const dimmed = project.status === "onHold" || project.status === "dropped";
    return (
      <SidebarRow
        key={project.id}
        selected={selectedProjects.has(project.id)}
        items={() => projectContextItems(project, { onFocusProject, onNewActionInProject, onDeleteProject, onDuplicateProject })}
        onPress={() => onSelectProject(project.id, modifiersRef.current)}
        droppable
        onDropTasks={(ids) => onDropOnSidebar?.(ids, { kind: "project", projectId: project.id })}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <ProjectTypeIcon type={project.type} size={16} dimmed={dimmed} />
        <Text numberOfLines={1} style={[styles.sidebarRowText, project.status === "dropped" && styles.taskTitleCompleted, project.status === "onHold" && styles.sidebarHoldText]}>{projectDisplayName(project)}</Text>
        {stalled && <Text style={styles.sidebarStatusTag}>Stalled</Text>}
        {project.status === "onHold" && <Text style={styles.sidebarStatusTag}>On Hold</Text>}
        {project.status === "dropped" && <Text style={styles.sidebarStatusTag}>Dropped</Text>}
        {project.status === "done" && <Text style={styles.sidebarStatusTag}>Done</Text>}
        {showCounts && <Text style={styles.sidebarCount}>{remainingIn(project.id)}</Text>}
      </SidebarRow>
    );
  };
  const renderFolder = (node: ReturnType<typeof buildFolderTree>["roots"][number], depth: number): React.ReactNode => {
    const collapsed = collapsedFolders.includes(node.path);
    const selected = selectedFolders.has(node.path);
    return (
      <View key={node.path}>
        <SidebarRow
          selected={selected}
          onPress={() => onSelectFolder(node.path, modifiersRef.current)}
          droppable
          onDropTasks={(ids) => onDropOnSidebar?.(ids, { kind: "folder", folder: node.path })}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <Pressable onPress={() => toggleFolder(node.path)} hitSlop={8} style={styles.collapseButton}>
            <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={16} color="#6e6c72" />
          </Pressable>
          <Icon name={collapsed ? "folder-outline" : "folder-open-outline"} size={16} color={projectTypeIconColor} />
          <Text numberOfLines={1} style={styles.sidebarRowText}>{node.name}</Text>
          {showCounts && <Text style={styles.sidebarCount}>{node.projects.reduce((sum, project) => sum + remainingIn(project.id), 0)}</Text>}
        </SidebarRow>
        {!collapsed && orderedSidebarSiblings(node, folderSidebarOrders).map((item) => (
          item.kind === "project"
            ? projectRow(item.project, depth + 1)
            : renderFolder(item.node, depth + 1)
        ))}
      </View>
    );
  };
  const renderTag = (node: (typeof tags)[number], depth: number): React.ReactNode => {
    const collapsed = collapsedTags.includes(node.name);
    const status = node.record.status ?? "active";
    const color = node.record.color ?? defaultTagColor;
    const count = tagCounts.get(tagKey(node.name)) ?? 0;
    return (
      <View key={node.name}>
        <SidebarRow
          selected={selectedTag === node.name}
          onPress={() => onSelectTag(node.name)}
          droppable
          onDropTasks={(ids) => onDropOnSidebar?.(ids, { kind: "tag", tag: node.name })}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {node.children.length ? (
            <Pressable onPress={() => toggleTag(node.name)} hitSlop={8} style={styles.collapseButton}>
              <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={16} color="#6e6c72" />
            </Pressable>
          ) : <View style={{ width: 16 }} />}
          <Icon name="pound" size={16} color={color} />
          <Text style={[styles.sidebarRowText, status === "dropped" && styles.taskTitleCompleted, status === "onHold" && styles.sidebarHoldText]}>{node.name}</Text>
          {status === "onHold" && <Text style={styles.sidebarStatusTag}>On Hold</Text>}
          {status === "dropped" && <Text style={styles.sidebarStatusTag}>Dropped</Text>}
          {showCounts && <Text style={styles.sidebarCount}>{count}</Text>}
        </SidebarRow>
        {!collapsed && node.children.map((child) => renderTag(child, depth + 1))}
      </View>
    );
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>{title}</Text>
        <ContextMenuPressable
          accessibilityLabel="Sidebar options"
          items={sidebarMenuItems}
          style={styles.iconButton}
          onPress={() => openMenu({ items: sidebarMenuItems, fallbackPosition: { x: 220, y: 72 } })}
        >
          <Icon name="dots-horizontal" size={19} color="#77747b" />
        </ContextMenuPressable>
      </View>
      <ScrollView contentContainerStyle={styles.sidebarScroll}>
        {perspective === "projects" && (
          <>
            <SidebarRow selected={selectedProjectId === null && selectedFolder === null} onPress={() => { onSelectProject(null); onSelectFolder(null); }}>
              <Icon name="folder-multiple-outline" size={17} color="#6f6c73" />
              <Text numberOfLines={1} style={styles.sidebarRowText}>All Projects</Text>
              {showCounts && <Text style={styles.sidebarCount}>{counts.remainingInProjects}</Text>}
            </SidebarRow>
            <Text style={styles.sidebarSectionLabel}>PROJECTS</Text>
            {!remainingProjects.length && !extraFolders.length && !droppedProjects.length && !doneProjects.length && (
              <Text style={styles.sidebarEmptyText}>No projects yet. Import from OmniFocus or use New Project.</Text>
            )}
            {tree.roots.map((node) => renderFolder(node, 0))}
            {tree.ungrouped.map((project) => projectRow(project, 0))}
            {!!doneProjects.length && (
              <>
                <Text style={styles.sidebarSectionLabel}>COMPLETED</Text>
                {doneProjects.map((project) => projectRow(project, 0))}
              </>
            )}
            {!!droppedProjects.length && (
              <>
                <Text style={styles.sidebarSectionLabel}>DROPPED</Text>
                {droppedProjects.map((project) => projectRow(project, 0))}
              </>
            )}
          </>
        )}
        {perspective === "tags" && (
          <>
            <SidebarRow selected={selectedTag === null} onPress={() => onSelectTag(null)}>
              <Icon name="tag-multiple-outline" size={17} color="#6f6c73" />
              <Text numberOfLines={1} style={styles.sidebarRowText}>All Tags</Text>
              {showCounts && <Text style={styles.sidebarCount}>{counts.remainingTagged}</Text>}
            </SidebarRow>
            <Text style={styles.sidebarSectionLabel}>TAGS</Text>
            {!tags.length && <Text style={styles.sidebarEmptyText}>No tags yet. Add them in the inspector.</Text>}
            {tags.map((node) => renderTag(node, 0))}
          </>
        )}
        {perspective === "forecast" && (
          <View>
            <SidebarRow selected={forecastDay === "past"} onPress={() => onSelectForecastDay("past")} style={styles.forecastPast}>
              <Text style={styles.sidebarRowText}>Past</Text>
              <Text style={styles.forecastPastCount}>{forecastCounts.past ?? 0}</Text>
            </SidebarRow>
            <View style={styles.forecastDays}>
              {week.map((day) => {
                const selected = forecastDay === day.key;
                const isToday = day.key === todayKey(calendarNow);
                return (
                  <Pressable key={day.key} onPress={() => onSelectForecastDay(day.key)} style={[styles.forecastDay, selected && styles.forecastDaySelected]}>
                    <Text style={[styles.forecastDayWeek, selected && styles.forecastDayTextSelected]}>{day.weekday}</Text>
                    <View style={[styles.forecastDayNumWrap, isToday && !selected && styles.forecastDayToday]}>
                      <Text style={[styles.forecastDayNum, selected && styles.forecastDayTextSelected, isToday && !selected && styles.forecastDayNumToday]}>{day.date}</Text>
                    </View>
                    {!!forecastCounts[day.key] && <Text style={[styles.forecastDayCount, selected && styles.forecastDayCountSelected]}>{forecastCounts[day.key]}</Text>}
                  </Pressable>
                );
              })}
            </View>
            <SidebarRow selected={forecastDay === "upcoming"} onPress={() => onSelectForecastDay("upcoming")} style={styles.forecastUpcoming}>
              <Text style={styles.sidebarRowText}>Upcoming</Text>
              <Text style={styles.sidebarCount}>{forecastCounts.upcoming ?? 0}</Text>
            </SidebarRow>
          </View>
        )}
        {!["projects", "tags", "forecast"].includes(perspective) && (
          <View style={styles.sidebarEmpty}>
            <Icon name={perspective === "inbox" ? "inbox-arrow-down-outline" : perspective === "flagged" ? "flag-outline" : "check-decagram-outline"} size={32} color="#aaa7ad" />
            <Text style={styles.sidebarEmptyText}>{perspective === "inbox" ? "Unsorted actions land here." : `Your ${title.toLowerCase()} items appear here.`}</Text>
          </View>
        )}
      </ScrollView>
      <Pressable onPress={onNewProject} style={styles.sidebarFooter}>
        <Icon name="plus" size={19} color={palette.purpleDark} />
        <Text style={styles.sidebarFooterText}>New Project</Text>
      </Pressable>
    </View>
  );
}
