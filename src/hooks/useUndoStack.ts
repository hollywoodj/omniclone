import { useCallback, useRef } from "react";
import type { Project, Task } from "../model";

export type LibrarySnapshot = {
  projects: Project[];
  tasks: Task[];
};

export function useUndoStack(snapshot: LibrarySnapshot) {
  const undoStack = useRef<LibrarySnapshot[]>([]);
  const redoStack = useRef<LibrarySnapshot[]>([]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const pushUndo = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-19), snapshotRef.current];
    redoStack.current = [];
  }, []);

  const undo = useCallback((): LibrarySnapshot | null => {
    const previous = undoStack.current.pop();
    if (!previous) return null;
    redoStack.current.push(snapshotRef.current);
    return previous;
  }, []);

  const redo = useCallback((): LibrarySnapshot | null => {
    const next = redoStack.current.pop();
    if (!next) return null;
    undoStack.current.push(snapshotRef.current);
    return next;
  }, []);

  return { pushUndo, undo, redo };
}
