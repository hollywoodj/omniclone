import packageJson from "../package.json";

/** Installed app version (Electron) or package.json version in dev/web. */
export async function getAppVersion(): Promise<string> {
  try {
    if (typeof window !== "undefined" && window.omniclone?.getVersion) {
      return await window.omniclone.getVersion();
    }
  } catch {
    // Fall back when the desktop bridge is unavailable.
  }
  return packageJson.version;
}
