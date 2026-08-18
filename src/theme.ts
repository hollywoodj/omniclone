export const lightPalette = {
  purple: "#8b4fc2",
  purpleDark: "#7836b4",
  purpleSoft: "#e4d5ef",
  purpleSelection: "#ded0eb",
  text: "#232126",
  muted: "#77747c",
  line: "#d9d7dc",
  chrome: "#e8e6ea",
  rail: "#f3f1f4",
  sidebar: "#efeff2",
  inspector: "#f6f5f7",
  canvas: "#ffffff",
  danger: "#d94b4b",
  flag: "#e2a13b",
  dueSoon: "#d4a017",
  overdue: "#d94b4b",
  surface: "#ffffff",
  groupRule: "#f5f4f6",
  rowHover: "#f4f2f6",
  heading: "#2a272c",
};

export type Palette = typeof lightPalette;
export type AppearanceMode = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

export const darkPalette: Palette = {
  purple: "#b57ae0",
  purpleDark: "#d2b3ea",
  purpleSoft: "#3d2a4e",
  purpleSelection: "#4a3560",
  text: "#f3f1f5",
  muted: "#9b979f",
  line: "#3c3940",
  chrome: "#2a272d",
  rail: "#232127",
  sidebar: "#2c2a30",
  inspector: "#26242a",
  canvas: "#1c1a1f",
  danger: "#e26b6b",
  flag: "#e2b15a",
  dueSoon: "#e0b84a",
  overdue: "#e26b6b",
  surface: "#2a272e",
  groupRule: "#161418",
  rowHover: "#332f36",
  heading: "#f0eef2",
};

export const palette: { [K in keyof Palette]: string } = Object.fromEntries(
  Object.entries(lightPalette).map(([key, hex]) => [key, `var(--oc-${key}, ${hex})`]),
) as { [K in keyof Palette]: string };

export function resolvedScheme(appearance: AppearanceMode, system?: ColorScheme | null): ColorScheme {
  if (appearance === "light" || appearance === "dark") return appearance;
  return system === "dark" ? "dark" : "light";
}

export function applyDocumentTheme(scheme: ColorScheme) {
  if (typeof document === "undefined") return;
  const colors = scheme === "dark" ? darkPalette : lightPalette;
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--oc-${key}`, value);
  }
}
