import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { palette } from "./model";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onPress?: () => void;
};

export type ContextMenuItems = ContextMenuItem[] | (() => ContextMenuItem[]);

function resolveMenuItems(items: ContextMenuItems) {
  return typeof items === "function" ? items() : items;
}

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

const MENU_WIDTH = 248;
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
            {menu.items.map((item, index) => item.separator ? (
              <View key={item.id} style={styles.separator} />
            ) : (
              <Pressable
                key={item.id}
                accessibilityRole="menuitem"
                disabled={item.disabled}
                onPress={() => {
                  closeContextMenu();
                  item.onPress?.();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  index > 0 && !menu.items[index - 1]?.separator && styles.menuItemBorder,
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
                {!!item.shortcut && <Text style={styles.menuItemShortcut}>{item.shortcut}</Text>}
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

type PointerLike = {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  pageX?: number;
  pageY?: number;
  clientX?: number;
  clientY?: number;
  nativeEvent?: PointerLike;
};

type OpenMenuOptions = {
  items: ContextMenuItems;
  event?: PointerLike;
  fallbackPosition?: { x: number; y: number };
};

function menuPosition(event?: PointerLike, fallbackPosition?: { x: number; y: number }) {
  const native = event?.nativeEvent ?? event;
  return {
    x: native?.pageX ?? event?.pageX ?? native?.clientX ?? fallbackPosition?.x ?? 120,
    y: native?.pageY ?? event?.pageY ?? native?.clientY ?? fallbackPosition?.y ?? 120,
  };
}

function asDomElement(node: unknown): HTMLElement | null {
  if (!node || typeof node !== "object") return null;
  if (typeof (node as HTMLElement).addEventListener === "function") return node as HTMLElement;
  const nested = node as { getNode?: () => unknown; _nativeNode?: unknown };
  if (nested._nativeNode) return asDomElement(nested._nativeNode);
  if (typeof nested.getNode === "function") return asDomElement(nested.getNode());
  return null;
}

export function useContextMenuTrigger() {
  const { openContextMenu } = useContextMenu();

  const openMenu = useCallback((options: OpenMenuOptions) => {
    const items = resolveMenuItems(options.items);
    if (!items.length) return;
    options.event?.preventDefault?.();
    options.event?.stopPropagation?.();
    options.event?.nativeEvent?.preventDefault?.();
    options.event?.nativeEvent?.stopPropagation?.();
    openContextMenu(menuPosition(options.event, options.fallbackPosition), items);
  }, [openContextMenu]);

  const contextMenuProps = useCallback((items: ContextMenuItems, fallbackPosition?: { x: number; y: number }) => ({
    onContextMenu: (event: PointerLike) => openMenu({ items, event, fallbackPosition }),
    onLongPress: () => openMenu({ items, fallbackPosition }),
  }), [openMenu]);

  return { openMenu, contextMenuProps };
}

type ContextMenuPressableProps = Omit<React.ComponentProps<typeof Pressable>, "onLongPress" | "onContextMenu"> & {
  items: ContextMenuItems;
  fallbackPosition?: { x: number; y: number };
};

export function ContextMenuPressable({ items, fallbackPosition, children, ...rest }: ContextMenuPressableProps) {
  const { openMenu } = useContextMenuTrigger();
  const hostRef = useRef<View>(null);
  const itemsRef = useRef(items);
  const fallbackRef = useRef(fallbackPosition);
  itemsRef.current = items;
  fallbackRef.current = fallbackPosition;

  useEffect(() => {
    const node = asDomElement(hostRef.current);
    if (!node) return;
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu({
        items: itemsRef.current,
        event: { pageX: event.pageX, pageY: event.pageY },
        fallbackPosition: fallbackRef.current,
      });
    };
    node.addEventListener("contextmenu", onContextMenu, true);
    return () => node.removeEventListener("contextmenu", onContextMenu, true);
  }, [openMenu]);

  return (
    <Pressable
      {...rest}
      ref={hostRef}
      collapsable={false}
      onLongPress={() => openMenu({ items: itemsRef.current, fallbackPosition: fallbackRef.current })}
      {...({
        onContextMenu: (event: PointerLike) => openMenu({ items: itemsRef.current, event, fallbackPosition: fallbackRef.current }),
      } as object)}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dismissLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
  },
  menu: {
    position: "absolute",
    zIndex: 201,
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bcb9bf",
    backgroundColor: "#fbfafc",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  menuItem: {
    minHeight: MENU_ITEM_HEIGHT,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 6,
  },
  menuItemBorder: {
    borderTopWidth: 0,
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
  menuItemShortcut: {
    fontSize: 11,
    color: "#8b888f",
    fontVariant: ["tabular-nums"],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 5,
    marginHorizontal: 10,
    backgroundColor: palette.line,
  },
});
