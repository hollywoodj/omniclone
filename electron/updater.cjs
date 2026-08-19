// Auto-update against the GitHub Releases feed published by
// .github/workflows/release.yml.
//
// Nothing happens in development: an unpackaged app has no installer for
// Squirrel/NSIS to replace, and checkForUpdates would only log a confusing
// "cannot find latest.yml" every time you run electron:dev.
const { app } = require("electron");

function log(message) {
  console.log(`[updater] ${message}`);
}

function initAutoUpdate() {
  if (!app.isPackaged) {
    log("skipped — development build");
    return;
  }

  // macOS refuses to swap an unsigned bundle (Squirrel.Mac verifies the code
  // signature of the running app), so checking there only produces noise until
  // the build is signed with a Developer ID.
  if (process.platform === "darwin") {
    log("skipped — macOS auto-update needs a signed build");
    return;
  }

  const { autoUpdater } = require("electron-updater");

  autoUpdater.autoDownload = true;
  // Applied on quit rather than mid-session: OmniClone holds unsaved state in
  // the renderer, and a forced relaunch would drop it.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

  autoUpdater.on("update-available", (info) => log(`update available: ${info.version}`));
  autoUpdater.on("update-not-available", () => log("already up to date"));
  autoUpdater.on("download-progress", (p) => log(`downloading: ${Math.round(p.percent)}%`));
  autoUpdater.on("update-downloaded", (info) => {
    log(`update ${info.version} staged — it installs when you quit`);
  });

  // A failed check must never block startup: no network, a rate limit, or a
  // release still uploading are all normal and self-correcting.
  autoUpdater.on("error", (err) => log(`check failed: ${err?.message ?? err}`));

  autoUpdater.checkForUpdates().catch((err) => log(`check failed: ${err?.message ?? err}`));
}

module.exports = { initAutoUpdate };
