import type { MenuCommand } from "./menuBar";

export type DesktopBridge = {
  onMenuCommand: (cb: (command: MenuCommand) => void) => () => void;
  setPerspectivesMenu: (items: Array<{ id: string; label: string; accelerator?: string }>) => void;
};

declare global {
  interface Window {
    omniclone?: DesktopBridge;
  }
}
