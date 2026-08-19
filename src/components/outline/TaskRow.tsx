import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { ContextMenuPressable, type ContextMenuItem } from "../../contextMenu";
import { dueUrgency, formatAvailableLabel, outlineDueLabel } from "../../dates";
import { setTaskDragData } from "../../lib/dnd";
import { palette, visibleOutlineColumns, type AppSettings, type OutlineColumnId, type Project, type Task } from "../../model";
import { formatEstimate, projectDisplayName } from "../../outline";
import { appStyles as styles } from "../../styles/appStyles";
import { DateField } from "../inspector/DateField";
import { Icon, type IconName } from "../ui/Icon";
import { StatusRing } from "../ui/StatusRing";
import { shortcutLabel } from "../../shortcuts.ts";

export function TaskRow({ task, project, projects, selected, editing, bulkCount, settings, depth = 0, hasChildren = false, collapsed = false, hideProject = false, blocked = false, compactDue = false, dragIds, registerRow, onSelect, onToggle, onInspect, onToggleSelected, onToggleFlag, onDelete, onCopy, onCopyLink, onCopyTaskPaper, onDuplicate, onMove, onIndent, onOutdent, onMoveRow, onToggleCollapse, onStartEdit, onCommitTitle, onCommitTitleAndAdd, onCancelEdit, onConvertToProject, onReveal, onChangeDates, onAwaitReply }: {
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
  compactDue?: boolean;
  dragIds?: string[];
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
  onCommitTitleAndAdd?: (title: string) => void;
  onCancelEdit?: () => void;
  onConvertToProject: () => void;
  onReveal: () => void;
  onChangeDates: (patch: Pick<Task, "due" | "defer">) => void;
  onAwaitReply: () => void;
}) {
  const urgency = dueUrgency(task.due);
  const bulk = bulkCount > 1;
  const availableLabel = formatAvailableLabel(task.defer);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [editingDate, setEditingDate] = useState<"due" | "defer" | null>(null);
  useEffect(() => setDraft(task.title), [task.id, task.title, editing]);
  useEffect(() => setEditingDate(null), [task.id]);
  const commit = () => onCommitTitle(draft.trim() || task.title);
  // OmniFocus commits on Return and opens the next action, so a list can be
  // typed straight through without reaching for the mouse.
  const commitAndAdd = () => {
    const title = draft.trim() || task.title;
    if (onCommitTitleAndAdd) onCommitTitleAndAdd(title);
    else onCommitTitle(title);
  };
  const cancelEdit = () => {
    setDraft(task.title);
    if (onCancelEdit) onCancelEdit();
    else onCommitTitle(task.title);
  };
  const columns = visibleOutlineColumns(settings.outlineColumns, hideProject);
  const columnStyle: Record<OutlineColumnId, object> = {
    project: styles.outlineColumnProject,
    tags: styles.outlineColumnTags,
    duration: styles.outlineColumnDuration,
    defer: styles.outlineColumnDefer,
    due: styles.outlineColumnDue,
  };
  const showMetaProject = !!project && !hideProject && !columns.includes("project");
  const showMetaTags = !!task.tags.length && !columns.includes("tags");
  const showTailDue = !columns.includes("due");
  const showTailDefer = !columns.includes("defer") && !task.due && !!availableLabel;
  const showTailEstimate = !!task.estimatedMinutes && !columns.includes("duration");
  const menuItems: ContextMenuItem[] = [
    { id: "inspect", label: "Inspect", icon: "information-outline", onPress: onInspect },
    { id: "reveal", label: "Show in Projects", icon: "folder-arrow-right", onPress: onReveal },
    { id: "edit", label: "Edit", icon: "pencil-outline", shortcut: "↩", onPress: onStartEdit },
    { id: "toggle", label: `${task.completed ? "Mark Incomplete" : "Mark Complete"}${bulk ? ` (${bulkCount})` : ""}`, icon: task.completed ? "circle-outline" : "check-circle-outline", onPress: onToggleSelected },
    { id: "await", label: `Complete and Await Reply${bulk ? ` (${bulkCount})` : ""}`, icon: "email-fast-outline", onPress: onAwaitReply },
    { id: "flag", label: `${task.flagged ? "Remove Flag" : "Flag"}${bulk ? ` (${bulkCount})` : ""}`, icon: task.flagged ? "flag-off-outline" : "flag-outline", shortcut: shortcutLabel("⇧⌘L"), onPress: onToggleFlag },
    { id: "sep-org", label: "", separator: true },
    { id: "duplicate", label: bulk ? `Duplicate (${bulkCount})` : "Duplicate", icon: "content-duplicate", shortcut: shortcutLabel("⌘D"), onPress: onDuplicate },
    { id: "indent", label: "Indent", icon: "format-indent-increase", shortcut: "⇥", onPress: onIndent },
    { id: "outdent", label: "Outdent", icon: "format-indent-decrease", shortcut: shortcutLabel("⇧⇥"), onPress: onOutdent },
    { id: "convert", label: "Convert to Project", icon: "folder-plus-outline", onPress: onConvertToProject },
    { id: "up", label: "Move Up", icon: "arrow-up", shortcut: shortcutLabel("⌥⌘↑"), onPress: () => onMoveRow(-1) },
    { id: "down", label: "Move Down", icon: "arrow-down", shortcut: shortcutLabel("⌥⌘↓"), onPress: () => onMoveRow(1) },
    { id: "inbox", label: "Move to Inbox", icon: "inbox-arrow-down-outline", onPress: () => onMove(null) },
    ...projects.slice(0, 8).map((item) => ({
      id: `move-${item.id}`,
      label: `Move to ${item.name}`,
      icon: "folder-outline" as IconName,
      onPress: () => onMove(item.id),
    })),
    { id: "sep-copy", label: "", separator: true },
    { id: "copy", label: bulk ? `Copy Titles (${bulkCount})` : "Copy Title", icon: "content-copy", onPress: onCopy },
    { id: "paper", label: "Copy as TaskPaper", icon: "code-tags", shortcut: shortcutLabel("⇧⌘C"), onPress: onCopyTaskPaper },
    { id: "link", label: bulk ? `Copy Links (${bulkCount})` : "Copy Link", icon: "link-variant", onPress: onCopyLink },
    { id: "delete", label: bulk ? `Delete (${bulkCount})` : "Delete", icon: "trash-can-outline", destructive: true, onPress: onDelete },
  ];

  return (
    <View
      ref={(node) => registerRow(task.id, node)}
      collapsable={false}
      style={editingDate ? { zIndex: 24, position: "relative" } : undefined}
      {...({
        dataSet: { taskId: task.id },
        ...(Platform.OS === "web" && !editing ? {
          draggable: true,
          onDragStart: (event: { dataTransfer?: { setData: (type: string, value: string) => void; effectAllowed?: string } }) => {
            setTaskDragData(event, dragIds?.length ? dragIds : [task.id]);
          },
        } : {}),
      } as object)}
    >
      <ContextMenuPressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        items={menuItems}
        onPress={onSelect}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        {...({ onDoubleClick: onStartEdit } as object)}
        style={({ pressed }) => [
          styles.taskRow,
          settings.rowDensity === "compact" && styles.taskRowCompact,
          selected && styles.taskRowSelected,
          hovered && !selected && styles.taskRowHover,
          compactDue && task.flagged && !task.due && !selected && styles.flaggedForecastRow,
          pressed && styles.taskRowPressed,
          { paddingLeft: 8 + depth * 18 },
        ]}
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
                onSubmitEditing={commitAndAdd}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === "Escape") {
                    event.preventDefault?.();
                    cancelEdit();
                  }
                }}
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
            {!!task.note?.trim() && !settings.showNotesInOutline && (
              <View style={styles.noteGlyph}>
                <Icon name="note-text-outline" size={12} color="#9a969e" />
              </View>
            )}
          </View>
          {settings.showNotesInOutline && !!task.note?.trim() && (
            <Text numberOfLines={3} style={styles.outlineNote}>{task.note}</Text>
          )}
          <View style={styles.taskMeta}>
            {showMetaProject && <Text numberOfLines={1} style={styles.taskMetaText}>{projectDisplayName(project)}</Text>}
            {showMetaTags && task.tags.map((tag) => <View key={tag} style={styles.tagChip}><Text style={styles.tagChipText}>{tag}</Text></View>)}
            {(task.status ?? "active") === "onHold" && <Text style={styles.deferText}>On Hold</Text>}
            {(task.status ?? "active") === "dropped" && <Text style={styles.deferText}>Dropped</Text>}
            {!!availableLabel && !!task.due && !columns.includes("defer") && <Text style={styles.deferText}>{availableLabel}</Text>}
          </View>
        </View>
        {columns.map((column) => {
          if (column === "project") {
            return (
              <Text key={column} numberOfLines={1} style={[styles.outlineColumnCell, styles.outlineColumnCellStrong, columnStyle[column]]}>
                {project ? projectDisplayName(project) : ""}
              </Text>
            );
          }
          if (column === "tags") {
            return (
              <Text key={column} numberOfLines={1} style={[styles.outlineColumnCell, columnStyle[column]]}>
                {task.tags.join(", ")}
              </Text>
            );
          }
          if (column === "duration") {
            return (
              <Text key={column} style={[styles.outlineColumnCell, columnStyle[column]]}>
                {task.estimatedMinutes ? formatEstimate(task.estimatedMinutes) : ""}
              </Text>
            );
          }
          if (column === "defer") {
            return (
              <Pressable key={column} onPress={() => setEditingDate(editingDate === "defer" ? null : "defer")} style={columnStyle[column]} hitSlop={6} {...({ dataSet: { noMarquee: "true" } } as object)}>
                <Text numberOfLines={1} style={styles.outlineColumnCell}>{availableLabel ?? ((hovered || selected) ? "Defer" : "")}</Text>
              </Pressable>
            );
          }
          return (
            <Pressable key={column} onPress={() => setEditingDate(editingDate === "due" ? null : "due")} style={columnStyle[column]} hitSlop={6} {...({ dataSet: { noMarquee: "true" } } as object)}>
              {task.due
                ? <Text numberOfLines={1} style={[styles.dueText, settings.colorDueItems && urgency === "overdue" && styles.dueOverdue, settings.colorDueItems && urgency === "dueSoon" && styles.dueSoon]}>{outlineDueLabel(task.due, compactDue) ?? task.due}</Text>
                : (hovered || selected) ? <Text style={styles.deferText}>Due</Text> : <Text style={styles.outlineColumnCell}> </Text>}
            </Pressable>
          );
        })}
        <View style={styles.taskTail}>
          {showTailEstimate && <Text style={styles.estimateText}>{formatEstimate(task.estimatedMinutes)}</Text>}
          {showTailDue && (
            <Pressable
              onPress={() => setEditingDate(editingDate === "due" ? null : "due")}
              hitSlop={6}
              {...({ dataSet: { noMarquee: "true" } } as object)}
            >
              {task.due
                ? <Text style={[styles.dueText, settings.colorDueItems && urgency === "overdue" && styles.dueOverdue, settings.colorDueItems && urgency === "dueSoon" && styles.dueSoon]}>{outlineDueLabel(task.due, compactDue) ?? task.due}</Text>
                : (hovered || selected) ? <Text style={styles.deferText}>Due</Text> : null}
            </Pressable>
          )}
          {showTailDefer && (
            <Pressable onPress={() => setEditingDate("defer")} hitSlop={6} {...({ dataSet: { noMarquee: "true" } } as object)}>
              <Text style={styles.deferText}>{availableLabel}</Text>
            </Pressable>
          )}
          <Pressable accessibilityLabel={task.flagged ? "Remove flag" : "Flag"} onPress={onToggleFlag} hitSlop={8} {...({ dataSet: { noMarquee: "true" } } as object)}>
            <Icon name={task.flagged ? "flag" : hovered || selected ? "flag-outline" : "flag-outline"} size={16} color={task.flagged ? palette.flag : hovered || selected ? "#c5c1c8" : "transparent"} />
          </Pressable>
          <Pressable onPress={onInspect} hitSlop={8} style={styles.rowInfoButton} {...({ dataSet: { noMarquee: "true" } } as object)}><Icon name="information-outline" size={17} color="#8e8a91" /></Pressable>
        </View>
        {editingDate && (
          <View style={styles.inlineDatePopover} {...({ dataSet: { noMarquee: "true" } } as object)}>
            <Text style={styles.inspectorSectionTitle}>{editingDate === "due" ? "DUE" : "DEFER UNTIL"}</Text>
            <DateField
              compact
              value={editingDate === "due" ? task.due : task.defer}
              onChange={(next) => onChangeDates(editingDate === "due" ? { due: next } : { defer: next })}
            />
            <Pressable onPress={() => setEditingDate(null)} style={styles.calendarClear}>
              <Text style={[styles.datePresetText, { color: palette.purpleDark }]}>Done</Text>
            </Pressable>
          </View>
        )}
      </ContextMenuPressable>
    </View>
  );
}
