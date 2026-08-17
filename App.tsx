import { MaterialCommunityIcons } from "@expo/vector-icons";
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
import { isTextInputTarget, matchOmniFocusHotkey, type HotkeyAction } from "./src/hotkeys";
import { ContextMenuPressable, ContextMenuProvider, useContextMenuTrigger, type ContextMenuItem } from "./src/contextMenu";
import { MenuBar, type MenuCommand } from "./src/menuBar";
import { ViewOptionsPanel } from "./src/viewOptions";
import { PerspectivesListModal } from "./src/perspectivesList";
import { QuickOpenModal } from "./src/quickOpen";
import { compareTasks, duplicateCustomPerspective, effectiveGroupBy, normalizeCustomPerspective, taskMatchesCustomPerspective } from "./src/perspectiveRules";
import { formatShortcut, toElectronAccelerator } from "./src/shortcuts";
import { useMarqueeSelection, useModifierKeys } from "./src/marquee";
import {
  applyRepeat,
  buildFolderTree,
  childMap,
  convertActionToProject,
  descendantsOf,
  flattenTasks,
  formatEstimate,
  indentTasks,
  insertTaskAfter,
  isBlockedSequential,
  moveSiblings,
  outdentTasks,
  projectDisplayName,
  projectInFolder,
  projectIsStalled,
  renameTag,
  sidebarActionCounts,
  skipReviewTimestamp,
  taskDepth,
  taskMatchesView,
  toTaskPaper,
  withLingeringTasks,
} from "./src/outline";
import {
  completionGroupLabel,
  completionGroupOrder,
  duePresetLabel,
  dueUrgency,
  formatAvailableLabel,
  forecastSubtitle,
  forecastWeek,
  inspectorTimestamp,
  isDueOnDay,
  isForecastItem,
  projectDueForReview,
  reviewStatusText,
  sameLocation,
  todayKey,
  type DueUrgency,
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

const trafficLightColors = ["#ff5f57", "#febc2e", "#28c840"] as const;

function TrafficLight({ color, onPress, accessibilityLabel }: { color: string; onPress?: () => void; accessibilityLabel?: string }) {
  const dot = (
    <View style={[styles.trafficLight, { backgroundColor: color }]}>
      <View style={styles.trafficLightShine} />
    </View>
  );
  if (!onPress) return dot;
  return (
    <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4}>
      {dot}
    </Pressable>
  );
}

function TrafficLights({ onClose }: { onClose?: () => void }) {
  return (
    <View style={styles.trafficLights}>
      {trafficLightColors.map((color, index) => (
        <TrafficLight key={color} color={color} onPress={index === 0 ? onClose : undefined} accessibilityLabel={index === 0 ? "Close" : undefined} />
      ))}
    </View>
  );
}

function SidebarRow({
  selected,
  items,
  style,
  children,
  ...rest
}: Omit<React.ComponentProps<typeof Pressable>, "style"> & { selected?: boolean; items?: ContextMenuItem[]; style?: React.ComponentProps<typeof View>["style"] }) {
  const [hovered, setHovered] = useState(false);
  const rowStyle = ({ pressed }: { pressed: boolean }) => [
    styles.sidebarRow,
    selected && styles.sidebarRowSelected,
    hovered && !selected && styles.sidebarRowHover,
    pressed && styles.pressed,
    style,
  ];
  const hoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  if (items?.length) {
    return (
      <ContextMenuPressable items={items} {...hoverProps} {...rest} style={rowStyle}>
        {children}
      </ContextMenuPressable>
    );
  }
  return (
    <Pressable {...hoverProps} {...rest} style={rowStyle}>
      {children}
    </Pressable>
  );
}

function clampPane(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function PaneResizeHandle({ onDrag }: { onDrag: (delta: number) => void }) {
  const lastX = useRef<number | null>(null);
  if (Platform.OS !== "web") return <View style={styles.paneHandle} />;
  return (
    <View
      accessibilityLabel="Resize pane"
      style={[styles.paneHandle, { cursor: "col-resize" } as object]}
      {...({
        onMouseDown: (event: { clientX: number; preventDefault?: () => void }) => {
          event.preventDefault?.();
          lastX.current = event.clientX;
          const move = (next: MouseEvent) => {
            if (lastX.current == null) return;
            onDrag(next.clientX - lastX.current);
            lastX.current = next.clientX;
          };
          const up = () => {
            lastX.current = null;
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        },
      } as object)}
    />
  );
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

function statusRingColor(completed: boolean, flagged: boolean, urgency: DueUrgency, fallback?: string, blocked?: boolean, hold?: boolean, dropped?: boolean) {
  if (completed) return fallback ?? palette.purple;
  if (dropped) return "#9aa0a6";
  if (hold) return "#c9a227";
  if (blocked) return "#b4b1b8";
  if (urgency === "overdue") return palette.overdue;
  if (urgency === "dueSoon") return palette.dueSoon;
  if (flagged) return palette.flag;
  return fallback ?? palette.purple;
}

function StatusRing({ completed, flagged = false, urgency = "none", color, onPress, size = 19, blocked = false, hold = false, dropped = false }: {
  completed: boolean;
  flagged?: boolean;
  urgency?: DueUrgency;
  color?: string;
  onPress: () => void;
  size?: number;
  blocked?: boolean;
  hold?: boolean;
  dropped?: boolean;
}) {
  const ringColor = statusRingColor(completed, flagged, urgency, color, blocked, hold, dropped);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed }}
      onPress={onPress}
      hitSlop={8}
      {...({ dataSet: { noMarquee: "true" } } as object)}
      style={[
        styles.statusRing,
        { width: size, height: size, borderRadius: size / 2, borderColor: ringColor },
        (blocked || hold) && !completed ? { borderStyle: "dashed" } : null,
        completed && { backgroundColor: ringColor },
      ]}
    >
      {completed && <Icon name="check" size={Math.max(10, size - 7)} color="#fff" />}
      {!completed && dropped && <Icon name="close" size={Math.max(10, size - 8)} color="#9aa0a6" />}
      {!completed && !dropped && hold && <Icon name="pause" size={Math.max(9, size - 9)} color="#c9a227" />}
      {!completed && !dropped && !hold && flagged && (
        <View style={styles.statusFlag} pointerEvents="none">
          <Icon name="flag" size={Math.max(8, size - 11)} color={palette.flag} />
        </View>
      )}
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
  onInspectProject?: (id: string) => void;
  onOpenProject?: (id: string) => void;
}): ContextMenuItem[] {
  return [
    ...(handlers.onInspectProject ? [{ id: "inspect", label: "Inspect", icon: "information-outline" as IconName, onPress: () => handlers.onInspectProject?.(project.id) }] : []),
    ...(handlers.onOpenProject ? [{ id: "open", label: "Show in Projects", icon: "folder-outline" as IconName, onPress: () => handlers.onOpenProject?.(project.id) }] : []),
    { id: "focus", label: "Focus Project", icon: "bullseye-arrow", onPress: () => handlers.onFocusProject(project.id) },
    { id: "new-action", label: "New Action in Project", icon: "plus", onPress: () => handlers.onNewActionInProject(project.id) },
    { id: "sep-delete", label: "", separator: true },
    { id: "delete", label: "Delete Project", icon: "trash-can-outline", destructive: true, onPress: () => handlers.onDeleteProject(project.id) },
  ];
}

