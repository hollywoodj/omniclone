import type { LocationState } from "../dates.ts";

export type LocationHistory = {
  stack: LocationState[];
  index: number;
};

export function emptyHistory(): LocationHistory {
  return { stack: [], index: -1 };
}

export function historyFrom(initial: LocationState): LocationHistory {
  return { stack: [initial], index: 0 };
}

export function canGoBack(history: LocationHistory) {
  return history.index > 0;
}

export function canGoForward(history: LocationHistory) {
  return history.index >= 0 && history.index < history.stack.length - 1;
}

export function pushLocation(history: LocationHistory, next: LocationState): LocationHistory {
  const nextStack = [...history.stack.slice(0, Math.max(history.index, -1) + 1), next];
  return { stack: nextStack, index: nextStack.length - 1 };
}

export function stepBack(history: LocationHistory): { history: LocationHistory; location: LocationState | undefined } {
  if (history.index <= 0) return { history, location: undefined };
  const index = history.index - 1;
  return { history: { stack: history.stack, index }, location: history.stack[index] };
}

export function stepForward(history: LocationHistory): { history: LocationHistory; location: LocationState | undefined } {
  if (history.index >= history.stack.length - 1) return { history, location: undefined };
  const index = history.index + 1;
  return { history: { stack: history.stack, index }, location: history.stack[index] };
}
