import React from "react";
import { Pressable, View } from "react-native";
import { palette } from "../../model";
import type { DueUrgency } from "../../dates";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "./Icon";

function statusRingColor(completed: boolean, flagged: boolean, urgency: DueUrgency, fallback?: string, blocked?: boolean, hold?: boolean, dropped?: boolean) {
  if (completed) return fallback ?? palette.purple;
  if (dropped) return "#9aa0a6";
  if (hold) return "#c9a227";
  if (blocked) return "#b4b1b8";
  if (urgency === "overdue") return palette.overdue;
  if (urgency === "dueSoon") return palette.dueSoon;
  if (flagged) return palette.flag;
  return fallback ?? palette.purple;
}

export function StatusRing({ completed, flagged = false, urgency = "none", color, onPress, size = 19, blocked = false, hold = false, dropped = false }: {
  completed: boolean;
  flagged?: boolean;
  urgency?: DueUrgency;
  color?: string;
  onPress: () => void;
  size?: number;
  blocked?: boolean;
  hold?: boolean;
  dropped?: boolean;
}) {
  const ringColor = statusRingColor(completed, flagged, urgency, color, blocked, hold, dropped);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed }}
      onPress={onPress}
      hitSlop={8}
      {...({ dataSet: { noMarquee: "true" } } as object)}
      style={[
        styles.statusRing,
        { width: size, height: size, borderRadius: size / 2, borderColor: ringColor },
        (blocked || hold) && !completed ? { borderStyle: "dashed" } : null,
        completed && { backgroundColor: ringColor },
      ]}
    >
      {completed && <Icon name="check" size={Math.max(10, size - 7)} color="#fff" />}
      {!completed && dropped && <Icon name="close" size={Math.max(10, size - 8)} color="#9aa0a6" />}
      {!completed && !dropped && hold && <Icon name="pause" size={Math.max(9, size - 9)} color="#c9a227" />}
      {!completed && !dropped && !hold && flagged && (
        <View style={styles.statusFlag} pointerEvents="none">
          <Icon name="flag" size={Math.max(8, size - 11)} color={palette.flag} />
        </View>
      )}
    </Pressable>
  );
}
