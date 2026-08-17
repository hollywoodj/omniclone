import React, { useRef } from "react";
import { Platform, View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";

export function clampPane(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function PaneResizeHandle({ onDrag }: { onDrag: (delta: number) => void }) {
  const lastX = useRef<number | null>(null);
  if (Platform.OS !== "web") return <View style={styles.paneHandle} />;
  return (
    <View
      accessibilityLabel="Resize pane"
      style={[styles.paneHandle, { cursor: "col-resize" } as object]}
      {...({
        onMouseDown: (event: { clientX: number; preventDefault?: () => void }) => {
          event.preventDefault?.();
          lastX.current = event.clientX;
          const move = (next: MouseEvent) => {
            if (lastX.current == null) return;
            onDrag(next.clientX - lastX.current);
            lastX.current = next.clientX;
          };
          const up = () => {
            lastX.current = null;
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        },
      } as object)}
    />
  );
}
