import { useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";

export function useAppLayout() {
  const { width } = useWindowDimensions();
  const isPhone = width < 720;
  const canShowSidebar = width >= 720;
  const canShowInspector = width >= 960;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  useEffect(() => {
    if (isPhone) setInspectorOpen(false);
  }, [isPhone]);

  return {
    isPhone,
    canShowSidebar,
    canShowInspector,
    sidebarOpen,
    setSidebarOpen,
    inspectorOpen,
    setInspectorOpen,
  };
}
