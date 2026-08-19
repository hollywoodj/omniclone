const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");

const distDir = path.join(__dirname, "..", "dist");
const isMac = process.platform === "darwin";

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    const requestedPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let filePath = path.join(distDir, requestedPath);
    if (!filePath.startsWith(distDir)) filePath = distDir;
    if (requestedPath === "/" || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, "index.html");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function send(win, command) {
  win?.webContents.send("menu-command", command);
}

function buildMenu(win, customPerspectives = []) {
  const perspectivesSubmenu = [
    // ⌃⌘P has no Windows/Linux spelling (there is no Command key), so the
    // non-Mac binding matches the Ctrl+Shift+P handled in src/hotkeys.ts.
    { label: "Show Perspectives List", accelerator: isMac ? "Control+Command+P" : "Control+Shift+P", click: () => send(win, { type: "showPerspectivesList" }) },
    { label: "Add Perspective…", click: () => send(win, { type: "addPerspective" }) },
    { type: "separator" },
    { label: "Inbox", accelerator: "CommandOrControl+1", click: () => send(win, { type: "perspective", id: "inbox" }) },
    { label: "Projects", accelerator: "CommandOrControl+2", click: () => send(win, { type: "perspective", id: "projects" }) },
    { label: "Tags", accelerator: "CommandOrControl+3", click: () => send(win, { type: "perspective", id: "tags" }) },
    { label: "Forecast", accelerator: "CommandOrControl+4", click: () => send(win, { type: "perspective", id: "forecast" }) },
    { label: "Flagged", accelerator: "CommandOrControl+5", click: () => send(win, { type: "perspective", id: "flagged" }) },
    { label: "Completed", accelerator: "CommandOrControl+6", click: () => send(win, { type: "perspective", id: "completed" }) },
    { label: "Review", accelerator: "CommandOrControl+7", click: () => send(win, { type: "perspective", id: "review" }) },
  ];
  if (customPerspectives.length) {
    perspectivesSubmenu.push({ type: "separator" });
    for (const item of customPerspectives) {
      perspectivesSubmenu.push({
        label: item.label,
        accelerator: item.accelerator,
        click: () => send(win, { type: "perspective", id: item.id }),
      });
    }
  }

  const template = [
    ...(process.platform === "darwin" ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings…", accelerator: "CommandOrControl+,", click: () => send(win, { type: "openSettings" }) },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Action", accelerator: "CommandOrControl+N", click: () => send(win, { type: "newAction" }) },
        { label: "New Project", accelerator: "Shift+CommandOrControl+N", click: () => send(win, { type: "newProject" }) },
        { label: "New Folder", accelerator: "Alt+CommandOrControl+N", click: () => send(win, { type: "newFolder" }) },
        { label: "Quick Entry", accelerator: "Control+Alt+Space", click: () => send(win, { type: "quickEntry" }) },
        { type: "separator" },
        { label: "Quick Open…", accelerator: "CommandOrControl+O", click: () => send(win, { type: "quickOpen" }) },
        { label: "Import from OmniFocus…", click: () => send(win, { type: "importOmniFocus" }) },
        { type: "separator" },
        { label: "Export as TaskPaper…", click: () => send(win, { type: "exportTaskPaper" }) },
        { label: "Print…", accelerator: "CommandOrControl+P", click: () => send(win, { type: "print" }) },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CommandOrControl+Z", click: () => send(win, { type: "undo" }) },
        { label: "Redo", accelerator: "Shift+CommandOrControl+Z", click: () => send(win, { type: "redo" }) },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        { label: "Copy as TaskPaper", accelerator: "Shift+CommandOrControl+C", click: () => send(win, { type: "copyTaskPaper" }) },
        { label: "Paste TaskPaper", click: () => send(win, { type: "pasteTaskPaper" }) },
        { role: "delete" },
        { type: "separator" },
        { label: "Select All", accelerator: "CommandOrControl+A", click: () => send(win, { type: "selectAll" }) },
        { label: "Duplicate", accelerator: "CommandOrControl+D", click: () => send(win, { type: "duplicate" }) },
        { type: "separator" },
        { label: "Find", accelerator: "CommandOrControl+F", click: () => send(win, { type: "toggleSearch" }) },
        { label: "Find Next", accelerator: "CommandOrControl+G", click: () => send(win, { type: "findNext" }) },
        { label: "Find Previous", accelerator: "Shift+CommandOrControl+G", click: () => send(win, { type: "findPrevious" }) },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Show View Options", accelerator: "Shift+CommandOrControl+V", click: () => send(win, { type: "toggleViewMenu" }) },
        { type: "separator" },
        { label: "Show Sidebar", accelerator: "Alt+CommandOrControl+S", click: () => send(win, { type: "toggleSidebar" }) },
        { label: "Show Inspector", accelerator: "Alt+CommandOrControl+I", click: () => send(win, { type: "toggleInspector" }) },
        { label: "Show Perspectives Bar", accelerator: "Alt+CommandOrControl+P", click: () => send(win, { type: "togglePerspectivesBar" }) },
        { type: "separator" },
        { label: "Go Back", accelerator: "CommandOrControl+[", click: () => send(win, { type: "goBack" }) },
        { label: "Go Forward", accelerator: "CommandOrControl+]", click: () => send(win, { type: "goForward" }) },
        { type: "separator" },
        { label: "Expand All", accelerator: "Alt+CommandOrControl+9", click: () => send(win, { type: "expandAll" }) },
        { label: "Collapse All", accelerator: "Alt+CommandOrControl+0", click: () => send(win, { type: "collapseAll" }) },
        { type: "separator" },
        { label: "Customize Toolbar…", click: () => send(win, { type: "customizeToolbar" }) },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Organize",
      submenu: [
        { label: "Clean Up", accelerator: "CommandOrControl+K", click: () => send(win, { type: "cleanUp" }) },
        { type: "separator" },
        { label: "Indent", click: () => send(win, { type: "indent" }) },
        { label: "Outdent", click: () => send(win, { type: "outdent" }) },
        { label: "Convert to Project", click: () => send(win, { type: "convertToProject" }) },
        { label: "Duplicate Project", click: () => send(win, { type: "duplicateProject" }) },
        { label: "Show in Projects", click: () => send(win, { type: "revealInProjects" }) },
        { label: "Complete and Await Reply", click: () => send(win, { type: "awaitReply" }) },
        { label: "Move Up", accelerator: "Alt+CommandOrControl+Up", click: () => send(win, { type: "moveRow", direction: "up" }) },
        { label: "Move Down", accelerator: "Alt+CommandOrControl+Down", click: () => send(win, { type: "moveRow", direction: "down" }) },
        { type: "separator" },
        { label: "Expand All", accelerator: "Alt+CommandOrControl+9", click: () => send(win, { type: "expandAll" }) },
        { label: "Collapse All", accelerator: "Alt+CommandOrControl+0", click: () => send(win, { type: "collapseAll" }) },
      ],
    },
    { label: "Perspectives", submenu: perspectivesSubmenu },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "OmniFocus Perspectives Documentation",
          click: () => shell.openExternal("https://support.omnigroup.com/documentation/omnifocus/universal/4.8.11/en/custom-perspectives/"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let mainWindow = null;
let pendingOpenUrl = process.argv.find((item) => String(item).startsWith("omniclone:")) ?? null;

function sendOpenUrl(url) {
  if (mainWindow) mainWindow.webContents.send("open-url", url);
  else pendingOpenUrl = url;
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("omniclone", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("omniclone");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((item) => String(item).startsWith("omniclone:"));
    if (url) sendOpenUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  sendOpenUrl(url);
});

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "OmniClone",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  buildMenu(win);
  ipcMain.removeAllListeners("set-perspectives-menu");
  ipcMain.on("set-perspectives-menu", (_event, items) => buildMenu(win, items));
  ipcMain.removeAllListeners("set-window-title");
  ipcMain.on("set-window-title", (_event, title) => {
    if (typeof title === "string" && title.trim()) win.setTitle(title);
  });

  if (process.env.ELECTRON_START_URL) {
    await win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    await startStaticServer(4321);
    await win.loadURL("http://127.0.0.1:4321");
  }

  if (pendingOpenUrl) {
    sendOpenUrl(pendingOpenUrl);
    pendingOpenUrl = null;
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
