import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { ProjectType } from "../../outline";

export const projectTypeIconColor = "#5eb0e8";

function Dot({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}

export function ProjectTypeIcon({
  type = "parallel",
  size = 16,
  color = projectTypeIconColor,
  style,
  dimmed = false,
}: {
  type?: ProjectType;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  dimmed?: boolean;
}) {
  const dotColor = dimmed ? "#b0b0b5" : color;
  const dot = Math.max(2.5, size * 0.22);
  const gap = Math.max(1.5, size * 0.12);

  if (type === "sequential") {
    return (
      <View style={[{ width: size, height: size, justifyContent: "center", alignItems: "center" }, style]}>
        <View style={{ width: dot * 3 + gap * 2, height: dot * 3 + gap * 2, transform: [{ rotate: "-45deg" }] }}>
          <View style={{ position: "absolute", left: 0, top: 0 }}>
            <Dot size={dot} color={dotColor} />
          </View>
          <View style={{ position: "absolute", left: dot + gap, top: dot + gap }}>
            <Dot size={dot} color={dotColor} />
          </View>
          <View style={{ position: "absolute", left: (dot + gap) * 2, top: (dot + gap) * 2 }}>
            <Dot size={dot} color={dotColor} />
          </View>
        </View>
      </View>
    );
  }

  if (type === "singleActions") {
    const arm = dot * 2 + gap;
    return (
      <View style={[{ width: size, height: size, justifyContent: "center", alignItems: "center" }, style]}>
        <View style={{ width: arm, height: arm, justifyContent: "center", alignItems: "center" }}>
          <View style={{ position: "absolute", top: 0, left: (arm - dot) / 2 }}>
            <Dot size={dot} color={dotColor} />
          </View>
          <View style={{ position: "absolute", bottom: 0, left: (arm - dot) / 2 }}>
            <Dot size={dot} color={dotColor} />
          </View>
          <View style={{ position: "absolute", left: 0, top: (arm - dot) / 2 }}>
            <Dot size={dot} color={dotColor} />
          </View>
          <View style={{ position: "absolute", right: 0, top: (arm - dot) / 2 }}>
            <Dot size={dot} color={dotColor} />
          </View>
          <Dot size={dot} color={dotColor} />
        </View>
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, justifyContent: "center", alignItems: "center" }, style]}>
      <View style={{ gap, flexDirection: "row" }}>
        <View style={{ gap }}>
          <Dot size={dot} color={dotColor} />
          <Dot size={dot} color={dotColor} />
        </View>
        <View style={{ gap }}>
          <Dot size={dot} color={dotColor} />
          <Dot size={dot} color={dotColor} />
        </View>
      </View>
    </View>
  );
}
