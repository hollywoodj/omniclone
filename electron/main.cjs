const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");

const distDir = path.join(__dirname, "..", "dist");

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
        { label: "Show Perspectives List", accelerator: "Control+Command+P", click: () => send(win, { type: "showPerspectivesList" }) },
    { label: "Add Perspective…", click: () => send(win, { type: "addPerspective" }) },
    { type: "separator" },
    { label: "Inbox", accelerator: "CommandOrControl+1", click: () => send(win, { type: "perspective", id: "inbox" }) },
    { label: "Projects", accelerator: "CommandOrControl+2", click: () => send(win, { type: "perspective", id: "projects" }) },
    { label: "Tags", accelerator: "CommandOrControl+3", click: () => send(win, { type: "perspective", id: "tags" }) },
    { label: "Forecast", accelerator: "CommandOrControl+4", click: () => send(win, { type: "perspective", id: "forecast" }) },
    { label: "Flagged", accelerator: "CommandOrControl+5", click: () => send(win, { type: "perspective", id: "flagged" }) },
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
        { label: "Quick Entry", click: () => send(win, { type: "quickEntry" }) },
        { type: "separator" },
        { label: "Quick Open…", accelerator: "CommandOrControl+O", click: () => send(win, { type: "quickOpen" }) },
        { label: "Import from OmniFocus…", click: () => send(win, { type: "importOmniFocus" }) },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { label: "Select All", accelerator: "CommandOrControl+A", click: () => send(win, { type: "selectAll" }) },
        { type: "separator" },
        { label: "Find", accelerator: "CommandOrControl+F", click: () => send(win, { type: "toggleSearch" }) },
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
        { role: "togglefullscreen" },
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
  buildMenu(win);
  ipcMain.removeAllListeners("set-perspectives-menu");
  ipcMain.on("set-perspectives-menu", (_event, items) => buildMenu(win, items));

  if (process.env.ELECTRON_START_URL) {
    await win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    await startStaticServer(4321);
    await win.loadURL("http://127.0.0.1:4321");
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
