import type { Project } from "../model";
import type { ContextMenuItem } from "../contextMenu";
import type { IconName } from "../components/ui/Icon";

export function projectContextItems(project: Project, handlers: {
  onFocusProject: (id: string) => void;
  onNewActionInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onInspectProject?: (id: string) => void;
  onOpenProject?: (id: string) => void;
  onDuplicateProject?: (id: string) => void;
}): ContextMenuItem[] {
  return [
    ...(handlers.onInspectProject ? [{ id: "inspect", label: "Inspect", icon: "information-outline" as IconName, onPress: () => handlers.onInspectProject?.(project.id) }] : []),
    ...(handlers.onOpenProject ? [{ id: "open", label: "Show in Projects", icon: "folder-outline" as IconName, onPress: () => handlers.onOpenProject?.(project.id) }] : []),
    { id: "focus", label: "Focus Project", icon: "bullseye-arrow", onPress: () => handlers.onFocusProject(project.id) },
    { id: "new-action", label: "New Action in Project", icon: "plus", onPress: () => handlers.onNewActionInProject(project.id) },
    ...(handlers.onDuplicateProject ? [{ id: "duplicate", label: "Duplicate Project", icon: "content-duplicate" as IconName, onPress: () => handlers.onDuplicateProject?.(project.id) }] : []),
    { id: "sep-delete", label: "", separator: true },
    { id: "delete", label: "Delete Project", icon: "trash-can-outline", destructive: true, onPress: () => handlers.onDeleteProject(project.id) },
  ];
}
