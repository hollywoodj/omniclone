import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { View } from "react-native";
import { asDomElement } from "./dom.ts";

const DRAG_THRESHOLD_PX = 6;
const ATTR = "data-perspective-id";

function asElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") return null;
  if ("nodeType" in target && (target as Node).nodeType === 3) return (target as Node).parentElement;
  if (typeof (target as Element).closest === "function") return target as Element;
  return null;
}

export function rowIdFromTarget(target: EventTarget | null): string | null {
  const el = asElement(target);
  if (!el) return null;
  return el.closest(`[${ATTR}]`)?.getAttribute(ATTR) ?? null;
}

export function bindPointerReorder(
  root: HTMLElement,
  options: {
    onReorder: (fromId: string, toId: string) => void;
    onDragChange?: (dragId: string | null, dropId: string | null) => void;
    onDoubleClick?: (id: string) => void;
    onDidDrag?: () => void;
    ignoreSelector?: string;
  },
): () => void {
  let fromId: string | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let pointerId: number | null = null;

  const ignored = (target: EventTarget | null) => {
    if (!options.ignoreSelector) return false;
    const el = asElement(target);
    return !!el?.closest(options.ignoreSelector);
  };

  const setDrag = (dragId: string | null, dropId: string | null) => {
    options.onDragChange?.(dragId, dropId);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (ignored(event.target)) return;
    const id = rowIdFromTarget(event.target);
    if (!id) return;
    fromId = id;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    pointerId = event.pointerId;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!fromId || pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && (dx * dx + dy * dy) < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    dragging = true;
    event.preventDefault();
    const over = document.elementFromPoint(event.clientX, event.clientY);
    const dropId = rowIdFromTarget(over);
    setDrag(fromId, dropId && dropId !== fromId ? dropId : null);
  };

  const finish = (event: PointerEvent) => {
    if (!fromId || pointerId !== event.pointerId) return;
    const dropId = dragging ? rowIdFromTarget(document.elementFromPoint(event.clientX, event.clientY)) : null;
    if (dragging) options.onDidDrag?.();
    if (dragging && dropId && dropId !== fromId) options.onReorder(fromId, dropId);
    fromId = null;
    dragging = false;
    pointerId = null;
    setDrag(null, null);
  };

  const onDoubleClick = (event: MouseEvent) => {
    if (ignored(event.target)) return;
    const id = rowIdFromTarget(event.target);
    if (id) options.onDoubleClick?.(id);
  };

  root.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  root.addEventListener("dblclick", onDoubleClick, true);

  return () => {
    root.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    root.removeEventListener("dblclick", onDoubleClick, true);
    setDrag(null, null);
  };
}

export function usePointerReorder(options: {
  enabled?: boolean;
  onReorder: (fromId: string, toId: string) => void;
  onDoubleClick?: (id: string) => void;
  ignoreSelector?: string;
}) {
  const hostRef = useRef<View | null>(null);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const skipPressRef = useRef(false);

  useLayoutEffect(() => {
    if (options.enabled === false) {
      setNode(null);
      return;
    }
    const resolved = asDomElement(hostRef.current);
    if (resolved) {
      setNode(resolved);
      return;
    }
    const frame = requestAnimationFrame(() => setNode(asDomElement(hostRef.current)));
    return () => cancelAnimationFrame(frame);
  }, [options.enabled]);

  useEffect(() => {
    if (!node || options.enabled === false) return;
    return bindPointerReorder(node, {
      ignoreSelector: options.ignoreSelector,
      onReorder: (fromId, toId) => callbacksRef.current.onReorder(fromId, toId),
      onDoubleClick: (id) => callbacksRef.current.onDoubleClick?.(id),
      onDidDrag: () => { skipPressRef.current = true; },
      onDragChange: (nextDrag, nextDrop) => {
        setDragId(nextDrag);
        setDropId(nextDrop);
      },
    });
  }, [node, options.enabled, options.ignoreSelector]);

  const shouldSkipPress = () => {
    if (!skipPressRef.current) return false;
    skipPressRef.current = false;
    return true;
  };

  return { ref: hostRef as RefObject<View | null>, dragId, dropId, shouldSkipPress };
}
