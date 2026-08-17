import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ContextMenuPressable, type ContextMenuItem } from "../../contextMenu";
import { dueUrgency, formatAvailableLabel } from "../../dates";
import { palette, type AppSettings, type Project, type Task } from "../../model";
import { formatEstimate, projectDisplayName } from "../../outline";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "../ui/Icon";
import { StatusRing } from "../ui/StatusRing";

export function TaskRow({ task, project, projects, selected, editing, bulkCount, settings, depth = 0, hasChildren = false, collapsed = false, hideProject = false, blocked = false, registerRow, onSelect, onToggle, onInspect, onToggleSelected, onToggleFlag, onDelete, onCopy, onCopyLink, onCopyTaskPaper, onDuplicate, onMove, onIndent, onOutdent, onMoveRow, onToggleCollapse, onStartEdit, onCommitTitle, onConvertToProject }: {
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
