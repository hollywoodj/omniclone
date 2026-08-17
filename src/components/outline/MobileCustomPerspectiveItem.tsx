import React from "react";
import { Text } from "react-native";
import { ContextMenuPressable, type ContextMenuItem } from "../../contextMenu";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "../ui/Icon";
import type { RailPerspective } from "../../perspectives/rail";

export function MobileCustomPerspectiveItem({
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
