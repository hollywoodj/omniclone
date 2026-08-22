import { useCallback, useRef, useState } from "react";
import { type LocationState, sameLocation, todayKey } from "../dates";
import {
  canGoBack as historyCanGoBack,
  canGoForward as historyCanGoForward,
  emptyHistory,
  historyFrom,
  pushLocation,
  stepBack,
  stepForward,
  type LocationHistory,
} from "../navigation/history";

const defaultLocation = (): LocationState => ({
  perspective: "projects",
  projectFilter: null,
  tagFilter: null,
  folderFilter: null,
  forecastDay: todayKey(),
  focusedProjectIds: [],
  focusedFolderPaths: [],
});

export function useLocationHistory(onNavigate?: () => void) {
  const [location, setLocation] = useState<LocationState>(defaultLocation);
  const [history, setHistory] = useState<LocationHistory>(emptyHistory());
  const locationRef = useRef(location);
  const historyRef = useRef(history);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  locationRef.current = location;
  historyRef.current = history;

  const applyLocation = useCallback((next: LocationState) => {
    locationRef.current = next;
    setLocation(next);
  }, []);

  const hydrateLocation = useCallback((initial: LocationState) => {
    locationRef.current = initial;
    const nextHistory = historyFrom(initial);
    historyRef.current = nextHistory;
    setLocation(initial);
    setHistory(nextHistory);
  }, []);

  const navigate = useCallback((patch: Partial<LocationState>) => {
    const next = { ...locationRef.current, ...patch };
    if (sameLocation(locationRef.current, next)) return;
    onNavigateRef.current?.();
    applyLocation(next);
    const nextHistory = pushLocation(historyRef.current, next);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    return next;
  }, [applyLocation]);

  const goBack = useCallback(() => {
    const stepped = stepBack(historyRef.current);
    if (!stepped.location) return;
    historyRef.current = stepped.history;
    setHistory(stepped.history);
    applyLocation(stepped.location);
  }, [applyLocation]);

  const goForward = useCallback(() => {
    const stepped = stepForward(historyRef.current);
    if (!stepped.location) return;
    historyRef.current = stepped.history;
    setHistory(stepped.history);
    applyLocation(stepped.location);
  }, [applyLocation]);

  return {
    perspective: location.perspective,
    projectFilter: location.projectFilter,
    tagFilter: location.tagFilter,
    folderFilter: location.folderFilter,
    forecastDay: location.forecastDay,
    focusedProjectIds: location.focusedProjectIds,
    focusedFolderPaths: location.focusedFolderPaths,
    canGoBack: historyCanGoBack(history),
    canGoForward: historyCanGoForward(history),
    locationRef,
    setProjectFilter: (value: string | null | ((current: string | null) => string | null)) => {
      const next = typeof value === "function" ? value(locationRef.current.projectFilter) : value;
      applyLocation({ ...locationRef.current, projectFilter: next });
    },
    hydrateLocation,
    navigate,
    goBack,
    goForward,
  };
}

