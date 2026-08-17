import { useCallback, useRef, useState } from "react";
import { type LocationState, sameLocation, todayKey } from "../dates";
import { type ActivePerspective } from "../model";
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

export function useLocationHistory(onNavigate?: () => void) {
  const [perspective, setPerspective] = useState<ActivePerspective>("projects");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [forecastDay, setForecastDay] = useState(todayKey());
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const locationRef = useRef<LocationState>({
    perspective: "projects",
    projectFilter: null,
    tagFilter: null,
    folderFilter: null,
    forecastDay: todayKey(),
    focusedProjectId: null,
  });
  const historyRef = useRef<LocationHistory>(emptyHistory());
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  locationRef.current = { perspective, projectFilter, tagFilter, folderFilter, forecastDay, focusedProjectId };

  const applyLocation = useCallback((next: LocationState) => {
    locationRef.current = next;
    setPerspective(next.perspective);
    setProjectFilter(next.projectFilter);
    setTagFilter(next.tagFilter);
    setFolderFilter(next.folderFilter);
    setForecastDay(next.forecastDay);
    setFocusedProjectId(next.focusedProjectId);
  }, []);

  const syncHistoryButtons = useCallback(() => {
    const history = historyRef.current;
    setCanGoBack(historyCanGoBack(history));
    setCanGoForward(historyCanGoForward(history));
  }, []);

  const hydrateLocation = useCallback((initial: LocationState) => {
    locationRef.current = initial;
    historyRef.current = historyFrom(initial);
    applyLocation(initial);
    syncHistoryButtons();
  }, [applyLocation, syncHistoryButtons]);

  const navigate = useCallback((patch: Partial<LocationState>) => {
    const next = { ...locationRef.current, ...patch };
    if (sameLocation(locationRef.current, next)) return;
    onNavigateRef.current?.();
    applyLocation(next);
    historyRef.current = pushLocation(historyRef.current, next);
    syncHistoryButtons();
    return next;
  }, [applyLocation, syncHistoryButtons]);

  const goBack = useCallback(() => {
    const stepped = stepBack(historyRef.current);
    if (!stepped.location) return;
    historyRef.current = stepped.history;
    applyLocation(stepped.location);
    syncHistoryButtons();
  }, [applyLocation, syncHistoryButtons]);

  const goForward = useCallback(() => {
    const stepped = stepForward(historyRef.current);
    if (!stepped.location) return;
    historyRef.current = stepped.history;
    applyLocation(stepped.location);
    syncHistoryButtons();
  }, [applyLocation, syncHistoryButtons]);

  return {
    perspective,
    projectFilter,
    tagFilter,
    folderFilter,
    forecastDay,
    focusedProjectId,
    canGoBack,
    canGoForward,
    locationRef,
    setProjectFilter,
    hydrateLocation,
    navigate,
    goBack,
    goForward,
  };
}

