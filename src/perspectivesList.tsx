import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ContextMenuItem } from "./contextMenu";
import { useContextMenuTrigger } from "./contextMenu";
import {
  palette,
  perspectives,
  type ActivePerspective,
  type AppSettings,
  type CustomPerspective,
  type PerspectiveId,
} from "./model";
import { formatShortcut, serializeShortcut, shortcutFromEvent } from "./shortcuts";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function Icon({ name, size = 18, color = palette.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

type ListedPerspective = {
  id: ActivePerspective;
  name: string;
  icon: string;
  color: string;
  custom?: CustomPerspective;
};

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
  onShortcutChange: (id: ActivePerspective, shortcut: string) => void;
  onStartRecording: (id: ActivePerspective) => void;
  onStopRecording: () => void;
}) {
  const { contextMenuProps } = useContextMenuTrigger();
  const [query, setQuery] = useState("");

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

  const rows: ListedPerspective[] = [
    ...perspectives.map((item) => ({ id: item.id as ActivePerspective, name: item.label, icon: item.icon, color: palette.purpleDark })),
    ...customPerspectives.map((item) => ({ id: `custom:${item.id}` as ActivePerspective, name: item.name, icon: item.icon, color: item.color, custom: item })),
  ].filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  const ordered = [...rows].sort((a, b) => {
    const aIndex = settings.perspectiveBarIds.indexOf(a.id);
    const bIndex = settings.perspectiveBarIds.indexOf(b.id);
    const aFav = aIndex >= 0;
    const bFav = bIndex >= 0;
    if (aFav && bFav) return aIndex - bIndex;
    if (aFav !== bFav) return aFav ? -1 : 1;
    return 0;
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.window, compact && styles.windowCompact]}>
          <View style={styles.titlebar}>
            {!compact && (
              <View style={styles.lights}>
                <Pressable accessibilityLabel="Close perspectives list" onPress={onClose} style={[styles.light, { backgroundColor: "#ff5f57" }]} />
                <View style={[styles.light, { backgroundColor: "#febc2e" }]} />
                <View style={[styles.light, { backgroundColor: "#28c840" }]} />
              </View>
            )}
            <Text style={styles.title}>Perspectives</Text>
            <Pressable onPress={onClose} style={styles.doneButton}><Text style={styles.done}>Done</Text></Pressable>
          </View>
          <View style={styles.searchRow}>
            <Icon name="magnify" size={16} color="#8b888f" />
            <TextInput value={query} onChangeText={setQuery} placeholder="Filter perspectives" style={styles.search} />
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {ordered.map((item) => {
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
              const menuProps = contextMenuProps(menuItems);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onOpen(item.id)}
                  onLongPress={menuProps.onLongPress}
                  {...(menuProps.onContextMenu ? { onContextMenu: menuProps.onContextMenu } : {})}
                  style={[styles.row, selected && styles.rowSelected]}
                >
                  <Pressable accessibilityLabel={favorite ? "Unfavorite" : "Favorite"} onPress={() => onToggleFavorite(item.id)} style={styles.starButton}>
                    <Icon name={favorite ? "star" : "star-outline"} size={18} color={favorite ? "#e2a13b" : "#b0adb4"} />
                  </Pressable>
                  <View style={[styles.iconWell, { backgroundColor: `${item.color}22` }]}>
                    <Icon name={item.icon as IconName} size={18} color={item.color} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowMeta}>{item.custom ? "Custom" : "Standard"}{favorite ? " · Favorite" : ""}</Text>
                  </View>
                  <Pressable
                    onPress={() => recordingId === item.id ? onStopRecording() : onStartRecording(item.id)}
                    style={[styles.shortcutButton, recordingId === item.id && styles.shortcutRecording]}
                  >
                    <Text style={[styles.shortcutText, recordingId === item.id && styles.shortcutRecordingText]}>
                      {recordingId === item.id ? "Type shortcut" : formatShortcut(shortcut) || "Shortcut"}
                    </Text>
                  </Pressable>
                  {!!shortcut && recordingId !== item.id && (
                    <Pressable accessibilityLabel="Clear shortcut" onPress={() => onShortcutChange(item.id, "")} style={styles.clearButton}>
                      <Icon name="close" size={14} color="#8b888f" />
                    </Pressable>
                  )}
                  <Pressable accessibilityLabel="Perspective actions" onPress={menuProps.onLongPress} style={styles.moreButton}>
                    <Icon name="dots-horizontal" size={18} color="#8b888f" />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={onAdd} style={styles.addButton}>
              <Icon name="plus" size={16} color="#fff" />
              <Text style={styles.addText}>Add Perspective</Text>
            </Pressable>
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
    backgroundColor: "rgba(27,24,30,.34)",
  },
  window: {
    width: "100%",
    maxWidth: 640,
    height: "78%",
    maxHeight: 560,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#aaa7ad",
    backgroundColor: "#f7f6f8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.3,
    shadowRadius: 48,
    elevation: 20,
  },
  windowCompact: {
    height: "94%",
    maxHeight: "94%",
  },
  titlebar: {
    height: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#c9c6cc",
    backgroundColor: "#eceaed",
  },
  lights: {
    position: "absolute",
    left: 14,
    flexDirection: "row",
    gap: 8,
  },
  light: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,.18)",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#37343a",
  },
  doneButton: {
    position: "absolute",
    right: 12,
    minWidth: 48,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  done: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.purpleDark,
  },
  searchRow: {
    height: 40,
    margin: 12,
    marginBottom: 4,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0cdd3",
    backgroundColor: "#fff",
  },
  search: {
    flex: 1,
    height: 36,
    fontSize: 13,
    color: palette.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
  },
  rowSelected: {
    backgroundColor: "#e4d8ef",
  },
  starButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWell: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.text,
  },
  rowMeta: {
    marginTop: 1,
    fontSize: 10,
    color: palette.muted,
  },
  shortcutButton: {
    minWidth: 84,
    height: 26,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0cdd3",
    backgroundColor: "#fff",
  },
  shortcutRecording: {
    borderColor: palette.purple,
    backgroundColor: palette.purpleSoft,
  },
  shortcutText: {
    fontSize: 11,
    color: "#5c5960",
  },
  shortcutRecordingText: {
    color: palette.purpleDark,
    fontWeight: "700",
  },
  clearButton: {
    width: 22,
    height: 22,
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
    height: 52,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    backgroundColor: "#f0eff1",
  },
  addButton: {
    height: 30,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 7,
    backgroundColor: palette.purple,
  },
  addText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
});
