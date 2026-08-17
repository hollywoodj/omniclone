import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
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
import { matchOmniFocusHotkey, type HotkeyAction } from "./src/hotkeys";
import { ContextMenuPressable, ContextMenuProvider, useContextMenuTrigger, type ContextMenuItem } from "./src/contextMenu";
import { MenuBar, type MenuCommand } from "./src/menuBar";
import { ViewOptionsPanel } from "./src/viewOptions";
import { PerspectivesListModal } from "./src/perspectivesList";
import { QuickOpenModal } from "./src/quickOpen";
import { compareTasks, duplicateCustomPerspective, effectiveGroupBy, normalizeCustomPerspective, taskMatchesCustomPerspective } from "./src/perspectiveRules";
import { formatShortcut, toElectronAccelerator } from "./src/shortcuts";

declare global {
  interface Window {
    omniclone?: {
      onMenuCommand: (cb: (command: MenuCommand) => void) => () => void;
      setPerspectivesMenu: (items: Array<{ id: string; label: string; accelerator?: string }>) => void;
    };
  }
}

type RailPerspective = {
  id: ActivePerspective;
  name: string;
  icon: string;
  color: string;
  custom?: CustomPerspective;
};

function favoritePerspectives(settings: AppSettings, customPerspectives: CustomPerspective[]): RailPerspective[] {
  const byId = new Map<string, RailPerspective>();
  for (const item of perspectives) {
    byId.set(item.id, { id: item.id, name: item.label, icon: item.icon, color: palette.purpleDark });
  }
  for (const item of customPerspectives) {
    byId.set(`custom:${item.id}`, { id: `custom:${item.id}`, name: item.name, icon: item.icon, color: item.color, custom: item });
  }
  return settings.perspectiveBarIds.map((id) => byId.get(id)).filter((item): item is RailPerspective => !!item);
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const projectColors = ["#8f57c8", "#2f8de4", "#58a65c", "#dc7f43", "#d05475", "#43a5a1"];

function Icon({ name, size = 20, color = palette.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function ToolbarButton({ icon, label, active, onPress, disabled }: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.toolbarButton, active && styles.toolbarButtonActive, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={22} color={icon === "plus" ? palette.purpleDark : "#56535a"} />
      <Text style={styles.toolbarLabel}>{label}</Text>
    </Pressable>
  );
}

function StatusRing({ completed, color = palette.purple, onPress, size = 19 }: {
  completed: boolean;
  color?: string;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed }}
      onPress={onPress}
      hitSlop={8}
      style={[styles.statusRing, { width: size, height: size, borderRadius: size / 2, borderColor: color }, completed && { backgroundColor: color }]}
    >
      {completed && <Icon name="check" size={Math.max(10, size - 7)} color="#fff" />}
    </Pressable>
  );
}

function copyToClipboard(text: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}

function projectContextItems(project: Project, handlers: {
  onFocusProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}): ContextMenuItem[] {
  return [
    { id: "focus", label: "Focus Project", icon: "bullseye-arrow", onPress: () => handlers.onFocusProject(project.id) },
    { id: "new-action", label: "New Action in Project", icon: "plus", onPress: () => handlers.onNewActionInProject(project.id) },
    { id: "sep-delete", label: "", separator: true },
    { id: "delete", label: "Delete Project", icon: "trash-can-outline", destructive: true, onPress: () => handlers.onDeleteProject(project.id) },
  ];
}

function PerspectiveRail({ current, inboxCount, items, showTitles, shortcuts, onSelect, onEdit, onUnfavorite, onOpenList, onOpenSettings, onDelete }: {
  current: ActivePerspective;
  inboxCount: number;
  items: RailPerspective[];
  showTitles: boolean;
  shortcuts: Record<string, string>;
  onSelect: (id: ActivePerspective) => void;
  onEdit: (id: ActivePerspective) => void;
  onUnfavorite: (id: ActivePerspective) => void;
  onOpenList: () => void;
  onOpenSettings: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={styles.perspectiveRail}>
      <ScrollView style={styles.perspectiveRailList} showsVerticalScrollIndicator={false} contentContainerStyle={styles.perspectiveRailScroll}>
        {items.map((item) => {
          const selected = current === item.id;
          const accent = item.custom?.color ?? palette.purpleDark;
          const menuItems: ContextMenuItem[] = [
            { id: "edit", label: "Edit", icon: "pencil-outline", shortcut: formatShortcut("meta+shift+v"), onPress: () => onEdit(item.id) },
            { id: "unfavorite", label: "Unfavorite", icon: "star-off-outline", onPress: () => onUnfavorite(item.id) },
            { id: "copy", label: "Copy Link", icon: "link-variant", onPress: () => copyToClipboard(`omniclone://perspective/${item.id}`) },
            { id: "sep-1", label: "", separator: true },
            { id: "list", label: "Perspectives", icon: "view-list-outline", shortcut: formatShortcut("ctrl+meta+p"), onPress: onOpenList },
            ...(item.custom ? [
              { id: "sep-2", label: "", separator: true },
              { id: "delete", label: "Delete", icon: "trash-can-outline" as IconName, destructive: true, onPress: () => onDelete(item.custom!.id) },
            ] : []),
          ];
          return (
            <ContextMenuPressable
              key={item.id}
              items={menuItems}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityHint={formatShortcut(shortcuts[item.id])}
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => [styles.perspectiveItem, selected && (item.custom ? { backgroundColor: `${accent}20` } : styles.perspectiveItemSelected), pressed && styles.pressed]}
            >
              <View>
                <Icon name={item.icon as IconName} size={24} color={selected ? accent : "#656269"} />
                {item.id === "inbox" && inboxCount > 0 && (
                  <View style={[styles.badge, selected && styles.badgeSelected]}><Text style={styles.badgeText}>{inboxCount}</Text></View>
                )}
              </View>
              {showTitles && <Text numberOfLines={1} style={[styles.perspectiveLabel, selected && { color: accent, fontWeight: "700" }]}>{item.name}</Text>}
            </ContextMenuPressable>
          );
        })}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Perspectives List" onPress={onOpenList} style={styles.perspectiveItem}>
        <Icon name="view-list-outline" size={22} color="#706d74" />
        {showTitles && <Text style={styles.perspectiveLabel}>List</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onOpenSettings} style={styles.railSettingsButton}>
        <Icon name="cog-outline" size={21} color="#706d74" />
      </Pressable>
    </View>
  );
}

