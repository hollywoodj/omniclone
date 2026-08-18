import { useEffect, useRef, useState } from "react";
import { todayKey, type LocationState } from "../dates";
import { settingsWithCustomBarItems } from "../library/hydrate";
import { loadDatabase, saveDatabase } from "../storage";
import { loadSettings, saveSettings } from "../settings";
import { normalizeCustomPerspective } from "../perspectiveRules";
import {
  defaultSettings,
  type AppSettings,
  type CustomPerspective,
  type Project,
  type TagRecord,
  type Task,
} from "../model";

export function usePersistedLibrary(onHydrated?: (initial: LocationState, settings: AppSettings) => void) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customPerspectives, setCustomPerspectives] = useState<CustomPerspective[]>([]);
  const [tagRecords, setTagRecords] = useState<TagRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const onHydratedRef = useRef(onHydrated);
  onHydratedRef.current = onHydrated;

  useEffect(() => {
    Promise.all([loadDatabase(), loadSettings()]).then(([saved, savedSettings]) => {
      let nextSettings = savedSettings;
      if (saved) {
        setProjects(saved.projects);
        setTasks(saved.tasks);
        setTagRecords(saved.tagRecords ?? []);
        const customs = saved.customPerspectives.map((item) => normalizeCustomPerspective(item));
        setCustomPerspectives(customs);
        nextSettings = settingsWithCustomBarItems(savedSettings, customs);
      }
      setSettings(nextSettings);
      const initial: LocationState = {
        perspective: nextSettings.defaultPerspective,
        projectFilter: null,
        tagFilter: null,
        folderFilter: null,
        forecastDay: todayKey(),
        focusedProjectIds: [],
    focusedFolderPaths: [],
      };
      onHydratedRef.current?.(initial, nextSettings);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveDatabase({ version: 2, projects, tasks, customPerspectives, tagRecords });
    }, 180);
    return () => clearTimeout(timer);
  }, [hydrated, projects, tasks, customPerspectives, tagRecords]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveSettings(settings);
    }, 120);
    return () => clearTimeout(timer);
  }, [hydrated, settings]);

  return {
    projects,
    setProjects,
    tasks,
    setTasks,
    customPerspectives,
    setCustomPerspectives,
    tagRecords,
    setTagRecords,
    settings,
    setSettings,
    hydrated,
  };
}
