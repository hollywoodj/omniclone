import React, { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { ContextMenuPressable, type ContextMenuItems } from "../../contextMenu";
import { allowTaskDrop, getTaskDragData } from "../../lib/dnd";
import { appStyles as styles } from "../../styles/appStyles";

export function SidebarRow({
  selected,
  items,
  style,
  children,
  droppable,
  onDropTasks,
  ...rest
}: Omit<React.ComponentProps<typeof Pressable>, "style"> & {
  selected?: boolean;
  items?: ContextMenuItems;
  style?: React.ComponentProps<typeof View>["style"];
  droppable?: boolean;
  onDropTasks?: (ids: string[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const rowStyle = ({ pressed }: { pressed: boolean }) => [
    styles.sidebarRow,
    selected && styles.sidebarRowSelected,
    hovered && !selected && styles.sidebarRowHover,
    dropHover && styles.sidebarRowDrop,
    pressed && styles.pressed,
    style,
  ];
  const hoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  const dropProps = droppable && Platform.OS === "web" ? {
    onDragOver: (event: { preventDefault?: () => void; dataTransfer?: { dropEffect?: string } }) => {
      allowTaskDrop(event);
      setDropHover(true);
    },
    onDragLeave: () => setDropHover(false),
    onDrop: (event: { preventDefault?: () => void; dataTransfer?: { getData: (type: string) => string; types?: ArrayLike<string> } }) => {
      event.preventDefault?.();
      setDropHover(false);
      const ids = getTaskDragData(event);
      if (ids?.length) onDropTasks?.(ids);
    },
  } : {};
  if (typeof items === "function" || items?.length) {
    return (
      <ContextMenuPressable items={items} {...hoverProps} {...dropProps} {...rest} style={rowStyle}>
        {children}
      </ContextMenuPressable>
    );
  }
  return (
    <Pressable {...hoverProps} {...dropProps} {...rest} style={rowStyle}>
      {children}
    </Pressable>
  );
}
