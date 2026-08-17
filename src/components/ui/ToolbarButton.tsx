import React from "react";
import { Pressable, Text } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "./Icon";

export function ToolbarButton({ icon, label, active, onPress, disabled }: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.toolbarButton, active && styles.toolbarButtonActive, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={22} color={icon === "plus" ? palette.purpleDark : "#56535a"} />
      <Text style={styles.toolbarLabel}>{label}</Text>
    </Pressable>
  );
}
