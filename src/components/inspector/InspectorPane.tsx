import React from "react";
import { projectIsStalled } from "../../outline";
import { remainingCountForProject, remainingCountForTag } from "../../perspectives/counts";
import type { Project, TagRecord, Task } from "../../model";
import { EmptyInspector } from "../inspector/EmptyInspector";
import { Inspector } from "../inspector/Inspector";
import { MultiSelectInspector } from "../inspector/MultiSelectInspector";
import { ProjectInspector } from "../inspector/ProjectInspector";
import { TagInspector } from "../inspector/TagInspector";
import { findTagRecord, remainingCountForTagTree } from "../../tags";

export function InspectorPane({
  selectedTaskIds,
  selectedTask,
  selectedTasks,
  inspectedProject,
  tagFilter,
  tasks,
  projects,
  onToggleSelected,
  onToggleFlagSelected,
  onDeleteSelected,
  onChangeTask,
  onToggleTask,
  onDeleteTask,
  onChangeProject,
  onReviewProject,
  onSkipProject,
  onDeleteProject,
  onFocusProject,
  onRenameTag,
  onChangeTag,
  tagRecords,
}: {
  selectedTaskIds: string[];
  selectedTask: Task | null;
  selectedTasks: Task[];
  inspectedProject?: Project;
  tagFilter: string | null;
  tasks: Task[];
  projects: Project[];
  onToggleSelected: () => void;
  onToggleFlagSelected: () => void;
  onDeleteSelected: () => void;
  onChangeTask: (patch: Partial<Task>) => void;
  onToggleTask: () => void;
  onDeleteTask: () => void;
  onChangeProject: (patch: Partial<Project>) => void;
  onReviewProject: () => void;
  onSkipProject: () => void;
  onDeleteProject: () => void;
  onFocusProject: () => void;
  onRenameTag: (name: string) => void;
  onChangeTag: (patch: Partial<TagRecord>) => void;
  tagRecords: TagRecord[];
}) {
  if (selectedTaskIds.length > 1) {
    return (
      <MultiSelectInspector
        count={selectedTaskIds.length}
        allCompleted={selectedTasks.length > 0 && selectedTasks.every((task) => task.completed)}
        allFlagged={selectedTasks.length > 0 && selectedTasks.every((task) => task.flagged)}
        onToggle={onToggleSelected}
        onToggleFlag={onToggleFlagSelected}
        onDelete={onDeleteSelected}
      />
    );
  }
  if (selectedTaskIds.length === 1 && selectedTask) {
    return <Inspector task={selectedTask} projects={projects} onChange={onChangeTask} onToggle={onToggleTask} onDelete={onDeleteTask} />;
  }
  if (inspectedProject) {
    return (
      <ProjectInspector
        project={inspectedProject}
        remainingCount={remainingCountForProject(tasks, inspectedProject.id)}
        stalled={projectIsStalled(inspectedProject, tasks)}
        onChange={onChangeProject}
        onReview={onReviewProject}
        onSkip={onSkipProject}
        onDelete={onDeleteProject}
        onFocus={onFocusProject}
      />
    );
  }
  if (tagFilter) {
    return (
      <TagInspector
        tag={tagFilter}
        record={findTagRecord(tagRecords, tagFilter)}
        count={remainingCountForTagTree(tasks, tagFilter, tagRecords) || remainingCountForTag(tasks, tagFilter)}
        tags={tagRecords}
        onRename={onRenameTag}
        onChange={onChangeTag}
      />
    );
  }
  return (
    <EmptyInspector
      title="No Selection"
      detail="Select an action, project, or tag to inspect it."
    />
  );
}
