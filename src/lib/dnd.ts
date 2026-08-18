export const TASK_DRAG_MIME = "application/x-omniclone-tasks";
export const TASK_DRAG_PREFIX = "omniclone-tasks:";

export function encodeTaskDragPayload(ids: string[]) {
  return `${TASK_DRAG_PREFIX}${JSON.stringify(ids)}`;
}

export function decodeTaskDragPayload(raw: string | undefined | null): string[] | null {
  if (!raw) return null;
  const json = raw.startsWith(TASK_DRAG_PREFIX) ? raw.slice(TASK_DRAG_PREFIX.length) : raw;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}

type DragLike = {
  dataTransfer?: {
    setData?: (type: string, value: string) => void;
    getData?: (type: string) => string;
    effectAllowed?: string;
    dropEffect?: string;
    types?: ArrayLike<string>;
  };
  preventDefault?: () => void;
};

export function setTaskDragData(event: DragLike, ids: string[]) {
  const payload = encodeTaskDragPayload(ids);
  event.dataTransfer?.setData?.(TASK_DRAG_MIME, payload);
  event.dataTransfer?.setData?.("text/plain", payload);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

export function getTaskDragData(event: DragLike): string[] | null {
  const transfer = event.dataTransfer;
  if (!transfer?.getData) return null;
  return decodeTaskDragPayload(transfer.getData(TASK_DRAG_MIME) || transfer.getData("text/plain"));
}

export function allowTaskDrop(event: DragLike) {
  event.preventDefault?.();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}
