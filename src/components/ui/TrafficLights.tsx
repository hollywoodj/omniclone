import React from "react";
import { Pressable, View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";

const trafficLightColors = ["#ff5f57", "#febc2e", "#28c840"] as const;

function TrafficLight({ color, onPress, accessibilityLabel }: { color: string; onPress?: () => void; accessibilityLabel?: string }) {
  const dot = (
    <View style={[styles.trafficLight, { backgroundColor: color }]}>
      <View style={styles.trafficLightShine} />
    </View>
  );
  if (!onPress) return dot;
  return (
    <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4}>
      {dot}
    </Pressable>
  );
}

export function TrafficLights({ onClose }: { onClose?: () => void }) {
  return (
    <View style={styles.trafficLights}>
      {trafficLightColors.map((color, index) => (
        <TrafficLight key={color} color={color} onPress={index === 0 ? onClose : undefined} accessibilityLabel={index === 0 ? "Close" : undefined} />
      ))}
    </View>
  );
}
