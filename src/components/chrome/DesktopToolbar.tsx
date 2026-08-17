import React from "react";
import { View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";
import { ToolbarButton } from "../ui/ToolbarButton";
import { TrafficLights } from "../ui/TrafficLights";

export function DesktopToolbar({
  showSidebar,
  showInspector,
  canGoBack,
  canGoForward,
  viewMenuOpen,
  settingsOpen,
  searchOpen,
  focused,
  canFocus,
  onToggleSidebar,
  onBack,
  onForward,
  onToggleView,
  onNewAction,
  onQuickEntry,
  onQuickOpen,
  onFocus,
  onSettings,
  onToggleSearch,
  onToggleInspector,
}: {
  showSidebar: boolean;
  showInspector: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewMenuOpen: boolean;
  settingsOpen: boolean;
  searchOpen: boolean;
  focused: boolean;
  canFocus: boolean;
  onToggleSidebar: () => void;
  onBack: () => void;
  onForward: () => void;
  onToggleView: () => void;
  onNewAction: () => void;
  onQuickEntry: () => void;
  onQuickOpen: () => void;
  onFocus: () => void;
  onSettings: () => void;
  onToggleSearch: () => void;
  onToggleInspector: () => void;
}) {
  return (
    <View style={styles.toolbar}>
      <TrafficLights />
      <View style={styles.toolbarLeading}>
        <ToolbarButton icon="page-layout-sidebar-left" label="Sidebar" active={showSidebar} onPress={onToggleSidebar} />
        <ToolbarButton icon="chevron-left" label="Back" disabled={!canGoBack} onPress={onBack} />
        <ToolbarButton icon="chevron-right" label="Forward" disabled={!canGoForward} onPress={onForward} />
        <ToolbarButton icon="eye-outline" label="View" active={viewMenuOpen} onPress={onToggleView} />
      </View>
      <View style={styles.toolbarCenter}>
        <ToolbarButton icon="plus" label="New Action" onPress={onNewAction} />
        <ToolbarButton icon="tray-arrow-down" label="Quick Entry" onPress={onQuickEntry} />
        <ToolbarButton icon="file-find-outline" label="Quick Open" onPress={onQuickOpen} />
        <ToolbarButton icon="bullseye-arrow" label="Focus" active={focused} disabled={!canFocus} onPress={onFocus} />
      </View>
      <View style={styles.toolbarTrailing}>
        <ToolbarButton icon="cog-outline" label="Settings" active={settingsOpen} onPress={onSettings} />
        <ToolbarButton icon="magnify" label="Search" active={searchOpen} onPress={onToggleSearch} />
        <ToolbarButton icon="information-outline" label="Inspect" active={showInspector} onPress={onToggleInspector} />
      </View>
    </View>
  );
}
