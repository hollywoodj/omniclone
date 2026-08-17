const { app, BrowserWindow } = require("electron");
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

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "OmniClone",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