function ProjectSidebar({
  perspective,
  projects,
  tasks,
  selectedProjectId,
  showCounts,
  onSelectProject,
  onNewProject,
  onFocusProject,
  onNewActionInProject,
  onDeleteProject,
}: {
  perspective: PerspectiveId;
  projects: Project[];
  tasks: Task[];
  selectedProjectId: string | null;
  showCounts: boolean;
  onSelectProject: (id: string | null) => void;
  onNewProject: () => void;
  onFocusProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}) {
  const tags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags))].sort(), [tasks]);
  const title = perspectives.find((item) => item.id === perspective)?.label ?? "Projects";
  const { openMenu } = useContextMenuTrigger();
  const sidebarMenuItems: ContextMenuItem[] = [
    { id: "new-project", label: "New Project", icon: "plus", onPress: onNewProject },
  ];

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
            <Pressable onPress={() => onSelectProject(null)} style={[styles.sidebarRow, selectedProjectId === null && styles.sidebarRowSelected]}>
              <Icon name="folder-multiple-outline" size={17} color="#6f6c73" />
              <Text numberOfLines={1} style={styles.sidebarRowText}>All Projects</Text>
              {showCounts && <Text style={styles.sidebarCount}>{tasks.filter((task) => task.projectId && !task.completed).length}</Text>}
            </Pressable>
            <Text style={styles.sidebarSectionLabel}>PROJECTS</Text>
            {!projects.length && (
              <Text style={styles.sidebarEmptyText}>No projects yet. Import from OmniFocus or use New Project.</Text>
            )}
            {projects.map((project) => (
              <ContextMenuPressable
                key={project.id}
                items={projectContextItems(project, { onFocusProject, onNewActionInProject, onDeleteProject })}
                onPress={() => onSelectProject(project.id)}
                style={[styles.sidebarRow, selectedProjectId === project.id && styles.sidebarRowSelected]}
              >
                <View style={[styles.projectDot, { borderColor: project.color }]} />
                <Text numberOfLines={1} style={styles.sidebarRowText}>{project.name}</Text>
                {showCounts && <Text style={styles.sidebarCount}>{tasks.filter((task) => task.projectId === project.id && !task.completed).length}</Text>}
              </ContextMenuPressable>
            ))}
          </>
        )}
        {perspective === "tags" && tags.map((tag) => (
          <View key={tag} style={styles.sidebarRow}>
            <Icon name="pound" size={16} color="#77747b" />
            <Text style={styles.sidebarRowText}>{tag}</Text>
            {showCounts && <Text style={styles.sidebarCount}>{tasks.filter((task) => task.tags.includes(tag) && !task.completed).length}</Text>}
          </View>
        ))}
        {perspective === "forecast" && (
          <View>
            <View style={styles.forecastPast}><Text style={styles.sidebarRowText}>Past</Text><Text style={styles.forecastPastCount}>1</Text></View>
            <View style={styles.forecastDays}>
              {["SAT\n15", "SUN\n16", "MON\n17", "TUE\n18", "WED\n19"].map((day, index) => (
                <View key={day} style={[styles.forecastDay, index === 0 && styles.forecastDaySelected]}><Text style={[styles.forecastDayText, index === 0 && styles.forecastDayTextSelected]}>{day}</Text></View>
              ))}
            </View>
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

function TaskRow({ task, project, selected, settings, onSelect, onToggle, onInspect, onToggleFlag, onDelete }: {
  task: Task;
  project?: Project;
  selected: boolean;
  settings: AppSettings;
  onSelect: () => void;
  onToggle: () => void;
  onInspect: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  const menuItems: ContextMenuItem[] = [
    { id: "inspect", label: "Inspect", icon: "information-outline", onPress: onInspect },
    { id: "toggle", label: task.completed ? "Mark Incomplete" : "Mark Complete", icon: task.completed ? "circle-outline" : "check-circle-outline", onPress: onToggle },
    { id: "flag", label: task.flagged ? "Remove Flag" : "Flag", icon: task.flagged ? "flag-off-outline" : "flag-outline", onPress: onToggleFlag },
    { id: "copy", label: "Copy Title", icon: "content-copy", onPress: () => copyToClipboard(task.title) },
    { id: "delete", label: "Delete", icon: "trash-can-outline", destructive: true, onPress: onDelete },
  ];

  return (
    <ContextMenuPressable
      accessibilityRole="button"
      items={menuItems}
      onPress={onSelect}
      style={({ pressed }) => [styles.taskRow, settings.rowDensity === "compact" && styles.taskRowCompact, selected && styles.taskRowSelected, pressed && styles.taskRowPressed]}
    >
      <StatusRing completed={task.completed} color={project?.color} onPress={onToggle} />
      <View style={styles.taskBody}>
        <View style={styles.taskTitleLine}>
          <Text
            numberOfLines={1}
            style={[
              styles.taskTitle,
              settings.textSize === "small" && styles.taskTitleSmall,
              settings.textSize === "large" && styles.taskTitleLarge,
              task.completed && styles.taskTitleResolved,
              task.completed && settings.strikeResolvedItems && styles.taskTitleCompleted,
            ]}
          >
            {task.title}
          </Text>
          {!!task.note && <Icon name="note-outline" size={13} color="#99969c" />}
        </View>
        <View style={styles.taskMeta}>
          {!!project && <Text numberOfLines={1} style={styles.taskMetaText}>{project.name}</Text>}
          {task.tags.map((tag) => <View key={tag} style={styles.tagChip}><Text style={styles.tagChipText}>{tag}</Text></View>)}
        </View>
      </View>
      <View style={styles.taskTail}>
        {!!task.due && <Text style={[styles.dueText, settings.colorDueItems && task.due.startsWith("Today") && styles.dueToday]}>{task.due}</Text>}
        {task.flagged && <Icon name="flag" size={16} color={palette.flag} />}
        <Pressable onPress={onInspect} hitSlop={8} style={styles.rowInfoButton}><Icon name="information-outline" size={17} color="#8e8a91" /></Pressable>
      </View>
    </ContextMenuPressable>
  );
}

function MobileCustomPerspectiveItem({
  item,
  selected,
  onSelect,
  onEdit,
  onUnfavorite,
  onOpenList,
  onDelete,
}: {
  item: RailPerspective;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onUnfavorite: () => void;
  onOpenList: () => void;
  onDelete?: () => void;
}) {
  const menuItems: ContextMenuItem[] = [
    { id: "edit", label: "Edit", icon: "pencil-outline", onPress: onEdit },
    { id: "unfavorite", label: "Unfavorite", icon: "star-off-outline", onPress: onUnfavorite },
    { id: "list", label: "Perspectives", icon: "view-list-outline", onPress: onOpenList },
    ...(item.custom && onDelete ? [{ id: "delete", label: "Delete", icon: "trash-can-outline" as IconName, destructive: true, onPress: onDelete }] : []),
  ];

  return (
    <ContextMenuPressable
      items={menuItems}
      onPress={onSelect}
      style={styles.mobileNavItem}
    >
      <Icon name={item.icon as IconName} size={21} color={selected ? item.color : "#77747b"} />
      <Text numberOfLines={1} style={[styles.mobileNavLabel, selected && { color: item.color, fontWeight: "700" }]}>{item.name}</Text>
    </ContextMenuPressable>
  );
}

function Outline({
  title,
  perspective,
  customPerspective,
  projects,
  tasks,
  selectedTaskId,
  projectFilter,
  settings,
  databaseEmpty,
  onSelectTask,
  onToggleTask,
  onInspectTask,
  onToggleFlagTask,
  onDeleteTask,
  onNewTask,
  onReviewProject,
  onOpenViewMenu,
  onFocusProject,
  onNewActionInProject,
  onDeleteProject,
  onImport,
}: {
  title: string;
  perspective: ActivePerspective;
  customPerspective?: CustomPerspective | null;
  projects: Project[];
  tasks: Task[];
  selectedTaskId: string | null;
  projectFilter: string | null;
  settings: AppSettings;
  databaseEmpty?: boolean;
  onSelectTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onInspectTask: (id: string) => void;
  onToggleFlagTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onNewTask: () => void;
  onReviewProject: (id: string) => void;
  onOpenViewMenu: () => void;
  onFocusProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onImport: () => void;
}) {
  const { openMenu } = useContextMenuTrigger();
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const outlineMenuItems: ContextMenuItem[] = [
    { id: "view-options", label: "View Options", icon: "tune-variant", onPress: onOpenViewMenu },
    { id: "new-action", label: "New Action", icon: "plus", onPress: onNewTask },
  ];
  const projectHandlers = { onFocusProject, onNewActionInProject, onDeleteProject };
  const projectHeading = (project: Project, count: number) => (
    <ContextMenuPressable items={projectContextItems(project, projectHandlers)} onPress={() => onFocusProject(project.id)} style={styles.projectHeading}>
      <Icon name="chevron-down" size={18} color="#6e6c72" />
      <View style={[styles.projectHeadingRing, { borderColor: project.color }]} />
      <View style={styles.projectHeadingCopy}>
        <Text style={styles.projectHeadingTitle}>{project.name}</Text>
        <Text numberOfLines={1} style={styles.projectHeadingNote}>{project.note}</Text>
      </View>
      <Text style={styles.projectHeadingCount}>{count}</Text>
    </ContextMenuPressable>
  );
  const taskRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      project={task.projectId ? projectById.get(task.projectId) : undefined}
      selected={selectedTaskId === task.id}
      settings={settings}
      onSelect={() => onSelectTask(task.id)}
      onToggle={() => onToggleTask(task.id)}
      onInspect={() => onInspectTask(task.id)}
      onToggleFlag={() => onToggleFlagTask(task.id)}
      onDelete={() => onDeleteTask(task.id)}
    />
  );

  const tags = [...new Set(tasks.flatMap((task) => task.tags))].sort();
  const groupBy = customPerspective ? effectiveGroupBy(customPerspective) : null;
  const visibleProjects = projects.filter((project) => !projectFilter || project.id === projectFilter);

  return (
    <View style={styles.outline}>
      <View style={styles.outlineHeader}>
        <View style={styles.outlineHeaderCopy}>
          <Text numberOfLines={1} style={styles.outlineTitle}>{title}</Text>
          <Text style={styles.outlineSubtitle}>{tasks.filter((task) => !task.completed).length} actions{perspective === "projects" && !projectFilter ? ` • ${projects.length} projects` : ""}</Text>
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
      <ScrollView style={styles.outlineScroll} contentContainerStyle={styles.outlineContent} keyboardShouldPersistTaps="handled">
        {groupBy === "project" && [{ project: null as Project | null, groupTasks: tasks.filter((task) => task.projectId === null) }, ...projects.map((project) => ({ project, groupTasks: tasks.filter((task) => task.projectId === project.id) }))].map(({ project, groupTasks }) => {
          if (!groupTasks.length && !project) return null;
          return (
            <View key={project?.id ?? "inbox"} style={styles.projectGroup}>
              {project ? projectHeading(project, groupTasks.length) : (
                <View style={styles.projectHeading}>
                  <Icon name="chevron-down" size={18} color="#6e6c72" />
                  <Icon name="inbox-arrow-down-outline" size={20} color={customPerspective?.color ?? palette.purple} />
                  <View style={styles.projectHeadingCopy}><Text style={styles.projectHeadingTitle}>Inbox</Text><Text numberOfLines={1} style={styles.projectHeadingNote}>Actions without a project</Text></View>
                  <Text style={styles.projectHeadingCount}>{groupTasks.length}</Text>
                </View>
              )}
              {groupTasks.map(taskRow)}
            </View>
          );
        })}
        {groupBy === "tag" && tags.map((tag) => {
          const tagged = tasks.filter((task) => task.tags.includes(tag));
          return (
            <View key={tag} style={styles.projectGroup}>
              <View style={styles.tagHeading}><Icon name="pound" size={22} color={customPerspective?.color ?? palette.purple} /><View><Text style={styles.projectHeadingTitle}>{tag}</Text><Text style={styles.projectHeadingNote}>{tagged.length} actions</Text></View></View>
              {tagged.map(taskRow)}
            </View>
          );
        })}
        {groupBy === "flagged" && [true, false].map((flagged) => {
          const groupTasks = tasks.filter((task) => task.flagged === flagged);
          if (!groupTasks.length) return null;
          return (
            <View key={flagged ? "flagged" : "unflagged"} style={styles.projectGroup}>
              <View style={styles.tagHeading}><Icon name={flagged ? "flag" : "flag-outline"} size={20} color={flagged ? palette.flag : "#8b888f"} /><View><Text style={styles.projectHeadingTitle}>{flagged ? "Flagged" : "Unflagged"}</Text><Text style={styles.projectHeadingNote}>{groupTasks.length} actions</Text></View></View>
              {groupTasks.map(taskRow)}
            </View>
          );
        })}
        {groupBy === "due" && [...new Set(tasks.map((task) => task.due ?? "No Due Date"))].map((due) => {
          const groupTasks = tasks.filter((task) => (task.due ?? "No Due Date") === due);
          return (
            <View key={due} style={styles.projectGroup}>
              <View style={styles.tagHeading}><Icon name="calendar-month-outline" size={20} color={customPerspective?.color ?? palette.purple} /><View><Text style={styles.projectHeadingTitle}>{due}</Text><Text style={styles.projectHeadingNote}>{groupTasks.length} actions</Text></View></View>
              {groupTasks.map(taskRow)}
            </View>
          );
        })}
        {groupBy === "none" && tasks.map(taskRow)}
        {!customPerspective && perspective === "projects" && visibleProjects.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          return (
            <View key={project.id} style={styles.projectGroup}>
              {projectHeading(project, projectTasks.filter((task) => !task.completed).length)}
              {projectTasks.map(taskRow)}
            </View>
          );
        })}
        {!customPerspective && perspective === "tags" && tags.map((tag) => {
          const tagged = tasks.filter((task) => task.tags.includes(tag));
          return (
            <View key={tag} style={styles.projectGroup}>
              <View style={styles.tagHeading}><Icon name="pound" size={22} color={palette.purple} /><View><Text style={styles.projectHeadingTitle}>{tag}</Text><Text style={styles.projectHeadingNote}>{tagged.length} actions</Text></View></View>
              {tagged.map(taskRow)}
            </View>
          );
        })}
        {!customPerspective && perspective === "review" && projects.map((project) => (
          <ContextMenuPressable key={project.id} items={projectContextItems(project, projectHandlers)} onPress={() => onFocusProject(project.id)} style={styles.reviewRow}>
            <View style={[styles.projectHeadingRing, { borderColor: project.color }]} />
            <View style={styles.reviewCopy}><Text style={styles.projectHeadingTitle}>{project.name}</Text><Text style={styles.projectHeadingNote}>Review every {project.reviewIntervalDays} days</Text></View>
            <Pressable onPress={() => onReviewProject(project.id)} style={styles.reviewButton}><Icon name="check" size={15} color="#fff" /><Text style={styles.reviewButtonText}>Reviewed</Text></Pressable>
          </ContextMenuPressable>
        ))}
        {!customPerspective && perspective !== "projects" && perspective !== "tags" && perspective !== "review" && tasks.map(taskRow)}
        {databaseEmpty ? (
          <View style={styles.migrateState}>
            <View style={styles.migrateIcon}><Icon name="database-import-outline" size={28} color={palette.purpleDark} /></View>
            <Text style={styles.migrateTitle}>Bring in your OmniFocus database</Text>
            <Text style={styles.migrateText}>CSV is the portable OmniFocus 4 export. It keeps projects, inbox items, dates, flags, tags, and notes. Native .ofocus backups cannot be read here.</Text>
            <Pressable accessibilityLabel="Import from OmniFocus" onPress={onImport} style={styles.migrateButton}>
              <Icon name="database-import-outline" size={16} color="#fff" />
              <Text style={styles.migrateButtonText}>Import from OmniFocus</Text>
            </Pressable>
            <Text style={styles.migrateHint}>Or create a project with ⇧⌘N and start empty.</Text>
          </View>
        ) : !tasks.length && (perspective !== "projects" || !visibleProjects.length) ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}><Icon name="check" size={26} color="#aaa7ad" /></View>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyText}>There are no remaining actions in this view.</Text>
          </View>
        ) : null}
      </ScrollView>
      <Pressable onPress={onNewTask} style={styles.newActionBar}><Icon name="plus" size={20} color={palette.purpleDark} /><Text style={styles.newActionText}>New Action</Text></Pressable>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Inspector({ task, projects, onChange, onToggle, onDelete, onClose, modal = false }: {
  task: Task;
  projects: Project[];
  onChange: (patch: Partial<Task>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const [tagDraft, setTagDraft] = useState(task.tags.join(", "));

  useEffect(() => setTagDraft(task.tags.join(", ")), [task.id, task.tags]);

  const commitTags = () => {
    onChange({ tags: tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean) });
  };

  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabText}>Action</Text></View>
        <Text style={styles.inspectorTabText}>Notes</Text>
        <Text style={styles.inspectorTabText}>Attachments</Text>
      </View>
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <StatusRing completed={task.completed} onPress={onToggle} />
          <TextInput value={task.title} onChangeText={(title) => onChange({ title })} multiline style={styles.inspectorTitleInput} accessibilityLabel="Action title" />
          <Pressable onPress={() => onChange({ flagged: !task.flagged })} hitSlop={8}><Icon name={task.flagged ? "flag" : "flag-outline"} size={20} color={task.flagged ? palette.flag : "#aaa7ad"} /></Pressable>
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>ORGANIZATION</Text>
          <FieldLabel>Project</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            <Pressable onPress={() => onChange({ projectId: null })} style={[styles.choiceChip, task.projectId === null && styles.choiceChipSelected]}><Text style={[styles.choiceText, task.projectId === null && styles.choiceTextSelected]}>Inbox</Text></Pressable>
            {projects.map((project) => <Pressable key={project.id} onPress={() => onChange({ projectId: project.id })} style={[styles.choiceChip, task.projectId === project.id && styles.choiceChipSelected]}><Text numberOfLines={1} style={[styles.choiceText, task.projectId === project.id && styles.choiceTextSelected]}>{project.name}</Text></Pressable>)}
          </ScrollView>
          <FieldLabel>Tags</FieldLabel>
          <TextInput value={tagDraft} onChangeText={setTagDraft} onBlur={commitTags} onSubmitEditing={commitTags} placeholder="Add tags, separated by commas" style={styles.fieldInput} />
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>DATES</Text>
          <FieldLabel>Defer Until</FieldLabel>
          <TextInput value={task.defer ?? ""} onChangeText={(defer) => onChange({ defer })} placeholder="None" style={styles.fieldInput} />
          <FieldLabel>Due</FieldLabel>
          <TextInput value={task.due ?? ""} onChangeText={(due) => onChange({ due })} placeholder="None" style={styles.fieldInput} />
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>NOTE</Text>
          <TextInput value={task.note ?? ""} onChangeText={(note) => onChange({ note })} placeholder="Add a note…" multiline textAlignVertical="top" style={[styles.fieldInput, styles.noteInput]} />
        </View>

        <View style={styles.inspectorSection}>
          <View style={styles.savedRow}><Icon name="cloud-check-outline" size={16} color="#6f9d70" /><Text style={styles.savedText}>Saved on this device</Text></View>
          <Pressable onPress={onDelete} style={styles.deleteButton}><Icon name="trash-can-outline" size={17} color={palette.danger} /><Text style={styles.deleteButtonText}>Delete Action</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function QuickEntryModal({ visible, kind, projects, defaultProjectId, onClose, onSave }: {
  visible: boolean;
  kind: "task" | "project";
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onSave: (title: string, projectId: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);

  useEffect(() => {
    if (visible) {
      setTitle("");
      setProjectId(defaultProjectId);
    }
  }, [visible, defaultProjectId]);

  const save = () => {
    if (!title.trim()) return;
    onSave(title.trim(), projectId);
    setTitle("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.quickEntryCard}>
          <View style={styles.quickEntryHeader}><Text style={styles.quickEntryHeaderText}>{kind === "task" ? "Quick Entry" : "New Project"}</Text><Pressable onPress={onClose}><Icon name="close" size={20} color="#77747b" /></Pressable></View>
          <View style={styles.quickInputRow}>
            <View style={styles.quickRing} />
            <TextInput autoFocus value={title} onChangeText={setTitle} onSubmitEditing={save} returnKeyType="done" placeholder={kind === "task" ? "What do you want to do?" : "Project name"} style={styles.quickInput} />
            {kind === "task" && <Icon name="flag-outline" size={21} color="#aaa7ad" />}
          </View>
          {kind === "task" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickProjectRow}>
              <Pressable onPress={() => setProjectId(null)} style={[styles.quickProjectChip, projectId === null && styles.quickProjectChipSelected]}><Icon name="inbox-arrow-down-outline" size={14} color={projectId === null ? palette.purpleDark : "#6c6970"} /><Text style={styles.quickProjectText}>Inbox</Text></Pressable>
              {projects.map((project) => <Pressable key={project.id} onPress={() => setProjectId(project.id)} style={[styles.quickProjectChip, projectId === project.id && styles.quickProjectChipSelected]}><View style={[styles.miniDot, { backgroundColor: project.color }]} /><Text numberOfLines={1} style={styles.quickProjectText}>{project.name}</Text></Pressable>)}
            </ScrollView>
          )}
          <View style={styles.quickFooter}><Text style={styles.quickHint}>Saved locally and available offline</Text><Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable disabled={!title.trim()} onPress={save} style={[styles.saveButton, !title.trim() && styles.disabled]}><Text style={styles.saveButtonText}>Save</Text></Pressable></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RuleChoices({ value, options, onChange }: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.ruleChoices}>
      {options.map((option) => (
        <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.ruleChoice, value === option.value && styles.ruleChoiceSelected]}>
          <Text style={[styles.ruleChoiceText, value === option.value && styles.ruleChoiceTextSelected]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type SettingsSection = "general" | "appearance" | "data";

function SettingsRow({ title, detail, children }: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowCopy}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {!!detail && <Text style={styles.settingsRowDetail}>{detail}</Text>}
      </View>
      <View style={styles.settingsRowControl}>{children}</View>
    </View>
  );
}

function SettingsModal({
  settings,
  projectCount,
  taskCount,
  compact,
  onChange,
  onClose,
  onImport,
  onReset,
}: {
  settings: AppSettings;
  projectCount: number;
  taskCount: number;
  compact: boolean;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const sections: Array<{ id: SettingsSection; label: string; icon: IconName }> = [
    { id: "general", label: "General", icon: "tune" },
    { id: "appearance", label: "Appearance", icon: "format-paint" },
    { id: "data", label: "Data", icon: "database-outline" },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.settingsBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.settingsWindow, compact && styles.settingsWindowCompact]}>
          <View style={styles.settingsTitlebar}>
            {!compact && <View style={styles.settingsTrafficLights}>
              <Pressable accessibilityLabel="Close settings" onPress={onClose} style={[styles.settingsTrafficLight, { backgroundColor: "#ff5f57" }]} />
              <View style={[styles.settingsTrafficLight, { backgroundColor: "#febc2e" }]} />
              <View style={[styles.settingsTrafficLight, { backgroundColor: "#28c840" }]} />
            </View>}
            <Text style={styles.settingsTitle}>Settings</Text>
            <Pressable onPress={onClose} style={styles.settingsDoneButton}><Text style={styles.settingsDoneText}>Done</Text></Pressable>
          </View>
          <View style={[styles.settingsBody, compact && styles.settingsBodyCompact]}>
            <View style={[styles.settingsSidebar, compact && styles.settingsSidebarCompact]}>
              {sections.map((item) => {
                const selected = section === item.id;
                return (
                  <Pressable key={item.id} onPress={() => setSection(item.id)} style={[styles.settingsNavItem, compact && styles.settingsNavItemCompact, selected && styles.settingsNavItemSelected]}>
                    <View style={[styles.settingsNavIcon, selected && styles.settingsNavIconSelected]}><Icon name={item.icon} size={17} color={selected ? "#fff" : "#66626a"} /></View>
                    <Text style={[styles.settingsNavText, selected && styles.settingsNavTextSelected]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView style={styles.settingsContent} contentContainerStyle={[styles.settingsContentInner, compact && styles.settingsContentInnerCompact]}>
              {section === "general" && (
                <>
                  <Text style={styles.settingsPageTitle}>General</Text>
                  <Text style={styles.settingsPageIntro}>Choose how OmniClone behaves when you open and organize your tasks.</Text>
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Default perspective</Text>
                      <Text style={styles.settingsRowDetail}>The perspective shown when the app opens.</Text>
                      <RuleChoices
                        value={settings.defaultPerspective}
                        onChange={(defaultPerspective) => onChange({ defaultPerspective: defaultPerspective as PerspectiveId })}
                        options={perspectives.map((item) => ({ label: item.label, value: item.id }))}
                      />
                    </View>
                    <SettingsRow title="Show completed actions" detail="Include resolved actions in built-in perspectives.">
                      <Switch value={settings.showCompleted} onValueChange={(showCompleted) => onChange({
                        showCompleted,
                        standardAvailability: Object.fromEntries(Object.keys(settings.standardAvailability).map((id) => [id, showCompleted ? "all" : "remaining"])) as AppSettings["standardAvailability"],
                      })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Open Inspector on selection" detail="Reveal action details when you select an item.">
                      <Switch value={settings.openInspectorOnSelection} onValueChange={(openInspectorOnSelection) => onChange({ openInspectorOnSelection })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Confirm before deleting" detail="Ask before removing actions from the database.">
                      <Switch value={settings.confirmBeforeDelete} onValueChange={(confirmBeforeDelete) => onChange({ confirmBeforeDelete })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                  </View>
                </>
              )}

              {section === "appearance" && (
                <>
                  <Text style={styles.settingsPageTitle}>Appearance</Text>
                  <Text style={styles.settingsPageIntro}>Tune outline density, typography, and the information shown in each view.</Text>
                  <Text style={styles.settingsGroupLabel}>OUTLINE</Text>
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Font size</Text>
                      <RuleChoices value={settings.textSize} onChange={(textSize) => onChange({ textSize: textSize as AppSettings["textSize"] })} options={[{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }]} />
                    </View>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Row spacing</Text>
                      <RuleChoices value={settings.rowDensity} onChange={(rowDensity) => onChange({ rowDensity: rowDensity as AppSettings["rowDensity"] })} options={[{ label: "Compact", value: "compact" }, { label: "Comfortable", value: "comfortable" }]} />
                    </View>
                    <SettingsRow title="Color text for due items">
                      <Switch value={settings.colorDueItems} onValueChange={(colorDueItems) => onChange({ colorDueItems })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Strike resolved items">
                      <Switch value={settings.strikeResolvedItems} onValueChange={(strikeResolvedItems) => onChange({ strikeResolvedItems })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                  </View>
                  <Text style={styles.settingsGroupLabel}>SIDEBAR</Text>
                  <View style={styles.settingsGroup}>
                    <SettingsRow title="Show Perspectives Bar">
                      <Switch value={settings.perspectiveBarVisible} onValueChange={(perspectiveBarVisible) => onChange({ perspectiveBarVisible })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Perspectives bar shows titles">
                      <Switch value={settings.perspectiveBarShowsTitles} onValueChange={(perspectiveBarShowsTitles) => onChange({ perspectiveBarShowsTitles })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Show item counts">
                      <Switch value={settings.showSidebarCounts} onValueChange={(showSidebarCounts) => onChange({ showSidebarCounts })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                  </View>
                </>
              )}

              {section === "data" && (
                <>
                  <Text style={styles.settingsPageTitle}>Data</Text>
                  <Text style={styles.settingsPageIntro}>Your database stays on this device and remains available offline.</Text>
                  <View style={styles.databaseCard}>
                    <View style={styles.databaseIcon}><Icon name="database-check-outline" size={28} color={palette.purpleDark} /></View>
                    <View style={styles.databaseCopy}>
                      <Text style={styles.databaseTitle}>Local database</Text>
                      <Text style={styles.databaseDetail}>{projectCount} projects · {taskCount} actions</Text>
                    </View>
                    <View style={styles.databaseStatus}><View style={styles.databaseStatusDot} /><Text style={styles.databaseStatusText}>Saved</Text></View>
                  </View>
                  <View style={styles.settingsGroup}>
                    <SettingsRow title="Import from OmniFocus" detail="Recommended: CSV from Database Settings. TaskPaper also works. Duplicate-safe merge or replace.">
                      <Pressable onPress={onImport} style={styles.settingsActionButton}><Icon name="database-import-outline" size={16} color={palette.purpleDark} /><Text style={styles.settingsActionText}>Import…</Text></Pressable>
                    </SettingsRow>
                  </View>
                  <Pressable onPress={onReset} style={styles.resetSettingsButton}><Icon name="restore" size={16} color={palette.danger} /><Text style={styles.resetSettingsText}>Restore Default Settings</Text></Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmDeleteModal({ visible, title, message, onCancel, onConfirm }: {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmBackdrop}>
        <Pressable style={styles.confirmDismissLayer} onPress={onCancel} accessibilityLabel="Cancel delete" />
        <View style={styles.confirmCard}>
          <View style={styles.confirmIcon}><Icon name="trash-can-outline" size={23} color={palette.danger} /></View>
          <Text style={styles.confirmTitle}>Delete “{title}”?</Text>
          <Text style={styles.confirmText}>{message ?? "This action will be permanently removed from your local database."}</Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={onConfirm} style={styles.confirmDeleteButton}><Text style={styles.confirmDeleteText}>Delete</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OmniImportModal({ data, error, summary, guide, onClose, onApply, onChooseFile }: {
  data: OmniImportData | null;
  error: string | null;
  summary: string | null;
  guide: boolean;
  onClose: () => void;
  onApply: (mode: ImportMode) => void;
  onChooseFile: () => void;
}) {
  const [replaceArmed, setReplaceArmed] = useState(false);
  useEffect(() => setReplaceArmed(false), [data]);
  const visible = guide || !!data || !!error || !!summary;
  const completed = data?.tasks.filter((task) => task.completed).length ?? 0;
  const inboxCount = data?.tasks.filter((task) => !task.projectId).length ?? 0;
  const tagCount = data ? new Set(data.tasks.flatMap((task) => task.tags)).size : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.importBackdrop}>
        <View style={styles.importCard}>
          <View style={styles.importHeader}>
            <View style={styles.importHeaderTitle}><Icon name="database-import-outline" size={20} color={palette.purpleDark} /><Text style={styles.importTitle}>{guide ? "Migrate OmniFocus Data" : "Import OmniFocus Records"}</Text></View>
            <Pressable accessibilityLabel="Close import" onPress={onClose} style={styles.iconButton}><Icon name="close" size={20} color={palette.muted} /></Pressable>
          </View>

          {data ? (
            <ScrollView contentContainerStyle={styles.importContent}>
              <View style={styles.importSourceRow}><View style={styles.importFileIcon}><Icon name="file-document-outline" size={25} color={palette.purpleDark} /></View><View style={styles.importSourceCopy}><Text numberOfLines={1} style={styles.importFileName}>{data.sourceName}</Text><Text style={styles.importFormat}>{data.format}</Text></View><Icon name="check-circle" size={23} color="#57965b" /></View>
              <Text style={styles.importSectionTitle}>READY TO IMPORT</Text>
              <View style={styles.importStats}>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{data.projects.length}</Text><Text style={styles.importStatLabel}>Projects</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{data.tasks.length}</Text><Text style={styles.importStatLabel}>Actions</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{inboxCount}</Text><Text style={styles.importStatLabel}>Inbox</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{completed}</Text><Text style={styles.importStatLabel}>Completed</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{tagCount}</Text><Text style={styles.importStatLabel}>Tags</Text></View>
              </View>
              {!!data.projects.length && <><Text style={styles.importSectionTitle}>PROJECTS FOUND</Text><View style={styles.importProjectList}>{data.projects.slice(0, 6).map((project) => <View key={project.id} style={styles.importProjectRow}><View style={[styles.miniDot, { backgroundColor: project.color }]} /><Text numberOfLines={1} style={styles.importProjectName}>{project.name}</Text><Text style={styles.importProjectCount}>{data.tasks.filter((task) => task.projectId === project.id).length}</Text></View>)}{data.projects.length > 6 && <Text style={styles.importMore}>+ {data.projects.length - 6} more projects</Text>}</View></>}
              {(!!data.skipped || !!data.warnings.length) && <View style={styles.importWarning}><Icon name="information-outline" size={18} color="#9b6c24" /><Text style={styles.importWarningText}>{[data.skipped ? `${data.skipped} unsupported or empty row${data.skipped === 1 ? " was" : "s were"} skipped.` : "", ...data.warnings].filter(Boolean).join(" ")}</Text></View>}
              <Text style={styles.importHelp}>Merge adds new records and ignores duplicates. Replace removes the current projects and actions, but keeps your custom perspectives.</Text>
              {replaceArmed && <View style={styles.replaceConfirm}><Text style={styles.replaceConfirmTitle}>Replace the current database?</Text><Text style={styles.replaceConfirmText}>Your current {data.tasks.length ? "projects and actions" : "records"} will be replaced by this import.</Text><View style={styles.replaceConfirmActions}><Pressable onPress={() => setReplaceArmed(false)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable onPress={() => onApply("replace")} style={styles.replaceButton}><Text style={styles.replaceButtonText}>Confirm Replace</Text></Pressable></View></View>}
            </ScrollView>
          ) : guide ? (
            <ScrollView contentContainerStyle={styles.importContent}>
              <Text style={styles.importLead}>OmniFocus does not offer a third-party API. CSV is the official portable export on iPhone, iPad, and Mac, and is the most complete way to move a live database here.</Text>
              <View style={styles.exportInstructions}>
                <Text style={styles.exportInstructionsTitle}>iPhone, iPad, or Vision Pro</Text>
                <Text style={styles.exportInstruction}>1. Open OmniFocus Settings</Text>
                <Text style={styles.exportInstruction}>2. Database → Export to CSV</Text>
                <Text style={styles.exportInstruction}>3. Share or save the file, then choose it below</Text>
              </View>
              <View style={styles.exportInstructions}>
                <Text style={styles.exportInstructionsTitle}>Mac</Text>
                <Text style={styles.exportInstruction}>1. File → Export…</Text>
                <Text style={styles.exportInstruction}>2. Choose CSV (or CSV UTF-16 if you use non-English characters)</Text>
                <Text style={styles.exportInstruction}>3. TaskPaper / Plain Text also works if you already have one</Text>
              </View>
              <View style={styles.importWarning}><Icon name="information-outline" size={18} color="#9b6c24" /><Text style={styles.importWarningText}>Skip .ofocus and .ofocus-backup files. Those packages are OmniFocus’s private transaction log, not a portable export.</Text></View>
            </ScrollView>
          ) : (
            <View style={styles.importMessageContent}>
              <View style={[styles.importMessageIcon, summary ? styles.importMessageIconSuccess : styles.importMessageIconError]}><Icon name={summary ? "check" : "file-alert-outline"} size={31} color={summary ? "#4f8b54" : palette.danger} /></View>
              <Text style={styles.importMessageTitle}>{summary ? "Import Complete" : "This file can’t be imported"}</Text>
              <Text style={styles.importMessageText}>{summary ?? error}</Text>
              {!summary && <View style={styles.exportInstructions}><Text style={styles.exportInstructionsTitle}>From OmniFocus</Text><Text style={styles.exportInstruction}>• iPhone or iPad: Settings → Database → Export to CSV</Text><Text style={styles.exportInstruction}>• Mac: File → Export → CSV or Plain Text (TaskPaper)</Text></View>}
            </View>
          )}

          <View style={styles.importFooter}>
            <Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelButtonText}>{data || guide ? "Cancel" : "Done"}</Text></Pressable>
            {guide && !data && <Pressable onPress={onChooseFile} style={styles.importMergeButton}><Icon name="file-document-outline" size={16} color="#fff" /><Text style={styles.importMergeText}>Choose CSV or TaskPaper</Text></Pressable>}
            {data && !replaceArmed && <><Pressable onPress={() => setReplaceArmed(true)} style={styles.importReplaceButton}><Text style={styles.importReplaceText}>Replace</Text></Pressable><Pressable onPress={() => onApply("merge")} style={styles.importMergeButton}><Icon name="call-merge" size={16} color="#fff" /><Text style={styles.importMergeText}>Merge Records</Text></Pressable></>}
            {!data && !guide && error && <Pressable onPress={onChooseFile} style={styles.importMergeButton}><Text style={styles.importMergeText}>Choose Another File</Text></Pressable>}
          </View>
        </View>
      </View>
    </Modal>
  );
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
  const [pendingDeleteDirection, setPendingDeleteDirection] = useState<"menu" | "previous" | "next">("menu");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [quickKind, setQuickKind] = useState<"task" | "project" | null>(null);
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

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedProject = selectedTask?.projectId ? projects.find((project) => project.id === selectedTask.projectId) : undefined;
  const activeCustomPerspective = perspective.startsWith("custom:") ? customPerspectives.find((item) => item.id === perspective.slice(7)) ?? null : null;
  const barItems = useMemo(() => favoritePerspectives(settings, customPerspectives), [customPerspectives, settings]);
  const knownTags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags))].sort(), [tasks]);

  const visibleTasks = useMemo(() => {
    let result = [...tasks];
    if (activeCustomPerspective) {
      const custom = activeCustomPerspective;
      result = result.filter((task) => taskMatchesCustomPerspective(task, custom));
      if (projectFilter) result = result.filter((task) => task.projectId === projectFilter);
      result.sort((a, b) => compareTasks(a, b, custom.sortBy));
    } else {
      if (perspective === "inbox") result = result.filter((task) => task.projectId === null);
      if (perspective === "projects") result = result.filter((task) => task.projectId !== null);
      if (perspective === "forecast") result = result.filter((task) => !!task.due);
      if (perspective === "flagged") result = result.filter((task) => task.flagged);
      if (projectFilter && perspective === "projects") result = result.filter((task) => task.projectId === projectFilter);
      const availability = settings.standardAvailability[perspective as PerspectiveId] ?? (settings.showCompleted ? "all" : "remaining");
      if (availability === "completed") result = result.filter((task) => task.completed);
      else if (availability !== "all") result = result.filter((task) => !task.completed);
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      result = result.filter((task) => `${task.title} ${task.note ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(needle));
    }
    return result;
  }, [tasks, perspective, projectFilter, settings.showCompleted, settings.standardAvailability, query, activeCustomPerspective]);

  const perspectiveTitle = activeCustomPerspective?.name ?? (projectFilter && perspective === "projects"
    ? projects.find((project) => project.id === projectFilter)?.name ?? "Projects"
    : perspectives.find((item) => item.id === perspective)?.label ?? "Projects");

  const selectPerspective = (id: ActivePerspective) => {
    setPerspective(id);
    setProjectFilter(null);
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
    setPerspective(`custom:${created.id}`);
    setProjectFilter(null);
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
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  };

  const toggleTask = (id: string) => {
    const target = tasks.find((task) => task.id === id);
    if (target) updateTask(id, { completed: !target.completed });
  };

  const finalizeDeleteTask = useCallback((id: string, direction: "menu" | "previous" | "next") => {
    const currentIndex = visibleTasks.findIndex((task) => task.id === id);
    setTasks((current) => current.filter((task) => task.id !== id));
    setPendingDeleteTaskId(null);
    setPendingDeleteDirection("menu");
    setInspectorOpen(false);

    if (direction === "next" && currentIndex >= 0) {
      const nextTask = visibleTasks[currentIndex + 1] ?? visibleTasks[currentIndex - 1];
      setSelectedTaskId(nextTask && nextTask.id !== id ? nextTask.id : null);
      return;
    }
    if (direction === "previous" && currentIndex >= 0) {
      const previousTask = visibleTasks[currentIndex - 1] ?? visibleTasks[currentIndex + 1];
      setSelectedTaskId(previousTask && previousTask.id !== id ? previousTask.id : null);
      return;
    }
    setSelectedTaskId((current) => current === id ? null : current);
  }, [visibleTasks]);

  const deleteTask = (id: string, direction: "menu" | "previous" | "next" = "menu") => {
    if (settings.confirmBeforeDelete) {
      setPendingDeleteTaskId(id);
      setPendingDeleteDirection(direction);
      return;
    }
    finalizeDeleteTask(id, direction);
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
    setSelectedTaskId((current) => {
      const selected = tasks.find((task) => task.id === current);
      return selected?.projectId === id ? null : current;
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

  const createItem = (title: string, projectId: string | null) => {
    if (quickKind === "project") {
      const project: Project = { id: makeId("project"), name: title, note: "", color: projectColors[projects.length % projectColors.length] ?? palette.purple, reviewIntervalDays: 7 };
      setProjects((current) => [...current, project]);
      setPerspective("projects");
      setProjectFilter(project.id);
    } else {
      const task: Task = { id: makeId("task"), title, projectId, tags: [], flagged: false, completed: false, createdAt: new Date().toISOString() };
      setTasks((current) => [...current, task]);
      setSelectedTaskId(task.id);
      if (projectId === null) selectPerspective("inbox");
      else {
        setPerspective("projects");
        setProjectFilter(projectId);
      }
    }
    setQuickKind(null);
  };

  const openInspector = (id: string) => {
    setSelectedTaskId(id);
    setInspectorOpen(true);
  };

  const selectTask = (id: string) => {
    setSelectedTaskId(id);
    if (isPhone || settings.openInspectorOnSelection) setInspectorOpen(true);
  };

  const selectAdjacentTask = useCallback((direction: "up" | "down") => {
    if (!visibleTasks.length) return;
    const currentIndex = selectedTaskId ? visibleTasks.findIndex((task) => task.id === selectedTaskId) : -1;
    const nextIndex = direction === "down"
      ? Math.min(currentIndex < 0 ? 0 : currentIndex + 1, visibleTasks.length - 1)
      : Math.max(currentIndex < 0 ? visibleTasks.length - 1 : currentIndex - 1, 0);
    const nextTask = visibleTasks[nextIndex];
    if (nextTask) selectTask(nextTask.id);
  }, [isPhone, selectedTaskId, settings.openInspectorOnSelection, visibleTasks]);

  const focusSelected = () => {
    if (!selectedTask?.projectId) return;
    setPerspective("projects");
    setProjectFilter(selectedTask.projectId);
  };

  const focusProject = (projectId: string) => {
    setPerspective("projects");
    setProjectFilter(projectId);
  };

  const newActionInProject = (projectId: string) => {
    setPerspective("projects");
    setProjectFilter(projectId);
    setQuickKind("task");
  };

  const toggleTaskFlag = (id: string) => {
    const target = tasks.find((task) => task.id === id);
    if (target) updateTask(id, { flagged: !target.flagged });
  };

  const deleteCustomPerspective = (id: string) => {
    const performDelete = () => {
      setCustomPerspectives((current) => current.filter((item) => item.id !== id));
      setSettings((current) => ({
        ...current,
        perspectiveBarIds: current.perspectiveBarIds.filter((item) => item !== `custom:${id}`),
        perspectiveShortcuts: Object.fromEntries(Object.entries(current.perspectiveShortcuts).filter(([key]) => key !== `custom:${id}`)),
      }));
      if (perspective === `custom:${id}`) setPerspective("projects");
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
    setPerspective(`custom:${copy.id}`);
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
    setSelectedTaskId(result.tasks[0]?.id ?? null);
    setPerspective("projects");
    setProjectFilter(null);
    setInspectorOpen(false);
    setImportPreview(null);
    const duplicateNote = result.duplicateTasks ? ` ${result.duplicateTasks} duplicate${result.duplicateTasks === 1 ? " was" : "s were"} ignored.` : "";
    setImportSummary(`${mode === "replace" ? "Loaded" : "Added"} ${result.addedTasks} action${result.addedTasks === 1 ? "" : "s"} and ${result.addedProjects} project${result.addedProjects === 1 ? "" : "s"}.${duplicateNote}`);
  };

  const defaultProjectId = projectFilter ?? selectedProject?.id ?? null;
  const pendingDeleteProject = pendingDeleteProjectId ? projects.find((project) => project.id === pendingDeleteProjectId) : undefined;
  const pendingDeleteProjectActionCount = pendingDeleteProjectId ? tasks.filter((task) => task.projectId === pendingDeleteProjectId).length : 0;
  const pendingDeleteMessage = pendingDeleteProjectId
    ? pendingDeleteProjectActionCount
      ? `This project and ${pendingDeleteProjectActionCount} action${pendingDeleteProjectActionCount === 1 ? "" : "s"} will be permanently removed from your local database.`
      : "This project will be permanently removed from your local database."
    : undefined;
  const sidebarPerspective: PerspectiveId = activeCustomPerspective
    ? (activeCustomPerspective.organizeBy === "projects" || effectiveGroupBy(activeCustomPerspective) === "project" ? "projects" : effectiveGroupBy(activeCustomPerspective) === "tag" ? "tags" : "projects")
    : perspective.startsWith("custom:") ? "projects" : perspective as PerspectiveId;
  const showSidebar = !isPhone && canShowSidebar && sidebarOpen && perspective !== "inbox" && !activeCustomPerspective?.keepSidebarHidden;
  const showInspector = !isPhone && canShowInspector && inspectorOpen && !!selectedTask;
  const modalOpen = quickKind !== null || settingsOpen || perspectivesListOpen || quickOpenOpen || importGuideOpen || !!importPreview || !!importError || !!importSummary;
  const nativeMenuTypes = new Set(["perspective", "toggleSidebar", "toggleInspector", "toggleSearch", "openSettings", "toggleViewMenu", "addPerspective", "showPerspectivesList", "togglePerspectivesBar", "quickOpen", "newAction", "newProject"]);

  const handleHotkeyAction = useCallback((action: HotkeyAction | MenuCommand) => {
    switch (action.type) {
      case "perspective":
        selectPerspective(action.id);
        break;
      case "toggleSidebar":
        if (canShowSidebar) setSidebarOpen((value) => !value);
        break;
      case "toggleInspector":
        if (canShowInspector && selectedTask) setInspectorOpen((value) => !value);
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
        setQuickKind("task");
        break;
      case "newProject":
        setQuickKind("project");
        break;
      case "quickEntry":
        setQuickKind("task");
        break;
      case "toggleComplete":
        if (selectedTaskId) toggleTask(selectedTaskId);
        break;
      case "toggleFlag":
        if (selectedTask) updateTask(selectedTask.id, { flagged: !selectedTask.flagged });
        break;
      case "delete":
        if (selectedTaskId) deleteTask(selectedTaskId, action.direction);
        else if (projectFilter) deleteProject(projectFilter);
        break;
      case "focusProject":
        focusSelected();
        break;
      case "markReviewed":
        if (perspective === "review" && selectedTask?.projectId) {
          setProjects((current) => current.map((project) => project.id === selectedTask.projectId ? { ...project, lastReviewedAt: new Date().toISOString() } : project));
        }
        break;
      case "selectRow":
        selectAdjacentTask(action.direction);
        break;
      case "confirmDelete":
        if (pendingDeleteProjectId) finalizeDeleteProject(pendingDeleteProjectId);
        else if (pendingDeleteTaskId) finalizeDeleteTask(pendingDeleteTaskId, pendingDeleteDirection);
        break;
      case "cancel":
        if (pendingDeleteProjectId) {
          setPendingDeleteProjectId(null);
          break;
        }
        if (pendingDeleteTaskId) {
          setPendingDeleteTaskId(null);
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
        break;
    }
  }, [
    canShowInspector,
    canShowSidebar,
    closeImport,
    deleteProject,
    deleteTask,
    finalizeDeleteProject,
    finalizeDeleteTask,
    focusSelected,
    importError,
    importGuideOpen,
    importPreview,
    importSummary,
    pendingDeleteDirection,
    pendingDeleteProjectId,
    pendingDeleteTaskId,
    perspective,
    perspectivesListOpen,
    quickKind,
    quickOpenOpen,
    searchOpen,
    selectAdjacentTask,
    selectedTask,
    selectedTaskId,
    settingsOpen,
    viewMenuOpen,
    projectFilter,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchOmniFocusHotkey(event, {
        deleteDialogOpen: !!pendingDeleteTaskId || !!pendingDeleteProjectId,
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
  }, [handleHotkeyAction, hasNativeMenu, modalOpen, pendingDeleteProjectId, pendingDeleteTaskId, settings.perspectiveShortcuts, shortcutRecordingId]);

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
            <View style={styles.trafficLights}><View style={[styles.trafficLight, { backgroundColor: "#ff5f57" }]} /><View style={[styles.trafficLight, { backgroundColor: "#febc2e" }]} /><View style={[styles.trafficLight, { backgroundColor: "#28c840" }]} /></View>
            <View style={styles.toolbarLeading}>
              <ToolbarButton icon="page-layout-sidebar-left" label="Sidebar" active={showSidebar} onPress={() => setSidebarOpen((value) => !value)} />
              <ToolbarButton icon="chevron-left" label="Back" disabled onPress={() => undefined} />
              <ToolbarButton icon="tune-variant" label="View" active={viewMenuOpen} onPress={() => setViewMenuOpen((value) => !value)} />
            </View>
            <View style={styles.toolbarCenter}>
              <ToolbarButton icon="plus" label="New Action" onPress={() => setQuickKind("task")} />
              <ToolbarButton icon="tray-arrow-down" label="Quick Entry" onPress={() => setQuickKind("task")} />
              <ToolbarButton icon="file-find-outline" label="Quick Open" onPress={() => setQuickOpenOpen(true)} />
              <ToolbarButton icon="bullseye-arrow" label="Focus" disabled={!selectedTask?.projectId} onPress={focusSelected} />
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
              <Pressable accessibilityLabel="View Options" onPress={() => setViewMenuOpen(true)} style={styles.mobileCircleButton}><Icon name="tune-variant" size={18} color={palette.purpleDark} /></Pressable>
              <Pressable accessibilityLabel="More and settings" onPress={() => setSettingsOpen(true)} style={styles.mobileCircleButton}><Icon name="dots-horizontal" size={20} color={palette.purpleDark} /></Pressable>
              <Pressable onPress={() => setSearchOpen((value) => !value)} style={styles.mobileCircleButton}><Icon name="magnify" size={21} color={palette.purpleDark} /></Pressable>
              <Pressable onPress={() => setQuickKind("task")} style={styles.mobileAddButton}><Icon name="plus" size={24} color="#fff" /></Pressable>
            </View>
          </View>
        )}

        {searchOpen && (
          <View style={styles.searchBar}>
            <Icon name="magnify" size={18} color="#77747b" />
            <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search Remaining" style={styles.searchInput} />
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
            onChangeCustom={(patch) => {
              if (activeCustomPerspective) patchCustomPerspective(activeCustomPerspective.id, patch);
            }}
            onClose={() => setViewMenuOpen(false)}
          />
        )}

        <View style={styles.workspace}>
          {!isPhone && settings.perspectiveBarVisible && (
            <PerspectiveRail
              current={perspective}
              inboxCount={tasks.filter((task) => task.projectId === null && !task.completed).length}
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
          )}
          {showSidebar && <ProjectSidebar perspective={sidebarPerspective} projects={projects} tasks={tasks} selectedProjectId={projectFilter} showCounts={settings.showSidebarCounts} onSelectProject={setProjectFilter} onNewProject={() => setQuickKind("project")} onFocusProject={focusProject} onNewActionInProject={newActionInProject} onDeleteProject={deleteProject} />}
          <Outline
            title={perspectiveTitle}
            perspective={perspective}
            customPerspective={activeCustomPerspective}
            projects={projects}
            tasks={visibleTasks}
            selectedTaskId={selectedTaskId}
            projectFilter={projectFilter}
            settings={settings}
            onSelectTask={selectTask}
            onToggleTask={toggleTask}
            onInspectTask={openInspector}
            onToggleFlagTask={toggleTaskFlag}
            onDeleteTask={(id) => deleteTask(id)}
            onNewTask={() => setQuickKind("task")}
            onReviewProject={(id) => setProjects((current) => current.map((project) => project.id === id ? { ...project, lastReviewedAt: new Date().toISOString() } : project))}
            onOpenViewMenu={() => setViewMenuOpen(true)}
            onFocusProject={focusProject}
            onNewActionInProject={newActionInProject}
            onDeleteProject={deleteProject}
            onImport={openOmniFocusImport}
            databaseEmpty={hydrated && projects.length === 0 && tasks.length === 0}
          />
          {showInspector && selectedTask && <Inspector task={selectedTask} projects={projects} onChange={(patch) => updateTask(selectedTask.id, patch)} onToggle={() => toggleTask(selectedTask.id)} onDelete={() => deleteTask(selectedTask.id)} />}
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

      {settingsOpen && <SettingsModal settings={settings} projectCount={projects.length} taskCount={tasks.length} compact={isPhone} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} onClose={() => setSettingsOpen(false)} onImport={() => { setSettingsOpen(false); void openOmniFocusImport(); }} onReset={() => setSettings(defaultSettings)} />}

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
        onSelectProject={(id) => { setPerspective("projects"); setProjectFilter(id); }}
      />

      <OmniImportModal data={importPreview} error={importError} summary={importSummary} guide={importGuideOpen} onClose={closeImport} onApply={applyImport} onChooseFile={() => void chooseOmniFocusFile()} />

      <ConfirmDeleteModal
        visible={!!pendingDeleteTaskId || !!pendingDeleteProjectId}
        title={pendingDeleteProject?.name ?? tasks.find((task) => task.id === pendingDeleteTaskId)?.title ?? (pendingDeleteProjectId ? "this project" : "this action")}
        message={pendingDeleteMessage}
        onCancel={() => {
          setPendingDeleteTaskId(null);
          setPendingDeleteDirection("menu");
          setPendingDeleteProjectId(null);
        }}
        onConfirm={() => {
          if (pendingDeleteProjectId) {
            finalizeDeleteProject(pendingDeleteProjectId);
            return;
          }
          if (!pendingDeleteTaskId) return;
          finalizeDeleteTask(pendingDeleteTaskId, pendingDeleteDirection);
        }}
      />

      {isPhone && selectedTask && (
        <Modal visible={inspectorOpen} animationType="slide" onRequestClose={() => setInspectorOpen(false)}>
          <SafeAreaView style={styles.safeArea}><Inspector modal task={selectedTask} projects={projects} onClose={() => setInspectorOpen(false)} onChange={(patch) => updateTask(selectedTask.id, patch)} onToggle={() => toggleTask(selectedTask.id)} onDelete={() => deleteTask(selectedTask.id)} /></SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
    </ContextMenuProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f1f0f2" },
  appShell: { flex: 1, backgroundColor: palette.canvas },
  toolbar: { height: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#bdbbc0", backgroundColor: "#f1f0f2", paddingHorizontal: 12, zIndex: 20 },
  trafficLights: { width: 67, flexDirection: "row", gap: 8, paddingLeft: 5 },
  trafficLight: { width: 13, height: 13, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,.2)" },
  toolbarLeading: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  toolbarCenter: { flexDirection: "row", alignItems: "center", gap: 9 },
  toolbarTrailing: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 6 },
  toolbarButton: { minWidth: 52, height: 54, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", borderRadius: 8, gap: 1 },
  toolbarButtonActive: { backgroundColor: "rgba(0,0,0,.055)" },
  toolbarLabel: { fontSize: 9.5, color: "#454248" },
  pressed: { opacity: .65 },
  disabled: { opacity: .35 },
  viewMenu: { position: "absolute", top: 56, left: -68, width: 250, padding: 14, backgroundColor: "#fbfafc", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "#bcb9bf", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: .2, shadowRadius: 24, elevation: 12, zIndex: 100 },
  viewMenuTitle: { fontSize: 13, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  viewMenuRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  viewMenuAction: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  viewMenuText: { fontSize: 12 },
  viewMenuFoot: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, fontSize: 10, color: palette.muted },
  menuDismissLayer: { position: "absolute", top: 90, left: 0, right: 0, bottom: 0, zIndex: 10 },
  mobileHeader: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#f7f5f8" },
  mobileEyebrow: { fontSize: 8, letterSpacing: 1.2, fontWeight: "700", color: palette.purpleDark },
  mobileTitle: { maxWidth: 220, fontSize: 23, fontWeight: "700", letterSpacing: -.4, color: palette.text },
  mobileHeaderActions: { flexDirection: "row", gap: 8 },
  mobileCircleButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.purpleSoft, alignItems: "center", justifyContent: "center" },
  mobileAddButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.purple, alignItems: "center", justifyContent: "center" },
  searchBar: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, backgroundColor: "#f6f5f7", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  searchInput: { flex: 1, height: 30, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c5c2c8", borderRadius: 7, backgroundColor: "#fff", fontSize: 13 },
  searchDone: { color: palette.purpleDark, fontSize: 12, fontWeight: "600" },
  workspace: { flex: 1, minHeight: 0, flexDirection: "row" },
  perspectiveRail: { width: 82, paddingHorizontal: 7, paddingVertical: 8, gap: 2, backgroundColor: palette.rail, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: palette.line },
  perspectiveRailList: { flex: 1 },
  perspectiveRailScroll: { gap: 2, paddingBottom: 4 },
  perspectiveItem: { height: 59, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 8 },
  perspectiveItemSelected: { backgroundColor: "#e9e0f0" },
  perspectiveLabel: { maxWidth: 68, fontSize: 9.5, color: "#58555c" },
  perspectiveLabelSelected: { color: palette.purpleDark, fontWeight: "600" },
  perspectiveMore: { marginTop: "auto" },
  customRailDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 9, marginVertical: 5, backgroundColor: palette.line },
  railSettingsButton: { height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  badge: { position: "absolute", right: -11, top: -4, minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#8d8a91" },
  badgeSelected: { backgroundColor: palette.purpleDark },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  sidebar: { width: 236, backgroundColor: palette.sidebar, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: palette.line },
  sidebarHeader: { height: 69, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sidebarTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -.25 },
  sidebarScroll: { paddingHorizontal: 8, paddingBottom: 50 },
  sidebarRow: { minHeight: 35, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 7 },
  sidebarRowSelected: { backgroundColor: "#d9d8dc" },
  sidebarRowText: { flex: 1, fontSize: 12.5, fontWeight: "500", color: "#3a373d" },
  sidebarCount: { fontSize: 10, color: palette.muted },
  sidebarSectionLabel: { marginTop: 16, marginBottom: 5, marginLeft: 8, fontSize: 8.5, letterSpacing: .7, fontWeight: "700", color: "#817e85" },
  projectDot: { width: 14, height: 14, borderWidth: 2, borderRadius: 7, backgroundColor: palette.sidebar },
  sidebarFooter: { position: "absolute", left: 0, right: 0, bottom: 0, height: 39, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: palette.sidebar },
  sidebarFooterText: { fontSize: 11, color: "#625f66" },
  sidebarEmpty: { paddingHorizontal: 24, paddingTop: 30, alignItems: "center", gap: 8 },
  sidebarEmptyText: { fontSize: 11, lineHeight: 16, textAlign: "center", color: "#8b888f" },
  forecastPast: { height: 35, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  forecastPastCount: { fontSize: 10, color: palette.danger },
  forecastDays: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 3 },
  forecastDay: { width: 38, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  forecastDaySelected: { backgroundColor: palette.purple },
  forecastDayText: { fontSize: 9, lineHeight: 14, textAlign: "center", color: palette.muted, fontWeight: "600" },
  forecastDayTextSelected: { color: "#fff" },
  outline: { flex: 1, minWidth: 320, backgroundColor: palette.canvas },
  outlineHeader: { height: 69, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  outlineHeaderCopy: { flex: 1 },
  outlineTitle: { fontSize: 24, lineHeight: 29, fontWeight: "700", letterSpacing: -.55, color: palette.text },
  outlineSubtitle: { fontSize: 10, color: "#858189" },
  iconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  outlineScroll: { flex: 1 },
  outlineContent: { paddingBottom: 48 },
  projectGroup: { borderBottomWidth: 7, borderBottomColor: "#f5f4f6" },
  projectHeading: { minHeight: 63, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "flex-start", gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  projectHeadingRing: { width: 18, height: 18, marginTop: 1, borderWidth: 3, borderRadius: 9, backgroundColor: "#fff" },
  projectHeadingCopy: { flex: 1 },
  projectHeadingTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: "700", color: "#2a272c" },
  projectHeadingNote: { fontSize: 10, lineHeight: 15, color: "#86828a" },
  projectHeadingCount: { fontSize: 10, color: "#89868c" },
  tagHeading: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  taskRow: { minHeight: 55, paddingHorizontal: 17, paddingVertical: 7, flexDirection: "row", alignItems: "flex-start", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e7e5e9" },
  taskRowCompact: { minHeight: 45, paddingVertical: 4 },
  taskRowSelected: { backgroundColor: palette.purpleSelection },
  taskRowPressed: { opacity: .72 },
  statusRing: { marginTop: 1, borderWidth: 1.8, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  taskBody: { flex: 1, minWidth: 0 },
  taskTitleLine: { minHeight: 19, flexDirection: "row", alignItems: "center", gap: 4 },
  taskTitle: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: "#29262b" },
  taskTitleSmall: { fontSize: 12, lineHeight: 17 },
  taskTitleLarge: { fontSize: 15, lineHeight: 20 },
  taskTitleResolved: { color: "#969299" },
  taskTitleCompleted: { textDecorationLine: "line-through" },
  taskMeta: { minHeight: 17, flexDirection: "row", alignItems: "center", gap: 5, overflow: "hidden" },
  taskMetaText: { maxWidth: 165, fontSize: 9.5, color: "#8b878f" },
  tagChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, backgroundColor: "rgba(110,108,115,.11)" },
  tagChipText: { fontSize: 8.5, color: "#77737b" },
  taskTail: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 5 },
  dueText: { fontSize: 9.5, color: "#77737b" },
  dueToday: { color: palette.danger, fontWeight: "600" },
  rowInfoButton: { marginLeft: 2 },
  newActionBar: { position: "absolute", left: 0, right: 0, bottom: 0, height: 40, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: "rgba(255,255,255,.97)" },
  newActionText: { fontSize: 11, color: "#625f66" },
  emptyState: { paddingVertical: 85, alignItems: "center" },
  emptyCheck: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: "#b7b3ba", alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 13, marginBottom: 4, fontSize: 17, fontWeight: "700", color: "#67636a" },
  emptyText: { fontSize: 11, color: "#8f8b93" },
  migrateState: { paddingVertical: 72, paddingHorizontal: 28, alignItems: "center" },
  migrateIcon: { width: 56, height: 56, marginBottom: 14, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: palette.purpleSoft },
  migrateTitle: { marginBottom: 8, fontSize: 18, fontWeight: "700", textAlign: "center", color: palette.text },
  migrateText: { maxWidth: 420, marginBottom: 16, fontSize: 11, lineHeight: 16, textAlign: "center", color: palette.muted },
  migrateButton: { minHeight: 34, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, backgroundColor: palette.purple },
  migrateButtonText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  migrateHint: { marginTop: 12, fontSize: 10, color: "#8f8b93" },
  importLead: { fontSize: 11, lineHeight: 16, color: "#5f5b63" },
  reviewRow: { minHeight: 66, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  reviewCopy: { flex: 1 },
  reviewButton: { height: 29, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.purple, borderRadius: 7 },
  reviewButtonText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  inspector: { width: 316, backgroundColor: palette.inspector, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.line },
  inspectorModal: { flex: 1, width: "100%", borderLeftWidth: 0 },
  inspectorTabs: { height: 43, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-around", gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  inspectorTabSelected: { paddingHorizontal: 18, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: "#dedce1" },
  inspectorTabText: { fontSize: 9.5, color: "#5f5c63" },
  modalClose: { marginRight: "auto" },
  inspectorScroll: { flex: 1 },
  inspectorTitleRow: { minHeight: 82, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  inspectorTitleInput: { flex: 1, minHeight: 45, padding: 0, fontSize: 13, lineHeight: 18, color: palette.text, textAlignVertical: "top" },
  inspectorSection: { paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  inspectorSectionTitle: { marginBottom: 8, fontSize: 8.5, letterSpacing: .45, fontWeight: "700", color: "#77737b" },
  fieldLabel: { marginTop: 5, marginBottom: 3, fontSize: 9.5, color: "#706c74" },
  fieldInput: { minHeight: 28, paddingHorizontal: 8, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 6, backgroundColor: "rgba(255,255,255,.74)", fontSize: 10.5, color: "#353238" },
  noteInput: { minHeight: 96, paddingTop: 7 },
  choiceRow: { gap: 5, paddingBottom: 4 },
  choiceChip: { maxWidth: 170, height: 27, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc9cf", backgroundColor: "rgba(255,255,255,.7)" },
  choiceChipSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  choiceText: { fontSize: 9.5, color: "#5c5960" },
  choiceTextSelected: { color: palette.purpleDark, fontWeight: "600" },
  savedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingBottom: 11 },
  savedText: { fontSize: 9, color: "#778079" },
  deleteButton: { height: 31, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 7, backgroundColor: "#fff9f9" },
  deleteButtonText: { color: palette.danger, fontSize: 10.5, fontWeight: "600" },
  modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 18, backgroundColor: "rgba(29,25,32,.24)" },
  quickEntryCard: { width: "100%", maxWidth: 680, overflow: "hidden", borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#fbfafc", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: .28, shadowRadius: 40, elevation: 16 },
  quickEntryHeader: { height: 42, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#f0eff1" },
  quickEntryHeaderText: { fontSize: 12, fontWeight: "700", color: "#37343a" },
  quickInputRow: { minHeight: 67, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff" },
  quickRing: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.8, borderColor: "#8e8a92" },
  quickInput: { flex: 1, height: 43, fontSize: 16, color: palette.text },
  quickProjectRow: { paddingHorizontal: 46, paddingVertical: 9, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#eceaed", backgroundColor: "#fff" },
  quickProjectChip: { maxWidth: 175, height: 29, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d2cfd5", backgroundColor: "#f5f4f6" },
  quickProjectChipSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  quickProjectText: { flexShrink: 1, fontSize: 9.5, color: "#5f5c63" },
  miniDot: { width: 7, height: 7, borderRadius: 4 },
  quickFooter: { minHeight: 50, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  quickHint: { flex: 1, fontSize: 8.5, color: "#98949c" },
  cancelButton: { height: 29, minWidth: 68, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#c9c6cc", borderRadius: 7, backgroundColor: "#fff" },
  cancelButtonText: { fontSize: 10.5, color: "#555159" },
  saveButton: { height: 29, minWidth: 68, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: palette.purple },
  saveButtonText: { fontSize: 10.5, color: "#fff", fontWeight: "700" },
  perspectiveModalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(29,25,32,.3)" },
  perspectiveEditor: { width: "100%", maxWidth: 720, maxHeight: "92%", overflow: "hidden", borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#f5f3f6", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: .28, shadowRadius: 42, elevation: 18 },
  perspectiveEditorHeader: { height: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#efedf0" },
  perspectiveEditorTitle: { fontSize: 14, fontWeight: "700", color: palette.text },
  editorCancelText: { minWidth: 52, fontSize: 12, color: palette.muted },
  editorSaveText: { minWidth: 52, textAlign: "right", fontSize: 12, fontWeight: "700", color: palette.purpleDark },
  perspectiveEditorScroll: { flexGrow: 0 },
  perspectiveEditorContent: { padding: 18, paddingBottom: 30 },
  perspectiveIdentity: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 18 },
  perspectivePreviewIcon: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  perspectiveNameInput: { flex: 1, height: 44, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c8c5cb", borderRadius: 9, backgroundColor: "#fff", fontSize: 17, fontWeight: "600", color: palette.text },
  editorSectionTitle: { marginTop: 4, marginBottom: 7, fontSize: 8.5, letterSpacing: .8, fontWeight: "700", color: "#77737b" },
  iconChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 15 },
  iconChoice: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#cecad1", borderRadius: 9, backgroundColor: "#fff" },
  colorChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 17 },
  colorChoice: { width: 29, height: 29, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 2, borderColor: "transparent" },
  colorChoiceSelected: { borderColor: "#fff", shadowColor: "#000", shadowOpacity: .22, shadowRadius: 3, elevation: 3 },
  ruleCard: { padding: 14, marginBottom: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d3d0d5", borderRadius: 11, backgroundColor: "#fff" },
  ruleCardHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  ruleCardTitle: { fontSize: 13, fontWeight: "700", color: palette.text },
  ruleLabel: { marginTop: 10, marginBottom: 5, fontSize: 10, fontWeight: "600", color: "#5f5b63" },
  ruleOptional: { fontWeight: "400", color: "#98949c" },
  ruleChoices: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  ruleChoice: { minHeight: 29, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 7, backgroundColor: "#f7f6f8" },
  ruleChoiceSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  ruleChoiceText: { fontSize: 9.5, color: "#67636b" },
  ruleChoiceTextSelected: { color: palette.purpleDark, fontWeight: "700" },
  projectRuleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  projectRuleChip: { minHeight: 29, maxWidth: "100%", paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 7, backgroundColor: "#f7f6f8" },
  projectRuleText: { flexShrink: 1, fontSize: 9.5, color: "#67636b" },
  editorInput: { minHeight: 34, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c9c6cc", borderRadius: 7, backgroundColor: "#fbfafc", fontSize: 11, color: palette.text },
  matchRow: { minHeight: 37, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  matchRowText: { fontSize: 10, color: "#67636b" },
  deletePerspectiveButton: { height: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 8, backgroundColor: "#fff9f9" },
  deletePerspectiveText: { fontSize: 11, fontWeight: "600", color: palette.danger },
  settingsBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "rgba(27,24,30,.34)" },
  settingsWindow: { width: "100%", maxWidth: 780, height: "82%", maxHeight: 610, minHeight: 480, overflow: "hidden", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#f7f6f8", shadowColor: "#000", shadowOffset: { width: 0, height: 24 }, shadowOpacity: .3, shadowRadius: 48, elevation: 20 },
  settingsWindowCompact: { height: "96%", maxHeight: "96%", minHeight: 0 },
  settingsTitlebar: { height: 49, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#c9c6cc", backgroundColor: "#eceaed" },
  settingsTrafficLights: { position: "absolute", left: 15, flexDirection: "row", gap: 8 },
  settingsTrafficLight: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,.18)" },
  settingsTitle: { fontSize: 13, fontWeight: "700", color: "#37343a" },
  settingsDoneButton: { position: "absolute", right: 12, minWidth: 48, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  settingsDoneText: { fontSize: 11, fontWeight: "600", color: palette.purpleDark },
  settingsBody: { flex: 1, minHeight: 0, flexDirection: "row" },
  settingsBodyCompact: { flexDirection: "column" },
  settingsSidebar: { width: 178, padding: 12, gap: 3, backgroundColor: "#e8e6ea", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#c9c6cc" },
  settingsSidebarCompact: { width: "100%", height: 58, paddingHorizontal: 8, paddingVertical: 8, flexDirection: "row", borderRightWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#c9c6cc" },
  settingsNavItem: { height: 39, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 7 },
  settingsNavItemCompact: { flex: 1, height: 40, justifyContent: "center", paddingHorizontal: 5, gap: 5 },
  settingsNavItemSelected: { backgroundColor: "#d8c9e5" },
  settingsNavIcon: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#d5d2d8" },
  settingsNavIconSelected: { backgroundColor: palette.purple },
  settingsNavText: { fontSize: 11.5, color: "#4c4850" },
  settingsNavTextSelected: { color: "#3d254f", fontWeight: "600" },
  settingsContent: { flex: 1, backgroundColor: "#f8f7f9" },
  settingsContentInner: { paddingHorizontal: 28, paddingTop: 25, paddingBottom: 35 },
  settingsContentInnerCompact: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 26 },
  settingsPageTitle: { fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: -.35, color: palette.text },
  settingsPageIntro: { marginTop: 4, marginBottom: 20, fontSize: 10.5, lineHeight: 16, color: palette.muted },
  settingsGroupLabel: { marginTop: 2, marginBottom: 6, marginLeft: 3, fontSize: 8, letterSpacing: .7, fontWeight: "700", color: "#817d85" },
  settingsGroup: { marginBottom: 18, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "#d2cfd5", borderRadius: 10, backgroundColor: "#fff" },
  settingsRow: { minHeight: 58, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e3e1e5" },
  settingsStackedRow: { minHeight: 74, paddingHorizontal: 13, paddingVertical: 11, gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e3e1e5" },
  settingsRowCopy: { flex: 1, minWidth: 0 },
  settingsRowTitle: { fontSize: 11.5, fontWeight: "600", color: "#37343a" },
  settingsRowDetail: { marginTop: 2, fontSize: 9, lineHeight: 13, color: "#89858d" },
  settingsRowControl: { alignItems: "flex-end" },
  databaseCard: { minHeight: 76, marginBottom: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d2cfd5", borderRadius: 10, backgroundColor: "#fff" },
  databaseIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: palette.purpleSoft },
  databaseCopy: { flex: 1 },
  databaseTitle: { fontSize: 12, fontWeight: "700", color: palette.text },
  databaseDetail: { marginTop: 3, fontSize: 9.5, color: palette.muted },
  databaseStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
  databaseStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#58a65c" },
  databaseStatusText: { fontSize: 9, color: "#667368" },
  settingsActionButton: { minHeight: 30, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c9c6cc", borderRadius: 7, backgroundColor: "#f7f6f8" },
  settingsActionText: { fontSize: 10, fontWeight: "600", color: palette.purpleDark },
  resetSettingsButton: { minHeight: 34, alignSelf: "flex-start", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 7, backgroundColor: "#fff9f9" },
  resetSettingsText: { fontSize: 10, fontWeight: "600", color: palette.danger },
  confirmBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "rgba(27,24,30,.32)" },
  confirmDismissLayer: { ...StyleSheet.absoluteFill, zIndex: 0 },
  confirmCard: { width: "100%", maxWidth: 390, padding: 20, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", borderRadius: 13, backgroundColor: "#fbfafc", shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: .24, shadowRadius: 32, elevation: 18, zIndex: 1 },
  confirmIcon: { width: 45, height: 45, marginBottom: 11, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: "#f7e4e4" },
  confirmTitle: { maxWidth: "100%", fontSize: 15, fontWeight: "700", color: palette.text },
  confirmText: { marginTop: 5, fontSize: 10, lineHeight: 15, textAlign: "center", color: palette.muted },
  confirmActions: { width: "100%", marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  confirmDeleteButton: { height: 29, minWidth: 72, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: palette.danger },
  confirmDeleteText: { fontSize: 10.5, fontWeight: "700", color: "#fff" },
  importBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(29,25,32,.34)" },
  importCard: { width: "100%", maxWidth: 620, maxHeight: "90%", overflow: "hidden", borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#f8f7f9", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: .3, shadowRadius: 42, elevation: 18 },
  importHeader: { minHeight: 53, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#efedf0" },
  importHeaderTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  importTitle: { fontSize: 14, fontWeight: "700", color: palette.text },
  importContent: { padding: 18, gap: 12 },
  importSourceRow: { minHeight: 62, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d0cdd3", borderRadius: 10, backgroundColor: "#fff" },
  importFileIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: palette.purpleSoft },
  importSourceCopy: { flex: 1, minWidth: 0 },
  importFileName: { fontSize: 12.5, fontWeight: "700", color: palette.text },
  importFormat: { marginTop: 2, fontSize: 9.5, color: palette.muted },
  importSectionTitle: { marginTop: 3, fontSize: 8.5, letterSpacing: .8, fontWeight: "700", color: "#77737b" },
  importStats: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  importStat: { flexGrow: 1, flexBasis: 72, minHeight: 62, padding: 8, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#d6d3d8", borderRadius: 9, backgroundColor: "#fff" },
  importStatValue: { fontSize: 20, lineHeight: 23, fontWeight: "700", color: palette.purpleDark },
  importStatLabel: { marginTop: 2, fontSize: 8.5, color: palette.muted },
  importProjectList: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "#d6d3d8", borderRadius: 9, backgroundColor: "#fff" },
  importProjectRow: { minHeight: 34, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ebe9ec" },
  importProjectName: { flex: 1, fontSize: 10.5, color: "#4e4a51" },
  importProjectCount: { fontSize: 9, color: palette.muted },
  importMore: { padding: 10, fontSize: 9.5, textAlign: "center", color: palette.purpleDark },
  importWarning: { padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 7, borderRadius: 8, backgroundColor: "#fff4dd" },
  importWarningText: { flex: 1, fontSize: 9.5, lineHeight: 14, color: "#75531f" },
  importHelp: { fontSize: 9.5, lineHeight: 14, color: palette.muted },
  replaceConfirm: { padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e3baba", borderRadius: 9, backgroundColor: "#fff7f7" },
  replaceConfirmTitle: { fontSize: 11.5, fontWeight: "700", color: palette.danger },
  replaceConfirmText: { fontSize: 9.5, lineHeight: 14, color: "#765b5b" },
  replaceConfirmActions: { marginTop: 5, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  replaceButton: { height: 29, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: palette.danger },
  replaceButtonText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  importMessageContent: { paddingHorizontal: 28, paddingVertical: 34, alignItems: "center" },
  importMessageIcon: { width: 58, height: 58, marginBottom: 13, alignItems: "center", justifyContent: "center", borderRadius: 29 },
  importMessageIconSuccess: { backgroundColor: "#e2f0e3" },
  importMessageIconError: { backgroundColor: "#f8e4e4" },
  importMessageTitle: { marginBottom: 7, fontSize: 17, fontWeight: "700", color: palette.text },
  importMessageText: { maxWidth: 450, fontSize: 11, lineHeight: 17, textAlign: "center", color: palette.muted },
  exportInstructions: { width: "100%", marginTop: 18, padding: 13, gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d6d3d8", borderRadius: 9, backgroundColor: "#fff" },
  exportInstructionsTitle: { marginBottom: 2, fontSize: 10.5, fontWeight: "700", color: palette.text },
  exportInstruction: { fontSize: 9.5, lineHeight: 15, color: "#5f5b63" },
  importFooter: { minHeight: 56, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: "#f0eff1" },
  importReplaceButton: { height: 31, minWidth: 72, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 7, backgroundColor: "#fff9f9" },
  importReplaceText: { fontSize: 10.5, color: palette.danger },
  importMergeButton: { height: 31, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 7, backgroundColor: palette.purple },
  importMergeText: { fontSize: 10.5, fontWeight: "700", color: "#fff" },
  mobileNav: { minHeight: 62, paddingTop: 5, paddingBottom: Platform.OS === "ios" ? 4 : 6, flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: "#f7f5f8" },
  mobileNavList: { flex: 1 },
  mobileNavScroll: { paddingHorizontal: 3 },
  mobileNavItem: { width: 64, alignItems: "center", justifyContent: "center", gap: 2 },
  mobileNavLabel: { maxWidth: 58, fontSize: 8, color: "#77747b" },
  mobileNavLabelSelected: { color: palette.purpleDark, fontWeight: "700" },
});
