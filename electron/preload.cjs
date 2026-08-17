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
});
