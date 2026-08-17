import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { palette, perspectives, type ActivePerspective, type CustomPerspective, type Project } from "./model";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function Icon({ name, size = 18, color = palette.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

type QuickOpenItem = {
  id: string;
  kind: "perspective" | "project" | "tag";
  label: string;
  detail: string;
  icon: IconName;
  color: string;
  perspective?: ActivePerspective;
  projectId?: string;
};

export function QuickOpenModal({
  visible,
  customPerspectives,
  projects,
  tags,
  onClose,
  onSelectPerspective,
  onSelectProject,
}: {
  visible: boolean;
  customPerspectives: CustomPerspective[];
  projects: Project[];
  tags: string[];
  onClose: () => void;
  onSelectPerspective: (id: ActivePerspective) => void;
  onSelectProject: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const items = useMemo(() => {
    const all: QuickOpenItem[] = [
      ...perspectives.map((item) => ({
        id: item.id,
        kind: "perspective" as const,
        label: item.label,
        detail: "Perspective",
        icon: item.icon as IconName,
        color: palette.purpleDark,
        perspective: item.id as ActivePerspective,
      })),
      ...customPerspectives.map((item) => ({
        id: `custom:${item.id}`,
        kind: "perspective" as const,
        label: item.name,
        detail: "Custom Perspective",
        icon: item.icon as IconName,
        color: item.color,
        perspective: `custom:${item.id}` as ActivePerspective,
      })),
      ...projects.map((project) => ({
        id: `project:${project.id}`,
        kind: "project" as const,
        label: project.name,
        detail: "Project",
        icon: "folder-outline" as IconName,
        color: project.color,
        projectId: project.id,
      })),
      ...tags.map((tag) => ({
        id: `tag:${tag}`,
        kind: "tag" as const,
        label: tag,
        detail: "Tag",
        icon: "tag-outline" as IconName,
        color: palette.purple,
      })),
    ];
    const needle = query.trim().toLowerCase();
    return needle ? all.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(needle)) : all;
  }, [customPerspectives, projects, query, tags]);

  useEffect(() => {
    setIndex(0);
  }, [query, visible]);

  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((current) => Math.min(current + 1, Math.max(items.length - 1, 0)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((current) => Math.max(current - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = items[index];
        if (item) choose(item);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, items, onClose, visible]);

  const choose = (item: QuickOpenItem) => {
    if (item.perspective) onSelectPerspective(item.perspective);
    else if (item.projectId) onSelectProject(item.projectId);
    else if (item.kind === "tag") onSelectPerspective("tags");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.searchRow}>
            <Icon name="magnify" size={18} color="#8b888f" />
            <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Go to a perspective, project, or tag" style={styles.search} />
          </View>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {items.map((item, itemIndex) => (
              <Pressable key={item.id} onPress={() => choose(item)} style={[styles.row, itemIndex === index && styles.rowSelected]}>
                <View style={[styles.iconWell, { backgroundColor: `${item.color}22` }]}>
                  <Icon name={item.icon} size={16} color={item.color} />
                </View>
                <Text numberOfLines={1} style={styles.label}>{item.label}</Text>
                <Text style={styles.detail}>{item.detail}</Text>
              </Pressable>
            ))}
            {!items.length && <Text style={styles.empty}>No matching items.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    paddingTop: 90,
    backgroundColor: "rgba(27,24,30,.28)",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: 420,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#b7b4ba",
    backgroundColor: "#f7f6f8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 18,
  },
  searchRow: {
    height: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
    backgroundColor: "#fff",
  },
  search: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: palette.text,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowSelected: {
    backgroundColor: palette.purpleSelection,
  },
  iconWell: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 13,
    color: palette.text,
  },
  detail: {
    fontSize: 11,
    color: palette.muted,
  },
  empty: {
    padding: 18,
    textAlign: "center",
    fontSize: 12,
    color: palette.muted,
  },
});
