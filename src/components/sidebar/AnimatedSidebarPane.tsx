import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";

const OPEN_MS = 380;
const CLOSE_MS = 280;
const openEase = Easing.bezier(0.22, 1, 0.36, 1);
const closeEase = Easing.bezier(0.4, 0, 0.2, 1);

export function AnimatedSidebarPane({
  open,
  width,
  children,
}: {
  open: boolean;
  width: number;
  children: React.ReactNode;
}) {
  const animatedWidth = useRef(new Animated.Value(open ? width : 0)).current;
  const openRef = useRef(open);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = open;
    animationRef.current?.stop();

    if (open && !wasOpen) {
      setRendered(true);
      animatedWidth.setValue(0);
      animationRef.current = Animated.timing(animatedWidth, {
        toValue: width,
        duration: OPEN_MS,
        easing: openEase,
        useNativeDriver: false,
      });
      animationRef.current.start();
      return;
    }

    if (!open && wasOpen) {
      animationRef.current = Animated.timing(animatedWidth, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: closeEase,
        useNativeDriver: false,
      });
      animationRef.current.start(({ finished }) => {
        if (finished) setRendered(false);
      });
      return;
    }

    if (open) animatedWidth.setValue(width);
  }, [animatedWidth, open, width]);

  if (!rendered && !open) return null;

  return (
    <Animated.View style={{ width: animatedWidth, overflow: "hidden", alignSelf: "stretch", flexShrink: 0 }}>
      <View style={[{ width, flex: 1 }, styles.desktopPane]}>{children}</View>
    </Animated.View>
  );
}
