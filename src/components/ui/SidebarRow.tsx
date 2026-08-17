import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { ContextMenuPressable, type ContextMenuItem } from "../../contextMenu";
import { appStyles as styles } from "../../styles/appStyles";

export function SidebarRow({
  selected,
  items,
  style,
  children,
  ...rest
}: Omit<React.ComponentProps<typeof Pressable>, "style"> & { selected?: boolean; items?: ContextMenuItem[]; style?: React.ComponentProps<typeof View>["style"] }) {
  const [hovered, setHovered] = useState(false);
  const rowStyle = ({ pressed }: { pressed: boolean }) => [
    styles.sidebarRow,
    selected && styles.sidebarRowSelected,
    hovered && !selected && styles.sidebarRowHover,
    pressed && styles.pressed,
    style,
  ];
  const hoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  if (items?.length) {
    return (
      <ContextMenuPressable items={items} {...hoverProps} {...rest} style={rowStyle}>
        {children}
      </ContextMenuPressable>
    );
  }
  return (
    <Pressable {...hoverProps} {...rest} style={rowStyle}>
      {children}
    </Pressable>
  );
}
