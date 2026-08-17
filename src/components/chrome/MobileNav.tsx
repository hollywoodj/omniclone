import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { palette } from "../../model";
import type { RailPerspective } from "../../perspectives/rail";
import { appStyles as styles } from "../../styles/appStyles";
import { MobileCustomPerspectiveItem } from "../outline/MobileCustomPerspectiveItem";
import { Icon } from "../ui/Icon";

export function MobileNav({
  items,
  currentId,
  onSelect,
  onEdit,
  onUnfavorite,
  onOpenList,
  onDelete,
  onImport,
  onSettings,
}: {
  items: RailPerspective[];
  currentId: string;
  onSelect: (id: RailPerspective["id"]) => void;
  onEdit: (id: RailPerspective["id"]) => void;
  onUnfavorite: (id: RailPerspective["id"]) => void;
  onOpenList: () => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onSettings: () => void;
}) {
  return (
    <View style={styles.mobileNav}>
      <ScrollView style={styles.mobileNavList} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavScroll}>
        {items.map((item) => (
          <MobileCustomPerspectiveItem
            key={item.id}
            item={item}
            selected={item.id === currentId}
            onSelect={() => onSelect(item.id)}
            onEdit={() => onEdit(item.id)}
            onUnfavorite={() => onUnfavorite(item.id)}
            onOpenList={onOpenList}
            onDelete={item.custom ? () => onDelete(item.custom!.id) : undefined}
          />
        ))}
        <Pressable onPress={onOpenList} style={styles.mobileNavItem}><Icon name="view-list-outline" size={21} color={palette.purpleDark} /><Text style={styles.mobileNavLabel}>List</Text></Pressable>
        <Pressable accessibilityLabel="Import from OmniFocus" onPress={onImport} style={styles.mobileNavItem}><Icon name="database-import-outline" size={21} color={palette.purpleDark} /><Text style={styles.mobileNavLabel}>Import</Text></Pressable>
        <Pressable accessibilityLabel="Settings" onPress={onSettings} style={styles.mobileNavItem}><Icon name="cog-outline" size={21} color={palette.purpleDark} /><Text style={styles.mobileNavLabel}>Settings</Text></Pressable>
      </ScrollView>
    </View>
  );
}
