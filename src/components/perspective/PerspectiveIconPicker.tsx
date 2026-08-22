import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  filterPerspectiveIcons,
  perspectiveIconCategories,
  perspectiveIconLabel,
  type PerspectiveIconName,
} from "../../perspectives/iconLibrary";
import { Icon } from "../ui/Icon";

export function PerspectiveIconPicker({
  value,
  accent,
  onSelect,
}: {
  value: string;
  accent: string;
  onSelect: (icon: PerspectiveIconName) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const icons = useMemo(() => {
    if (query.trim()) return filterPerspectiveIcons(query);
    if (activeCategory) {
      const category = perspectiveIconCategories.find((item) => item.id === activeCategory);
      return category ? [...category.icons] : [];
    }
    return perspectiveIconCategories.flatMap((category) => [...category.icons]);
  }, [activeCategory, query]);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>ICON</Text>
      <TextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (text.trim()) setActiveCategory(null);
        }}
        placeholder="Search icons"
        placeholderTextColor="#9a97a0"
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
        <Pressable
          onPress={() => {
            setActiveCategory(null);
            setQuery("");
          }}
          style={[styles.categoryChip, !activeCategory && !query && styles.categoryChipSelected]}
        >
          <Text style={[styles.categoryChipText, !activeCategory && !query && styles.categoryChipTextSelected]}>All</Text>
        </Pressable>
        {perspectiveIconCategories.map((category) => {
          const selected = activeCategory === category.id && !query.trim();
          return (
            <Pressable
              key={category.id}
              onPress={() => {
                setActiveCategory(category.id);
                setQuery("");
              }}
              style={[styles.categoryChip, selected && styles.categoryChipSelected]}
            >
              <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{category.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView style={styles.iconScroll} contentContainerStyle={styles.iconGrid} keyboardShouldPersistTaps="handled">
        {icons.map((icon) => {
          const selected = value === icon;
          return (
            <Pressable
              key={icon}
              accessibilityLabel={perspectiveIconLabel(icon)}
              onPress={() => onSelect(icon)}
              style={[
                styles.iconCell,
                selected && { borderColor: accent, backgroundColor: `${accent}18` },
              ]}
            >
              <Icon name={icon} size={20} color={selected ? accent : "#5c5960"} />
            </Pressable>
          );
        })}
        {!icons.length && (
          <Text style={styles.empty}>No icons match “{query.trim()}”.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8d5da",
    gap: 8,
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: "#817d85",
  },
  search: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d4d1d6",
    backgroundColor: "#f7f6f8",
    fontSize: 12,
    color: "#3a373d",
  },
  categoryScroll: {
    flexGrow: 0,
    maxHeight: 30,
  },
  categoryRow: {
    gap: 6,
    paddingRight: 4,
  },
  categoryChip: {
    minHeight: 26,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d4d1d6",
    backgroundColor: "#f7f6f8",
  },
  categoryChipSelected: {
    borderColor: "#b8b4bc",
    backgroundColor: "#ecebed",
  },
  categoryChipText: {
    fontSize: 11,
    color: "#6e6b72",
    fontWeight: "500",
  },
  categoryChipTextSelected: {
    color: "#3a373d",
    fontWeight: "700",
  },
  iconScroll: {
    maxHeight: 220,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 2,
  },
  iconCell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d4d1d6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f6f8",
  },
  empty: {
    width: "100%",
    paddingVertical: 12,
    fontSize: 12,
    color: "#8a878e",
    textAlign: "center",
  },
});
