import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { palette } from "./model";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

type ContextMenuContextValue = {
  openContextMenu: (position: { x: number; y: number }, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
};

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 36;
const MENU_PADDING = 8;

function Icon({ name, size = 17, color = "#56535a" }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const { width, height } = useWindowDimensions();

  const closeContextMenu = useCallback(() => setMenu(null), []);

  const openContextMenu = useCallback((position: { x: number; y: number }, items: ContextMenuItem[]) => {
    if (!items.length) return;
    setMenu({ x: position.x, y: position.y, items });
  }, []);

  const menuHeight = menu ? MENU_PADDING * 2 + menu.items.length * MENU_ITEM_HEIGHT : 0;
  const left = menu ? Math.max(8, Math.min(menu.x, width - MENU_WIDTH - 8)) : 0;
  const top = menu ? Math.max(8, Math.min(menu.y, height - menuHeight - 8)) : 0;

  const value = useMemo(() => ({ openContextMenu, closeContextMenu }), [closeContextMenu, openContextMenu]);

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {menu && (
        <>
          <Pressable
            accessibilityLabel="Close context menu"
            onPress={closeContextMenu}
            style={styles.dismissLayer}
          />
          <View style={[styles.menu, { left, top, width: MENU_WIDTH }]}>
            {menu.items.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="menuitem"
                disabled={item.disabled}
                onPress={() => {
                  closeContextMenu();
                  item.onPress();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  index > 0 && styles.menuItemBorder,
                  item.disabled && styles.menuItemDisabled,
                  pressed && !item.disabled && styles.menuItemPressed,
                ]}
              >
                {item.icon && (
                  <Icon
                    name={item.icon}
                    color={item.destructive ? palette.danger : item.disabled ? "#b5b2b8" : "#56535a"}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.menuItemText,
                    item.destructive && styles.menuItemTextDestructive,
                    item.disabled && styles.menuItemTextDisabled,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) throw new Error("useContextMenu must be used within ContextMenuProvider");
  return context;
}

type OpenMenuOptions = {
  items: ContextMenuItem[];
  event?: { nativeEvent: { pageX?: number; pageY?: number; locationX?: number; locationY?: number } };
  fallbackPosition?: { x: number; y: number };
};

export function useContextMenuTrigger() {
  const { openContextMenu } = useContextMenu();

  const openMenu = useCallback((options: OpenMenuOptions) => {
    const { items, event, fallbackPosition } = options;
    const x = event?.nativeEvent.pageX ?? fallbackPosition?.x ?? 120;
    const y = event?.nativeEvent.pageY ?? fallbackPosition?.y ?? 120;
    openContextMenu({ x, y }, items);
  }, [openContextMenu]);

  const contextMenuProps = useCallback((items: ContextMenuItem[], fallbackPosition?: { x: number; y: number }) => ({
    onContextMenu: Platform.OS === "web"
      ? (event: { preventDefault: () => void; nativeEvent: { pageX?: number; pageY?: number } }) => {
          event.preventDefault();
          openMenu({ items, event });
        }
      : undefined,
    onLongPress: () => openMenu({ items, fallbackPosition }),
  }), [openMenu]);

  return { openMenu, contextMenuProps };
}

const styles = StyleSheet.create({
  dismissLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
  },
  menu: {
    position: "absolute",
    zIndex: 201,
    paddingVertical: MENU_PADDING,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bcb9bf",
    backgroundColor: "#fbfafc",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  menuItem: {
    minHeight: MENU_ITEM_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menuItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  menuItemPressed: {
    backgroundColor: "rgba(0,0,0,.04)",
  },
  menuItemDisabled: {
    opacity: 0.45,
  },
  menuItemText: {
    flex: 1,
    fontSize: 12,
    color: "#3a373d",
  },
  menuItemTextDestructive: {
    color: palette.danger,
  },
  menuItemTextDisabled: {
    color: "#8b888f",
  },
});