function PerspectiveRail({ current, badges, items, showTitles, shortcuts, onSelect, onEdit, onUnfavorite, onOpenList, onOpenSettings, onDelete }: {
  current: ActivePerspective;
  badges: Record<string, { count: number; color?: string }>;
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
                {!!badges[item.id]?.count && (
                  <View style={[styles.badge, selected && styles.badgeSelected, badges[item.id]?.color ? { backgroundColor: badges[item.id]?.color } : null]}>
                    <Text style={styles.badgeText}>{badges[item.id]?.count}</Text>
                  </View>
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

function TaskRow({ task, project, projects, selected, editing, bulkCount, settings, depth = 0, hasChildren = false, collapsed = false, hideProject = false, blocked = false, registerRow, onSelect, onToggle, onInspect, onToggleSelected, onToggleFlag, onDelete, onCopy, onCopyLink, onCopyTaskPaper, onDuplicate, onMove, onIndent, onOutdent, onMoveRow, onToggleCollapse, onStartEdit, onCommitTitle, onConvertToProject }: {
  task: Task;
  project?: Project;
  projects: Project[];
  selected: boolean;
  editing: boolean;
  bulkCount: number;
  settings: AppSettings;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  hideProject?: boolean;
  blocked?: boolean;
  registerRow: (id: string, node: View | null) => void;
  onSelect: () => void;
  onToggle: () => void;
  onInspect: () => void;
  onToggleSelected: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onCopyTaskPaper: () => void;
  onDuplicate: () => void;
  onMove: (projectId: string | null) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMoveRow: (direction: -1 | 1) => void;
  onToggleCollapse: () => void;
  onStartEdit: () => void;
  onCommitTitle: (title: string) => void;
  onConvertToProject: () => void;
}) {
  const urgency = dueUrgency(task.due);
  const bulk = bulkCount > 1;
  const availableLabel = formatAvailableLabel(task.defer);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState(task.title);
  useEffect(() => setDraft(task.title), [task.id, task.title, editing]);
  const commit = () => onCommitTitle(draft.trim() || task.title);
  const menuItems: ContextMenuItem[] = [
    { id: "inspect", label: "Inspect", icon: "information-outline", onPress: onInspect },
    { id: "edit", label: "Edit", icon: "pencil-outline", shortcut: "↩", onPress: onStartEdit },
    { id: "toggle", label: `${task.completed ? "Mark Incomplete" : "Mark Complete"}${bulk ? ` (${bulkCount})` : ""}`, icon: task.completed ? "circle-outline" : "check-circle-outline", onPress: onToggleSelected },
    { id: "flag", label: `${task.flagged ? "Remove Flag" : "Flag"}${bulk ? ` (${bulkCount})` : ""}`, icon: task.flagged ? "flag-off-outline" : "flag-outline", shortcut: "⇧⌘L", onPress: onToggleFlag },
    { id: "sep-org", label: "", separator: true },
    { id: "duplicate", label: bulk ? `Duplicate (${bulkCount})` : "Duplicate", icon: "content-duplicate", shortcut: "⌘D", onPress: onDuplicate },
    { id: "indent", label: "Indent", icon: "format-indent-increase", shortcut: "⇥", onPress: onIndent },
    { id: "outdent", label: "Outdent", icon: "format-indent-decrease", shortcut: "⇧⇥", onPress: onOutdent },
    { id: "convert", label: "Convert to Project", icon: "folder-plus-outline", onPress: onConvertToProject },
    { id: "up", label: "Move Up", icon: "arrow-up", shortcut: "⌥⌘↑", onPress: () => onMoveRow(-1) },
    { id: "down", label: "Move Down", icon: "arrow-down", shortcut: "⌥⌘↓", onPress: () => onMoveRow(1) },
    { id: "inbox", label: "Move to Inbox", icon: "inbox-arrow-down-outline", onPress: () => onMove(null) },
    ...projects.slice(0, 8).map((item) => ({
      id: `move-${item.id}`,
      label: `Move to ${item.name}`,
      icon: "folder-outline" as IconName,
      onPress: () => onMove(item.id),
    })),
    { id: "sep-copy", label: "", separator: true },
    { id: "copy", label: bulk ? `Copy Titles (${bulkCount})` : "Copy Title", icon: "content-copy", onPress: onCopy },
    { id: "paper", label: "Copy as TaskPaper", icon: "code-tags", shortcut: "⇧⌘C", onPress: onCopyTaskPaper },
    { id: "link", label: bulk ? `Copy Links (${bulkCount})` : "Copy Link", icon: "link-variant", onPress: onCopyLink },
    { id: "delete", label: bulk ? `Delete (${bulkCount})` : "Delete", icon: "trash-can-outline", destructive: true, onPress: onDelete },
  ];

  return (
    <View
      ref={(node) => registerRow(task.id, node)}
      collapsable={false}
      {...({ dataSet: { taskId: task.id } } as object)}
    >
      <ContextMenuPressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        items={menuItems}
        onPress={onSelect}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        {...({ onDoubleClick: onStartEdit } as object)}
        style={({ pressed }) => [styles.taskRow, settings.rowDensity === "compact" && styles.taskRowCompact, selected && styles.taskRowSelected, hovered && !selected && styles.taskRowHover, pressed && styles.taskRowPressed, { paddingLeft: 8 + depth * 18 }]}
      >
        <Pressable
          accessibilityLabel={collapsed ? "Expand action group" : "Collapse action group"}
          onPress={hasChildren ? onToggleCollapse : undefined}
          style={styles.collapseButton}
          {...({ dataSet: { noMarquee: "true" } } as object)}
        >
          {hasChildren ? <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={16} color="#6e6c72" /> : <View style={{ width: 16 }} />}
        </Pressable>
        <StatusRing
          completed={task.completed}
          flagged={task.flagged}
          urgency={urgency}
          color={project?.color}
          blocked={blocked}
          hold={(task.status ?? "active") === "onHold"}
          dropped={(task.status ?? "active") === "dropped"}
          onPress={onToggle}
        />
        <View style={styles.taskBody}>
          <View style={styles.taskTitleLine}>
            {editing ? (
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onBlur={commit}
                onSubmitEditing={commit}
                style={[
                  styles.taskTitle,
                  styles.taskTitleInput,
                  settings.textSize === "small" && styles.taskTitleSmall,
                  settings.textSize === "large" && styles.taskTitleLarge,
                ]}
                accessibilityLabel="Action title"
                {...({ dataSet: { noMarquee: "true" } } as object)}
              />
            ) : (
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
            )}
            {!!task.note && !settings.showNotesInOutline && <Icon name="note-outline" size={13} color="#99969c" />}
          </View>
          {settings.showNotesInOutline && !!task.note?.trim() && (
            <Text numberOfLines={3} style={styles.outlineNote}>{task.note}</Text>
          )}
          <View style={styles.taskMeta}>
            {!!project && !hideProject && <Text numberOfLines={1} style={styles.taskMetaText}>{projectDisplayName(project)}</Text>}
            {task.tags.map((tag) => <View key={tag} style={styles.tagChip}><Text style={styles.tagChipText}>{tag}</Text></View>)}
            {(task.status ?? "active") === "onHold" && <Text style={styles.deferText}>On Hold</Text>}
            {(task.status ?? "active") === "dropped" && <Text style={styles.deferText}>Dropped</Text>}
            {!!availableLabel && !!task.due && <Text style={styles.deferText}>{availableLabel}</Text>}
          </View>
        </View>
        <View style={styles.taskTail}>
          {!!task.estimatedMinutes && <Text style={styles.estimateText}>{formatEstimate(task.estimatedMinutes)}</Text>}
          {!!task.due && <Text style={[styles.dueText, settings.colorDueItems && urgency === "overdue" && styles.dueOverdue, settings.colorDueItems && urgency === "dueSoon" && styles.dueSoon]}>{task.due}</Text>}
          {!task.due && !!availableLabel && <Text style={styles.deferText}>{availableLabel}</Text>}
          <Pressable accessibilityLabel={task.flagged ? "Remove flag" : "Flag"} onPress={onToggleFlag} hitSlop={8} {...({ dataSet: { noMarquee: "true" } } as object)}>
            <Icon name={task.flagged ? "flag" : hovered || selected ? "flag-outline" : "flag-outline"} size={16} color={task.flagged ? palette.flag : hovered || selected ? "#c5c1c8" : "transparent"} />
          </Pressable>
          <Pressable onPress={onInspect} hitSlop={8} style={styles.rowInfoButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Icon name="information-outline" size={17} color="#8e8a91" /></Pressable>
        </View>
      </ContextMenuPressable>
    </View>
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
      style={[styles.mobileNavItem, selected && styles.mobileNavItemSelected]}
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
  onNewTask,
  onReviewProject,
  onSkipReview,
  onOpenViewMenu,
  onFocusProject,
  onSelectProject,
  onInspectProject,
  onNewActionInProject,
  onDeleteProject,
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
  const selectedSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const children = useMemo(() => childMap(tasks), [tasks]);
  const outlineMenuItems: ContextMenuItem[] = [
    { id: "select-all", label: "Select All", icon: "select-all", shortcut: "⌘A", onPress: onSelectAll },
    { id: "clean-up", label: "Clean Up", icon: "broom", shortcut: "⌘K", onPress: onCleanUp },
    { id: "sep-outline", label: "", separator: true },
    { id: "expand", label: "Expand All", icon: "arrow-expand-vertical", shortcut: "⌥⌘9", onPress: onExpandAll },
    { id: "collapse", label: "Collapse All", icon: "arrow-collapse-vertical", shortcut: "⌥⌘0", onPress: onCollapseAll },
    { id: "view-options", label: "View Options", icon: "tune-variant", shortcut: "⇧⌘V", onPress: onOpenViewMenu },
    { id: "new-action", label: "New Action", icon: "plus", shortcut: "⌘N", onPress: onNewTask },
  ];
  const projectHandlers = { onFocusProject, onNewActionInProject, onDeleteProject, onInspectProject, onOpenProject: onSelectProject };
  const collapsed = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const toggleCollapsed = (id: string) => {
    setCollapsedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const groupIds = useMemo(() => {
    const ids: string[] = [];
    const tags = [...new Set(tasks.flatMap((task) => task.tags))].sort();
    const groupBy = customPerspective ? effectiveGroupBy(customPerspective) : null;
    if (groupBy === "project" || (!customPerspective && perspective === "projects")) {
      ids.push("inbox", ...projects.map((project) => project.id));
    }
    if (groupBy === "tag" || (!customPerspective && perspective === "tags")) ids.push(...tags.map((tag) => `tag:${tag}`));
    if (groupBy === "flagged") ids.push("flagged", "unflagged");
    if (groupBy === "due") ids.push(...[...new Set(tasks.map((task) => `due:${task.due ?? "No Due Date"}`))]);
    if (!customPerspective && perspective === "review") ids.push(...projects.map((project) => `review:${project.id}`));
    if (!customPerspective && perspective === "completed") ids.push(...completionGroupOrder.map((label) => `done:${label}`));
    return ids;
  }, [customPerspective, perspective, projects, tasks]);
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
            {projectIsStalled(project, tasks) ? "Stalled · no remaining actions" : (project.note || (project.folder ? project.folder : "Project"))}
          </Text>
        </View>
        {projectIsStalled(project, tasks) && <Text style={styles.sidebarStatusTag}>Stalled</Text>}
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
        hideProject={!customPerspective && (perspective === "projects" || perspective === "review")}
        blocked={isBlockedSequential(task, tasks, projects)}
        registerRow={registerRow}
        onSelect={() => {
          if (suppressClickRef.current) return;
          if (editingTaskId === task.id) return;
          onSelectTask(task.id, modifiersRef.current);
        }}
        onToggle={() => onToggleTask(task.id)}
        onInspect={() => onInspectTask(task.id)}
        onToggleSelected={() => onToggleSelectedTasks(task.id)}
        onToggleFlag={() => onToggleFlagTask(task.id)}
        onDelete={() => onDeleteTask(task.id)}
        onCopy={() => onCopyTasks(task.id)}
        onCopyLink={() => onCopyLink(task.id)}
        onCopyTaskPaper={() => onCopyTaskPaper(task.id)}
        onDuplicate={() => onDuplicateTasks(task.id)}
        onMove={(projectId) => onMoveTasks(task.id, projectId)}
        onIndent={() => onIndent(task.id)}
        onOutdent={() => onOutdent(task.id)}
        onMoveRow={(direction) => onMoveRow(task.id, direction)}
        onToggleCollapse={() => toggleCollapsed(task.id)}
        onStartEdit={() => onStartEdit(task.id)}
        onCommitTitle={(title) => onCommitTitle(task.id, title)}
        onConvertToProject={() => onConvertToProject(task.id)}
      />
    );
  };

  const tags = [...new Set(tasks.flatMap((task) => task.tags))].sort();
  const groupBy = customPerspective ? effectiveGroupBy(customPerspective) : null;
  const visibleProjects = projects.filter((project) => {
    if (projectFilter) return project.id === projectFilter;
    if (folderFilter) return projectInFolder(project, folderFilter);
    return true;
  });
  const reviewProjects = projects.filter((project) => projectDueForReview(project) || projectIsStalled(project, tasks));
  const remainingCount = tasks.filter((task) => !task.completed).length;
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
        {groupBy === "project" && [{ project: null as Project | null, groupTasks: tasks.filter((task) => task.projectId === null) }, ...projects.map((project) => ({ project, groupTasks: tasks.filter((task) => task.projectId === project.id) }))].map(({ project, groupTasks }) => {
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
        {groupBy === "tag" && tags.map((tag) => {
          const tagged = tasks.filter((task) => task.tags.includes(tag));
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
          const groupTasks = tasks.filter((task) => task.flagged === flagged);
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
        {groupBy === "due" && [...new Set(tasks.map((task) => task.due ?? "No Due Date"))].map((due) => {
          const groupTasks = tasks.filter((task) => (task.due ?? "No Due Date") === due);
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
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
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
        {!customPerspective && perspective === "tags" && !tagFilter && tags.map((tag) => {
          const tagged = tasks.filter((task) => task.tags.includes(tag));
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
          const remaining = tasks.filter((task) => task.projectId === project.id && !task.completed);
          const reviewId = `review:${project.id}`;
          return (
            <View key={project.id} style={styles.projectGroup}>
              <ContextMenuPressable items={projectContextItems(project, projectHandlers)} onPress={() => onInspectProject(project.id)} style={[styles.reviewRow, inspectedProjectId === project.id && styles.projectHeadingSelected]}>
                <Pressable accessibilityLabel={collapsed.has(reviewId) ? "Expand project" : "Collapse project"} onPress={() => toggleCollapsed(reviewId)} hitSlop={8} style={styles.collapseButton} {...({ dataSet: { noMarquee: "true" } } as object)}>
                  <Icon name={collapsed.has(reviewId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                </Pressable>
                <View style={[styles.projectHeadingRing, { borderColor: project.color }]} />
                <View style={styles.reviewCopy}><Text style={styles.projectHeadingTitle}>{projectDisplayName(project)}</Text><Text style={styles.projectHeadingNote}>{projectIsStalled(project, tasks) ? "Stalled · no remaining actions" : reviewStatusText(project)}{remaining.length ? ` · ${remaining.length} remaining` : ""}</Text></View>
                <Pressable onPress={() => onSkipReview(project.id)} style={styles.skipButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Text style={styles.skipButtonText}>Skip</Text></Pressable>
                <Pressable onPress={() => onReviewProject(project.id)} style={styles.reviewButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Icon name="check" size={15} color="#fff" /><Text style={styles.reviewButtonText}>Reviewed</Text></Pressable>
              </ContextMenuPressable>
              {!collapsed.has(reviewId) && remaining.map(taskRow)}
            </View>
          );
        })}
        {!customPerspective && perspective === "completed" && completionGroupOrder.map((label) => {
          const groupTasks = tasks.filter((task) => completionGroupLabel(task.completedAt) === label);
          if (!groupTasks.length) return null;
          const groupId = `done:${label}`;
          return (
            <View key={label} style={styles.projectGroup}>
              <Pressable onPress={() => toggleCollapsed(groupId)} style={styles.tagHeading}>
                <Icon name={collapsed.has(groupId) ? "chevron-right" : "chevron-down"} size={18} color="#6e6c72" />
                <Icon name="check-circle-outline" size={20} color={palette.purple} />
                <View><Text style={styles.projectHeadingTitle}>{label}</Text><Text style={styles.projectHeadingNote}>{groupTasks.length} completed</Text></View>
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
            <Text style={styles.migrateHint}>Or create a project with ⇧⌘N and start empty.</Text>
          </View>
        ) : !customPerspective && perspective === "review" && !reviewProjects.length ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}><Icon name="check-decagram-outline" size={26} color="#aaa7ad" /></View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyText}>No projects are waiting for review.</Text>
          </View>
        ) : !tasks.length && (perspective !== "projects" || !visibleProjects.length) && perspective !== "review" ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyCheck}><Icon name="check" size={26} color="#aaa7ad" /></View>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyText}>There are no remaining actions in this view.</Text>
          </View>
        ) : null}
      </ScrollView>
      {overlay}
      </View>
      <Pressable onPress={onNewTask} style={styles.newActionBar}><Icon name="plus" size={20} color={palette.purpleDark} /><Text style={styles.newActionText}>New Action</Text></Pressable>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function DatePresets({ value, onChange }: {
  value?: string;
  onChange: (value?: string) => void;
}) {
  const presets: Array<{ id: string; label: string; next?: string }> = [
    { id: "none", label: "None" },
    { id: "today", label: "Today", next: duePresetLabel("today") },
    { id: "tomorrow", label: "Tomorrow", next: duePresetLabel("tomorrow") },
    { id: "weekend", label: "Weekend", next: duePresetLabel("weekend") },
    { id: "next", label: "Next Week", next: duePresetLabel("nextWeek") },
  ];
  const selected = !value ? "none" : presets.find((item) => item.next && item.next === value)?.id;
  return (
    <View style={styles.datePresets}>
      {presets.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onChange(item.next)}
          style={[styles.datePreset, selected === item.id && styles.datePresetSelected]}
        >
          <Text style={[styles.datePresetText, selected === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
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
  const [tagDraft, setTagDraft] = useState("");
  const [tab, setTab] = useState<"action" | "notes" | "attachments">("action");

  useEffect(() => setTagDraft(""), [task.id]);
  useEffect(() => setTab("action"), [task.id]);

  const commitTags = () => {
    const added = tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (!added.length) return;
    onChange({ tags: [...new Set([...task.tags, ...added])] });
    setTagDraft("");
  };

  const tabs: Array<{ id: "action" | "notes" | "attachments"; label: string }> = [
    { id: "action", label: "Action" },
    { id: "notes", label: "Notes" },
    { id: "attachments", label: "Attachments" },
  ];

  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabBar}>
          {tabs.map((item) => (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={tab === item.id ? styles.inspectorTabSelected : styles.inspectorTab}>
              <Text style={[styles.inspectorTabText, tab === item.id && styles.inspectorTabTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {tab === "notes" && (
        <View style={styles.inspectorNotePane}>
          <TextInput
            value={task.note ?? ""}
            onChangeText={(note) => onChange({ note })}
            placeholder="Write a note…"
            multiline
            textAlignVertical="top"
            style={styles.inspectorNoteEditor}
            accessibilityLabel="Action note"
          />
        </View>
      )}
      {tab === "attachments" && (
        <View style={styles.attachmentEmpty}>
          <View style={styles.attachmentIcon}><Icon name="paperclip" size={26} color="#aaa7ad" /></View>
          <Text style={styles.attachmentTitle}>No Attachments</Text>
          <Text style={styles.attachmentText}>OmniFocus stores files on the Notes tab. OmniClone keeps notes with the action; file attachments are not imported from CSV.</Text>
        </View>
      )}
      {tab === "action" && (
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <StatusRing
            completed={task.completed}
            flagged={task.flagged}
            urgency={dueUrgency(task.due)}
            blocked={false}
            hold={(task.status ?? "active") === "onHold"}
            dropped={(task.status ?? "active") === "dropped"}
            onPress={onToggle}
          />
          <TextInput value={task.title} onChangeText={(title) => onChange({ title })} multiline style={styles.inspectorTitleInput} accessibilityLabel="Action title" />
          <Pressable onPress={() => onChange({ flagged: !task.flagged })} hitSlop={8}><Icon name={task.flagged ? "flag" : "flag-outline"} size={20} color={task.flagged ? palette.flag : "#aaa7ad"} /></Pressable>
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>STATUS</Text>
          <View style={styles.datePresets}>
            {([{ id: "active", label: "Active" }, { id: "onHold", label: "On Hold" }, { id: "dropped", label: "Dropped" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ status: item.id, completed: item.id === "dropped" ? task.completed : task.completed })} style={[styles.datePreset, (task.status ?? "active") === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (task.status ?? "active") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>ORGANIZATION</Text>
          <FieldLabel>Project</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            <Pressable onPress={() => onChange({ projectId: null })} style={[styles.choiceChip, task.projectId === null && styles.choiceChipSelected]}><Text style={[styles.choiceText, task.projectId === null && styles.choiceTextSelected]}>Inbox</Text></Pressable>
            {projects.map((project) => <Pressable key={project.id} onPress={() => onChange({ projectId: project.id })} style={[styles.choiceChip, task.projectId === project.id && styles.choiceChipSelected]}><Text numberOfLines={1} style={[styles.choiceText, task.projectId === project.id && styles.choiceTextSelected]}>{projectDisplayName(project)}</Text></Pressable>)}
          </ScrollView>
          <FieldLabel>Tags</FieldLabel>
          <View style={styles.tagTokenRow}>
            {task.tags.map((tag) => (
              <Pressable key={tag} onPress={() => onChange({ tags: task.tags.filter((item) => item !== tag) })} style={styles.tagToken}>
                <Text style={styles.tagTokenText}>{tag}</Text>
                <Icon name="close" size={12} color="#8b888f" />
              </Pressable>
            ))}
          </View>
          <TextInput value={tagDraft} onChangeText={setTagDraft} onBlur={commitTags} onSubmitEditing={commitTags} placeholder="Add a tag" style={styles.fieldInput} />
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>DATES</Text>
          <FieldLabel>Defer Until</FieldLabel>
          <DatePresets value={task.defer} onChange={(defer) => onChange({ defer })} />
          <TextInput value={task.defer ?? ""} onChangeText={(defer) => onChange({ defer })} placeholder="None" style={styles.fieldInput} />
          <FieldLabel>Due</FieldLabel>
          <DatePresets value={task.due} onChange={(due) => onChange({ due })} />
          <TextInput value={task.due ?? ""} onChangeText={(due) => onChange({ due })} placeholder="None" style={styles.fieldInput} />
          <FieldLabel>Repeat</FieldLabel>
          <View style={styles.datePresets}>
            {(["none", "daily", "weekly", "monthly"] as const).map((repeat) => (
              <Pressable key={repeat} onPress={() => onChange({ repeat })} style={[styles.datePreset, (task.repeat ?? "none") === repeat && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (task.repeat ?? "none") === repeat && styles.datePresetTextSelected]}>{repeat === "none" ? "None" : repeat === "daily" ? "Daily" : repeat === "weekly" ? "Weekly" : "Monthly"}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel>Estimated Duration</FieldLabel>
          <View style={styles.datePresets}>
            {[{ label: "None", minutes: undefined }, { label: "5m", minutes: 5 }, { label: "15m", minutes: 15 }, { label: "30m", minutes: 30 }, { label: "1h", minutes: 60 }].map((item) => (
              <Pressable key={item.label} onPress={() => onChange({ estimatedMinutes: item.minutes })} style={[styles.datePreset, (task.estimatedMinutes ?? undefined) === item.minutes && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (task.estimatedMinutes ?? undefined) === item.minutes && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {!!task.note && (
          <Pressable onPress={() => setTab("notes")} style={styles.inspectorSection}>
            <Text style={styles.inspectorSectionTitle}>NOTE</Text>
            <Text numberOfLines={3} style={styles.notePreview}>{task.note}</Text>
          </Pressable>
        )}

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>INFO</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Added</Text><Text style={styles.infoValue}>{inspectorTimestamp(task.createdAt) ?? "—"}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Completed</Text><Text style={styles.infoValue}>{task.completed ? inspectorTimestamp(task.completedAt) ?? "Now" : "—"}</Text></View>
        </View>

        <View style={styles.inspectorSection}>
          <View style={styles.savedRow}><Icon name="cloud-check-outline" size={16} color="#6f9d70" /><Text style={styles.savedText}>Saved on this device</Text></View>
          <Pressable onPress={onDelete} style={styles.deleteButton}><Icon name="trash-can-outline" size={17} color={palette.danger} /><Text style={styles.deleteButtonText}>Delete Action</Text></Pressable>
        </View>
      </ScrollView>
      )}
    </View>
  );
}

function ProjectInspector({ project, remainingCount, stalled, onChange, onReview, onSkip, onDelete, onFocus, onClose, modal = false }: {
  project: Project;
  remainingCount: number;
  stalled?: boolean;
  onChange: (patch: Partial<Project>) => void;
  onReview: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const intervals = [
    { label: "Daily", days: 1 },
    { label: "Weekly", days: 7 },
    { label: "Two Weeks", days: 14 },
    { label: "Monthly", days: 30 },
  ];
  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabTextSelected}>Project</Text></View>
        </View>
      </View>
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <View style={[styles.projectHeadingRing, { borderColor: project.color, marginTop: 4 }]} />
          <TextInput value={project.name} onChangeText={(name) => onChange({ name })} multiline style={styles.inspectorTitleInput} accessibilityLabel="Project name" />
        </View>
        {!!project.folder && <Text style={[styles.projectHeadingNote, { paddingHorizontal: 13 }]}>{project.folder}</Text>}
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>COLOR</Text>
          <View style={styles.colorChoiceRow}>
            {projectColors.map((color) => (
              <Pressable key={color} onPress={() => onChange({ color })} style={[styles.inspectorColor, { backgroundColor: color }, project.color === color && styles.inspectorColorSelected]} />
            ))}
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>STATUS</Text>
          <FieldLabel>Type</FieldLabel>
          <View style={styles.datePresets}>
            {([{ id: "parallel", label: "Parallel" }, { id: "sequential", label: "Sequential" }, { id: "singleActions", label: "Single Actions" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ type: item.id })} style={[styles.datePreset, (project.type ?? "parallel") === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (project.type ?? "parallel") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel>Status</FieldLabel>
          <View style={styles.datePresets}>
            {([{ id: "active", label: "Active" }, { id: "onHold", label: "On Hold" }, { id: "dropped", label: "Dropped" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ status: item.id })} style={[styles.datePreset, (project.status ?? "active") === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (project.status ?? "active") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>NOTE</Text>
          <TextInput value={project.note} onChangeText={(note) => onChange({ note })} placeholder="Add a project note…" multiline textAlignVertical="top" style={[styles.fieldInput, styles.noteInput]} />
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>REVIEW</Text>
          <FieldLabel>Repeat</FieldLabel>
          <View style={styles.datePresets}>
            {intervals.map((item) => (
              <Pressable key={item.days} onPress={() => onChange({ reviewIntervalDays: item.days })} style={[styles.datePreset, project.reviewIntervalDays === item.days && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, project.reviewIntervalDays === item.days && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.projectHeadingNote}>{reviewStatusText(project)}</Text>
          <Text style={[styles.projectHeadingNote, { marginTop: 4 }]}>{stalled ? "Stalled · " : ""}{remainingCount} remaining action{remainingCount === 1 ? "" : "s"}</Text>
          <View style={styles.reviewActionRow}>
            <Pressable onPress={onSkip} style={styles.skipButton}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>
            <Pressable onPress={onReview} style={styles.reviewButton}>
              <Icon name="check" size={15} color="#fff" />
              <Text style={styles.reviewButtonText}>Mark Reviewed</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Pressable onPress={onFocus} style={styles.multiSelectButton}>
            <Icon name="bullseye-arrow" size={17} color={palette.purpleDark} />
            <Text style={styles.multiSelectButtonText}>Focus Project</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.deleteButton}>
            <Icon name="trash-can-outline" size={17} color={palette.danger} />
            <Text style={styles.deleteButtonText}>Delete Project</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function MultiSelectInspector({
  count,
  allCompleted,
  allFlagged,
  onToggle,
  onToggleFlag,
  onDelete,
}: {
  count: number;
  allCompleted: boolean;
  allFlagged: boolean;
  onToggle: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.inspector}>
      <View style={styles.inspectorTabs}>
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabText}>Selection</Text></View>
        </View>
      </View>
      <View style={styles.multiSelectBody}>
        <Text style={styles.multiSelectCount}>{count}</Text>
        <Text style={styles.multiSelectLabel}>actions selected</Text>
        <Text style={styles.multiSelectHint}>Shift-click, ⌘-click, drag, or ⌘A to change the selection.</Text>
        <Pressable onPress={onToggle} style={styles.multiSelectButton}>
          <Icon name={allCompleted ? "circle-outline" : "check-circle-outline"} size={17} color={palette.purpleDark} />
          <Text style={styles.multiSelectButtonText}>{allCompleted ? "Mark Incomplete" : "Mark Complete"}</Text>
        </Pressable>
        <Pressable onPress={onToggleFlag} style={styles.multiSelectButton}>
          <Icon name={allFlagged ? "flag-off-outline" : "flag-outline"} size={17} color={allFlagged ? palette.muted : palette.flag} />
          <Text style={styles.multiSelectButtonText}>{allFlagged ? "Remove Flags" : "Flag"}</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Icon name="trash-can-outline" size={17} color={palette.danger} />
          <Text style={styles.deleteButtonText}>Delete {count} Actions</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TagInspector({ tag, count, onRename, onClose, modal = false }: {
  tag: string;
  count: number;
  onRename: (name: string) => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const [name, setName] = useState(tag);
  useEffect(() => setName(tag), [tag]);
  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabTextSelected}>Tag</Text></View>
        </View>
      </View>
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <Icon name="pound" size={22} color={palette.purpleDark} />
          <TextInput value={name} onChangeText={setName} onBlur={() => { if (name.trim()) onRename(name.trim()); }} onSubmitEditing={() => { if (name.trim()) onRename(name.trim()); }} style={styles.inspectorTitleInput} accessibilityLabel="Tag name" />
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>INFO</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Remaining</Text><Text style={styles.infoValue}>{count}</Text></View>
          <Text style={[styles.projectHeadingNote, { marginTop: 8 }]}>Renaming updates every action that uses this tag.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function EmptyInspector({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.inspector}>
      <View style={styles.inspectorTabs}>
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabText}>Inspector</Text></View>
        </View>
      </View>
      <View style={styles.emptyInspector}>
        <View style={styles.emptyCheck}><Icon name="information-outline" size={26} color="#aaa7ad" /></View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{detail}</Text>
      </View>
    </View>
  );
}

function QuickEntryModal({ visible, kind, projects, defaultProjectId, onClose, onSave }: {
  visible: boolean;
  kind: "task" | "project" | "folder";
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onSave: (payload: { title: string; projectId: string | null; flagged?: boolean; due?: string; tags?: string[] }) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [flagged, setFlagged] = useState(false);
  const [due, setDue] = useState<string | undefined>();
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    if (visible) {
      setTitle("");
      setProjectId(defaultProjectId);
      setFlagged(false);
      setDue(undefined);
      setTagDraft("");
    }
  }, [visible, defaultProjectId]);

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      projectId,
      flagged,
      due,
      tags: tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    setTitle("");
    setFlagged(false);
    setDue(undefined);
    setTagDraft("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.quickEntryCard}>
          <View style={styles.quickEntryHeader}><Text style={styles.quickEntryHeaderText}>{kind === "task" ? "Quick Entry" : kind === "folder" ? "New Folder" : "New Project"}</Text><Pressable onPress={onClose}><Icon name="close" size={20} color="#77747b" /></Pressable></View>
          <View style={styles.quickInputRow}>
            {kind === "folder" ? <Icon name="folder-plus-outline" size={22} color={palette.purpleDark} /> : <View style={styles.quickRing} />}
            <TextInput autoFocus value={title} onChangeText={setTitle} onSubmitEditing={save} returnKeyType="done" placeholder={kind === "task" ? "What do you want to do?" : kind === "folder" ? "Folder name" : "Project name"} style={styles.quickInput} />
            {kind === "task" && (
              <Pressable accessibilityLabel={flagged ? "Remove flag" : "Flag"} onPress={() => setFlagged((value) => !value)} hitSlop={8}>
                <Icon name={flagged ? "flag" : "flag-outline"} size={21} color={flagged ? palette.flag : "#aaa7ad"} />
              </Pressable>
            )}
          </View>
          {kind === "task" && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickProjectRow}>
                <Pressable onPress={() => setProjectId(null)} style={[styles.quickProjectChip, projectId === null && styles.quickProjectChipSelected]}><Icon name="inbox-arrow-down-outline" size={14} color={projectId === null ? palette.purpleDark : "#6c6970"} /><Text style={styles.quickProjectText}>Inbox</Text></Pressable>
                {projects.map((project) => <Pressable key={project.id} onPress={() => setProjectId(project.id)} style={[styles.quickProjectChip, projectId === project.id && styles.quickProjectChipSelected]}><View style={[styles.miniDot, { backgroundColor: project.color }]} /><Text numberOfLines={1} style={styles.quickProjectText}>{project.name}</Text></Pressable>)}
              </ScrollView>
              <View style={styles.quickMeta}>
                <FieldLabel>Due</FieldLabel>
                <DatePresets value={due} onChange={setDue} />
                <FieldLabel>Tags</FieldLabel>
                <TextInput value={tagDraft} onChangeText={setTagDraft} placeholder="errands, phone" style={styles.fieldInput} />
              </View>
            </>
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
            {!compact && <View style={styles.settingsTrafficLights}><TrafficLights onClose={onClose} /></View>}
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
                    <SettingsRow title="Clean up immediately" detail="Hide completed and filed inbox items as soon as they change. Turn off to keep them until ⌘K.">
                      <Switch value={settings.cleanUpImmediately} onValueChange={(cleanUpImmediately) => onChange({ cleanUpImmediately })} trackColor={{ true: palette.purple }} />
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
                    <SettingsRow title="Show notes in outline" detail="Display action notes under titles, matching OmniFocus View Options.">
                      <Switch value={settings.showNotesInOutline} onValueChange={(showNotesInOutline) => onChange({ showNotesInOutline })} trackColor={{ true: palette.purple }} />
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.chrome },
  appShell: { flex: 1, backgroundColor: palette.chrome },
  toolbar: { height: 58, flexDirection: "row", alignItems: "center", backgroundColor: palette.chrome, paddingHorizontal: 12, zIndex: 20 },
  trafficLights: { width: 62, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  trafficLight: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,.22)", overflow: "hidden" },
  trafficLightShine: { position: "absolute", top: 1, left: 2, width: 6, height: 3.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,.5)" },
  toolbarLeading: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  toolbarCenter: { flexDirection: "row", alignItems: "center", gap: 9 },
  toolbarTrailing: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 6 },
  toolbarButton: { minWidth: 52, height: 50, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", borderRadius: 12, gap: 1 },
  toolbarButtonActive: { backgroundColor: "rgba(0,0,0,.07)" },
  toolbarLabel: { fontSize: 9.5, color: "#454248" },
  pressed: { opacity: .65 },
  disabled: { opacity: .35 },
  viewMenu: { position: "absolute", top: 56, left: -68, width: 250, padding: 14, backgroundColor: "#fbfafc", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "#bcb9bf", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: .2, shadowRadius: 24, elevation: 12, zIndex: 100 },
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
  searchBar: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: palette.chrome },
  searchInput: { flex: 1, height: 30, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c5c2c8", borderRadius: 15, backgroundColor: "#fff", fontSize: 13 },
  searchDone: { color: palette.purpleDark, fontSize: 12, fontWeight: "600" },
  searchCount: { fontSize: 11, fontWeight: "700", color: "#8b888f", minWidth: 18, textAlign: "right" },
  workspace: { flex: 1, minHeight: 0, flexDirection: "row" },
  workspaceDesktop: { paddingHorizontal: 8, paddingBottom: 8, paddingTop: 2, backgroundColor: palette.chrome },
  desktopPane: { borderRadius: 12, overflow: "hidden" },
  railPane: { width: 82, marginRight: 8 },
  outlinePane: { flex: 1, minWidth: 320 },
  perspectiveRail: { flex: 1, width: 82, paddingHorizontal: 7, paddingVertical: 8, gap: 2, backgroundColor: palette.rail },
  perspectiveRailList: { flex: 1 },
  perspectiveRailScroll: { gap: 2, paddingBottom: 4 },
  perspectiveItem: { height: 59, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 12 },
  perspectiveItemSelected: { backgroundColor: "#e9e0f0" },
  perspectiveLabel: { maxWidth: 68, fontSize: 9.5, color: "#58555c" },
  perspectiveLabelSelected: { color: palette.purpleDark, fontWeight: "600" },
  perspectiveMore: { marginTop: "auto" },
  customRailDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 9, marginVertical: 5, backgroundColor: palette.line },
  railSettingsButton: { height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  badge: { position: "absolute", right: -11, top: -4, minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#8d8a91" },
  badgeSelected: { backgroundColor: palette.purpleDark },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  sidebar: { flex: 1, backgroundColor: palette.sidebar },
  sidebarHeader: { height: 69, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sidebarTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -.25 },
  sidebarScroll: { paddingHorizontal: 8, paddingBottom: 50 },
  sidebarRow: { minHeight: 35, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10 },
  sidebarRowSelected: { backgroundColor: "#d9d8dc" },
  sidebarRowHover: { backgroundColor: "rgba(0,0,0,.05)" },
  sidebarRowText: { flex: 1, fontSize: 12.5, fontWeight: "500", color: "#3a373d" },
  sidebarCount: { fontSize: 10, color: palette.muted },
  sidebarHoldText: { color: "#8a6a1a" },
  sidebarStatusTag: { fontSize: 9, fontWeight: "700", color: "#8a9098" },
  sidebarSectionLabel: { marginTop: 16, marginBottom: 5, marginLeft: 8, fontSize: 8.5, letterSpacing: .7, fontWeight: "700", color: "#817e85" },
  projectDot: { width: 14, height: 14, borderWidth: 2, borderRadius: 7, backgroundColor: palette.sidebar },
  projectDotHold: { backgroundColor: "#c9a227" },
  projectDotDropped: { backgroundColor: "#9aa0a6" },
  projectDotStalled: { backgroundColor: "#d94b4b" },
  sidebarFooter: { position: "absolute", left: 0, right: 0, bottom: 0, height: 39, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: palette.sidebar },
  sidebarFooterText: { fontSize: 11, color: "#625f66" },
  sidebarEmpty: { paddingHorizontal: 24, paddingTop: 30, alignItems: "center", gap: 8 },
  sidebarEmptyText: { fontSize: 11, lineHeight: 16, textAlign: "center", color: "#8b888f" },
  forecastPast: { height: 35, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10 },
  forecastPastCount: { fontSize: 10, color: palette.danger, fontWeight: "700" },
  forecastDays: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 2 },
  forecastDay: { flex: 1, minWidth: 0, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 12, gap: 1 },
  forecastDaySelected: { backgroundColor: palette.purple },
  forecastDayText: { fontSize: 9, lineHeight: 14, textAlign: "center", color: palette.muted, fontWeight: "600" },
  forecastDayWeek: { fontSize: 8, letterSpacing: 0.3, fontWeight: "700", color: palette.muted },
  forecastDayNum: { fontSize: 12, fontWeight: "700", color: "#3a373d" },
  forecastDayCount: { fontSize: 8, color: palette.purpleDark, fontWeight: "700" },
  forecastDayCountSelected: { color: "#fff" },
  forecastDayTextSelected: { color: "#fff" },
  forecastDayNumWrap: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  forecastDayToday: { borderWidth: 1.5, borderColor: palette.purple },
  forecastDayNumToday: { color: palette.purpleDark },
  forecastUpcoming: { height: 35, marginTop: 8, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10 },
  outline: { flex: 1, minWidth: 320, backgroundColor: palette.canvas },
  outlineHeader: { height: 69, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  outlineHeaderCopy: { flex: 1 },
  outlineTitle: { fontSize: 24, lineHeight: 29, fontWeight: "700", letterSpacing: -.55, color: palette.text },
  outlineSubtitle: { fontSize: 10, color: "#858189" },
  iconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  outlineBody: { flex: 1, position: "relative", overflow: "hidden" },
  outlineScroll: { flex: 1 },
  outlineContent: { paddingBottom: 48, paddingTop: 4 },
  projectGroup: { borderBottomWidth: 7, borderBottomColor: "#f5f4f6" },
  projectHeading: { minHeight: 63, marginHorizontal: 8, marginTop: 4, paddingHorizontal: 8, paddingVertical: 10, flexDirection: "row", alignItems: "flex-start", gap: 7, borderRadius: 12 },
  projectHeadingSelected: { backgroundColor: palette.purpleSelection },
  projectHeadingMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 7 },
  projectHeadingRing: { width: 18, height: 18, marginTop: 1, borderWidth: 3, borderRadius: 9, backgroundColor: "#fff" },
  projectHeadingCopy: { flex: 1 },
  projectHeadingTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: "700", color: "#2a272c" },
  projectHeadingNote: { fontSize: 10, lineHeight: 15, color: "#86828a" },
  projectHeadingCount: { fontSize: 10, color: "#89868c" },
  tagHeading: { minHeight: 54, marginHorizontal: 8, marginTop: 4, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 12 },
  taskRow: { minHeight: 52, marginHorizontal: 8, marginVertical: 1, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 12 },
  taskRowCompact: { minHeight: 42, paddingVertical: 4 },
  taskRowSelected: { backgroundColor: palette.purpleSelection },
  taskRowHover: { backgroundColor: "#f4f2f6" },
  taskRowPressed: { opacity: .72 },
  statusRing: { marginTop: 1, borderWidth: 1.8, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", overflow: "visible" },
  statusFlag: { position: "absolute", right: -6, bottom: -7 },
  collapseButton: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  taskBody: { flex: 1, minWidth: 0 },
  taskTitleLine: { minHeight: 19, flexDirection: "row", alignItems: "center", gap: 4 },
  taskTitle: { flexShrink: 1, flex: 1, fontSize: 13, lineHeight: 18, color: "#29262b" },
  taskTitleInput: { minHeight: 20, padding: 0, margin: 0 },
  taskTitleSmall: { fontSize: 12, lineHeight: 17 },
  taskTitleLarge: { fontSize: 15, lineHeight: 20 },
  taskTitleResolved: { color: "#969299" },
  taskTitleCompleted: { textDecorationLine: "line-through" },
  outlineNote: { marginTop: 2, marginBottom: 2, fontSize: 11, lineHeight: 15, color: "#86828a" },
  taskMeta: { minHeight: 17, flexDirection: "row", alignItems: "center", gap: 5, overflow: "hidden" },
  taskMetaText: { maxWidth: 165, fontSize: 9.5, color: "#8b878f" },
  tagChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(110,108,115,.11)" },
  tagChipText: { fontSize: 8.5, color: "#77737b" },
  taskTail: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 5 },
  dueText: { fontSize: 9.5, color: "#77737b" },
  dueToday: { color: palette.danger, fontWeight: "600" },
  dueOverdue: { color: palette.overdue, fontWeight: "700" },
  dueSoon: { color: palette.dueSoon, fontWeight: "600" },
  deferText: { fontSize: 9.5, color: "#9a969e", fontStyle: "italic" },
  rowInfoButton: { marginLeft: 2 },
  newActionBar: { position: "absolute", left: 0, right: 0, bottom: 0, height: 40, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: "rgba(255,255,255,.97)" },
  newActionText: { fontSize: 11, color: "#625f66" },
  emptyState: { paddingVertical: 85, alignItems: "center" },
  emptyCheck: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: "#b7b3ba", alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 13, marginBottom: 4, fontSize: 17, fontWeight: "700", color: "#67636a" },
  emptyText: { fontSize: 11, color: "#8f8b93" },
  inlineNewAction: { minHeight: 34, paddingHorizontal: 18, paddingLeft: 48, flexDirection: "row", alignItems: "center", gap: 6 },
  inlineNewActionText: { fontSize: 12, fontWeight: "600", color: palette.purpleDark },
  estimateText: { fontSize: 10, color: "#8a9098", fontVariant: ["tabular-nums"] },
  paneHandle: { width: 8, backgroundColor: "transparent" },
  migrateState: { paddingVertical: 72, paddingHorizontal: 28, alignItems: "center" },
  migrateIcon: { width: 56, height: 56, marginBottom: 14, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: palette.purpleSoft },
  migrateTitle: { marginBottom: 8, fontSize: 18, fontWeight: "700", textAlign: "center", color: palette.text },
  migrateText: { maxWidth: 420, marginBottom: 16, fontSize: 11, lineHeight: 16, textAlign: "center", color: palette.muted },
  migrateButton: { minHeight: 34, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, backgroundColor: palette.purple },
  migrateButtonText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  migrateHint: { marginTop: 12, fontSize: 10, color: "#8f8b93" },
  importLead: { fontSize: 11, lineHeight: 16, color: "#5f5b63" },
  reviewRow: { minHeight: 66, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  reviewCopy: { flex: 1 },
  reviewButton: { height: 29, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.purple, borderRadius: 10 },
  reviewButtonText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  skipButton: { height: 29, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc9cf", backgroundColor: "#fff" },
  skipButtonText: { fontSize: 10, fontWeight: "600", color: "#5f5c63" },
  reviewActionRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  emptyInspector: { flex: 1, paddingHorizontal: 24, paddingTop: 64, alignItems: "center" },
  tagTokenRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  tagToken: { minHeight: 24, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, backgroundColor: palette.purpleSoft },
  tagTokenText: { fontSize: 10, fontWeight: "600", color: palette.purpleDark },
  inspector: { flex: 1, backgroundColor: palette.inspector },
  inspectorModal: { flex: 1, width: "100%", borderLeftWidth: 0 },
  inspectorTabs: { height: 43, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  inspectorTabBar: { flex: 1, height: 28, padding: 2, flexDirection: "row", alignItems: "center", borderRadius: 9, backgroundColor: "#e4e2e6" },
  inspectorTabSelected: { flex: 1, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  inspectorTab: { flex: 1, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  inspectorTabText: { fontSize: 9.5, color: "#5f5c63" },
  inspectorTabTextSelected: { color: palette.text, fontWeight: "700" },
  inspectorNotePane: { flex: 1, padding: 12 },
  inspectorNoteEditor: { flex: 1, minHeight: 220, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 12, backgroundColor: "#fff", fontSize: 13, lineHeight: 18, color: palette.text },
  notePreview: { fontSize: 11, lineHeight: 16, color: "#4e4a51" },
  attachmentEmpty: { flex: 1, paddingHorizontal: 28, paddingTop: 48, alignItems: "center" },
  attachmentIcon: { width: 52, height: 52, marginBottom: 12, alignItems: "center", justifyContent: "center", borderRadius: 26, borderWidth: 1.5, borderColor: "#cfcdd2" },
  attachmentTitle: { marginBottom: 6, fontSize: 15, fontWeight: "700", color: "#67636a" },
  attachmentText: { fontSize: 11, lineHeight: 16, textAlign: "center", color: "#8f8b93" },
  datePresets: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 6 },
  datePreset: { minHeight: 24, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d0ced3", backgroundColor: "#fff" },
  datePresetSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  datePresetText: { fontSize: 9, color: "#5f5c63" },
  datePresetTextSelected: { color: palette.purpleDark, fontWeight: "700" },
  focusBar: { minHeight: 32, marginHorizontal: 8, marginTop: 4, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ece3f4", borderRadius: 10 },
  focusBarText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#4a2d66" },
  unfocusButton: { height: 24, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: palette.purple },
  unfocusButtonText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  modalClose: { marginRight: "auto" },
  inspectorScroll: { flex: 1 },
  multiSelectBody: { flex: 1, paddingHorizontal: 22, paddingTop: 36, alignItems: "center" },
  multiSelectCount: { fontSize: 42, lineHeight: 46, fontWeight: "700", color: palette.purpleDark },
  multiSelectLabel: { marginTop: 2, fontSize: 13, fontWeight: "600", color: "#3a373d" },
  multiSelectHint: { marginTop: 10, marginBottom: 22, fontSize: 11, lineHeight: 16, textAlign: "center", color: palette.muted },
  multiSelectButton: { width: "100%", height: 34, marginBottom: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc9cf", backgroundColor: "#fff" },
  multiSelectButtonText: { fontSize: 12, fontWeight: "600", color: "#3a373d" },
  inspectorTitleRow: { minHeight: 82, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  inspectorTitleInput: { flex: 1, minHeight: 45, padding: 0, fontSize: 13, lineHeight: 18, color: palette.text, textAlignVertical: "top" },
  inspectorSection: { paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  inspectorSectionTitle: { marginBottom: 8, fontSize: 8.5, letterSpacing: .45, fontWeight: "700", color: "#77737b" },
  fieldLabel: { marginTop: 5, marginBottom: 3, fontSize: 9.5, color: "#706c74" },
  fieldInput: { minHeight: 28, paddingHorizontal: 8, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 10, backgroundColor: "rgba(255,255,255,.74)", fontSize: 10.5, color: "#353238" },
  infoRow: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoLabel: { fontSize: 10, color: "#706c74" },
  infoValue: { fontSize: 10, color: "#3a373d" },
  inspectorColor: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "transparent" },
  inspectorColorSelected: { borderColor: "#fff", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 3, elevation: 3 },
  noteInput: { minHeight: 96, paddingTop: 7 },
  choiceRow: { gap: 5, paddingBottom: 4 },
  choiceChip: { maxWidth: 170, height: 27, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc9cf", backgroundColor: "rgba(255,255,255,.7)" },
  choiceChipSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  choiceText: { fontSize: 9.5, color: "#5c5960" },
  choiceTextSelected: { color: palette.purpleDark, fontWeight: "600" },
  savedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingBottom: 11 },
  savedText: { fontSize: 9, color: "#778079" },
  deleteButton: { height: 31, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 10, backgroundColor: "#fff9f9" },
  deleteButtonText: { color: palette.danger, fontSize: 10.5, fontWeight: "600" },
  modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 18, backgroundColor: "rgba(29,25,32,.24)" },
  quickEntryCard: { width: "100%", maxWidth: 680, overflow: "hidden", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#fbfafc", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: .28, shadowRadius: 40, elevation: 16 },
  quickEntryHeader: { height: 42, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#f0eff1" },
  quickEntryHeaderText: { fontSize: 12, fontWeight: "700", color: "#37343a" },
  quickInputRow: { minHeight: 67, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff" },
  quickRing: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.8, borderColor: "#8e8a92" },
  quickInput: { flex: 1, height: 43, fontSize: 16, color: palette.text },
  quickProjectRow: { paddingHorizontal: 46, paddingVertical: 9, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#eceaed", backgroundColor: "#fff" },
  quickProjectChip: { maxWidth: 175, height: 29, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d2cfd5", backgroundColor: "#f5f4f6" },
  quickProjectChipSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  quickProjectText: { flexShrink: 1, fontSize: 9.5, color: "#5f5c63" },
  quickMeta: { paddingHorizontal: 16, paddingBottom: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#eceaed", backgroundColor: "#fff" },
  miniDot: { width: 7, height: 7, borderRadius: 4 },
  quickFooter: { minHeight: 50, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  quickHint: { flex: 1, fontSize: 8.5, color: "#98949c" },
  cancelButton: { height: 29, minWidth: 68, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#c9c6cc", borderRadius: 10, backgroundColor: "#fff" },
  cancelButtonText: { fontSize: 10.5, color: "#555159" },
  saveButton: { height: 29, minWidth: 68, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: palette.purple },
  saveButtonText: { fontSize: 10.5, color: "#fff", fontWeight: "700" },
  perspectiveModalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(29,25,32,.3)" },
  perspectiveEditor: { width: "100%", maxWidth: 720, maxHeight: "92%", overflow: "hidden", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#f5f3f6", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: .28, shadowRadius: 42, elevation: 18 },
  perspectiveEditorHeader: { height: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#efedf0" },
  perspectiveEditorTitle: { fontSize: 14, fontWeight: "700", color: palette.text },
  editorCancelText: { minWidth: 52, fontSize: 12, color: palette.muted },
  editorSaveText: { minWidth: 52, textAlign: "right", fontSize: 12, fontWeight: "700", color: palette.purpleDark },
  perspectiveEditorScroll: { flexGrow: 0 },
  perspectiveEditorContent: { padding: 18, paddingBottom: 30 },
  perspectiveIdentity: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 18 },
  perspectivePreviewIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  perspectiveNameInput: { flex: 1, height: 44, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c8c5cb", borderRadius: 12, backgroundColor: "#fff", fontSize: 17, fontWeight: "600", color: palette.text },
  editorSectionTitle: { marginTop: 4, marginBottom: 7, fontSize: 8.5, letterSpacing: .8, fontWeight: "700", color: "#77737b" },
  iconChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 15 },
  iconChoice: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#cecad1", borderRadius: 12, backgroundColor: "#fff" },
  colorChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 17 },
  colorChoice: { width: 29, height: 29, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 2, borderColor: "transparent" },
  colorChoiceSelected: { borderColor: "#fff", shadowColor: "#000", shadowOpacity: .22, shadowRadius: 3, elevation: 3 },
  ruleCard: { padding: 14, marginBottom: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d3d0d5", borderRadius: 14, backgroundColor: "#fff" },
  ruleCardHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  ruleCardTitle: { fontSize: 13, fontWeight: "700", color: palette.text },
  ruleLabel: { marginTop: 10, marginBottom: 5, fontSize: 10, fontWeight: "600", color: "#5f5b63" },
  ruleOptional: { fontWeight: "400", color: "#98949c" },
  ruleChoices: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  ruleChoice: { minHeight: 29, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 10, backgroundColor: "#f7f6f8" },
  ruleChoiceSelected: { borderColor: palette.purple, backgroundColor: palette.purpleSoft },
  ruleChoiceText: { fontSize: 9.5, color: "#67636b" },
  ruleChoiceTextSelected: { color: palette.purpleDark, fontWeight: "700" },
  projectRuleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  projectRuleChip: { minHeight: 29, maxWidth: "100%", paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfccd2", borderRadius: 10, backgroundColor: "#f7f6f8" },
  projectRuleText: { flexShrink: 1, fontSize: 9.5, color: "#67636b" },
  editorInput: { minHeight: 34, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c9c6cc", borderRadius: 10, backgroundColor: "#fbfafc", fontSize: 11, color: palette.text },
  matchRow: { minHeight: 37, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  matchRowText: { fontSize: 10, color: "#67636b" },
  deletePerspectiveButton: { height: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 10, backgroundColor: "#fff9f9" },
  deletePerspectiveText: { fontSize: 11, fontWeight: "600", color: palette.danger },
  settingsBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "rgba(27,24,30,.34)" },
  settingsWindow: { width: "100%", maxWidth: 780, height: "82%", maxHeight: 610, minHeight: 480, overflow: "hidden", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#f7f6f8", shadowColor: "#000", shadowOffset: { width: 0, height: 24 }, shadowOpacity: .3, shadowRadius: 48, elevation: 20 },
  settingsWindowCompact: { height: "96%", maxHeight: "96%", minHeight: 0 },
  settingsTitlebar: { height: 49, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#c9c6cc", backgroundColor: "#eceaed" },
  settingsTrafficLights: { position: "absolute", left: 15, flexDirection: "row", gap: 8 },
  settingsTitle: { fontSize: 13, fontWeight: "700", color: "#37343a" },
  settingsDoneButton: { position: "absolute", right: 12, minWidth: 48, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  settingsDoneText: { fontSize: 11, fontWeight: "600", color: palette.purpleDark },
  settingsBody: { flex: 1, minHeight: 0, flexDirection: "row" },
  settingsBodyCompact: { flexDirection: "column" },
  settingsSidebar: { width: 178, padding: 12, gap: 3, backgroundColor: "#e8e6ea", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#c9c6cc" },
  settingsSidebarCompact: { width: "100%", height: 58, paddingHorizontal: 8, paddingVertical: 8, flexDirection: "row", borderRightWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#c9c6cc" },
  settingsNavItem: { height: 39, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 10 },
  settingsNavItemCompact: { flex: 1, height: 40, justifyContent: "center", paddingHorizontal: 5, gap: 5 },
  settingsNavItemSelected: { backgroundColor: "#d8c9e5" },
  settingsNavIcon: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#d5d2d8" },
  settingsNavIconSelected: { backgroundColor: palette.purple },
  settingsNavText: { fontSize: 11.5, color: "#4c4850" },
  settingsNavTextSelected: { color: "#3d254f", fontWeight: "600" },
  settingsContent: { flex: 1, backgroundColor: "#f8f7f9" },
  settingsContentInner: { paddingHorizontal: 28, paddingTop: 25, paddingBottom: 35 },
  settingsContentInnerCompact: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 26 },
  settingsPageTitle: { fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: -.35, color: palette.text },
  settingsPageIntro: { marginTop: 4, marginBottom: 20, fontSize: 10.5, lineHeight: 16, color: palette.muted },
  settingsGroupLabel: { marginTop: 2, marginBottom: 6, marginLeft: 3, fontSize: 8, letterSpacing: .7, fontWeight: "700", color: "#817d85" },
  settingsGroup: { marginBottom: 18, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "#d2cfd5", borderRadius: 14, backgroundColor: "#fff" },
  settingsRow: { minHeight: 58, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e3e1e5" },
  settingsStackedRow: { minHeight: 74, paddingHorizontal: 13, paddingVertical: 11, gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e3e1e5" },
  settingsRowCopy: { flex: 1, minWidth: 0 },
  settingsRowTitle: { fontSize: 11.5, fontWeight: "600", color: "#37343a" },
  settingsRowDetail: { marginTop: 2, fontSize: 9, lineHeight: 13, color: "#89858d" },
  settingsRowControl: { alignItems: "flex-end" },
  databaseCard: { minHeight: 76, marginBottom: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d2cfd5", borderRadius: 14, backgroundColor: "#fff" },
  databaseIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: palette.purpleSoft },
  databaseCopy: { flex: 1 },
  databaseTitle: { fontSize: 12, fontWeight: "700", color: palette.text },
  databaseDetail: { marginTop: 3, fontSize: 9.5, color: palette.muted },
  databaseStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
  databaseStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#58a65c" },
  databaseStatusText: { fontSize: 9, color: "#667368" },
  settingsActionButton: { minHeight: 30, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#c9c6cc", borderRadius: 10, backgroundColor: "#f7f6f8" },
  settingsActionText: { fontSize: 10, fontWeight: "600", color: palette.purpleDark },
  resetSettingsButton: { minHeight: 34, alignSelf: "flex-start", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 10, backgroundColor: "#fff9f9" },
  resetSettingsText: { fontSize: 10, fontWeight: "600", color: palette.danger },
  confirmBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "rgba(27,24,30,.32)" },
  confirmDismissLayer: { ...StyleSheet.absoluteFill, zIndex: 0 },
  confirmCard: { width: "100%", maxWidth: 390, padding: 20, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", borderRadius: 18, backgroundColor: "#fbfafc", shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: .24, shadowRadius: 32, elevation: 18, zIndex: 1 },
  confirmIcon: { width: 45, height: 45, marginBottom: 11, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: "#f7e4e4" },
  confirmTitle: { maxWidth: "100%", fontSize: 15, fontWeight: "700", color: palette.text },
  confirmText: { marginTop: 5, fontSize: 10, lineHeight: 15, textAlign: "center", color: palette.muted },
  confirmActions: { width: "100%", marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  confirmDeleteButton: { height: 29, minWidth: 72, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: palette.danger },
  confirmDeleteText: { fontSize: 10.5, fontWeight: "700", color: "#fff" },
  importBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(29,25,32,.34)" },
  importCard: { width: "100%", maxWidth: 620, maxHeight: "90%", overflow: "hidden", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#aaa7ad", backgroundColor: "#f8f7f9", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: .3, shadowRadius: 42, elevation: 18 },
  importHeader: { minHeight: 53, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: "#efedf0" },
  importHeaderTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  importTitle: { fontSize: 14, fontWeight: "700", color: palette.text },
  importContent: { padding: 18, gap: 12 },
  importSourceRow: { minHeight: 62, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d0cdd3", borderRadius: 14, backgroundColor: "#fff" },
  importFileIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: palette.purpleSoft },
  importSourceCopy: { flex: 1, minWidth: 0 },
  importFileName: { fontSize: 12.5, fontWeight: "700", color: palette.text },
  importFormat: { marginTop: 2, fontSize: 9.5, color: palette.muted },
  importSectionTitle: { marginTop: 3, fontSize: 8.5, letterSpacing: .8, fontWeight: "700", color: "#77737b" },
  importStats: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  importStat: { flexGrow: 1, flexBasis: 72, minHeight: 62, padding: 8, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#d6d3d8", borderRadius: 12, backgroundColor: "#fff" },
  importStatValue: { fontSize: 20, lineHeight: 23, fontWeight: "700", color: palette.purpleDark },
  importStatLabel: { marginTop: 2, fontSize: 8.5, color: palette.muted },
  importProjectList: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "#d6d3d8", borderRadius: 12, backgroundColor: "#fff" },
  importProjectRow: { minHeight: 34, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ebe9ec" },
  importProjectName: { flex: 1, fontSize: 10.5, color: "#4e4a51" },
  importProjectCount: { fontSize: 9, color: palette.muted },
  importMore: { padding: 10, fontSize: 9.5, textAlign: "center", color: palette.purpleDark },
  importWarning: { padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 7, borderRadius: 12, backgroundColor: "#fff4dd" },
  importWarningText: { flex: 1, fontSize: 9.5, lineHeight: 14, color: "#75531f" },
  importHelp: { fontSize: 9.5, lineHeight: 14, color: palette.muted },
  replaceConfirm: { padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e3baba", borderRadius: 12, backgroundColor: "#fff7f7" },
  replaceConfirmTitle: { fontSize: 11.5, fontWeight: "700", color: palette.danger },
  replaceConfirmText: { fontSize: 9.5, lineHeight: 14, color: "#765b5b" },
  replaceConfirmActions: { marginTop: 5, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  replaceButton: { height: 29, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: palette.danger },
  replaceButtonText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  importMessageContent: { paddingHorizontal: 28, paddingVertical: 34, alignItems: "center" },
  importMessageIcon: { width: 58, height: 58, marginBottom: 13, alignItems: "center", justifyContent: "center", borderRadius: 29 },
  importMessageIconSuccess: { backgroundColor: "#e2f0e3" },
  importMessageIconError: { backgroundColor: "#f8e4e4" },
  importMessageTitle: { marginBottom: 7, fontSize: 17, fontWeight: "700", color: palette.text },
  importMessageText: { maxWidth: 450, fontSize: 11, lineHeight: 17, textAlign: "center", color: palette.muted },
  exportInstructions: { width: "100%", marginTop: 18, padding: 13, gap: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d6d3d8", borderRadius: 12, backgroundColor: "#fff" },
  exportInstructionsTitle: { marginBottom: 2, fontSize: 10.5, fontWeight: "700", color: palette.text },
  exportInstruction: { fontSize: 9.5, lineHeight: 15, color: "#5f5b63" },
  importFooter: { minHeight: 56, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: "#f0eff1" },
  importReplaceButton: { height: 31, minWidth: 72, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#dfb5b5", borderRadius: 10, backgroundColor: "#fff9f9" },
  importReplaceText: { fontSize: 10.5, color: palette.danger },
  importMergeButton: { height: 31, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, backgroundColor: palette.purple },
  importMergeText: { fontSize: 10.5, fontWeight: "700", color: "#fff" },
  mobileNav: { minHeight: 62, paddingTop: 5, paddingBottom: Platform.OS === "ios" ? 4 : 6, flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: "#f7f5f8" },
  mobileNavList: { flex: 1 },
  mobileNavScroll: { paddingHorizontal: 3 },
  mobileNavItem: { width: 64, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 12, paddingVertical: 4 },
  mobileNavItemSelected: { backgroundColor: palette.purpleSoft },
  mobileNavLabel: { maxWidth: 58, fontSize: 8, color: "#77747b" },
  mobileNavLabelSelected: { color: palette.purpleDark, fontWeight: "700" },
});
