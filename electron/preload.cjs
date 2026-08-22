const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("omniclone", {
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("menu-command", listener);
    return () => ipcRenderer.removeListener("menu-command", listener);
  },
  setPerspectivesMenu: (items) => {
    ipcRenderer.send("set-perspectives-menu", items);
  },
  setWindowTitle: (title) => {
    ipcRenderer.send("set-window-title", title);
  },
  onOpenUrl: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("open-url", listener);
    return () => ipcRenderer.removeListener("open-url", listener);
  },
  openExternal: (url) => {
    ipcRenderer.send("open-external", url);
  },
  onFlushRequest: (callback) => {
    const listener = () => {
      Promise.resolve(callback()).finally(() => {
        ipcRenderer.send("flush-complete");
      });
    };
    ipcRenderer.on("request-flush", listener);
    return () => ipcRenderer.removeListener("request-flush", listener);
  },
});
