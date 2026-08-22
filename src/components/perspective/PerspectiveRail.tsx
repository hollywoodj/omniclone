import React, { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ContextMenuPressable, type ContextMenuItem } from "../../contextMenu";
import { palette, type ActivePerspective } from "../../model";
import { formatShortcut } from "../../shortcuts";
import { copyToClipboard } from "../../lib/clipboard";
import { allowPerspectiveDrop, allowTaskDrop, getPerspectiveDragData, getTaskDragData, setPerspectiveDragData } from "../../lib/dnd";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "../ui/Icon";
import type { RailPerspective } from "../../perspectives/rail";

export function PerspectiveRail({
  current,
  badges,
  items,
  showTitles,
  shortcuts,
  onSelect,
  onReveal,
  onEdit,
  onUnfavorite,
  onOpenList,
  onOpenSettings,
  onDelete,
  onReorder,
  onDropInbox,
}: {
  current: ActivePerspective;
  badges: Record<string, { count: number; color?: string }>;
  items: RailPerspective[];
  showTitles: boolean;
  shortcuts: Record<string, string>;
  onSelect: (id: ActivePerspective) => void;
  onReveal: (id: ActivePerspective) => void;
  onEdit: (id: ActivePerspective) => void;
  onUnfavorite: (id: ActivePerspective) => void;
  onOpenList: () => void;
  onOpenSettings: () => void;
  onDelete: (id: string) => void;
  onReorder: (fromId: ActivePerspective, toId: ActivePerspective) => void;
  onDropInbox?: (ids: string[]) => void;
}) {
  const [inboxHover, setInboxHover] = useState(false);
  const [dragId, setDragId] = useState<ActivePerspective | null>(null);
  const [dropId, setDropId] = useState<ActivePerspective | null>(null);
  const draggingRef = useRef(false);

  return (
    <View style={styles.perspectiveRail}>
      <ScrollView style={styles.perspectiveRailList} showsVerticalScrollIndicator={false} contentContainerStyle={styles.perspectiveRailScroll}>
        {items.map((item) => {
          const selected = current === item.id;
          const accent = item.custom?.color ?? item.color ?? palette.purpleDark;
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
          const acceptsInboxDrop = item.id === "inbox" || !!item.custom?.rules.some((rule) => rule.enabled !== false && rule.kind === "inInbox");
          const dragHandlers = Platform.OS === "web" ? {
            draggable: true,
            onDragStart: (event: { dataTransfer?: { setData?: (type: string, value: string) => void; effectAllowed?: string } }) => {
              draggingRef.current = true;
              setDragId(item.id);
              setPerspectiveDragData(event, item.id);
            },
            onDragOver: (event: { preventDefault?: () => void; dataTransfer?: { dropEffect?: string } }) => {
              if (acceptsInboxDrop) {
                allowTaskDrop(event);
                setInboxHover(true);
              }
              allowPerspectiveDrop(event);
              setDropId(item.id);
            },
            onDragLeave: () => {
              setInboxHover(false);
              setDropId((currentId) => currentId === item.id ? null : currentId);
            },
            onDrop: (event: { preventDefault?: () => void; dataTransfer?: { getData: (type: string) => string } }) => {
              event.preventDefault?.();
              setInboxHover(false);
              const taskIds = getTaskDragData(event);
              if (taskIds?.length && acceptsInboxDrop) {
                setDragId(null);
                setDropId(null);
                onDropInbox?.(taskIds);
                return;
              }
              const fromId = getPerspectiveDragData(event) as ActivePerspective | null;
              setDragId(null);
              setDropId(null);
              if (fromId && fromId !== item.id) onReorder(fromId, item.id);
              requestAnimationFrame(() => { draggingRef.current = false; });
            },
            onDragEnd: () => {
              setDragId(null);
              setDropId(null);
              setInboxHover(false);
              requestAnimationFrame(() => { draggingRef.current = false; });
            },
          } : (acceptsInboxDrop ? {
            onDragOver: (event: { preventDefault?: () => void; dataTransfer?: { dropEffect?: string } }) => {
              allowTaskDrop(event);
              setInboxHover(true);
            },
            onDragLeave: () => setInboxHover(false),
            onDrop: (event: { preventDefault?: () => void; dataTransfer?: { getData: (type: string) => string } }) => {
              event.preventDefault?.();
              setInboxHover(false);
              const ids = getTaskDragData(event);
              if (ids?.length) onDropInbox?.(ids);
            },
          } : {});
          return (
            <View
              key={item.id}
              collapsable={false}
              style={dragId === item.id ? { opacity: 0.45 } : undefined}
              {...(dragHandlers as object)}
            >
            <ContextMenuPressable
              items={menuItems}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityHint={formatShortcut(shortcuts[item.id])}
              onPress={() => {
                if (draggingRef.current) return;
                onSelect(item.id);
              }}
              style={({ pressed }) => [
                styles.perspectiveItem,
                selected && (item.custom ? { backgroundColor: `${accent}20` } : styles.perspectiveItemSelected),
                acceptsInboxDrop && inboxHover && styles.sidebarRowDrop,
                dropId === item.id && dragId !== item.id && styles.perspectiveItemDrop,
                pressed && styles.pressed,
              ]}
              {...({ onDoubleClick: () => onReveal(item.id) } as object)}
            >
              <View>
                <Icon name={item.icon as IconName} size={24} color={accent} />
                {!!badges[item.id]?.count && (
                  <View style={[styles.badge, selected && styles.badgeSelected, badges[item.id]?.color ? { backgroundColor: badges[item.id]?.color } : null]}>
                    <Text style={styles.badgeText}>{badges[item.id]?.count}</Text>
                  </View>
                )}
              </View>
              {showTitles && <Text numberOfLines={1} style={[styles.perspectiveLabel, selected && { color: accent, fontWeight: "700" }]}>{item.name}</Text>}
            </ContextMenuPressable>
            </View>
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
