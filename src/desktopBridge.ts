import type { MenuCommand } from "./menuBar";

export type DesktopBridge = {
  onMenuCommand: (cb: (command: MenuCommand) => void) => () => void;
  setPerspectivesMenu: (items: Array<{ id: string; label: string; accelerator?: string }>) => void;
  setWindowTitle?: (title: string) => void;
  onOpenUrl?: (cb: (url: string) => void) => () => void;
  openExternal?: (url: string) => void;
  onFlushRequest?: (cb: () => void | Promise<void>) => () => void;
  getVersion?: () => Promise<string>;
};

declare global {
  interface Window {
    omniclone?: DesktopBridge;
  }
}
