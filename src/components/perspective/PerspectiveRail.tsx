import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ContextMenuPressable, type ContextMenuItem } from "../../contextMenu";
import { palette, type ActivePerspective } from "../../model";
import { formatShortcut } from "../../shortcuts";
import { copyToClipboard } from "../../lib/clipboard";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "../ui/Icon";
import type { RailPerspective } from "../../perspectives/rail";

export function PerspectiveRail({ current, badges, items, showTitles, shortcuts, onSelect, onEdit, onUnfavorite, onOpenList, onOpenSettings, onDelete }: {
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
