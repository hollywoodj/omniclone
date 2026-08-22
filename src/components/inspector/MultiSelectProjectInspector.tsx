import React from "react";
import { Pressable, Text, View } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { modifierLabel } from "../../shortcuts.ts";

export function MultiSelectProjectInspector({
  projectCount,
  folderCount,
  onFocus,
  onDelete,
}: {
  projectCount: number;
  folderCount: number;
  onFocus: () => void;
  onDelete: () => void;
}) {
  const count = projectCount + folderCount;
  const label = folderCount && projectCount
    ? `${projectCount} project${projectCount === 1 ? "" : "s"} and ${folderCount} folder${folderCount === 1 ? "" : "s"}`
    : folderCount
      ? `${folderCount} folder${folderCount === 1 ? "" : "s"}`
      : `${projectCount} project${projectCount === 1 ? "" : "s"}`;

  return (
    <View style={styles.inspector}>
      <View style={styles.inspectorTabs}>
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabText}>Selection</Text></View>
        </View>
      </View>
      <View style={styles.multiSelectBody}>
        <Text style={styles.multiSelectCount}>{count}</Text>
        <Text style={styles.multiSelectLabel}>{label} selected</Text>
        <Text style={styles.multiSelectHint}>{`${modifierLabel()}-click projects or folders in the sidebar to change the selection.`}</Text>
        <Pressable onPress={onFocus} style={styles.multiSelectButton}>
          <Icon name="bullseye-arrow" size={17} color={palette.purpleDark} />
          <Text style={styles.multiSelectButtonText}>Focus Selection</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Icon name="trash-can-outline" size={17} color={palette.danger} />
          <Text style={styles.deleteButtonText}>Delete {label}</Text>
        </Pressable>
      </View>
    </View>
  );
}
