import type { IconName } from "../components/ui/Icon";

export type PerspectiveIconName = IconName;

export type PerspectiveIconCategory = {
  id: string;
  label: string;
  icons: readonly PerspectiveIconName[];
};

export const perspectiveIconCategories: readonly PerspectiveIconCategory[] = [
  {
    id: "essentials",
    label: "Essentials",
    icons: [
      "star-four-points-outline",
      "star-outline",
      "flag-outline",
      "flag",
      "target",
      "bullseye-arrow",
      "check-circle-outline",
      "check",
      "bookmark-outline",
      "tag-outline",
      "inbox-outline",
      "inbox-arrow-down-outline",
      "clipboard-text-outline",
      "magnify",
      "lightbulb-outline",
      "alert-circle-outline",
      "bell-outline",
      "lock-outline",
      "key-outline",
      "shield-outline",
    ],
  },
  {
    id: "arrows",
    label: "Arrows",
    icons: [
      "arrow-up",
      "arrow-down",
      "arrow-left",
      "arrow-right",
      "arrow-up-down",
      "arrow-left-right",
      "autorenew",
      "sync",
      "download-outline",
      "upload-outline",
      "play-circle-outline",
      "power",
    ],
  },
  {
    id: "work",
    label: "Work",
    icons: [
      "briefcase-outline",
      "office-building",
      "domain",
      "desk",
      "laptop",
      "monitor",
      "printer-outline",
      "file-document-outline",
      "chart-bar",
      "chart-line",
      "chart-pie",
      "database-outline",
      "code-tags",
      "web",
      "console",
      "cog-outline",
      "tools",
      "wrench-outline",
      "hammer-screwdriver",
      "pencil-outline",
      "content-copy",
    ],
  },
  {
    id: "home",
    label: "Home & Life",
    icons: [
      "home-outline",
      "bed-outline",
      "sofa-outline",
      "account-outline",
      "account-group-outline",
      "baby-carriage",
      "heart-outline",
      "hand-heart-outline",
      "gift-outline",
      "cake-variant-outline",
      "emoticon-outline",
      "palette-outline",
      "brush-outline",
      "image-outline",
      "camera-outline",
      "puzzle-outline",
    ],
  },
  {
    id: "health",
    label: "Health",
    icons: [
      "medical-bag",
      "hospital-box-outline",
      "pill",
      "brain",
      "sleep",
      "dumbbell",
      "weight-lifter",
      "run",
      "bike",
      "smoking-off",
    ],
  },
  {
    id: "travel",
    label: "Travel & Places",
    icons: [
      "airplane",
      "airplane-takeoff",
      "car-outline",
      "train",
      "subway-variant",
      "taxi",
      "sail-boat",
      "map-marker-outline",
      "compass-outline",
      "earth",
      "beach",
      "tree-outline",
      "terrain",
    ],
  },
  {
    id: "media",
    label: "Media",
    icons: [
      "music-note-outline",
      "music",
      "headphones",
      "microphone-outline",
      "movie-outline",
      "filmstrip",
      "video-outline",
      "gamepad-variant-outline",
      "book-outline",
      "book-open-page-variant-outline",
      "newspaper-variant-outline",
    ],
  },
  {
    id: "food",
    label: "Food & Drink",
    icons: [
      "coffee-outline",
      "glass-cocktail",
      "silverware-fork-knife",
      "food-apple-outline",
      "knife",
      "cart-outline",
      "basket-outline",
      "store-outline",
      "shopping-outline",
    ],
  },
  {
    id: "money",
    label: "Money",
    icons: [
      "cash",
      "credit-card-outline",
      "wallet-outline",
      "bank-outline",
      "diamond-stone",
      "trophy-outline",
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icons: [
      "email-outline",
      "comment-outline",
      "phone-outline",
      "phone-in-talk-outline",
      "radar",
      "satellite-variant",
    ],
  },
  {
    id: "time",
    label: "Time & Calendar",
    icons: [
      "calendar-month-outline",
      "calendar-today",
      "clock-outline",
      "timer-outline",
      "alarm",
    ],
  },
  {
    id: "weather",
    label: "Weather & Nature",
    icons: [
      "weather-sunny",
      "white-balance-sunny",
      "weather-night",
      "moon-waning-crescent",
      "umbrella-outline",
      "water-outline",
      "leaf",
      "flower-outline",
      "fire",
      "lightning-bolt-outline",
    ],
  },
  {
    id: "sports",
    label: "Sports & Fun",
    icons: [
      "soccer",
      "football",
      "tennis",
      "golf",
      "ski",
      "swim",
      "rocket-launch-outline",
      "school-outline",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    icons: [
      "archive-outline",
      "delete-outline",
      "eye-outline",
      "pin-outline",
      "scissors-cutting",
      "shovel",
      "traffic-light",
      "scale-balance",
      "cloud-outline",
    ],
  },
] as const;

const iconSet = new Set<PerspectiveIconName>();

for (const category of perspectiveIconCategories) {
  for (const icon of category.icons) {
    iconSet.add(icon);
  }
}

export const perspectiveIconChoices = [...iconSet] as const;

export function isPerspectiveIconName(value: string): value is PerspectiveIconName {
  return iconSet.has(value as PerspectiveIconName);
}

export function perspectiveIconLabel(icon: string): string {
  return icon
    .replace(/-outline$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function filterPerspectiveIcons(query: string): PerspectiveIconName[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...perspectiveIconChoices];

  return perspectiveIconChoices.filter((icon) => {
    if (icon.includes(trimmed)) return true;
    return perspectiveIconLabel(icon).toLowerCase().includes(trimmed);
  });
}

export function perspectiveIconsForCategory(categoryId: string): PerspectiveIconName[] {
  const category = perspectiveIconCategories.find((item) => item.id === categoryId);
  return category ? [...category.icons] : [];
}
