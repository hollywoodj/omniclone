import React from "react";
import { Pressable } from "react-native";
import type { ActivePerspective, AppSettings, CustomPerspective, PerspectiveAvailability, PerspectiveId, Project } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { ViewOptionsPanel } from "../../viewOptions";

export function ViewOptionsHost({
  compact,
  dismissDesktop,
  perspective,
  custom,
  projects,
  tags,
  settings,
  onChangeAvailability,
  onChangeShowNotes,
  onChangeCustom,
  onClose,
}: {
  compact: boolean;
  dismissDesktop: boolean;
  perspective: ActivePerspective;
  custom: CustomPerspective | null;
  projects: Project[];
  tags: string[];
  settings: AppSettings;
  onChangeAvailability: (availability: PerspectiveAvailability) => void;
  onChangeShowNotes: (showNotes: boolean) => void;
  onChangeCustom: (patch: Partial<CustomPerspective>) => void;
  onClose: () => void;
}) {
  const panel = (
    <ViewOptionsPanel
      compact={compact}
      perspective={perspective}
      custom={custom}
      projects={projects}
      tags={tags}
      availability={settings.standardAvailability[perspective as PerspectiveId] ?? "remaining"}
      onChangeAvailability={onChangeAvailability}
      showNotes={settings.showNotesInOutline}
      onChangeShowNotes={onChangeShowNotes}
      onChangeCustom={onChangeCustom}
      onClose={onClose}
    />
  );
  if (!compact && dismissDesktop) {
    return (
      <>
        <Pressable accessibilityLabel="Close view options" onPress={onClose} style={styles.menuDismissLayer} />
        {panel}
      </>
    );
  }
  return panel;
}
