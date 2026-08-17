import { useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";

export function useAppLayout() {
  const { width } = useWindowDimensions();
  const isPhone = width < 720;
  const canShowSidebar = width >= 850;
  const canShowInspector = width >= 960;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  useEffect(() => {
    if (!canShowSidebar) setSidebarOpen(false);
  }, [canShowSidebar]);

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
