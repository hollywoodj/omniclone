import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ContextMenuItem } from "./contextMenu";
import { ContextMenuPressable, useContextMenuTrigger } from "./contextMenu";
import {
  type ActivePerspective,
  type AppSettings,
  type CustomPerspective,
  type PerspectiveId,
} from "./model";
import { usePointerReorder } from "./lib/pointerReorder";
import { orderedListedPerspectives } from "./perspectives/rail";
import { formatShortcut, isMacPlatform, serializeShortcut, shortcutFromEvent } from "./shortcuts";
import { TrafficLights } from "./components/ui/TrafficLights";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function Icon({ name, size = 18, color = "#232126" }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function PerspectivesListModal({
  visible,
  compact,
  settings,
  customPerspectives,
  current,
  recordingId,
  onClose,
  onOpen,
  onEdit,
  onAdd,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onMove,
  onReorder,
  onShortcutChange,
  onStartRecording,
  onStopRecording,
}: {
  visible: boolean;
  compact: boolean;
  settings: AppSettings;
  customPerspectives: CustomPerspective[];
  current: ActivePerspective;
  recordingId: string | null;
  onClose: () => void;
  onOpen: (id: ActivePerspective) => void;
  onEdit: (id: ActivePerspective) => void;
  onAdd: () => void;
  onDuplicate: (perspective: CustomPerspective) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: ActivePerspective) => void;
  onMove: (id: ActivePerspective, direction: -1 | 1) => void;
  onReorder: (fromId: ActivePerspective, toId: ActivePerspective) => void;
  onShortcutChange: (id: ActivePerspective, shortcut: string) => void;
  onStartRecording: (id: ActivePerspective) => void;
  onStopRecording: () => void;
}) {
  const { openMenu } = useContextMenuTrigger();
  const rows = orderedListedPerspectives(settings, customPerspectives);
  const reorder = usePointerReorder({
    enabled: visible,
    onReorder: (fromId, toId) => onReorder(fromId as ActivePerspective, toId as ActivePerspective),
    ignoreSelector: "[data-no-drag=\"true\"]",
  });

  useEffect(() => {
    if (!recordingId || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onStopRecording();
        return;
      }
      const chord = shortcutFromEvent(event);
      if (!chord) return;
      event.preventDefault();
      event.stopPropagation();
      onShortcutChange(recordingId as ActivePerspective, serializeShortcut(chord));
      onStopRecording();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onShortcutChange, onStopRecording, recordingId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.window, compact && styles.windowCompact]}>
          <View style={styles.titlebar}>
            <View style={styles.titlebarLeft}>
              {!compact && <TrafficLights onClose={onClose} />}
              {(compact || !isMacPlatform()) && (
                <Pressable onPress={onClose} style={styles.doneButton} hitSlop={8}>
                  <Text style={styles.done}>{compact ? "Done" : "Close"}</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.title}>Perspectives</Text>
            <Pressable accessibilityLabel="Add perspective" onPress={onAdd} style={styles.addButton} hitSlop={8}>
              <Icon name="plus" size={16} color="#6e6b72" />
            </Pressable>
          </View>
          <View ref={reorder.ref} style={styles.list} collapsable={false}>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rows.map((item) => {
              const favorite = settings.perspectiveBarIds.includes(item.id);
              const shortcut = settings.perspectiveShortcuts[item.id] ?? "";
              const selected = current === item.id;
              const menuItems: ContextMenuItem[] = [
                { id: "open", label: "Open", icon: "open-in-app", onPress: () => onOpen(item.id) },
                { id: "edit", label: "Edit", icon: "pencil-outline", onPress: () => onEdit(item.id) },
                { id: "fav", label: favorite ? "Unfavorite" : "Favorite", icon: favorite ? "star-off-outline" : "star-outline", onPress: () => onToggleFavorite(item.id) },
                { id: "sep-1", label: "", separator: true },
                { id: "up", label: "Move Up", icon: "chevron-up", onPress: () => onMove(item.id, -1) },
                { id: "down", label: "Move Down", icon: "chevron-down", onPress: () => onMove(item.id, 1) },
                ...(item.custom ? [
                  { id: "dup", label: "Duplicate", icon: "content-copy" as IconName, onPress: () => onDuplicate(item.custom!) },
                  { id: "sep-2", label: "", separator: true },
                  { id: "delete", label: "Delete", icon: "trash-can-outline" as IconName, destructive: true, onPress: () => onDelete(item.custom!.id) },
                ] : []),
              ];
              return (
                <View
                  key={item.id}
                  collapsable={false}
                  style={[
                    { width: "100%" },
                    Platform.OS === "web" ? ({ cursor: "grab" } as object) : null,
                    reorder.dragId === item.id && styles.rowDragging,
                    reorder.dropId === item.id && styles.rowDrop,
                  ]}
                  {...({ dataSet: { perspectiveId: item.id } } as object)}
                >
                <ContextMenuPressable
                  items={menuItems}
                  onPress={() => {
                    if (reorder.shouldSkipPress()) return;
                    onOpen(item.id);
                  }}
                  style={[
                    styles.row,
                    selected && styles.rowSelected,
                  ]}
                >
                  <Icon name={item.icon as IconName} size={20} color={item.color} />
                  <Text numberOfLines={1} style={styles.rowTitle}>{item.name}</Text>
                  <Pressable
                    onPress={() => recordingId === item.id ? onStopRecording() : onStartRecording(item.id)}
                    style={[styles.shortcutButton, recordingId === item.id && styles.shortcutRecording, !shortcut && recordingId !== item.id && styles.shortcutEmpty]}
                    {...({ dataSet: { noDrag: "true" } } as object)}
                  >
                    <Text style={[styles.shortcutText, recordingId === item.id && styles.shortcutRecordingText, !shortcut && recordingId !== item.id && styles.shortcutPlaceholder]}>
                      {recordingId === item.id ? "Type shortcut" : formatShortcut(shortcut) || "Shortcut"}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityLabel={favorite ? "Unfavorite" : "Favorite"} onPress={() => onToggleFavorite(item.id)} style={styles.starButton} {...({ dataSet: { noDrag: "true" } } as object)}>
                    <Icon name={favorite ? "star" : "star-outline"} size={18} color={favorite ? "#e2a13b" : "#c5c2c8"} />
                  </Pressable>
                  <Pressable accessibilityLabel="Perspective actions" onPress={() => openMenu({ items: menuItems })} style={styles.moreButton} {...({ dataSet: { noDrag: "true" } } as object)}>
                    <Icon name="dots-horizontal" size={18} color="#b0adb4" />
                  </Pressable>
                </ContextMenuPressable>
                </View>
              );
            })}
          </ScrollView>
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerText}>Drag and drop to rearrange perspectives.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function isStandardPerspectiveId(id: ActivePerspective): id is PerspectiveId {
  return !id.startsWith("custom:");
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(27,24,30,.28)",
  },
  window: {
    width: "100%",
    maxWidth: 420,
    height: 468,
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bbb8be",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 36,
    elevation: 20,
  },
  windowCompact: {
    height: "94%",
    maxHeight: "94%",
    maxWidth: "100%",
  },
  titlebar: {
    height: 38,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f3f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e0e4",
  },
  titlebarLeft: {
    position: "absolute",
    left: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2d2a31",
  },
  doneButton: {
    minWidth: 44,
    height: 28,
    justifyContent: "center",
  },
  done: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b46a1",
  },
  addButton: {
    position: "absolute",
    right: 10,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  list: {
    flex: 1,
    backgroundColor: "#fff",
  },
  listContent: {
    paddingVertical: 4,
  },
  row: {
    minHeight: 40,
    paddingLeft: 14,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowSelected: {
    backgroundColor: "#f3f1f5",
  },
  rowDragging: {
    opacity: 0.45,
  },
  rowDrop: {
    backgroundColor: "#efe7f6",
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: "#1f1d22",
  },
  shortcutButton: {
    minWidth: 52,
    height: 22,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#ecebed",
  },
  shortcutEmpty: {
    backgroundColor: "#f0eef1",
  },
  shortcutRecording: {
    backgroundColor: "#eadcf4",
  },
  shortcutText: {
    fontSize: 11,
    color: "#6f6c73",
    fontVariant: ["tabular-nums"],
  },
  shortcutPlaceholder: {
    color: "#8b888f",
  },
  shortcutRecordingText: {
    color: "#6b46a1",
    fontWeight: "700",
  },
  starButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  moreButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e0e4",
    backgroundColor: "#ecebed",
  },
  footerText: {
    fontSize: 11,
    color: "#8a878e",
  },
});
