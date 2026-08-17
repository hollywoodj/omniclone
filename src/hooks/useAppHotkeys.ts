import { useEffect } from "react";
import { Platform } from "react-native";
import "../desktopBridge";
import { nativeMenuCommandTypes, type AppCommand } from "../commands/dispatch";
import { matchOmniFocusHotkey } from "../hotkeys";
import type { CustomPerspective } from "../model";
import { toElectronAccelerator } from "../shortcuts";

export function hasNativeMenu() {
  return typeof window !== "undefined" && !!window.omniclone;
}

export function useAppHotkeys(options: {
  enabled: boolean;
  modalOpen: boolean;
  pendingDeleteOpen: boolean;
  perspectiveShortcuts: Record<string, string>;
  shortcutRecordingId: string | null;
  customPerspectives: CustomPerspective[];
  onCommand: (command: AppCommand) => void;
}) {
  const nativeMenu = hasNativeMenu();

  useEffect(() => {
    if (!options.enabled || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchOmniFocusHotkey(event, {
        deleteDialogOpen: options.pendingDeleteOpen,
        perspectiveShortcuts: options.perspectiveShortcuts,
        shortcutCapture: !!options.shortcutRecordingId,
      });
      if (!action) return;
      if (nativeMenu && nativeMenuCommandTypes.has(action.type)) return;
      if (options.modalOpen && action.type !== "cancel" && action.type !== "confirmDelete") return;
      event.preventDefault();
      options.onCommand(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    nativeMenu,
    options.enabled,
    options.modalOpen,
    options.onCommand,
    options.pendingDeleteOpen,
    options.perspectiveShortcuts,
    options.shortcutRecordingId,
  ]);

  useEffect(() => {
    if (!nativeMenu || typeof window === "undefined") return;
    window.omniclone?.setPerspectivesMenu(options.customPerspectives.map((item) => ({
      id: `custom:${item.id}`,
      label: item.name,
      accelerator: toElectronAccelerator(options.perspectiveShortcuts[`custom:${item.id}`]),
    })));
  }, [nativeMenu, options.customPerspectives, options.perspectiveShortcuts]);

  useEffect(() => {
    if (!nativeMenu || typeof window === "undefined") return;
    return window.omniclone?.onMenuCommand((command) => options.onCommand(command));
  }, [nativeMenu, options.onCommand]);

  return nativeMenu;
}
