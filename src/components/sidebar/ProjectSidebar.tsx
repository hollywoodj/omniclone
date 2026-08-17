import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ContextMenuPressable, useContextMenuTrigger, type ContextMenuItem } from "../../contextMenu";
import { forecastWeek, todayKey, type ForecastDayKey } from "../../dates";
import { palette, perspectives, type PerspectiveId, type Project, type Task } from "../../model";
import { projectContextItems } from "../../perspectives/projectContextItems";
import { buildFolderTree, projectDisplayName, projectInFolder, sidebarActionCounts } from "../../outline";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { SidebarRow } from "../ui/SidebarRow";

export function ProjectSidebar({
  perspective,
  projects,
  tasks,
  extraFolders,
  selectedProjectId,
  selectedTag,
  selectedFolder,
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
}: {
  perspective: PerspectiveId;
  projects: Project[];
  tasks: Task[];
  extraFolders: string[];
  selectedProjectId: string | null;
  selectedTag: string | null;
  selectedFolder: string | null;
  forecastDay: ForecastDayKey;
  forecastCounts: Record<string, number>;
  showCounts: boolean;
  onSelectProject: (id: string | null) => void;
  onSelectTag: (tag: string | null) => void;
  onSelectFolder: (folder: string | null) => void;
  onSelectForecastDay: (day: ForecastDayKey) => void;
  onNewProject: () => void;
  onNewFolder: () => void;
  onFocusProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}) {
  const tags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags))].sort(), [tasks]);
  const counts = useMemo(() => sidebarActionCounts(tasks), [tasks]);
  const title = perspectives.find((item) => item.id === perspective)?.label ?? "Projects";
  const { openMenu } = useContextMenuTrigger();
  const sidebarMenuItems: ContextMenuItem[] = [
    { id: "new-project", label: "New Project", icon: "plus", onPress: onNewProject },
    { id: "new-folder", label: "New Folder", icon: "folder-plus-outline", onPress: onNewFolder },
  ];
  const week = useMemo(() => forecastWeek(), []);
  const tree = useMemo(() => buildFolderTree(projects, extraFolders), [extraFolders, projects]);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const toggleFolder = (path: string) => {
    setCollapsedFolders((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  };
  const remainingIn = (projectId: string) => counts.remainingByProject.get(projectId) ?? 0;
  const projectRow = (project: Project, depth: number) => {
    const stalled = (project.status ?? "active") === "active" && remainingIn(project.id) === 0;
    return (
      <SidebarRow
        key={project.id}
        selected={selectedProjectId === project.id}
        items={projectContextItems(project, { onFocusProject, onNewActionInProject, onDeleteProject })}
        onPress={() => onSelectProject(project.id)}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <View style={[styles.projectDot, { borderColor: project.color }, project.status === "dropped" && styles.projectDotDropped, project.status === "onHold" && styles.projectDotHold, stalled && styles.projectDotStalled]} />
        <Text numberOfLines={1} style={[styles.sidebarRowText, project.status === "dropped" && styles.taskTitleCompleted, project.status === "onHold" && styles.sidebarHoldText]}>{projectDisplayName(project)}</Text>
        {stalled && <Text style={styles.sidebarStatusTag}>Stalled</Text>}
        {project.status === "onHold" && <Text style={styles.sidebarStatusTag}>On Hold</Text>}
        {project.status === "dropped" && <Text style={styles.sidebarStatusTag}>Dropped</Text>}
        {project.type === "sequential" && <Icon name="arrow-down-bold" size={12} color="#8b888f" />}
        {showCounts && <Text style={styles.sidebarCount}>{remainingIn(project.id)}</Text>}
      </SidebarRow>
    );
  };
  const renderFolder = (node: ReturnType<typeof buildFolderTree>["roots"][number], depth: number): React.ReactNode => {
    const collapsed = collapsedFolders.includes(node.path);
    const selected = selectedFolder === node.path && !selectedProjectId;
    return (
      <View key={node.path}>
        <SidebarRow
          selected={selected}
          onPress={() => onSelectFolder(node.path)}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <Pressable onPress={() => toggleFolder(node.path)} hitSlop={8} style={styles.collapseButton}>
            <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={16} color="#6e6c72" />
          </Pressable>
          <Icon name={collapsed ? "folder-outline" : "folder-open-outline"} size={16} color="#8b4fc2" />
          <Text numberOfLines={1} style={styles.sidebarRowText}>{node.name}</Text>
          {showCounts && <Text style={styles.sidebarCount}>{node.projects.reduce((sum, project) => sum + remainingIn(project.id), 0)}</Text>}
        </SidebarRow>
        {!collapsed && node.projects.map((project) => projectRow(project, depth + 1))}
        {!collapsed && node.children.map((child) => renderFolder(child, depth + 1))}
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
            {!projects.length && !extraFolders.length && (
              <Text style={styles.sidebarEmptyText}>No projects yet. Import from OmniFocus or use New Project.</Text>
            )}
            {tree.roots.map((node) => renderFolder(node, 0))}
            {tree.ungrouped.map((project) => projectRow(project, 0))}
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
            {tags.map((tag) => (
              <SidebarRow key={tag} selected={selectedTag === tag} onPress={() => onSelectTag(tag)}>
                <Icon name="pound" size={16} color="#77747b" />
                <Text style={styles.sidebarRowText}>{tag}</Text>
                {showCounts && <Text style={styles.sidebarCount}>{counts.remainingByTag.get(tag) ?? 0}</Text>}
              </SidebarRow>
            ))}
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
                const isToday = day.key === todayKey();
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
