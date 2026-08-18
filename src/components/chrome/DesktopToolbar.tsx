import React from "react";
import { View } from "react-native";
import { defaultToolbarButtons, type ToolbarButtonId } from "../../model";
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
  visibleButtons,
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
  visibleButtons?: ToolbarButtonId[];
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
  const visible = new Set(visibleButtons?.length ? visibleButtons : defaultToolbarButtons);
  const show = (id: ToolbarButtonId) => visible.has(id);
  return (
    <View style={styles.toolbar}>
      <TrafficLights />
      <View style={styles.toolbarLeading}>
        {show("sidebar") && <ToolbarButton icon="page-layout-sidebar-left" label="Sidebar" active={showSidebar} onPress={onToggleSidebar} />}
        {show("back") && <ToolbarButton icon="chevron-left" label="Back" disabled={!canGoBack} onPress={onBack} />}
        {show("forward") && <ToolbarButton icon="chevron-right" label="Forward" disabled={!canGoForward} onPress={onForward} />}
        {show("view") && <ToolbarButton icon="eye-outline" label="View" active={viewMenuOpen} onPress={onToggleView} />}
      </View>
      <View style={styles.toolbarCenter}>
        {show("newAction") && <ToolbarButton icon="plus" label="New Action" onPress={onNewAction} />}
        {show("quickEntry") && <ToolbarButton icon="tray-arrow-down" label="Quick Entry" onPress={onQuickEntry} />}
        {show("quickOpen") && <ToolbarButton icon="file-find-outline" label="Quick Open" onPress={onQuickOpen} />}
        {show("focus") && <ToolbarButton icon="bullseye-arrow" label="Focus" active={focused} disabled={!canFocus} onPress={onFocus} />}
      </View>
      <View style={styles.toolbarTrailing}>
        {show("settings") && <ToolbarButton icon="cog-outline" label="Settings" active={settingsOpen} onPress={onSettings} />}
        {show("search") && <ToolbarButton icon="magnify" label="Search" active={searchOpen} onPress={onToggleSearch} />}
        {show("inspect") && <ToolbarButton icon="information-outline" label="Inspect" active={showInspector} onPress={onToggleInspector} />}
      </View>
    </View>
  );
}
