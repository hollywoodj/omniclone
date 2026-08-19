import React from "react";
import { Pressable, View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";
import { isMacPlatform } from "../../shortcuts";

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

/**
 * macOS window buttons. The Electron build uses a normal framed window, so on
 * Windows and Linux the real minimize/maximize/close controls already sit in
 * the title bar; drawing these there gives the user two sets, one of which is
 * decorative. Render them only where they belong.
 */
export function TrafficLights({ onClose }: { onClose?: () => void }) {
  if (!isMacPlatform()) return null;
  return (
    <View style={styles.trafficLights}>
      {trafficLightColors.map((color, index) => (
        <TrafficLight key={color} color={color} onPress={index === 0 ? onClose : undefined} accessibilityLabel={index === 0 ? "Close" : undefined} />
      ))}
    </View>
  );
}
