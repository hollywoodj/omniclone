import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { palette } from "../../model";

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 20, color = palette.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
