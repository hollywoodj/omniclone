import React from "react";
import { Text, View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function EmptyInspector({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.inspector}>
      <View style={styles.inspectorTabs}>
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabText}>Inspector</Text></View>
        </View>
      </View>
      <View style={styles.emptyInspector}>
        <View style={styles.emptyCheck}><Icon name="information-outline" size={26} color="#aaa7ad" /></View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{detail}</Text>
      </View>
    </View>
  );
}
