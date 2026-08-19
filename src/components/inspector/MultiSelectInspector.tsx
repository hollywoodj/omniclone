import React from "react";
import { Pressable, Text, View } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { shortcutLabel, modifierLabel } from "../../shortcuts.ts";

export function MultiSelectInspector({
  count,
  allCompleted,
  allFlagged,
  onToggle,
  onToggleFlag,
  onDelete,
}: {
  count: number;
  allCompleted: boolean;
  allFlagged: boolean;
  onToggle: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.inspector}>
      <View style={styles.inspectorTabs}>
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabText}>Selection</Text></View>
        </View>
      </View>
      <View style={styles.multiSelectBody}>
        <Text style={styles.multiSelectCount}>{count}</Text>
        <Text style={styles.multiSelectLabel}>actions selected</Text>
        <Text style={styles.multiSelectHint}>{`Shift-click, ${modifierLabel()}-click, drag, or ${shortcutLabel("⌘A")} to change the selection.`}</Text>
        <Pressable onPress={onToggle} style={styles.multiSelectButton}>
          <Icon name={allCompleted ? "circle-outline" : "check-circle-outline"} size={17} color={palette.purpleDark} />
          <Text style={styles.multiSelectButtonText}>{allCompleted ? "Mark Incomplete" : "Mark Complete"}</Text>
        </Pressable>
        <Pressable onPress={onToggleFlag} style={styles.multiSelectButton}>
          <Icon name={allFlagged ? "flag-off-outline" : "flag-outline"} size={17} color={allFlagged ? palette.muted : palette.flag} />
          <Text style={styles.multiSelectButtonText}>{allFlagged ? "Remove Flags" : "Flag"}</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Icon name="trash-can-outline" size={17} color={palette.danger} />
          <Text style={styles.deleteButtonText}>Delete {count} Actions</Text>
        </Pressable>
      </View>
    </View>
  );
}
