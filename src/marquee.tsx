import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { idsIntersectingRect, normalizedRect, type Rect } from "./selection";

type MarqueePoint = { x: number; y: number };

export type MarqueeSelectionApi = {
  registerRow: (id: string, node: View | null) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
  overlay: React.ReactNode;
};

function asDomElement(node: unknown): HTMLElement | null {
  if (!node || typeof node !== "object") return null;
  if (typeof (node as HTMLElement).getBoundingClientRect === "function") return node as HTMLElement;
  const nested = node as { getNode?: () => unknown; _nativeNode?: unknown };
  if (nested._nativeNode) return asDomElement(nested._nativeNode);
  if (typeof nested.getNode === "function") return asDomElement(nested.getNode());
  return null;
}

function isMarqueeExempt(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("input, textarea, select, [contenteditable='true'], [data-no-marquee='true']");
}

function isTaskRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("[data-task-id]");
}

function clientRect(node: View | HTMLElement | null): Rect | null {
  const element = asDomElement(node);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height };
}

export function useModifierKeys(enabled = true) {
  const modifiersRef = useRef({ shift: false, toggle: false });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const sync = (event: KeyboardEvent | MouseEvent) => {
      modifiersRef.current = {
        shift: event.shiftKey,
        toggle: event.metaKey || (!/Mac|iPhone|iPad/.test(navigator.platform) && event.ctrlKey),
      };
    };
    const reset = () => {
      modifiersRef.current = { shift: false, toggle: false };
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("mousemove", sync);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("mousemove", sync);
      window.removeEventListener("blur", reset);
    };
  }, [enabled]);

  return modifiersRef;
}

export function useMarqueeSelection(options: {
  enabled?: boolean;
  containerRef: React.RefObject<View | null>;
  onStart?: () => void;
  onSelect: (ids: string[], additive: boolean) => void;
  onClear?: () => void;
}): MarqueeSelectionApi {
  const { enabled = Platform.OS === "web", containerRef, onStart, onSelect, onClear } = options;
  const rowsRef = useRef(new Map<string, View>());
  const rowRectsRef = useRef<Map<string, Rect> | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    origin: MarqueePoint;
    additive: boolean;
    active: boolean;
    pointerId: number;
  } | null>(null);
  const [overlayRect, setOverlayRect] = useState<Rect | null>(null);
  const onStartRef = useRef(onStart);
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClear);
  onStartRef.current = onStart;
  onSelectRef.current = onSelect;
  onClearRef.current = onClear;

  const registerRow = useCallback((id: string, node: View | null) => {
    if (node) rowsRef.current.set(id, node);
    else rowsRef.current.delete(id);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const host = asDomElement(containerRef.current);
    if (!host) return;

    const hitIds = (marquee: Rect) => {
      if (!rowRectsRef.current) {
        rowRectsRef.current = new Map();
        for (const [id, node] of rowsRef.current) {
          const rect = clientRect(node);
          if (rect) rowRectsRef.current.set(id, rect);
        }
      }
      const rows: Array<{ id: string; rect: Rect }> = [];
      for (const [id, rect] of rowRectsRef.current) rows.push({ id, rect });
      return idsIntersectingRect(rows, marquee);
    };

    const overlayFrom = (origin: MarqueePoint, point: MarqueePoint) => {
      const hostBox = host.getBoundingClientRect();
      const marquee = normalizedRect(origin.x, origin.y, point.x, point.y);
      return {
        marquee,
        overlay: {
          x: marquee.x - hostBox.left,
          y: marquee.y - hostBox.top,
          width: marquee.width,
          height: marquee.height,
        },
      };
    };

    const finish = () => {
      dragRef.current = null;
      rowRectsRef.current = null;
      setOverlayRect(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch") return;
      if (isMarqueeExempt(event.target)) return;
      rowRectsRef.current = null;
      dragRef.current = {
        origin: { x: event.clientX, y: event.clientY },
        additive: event.shiftKey || event.metaKey || (!/Mac|iPhone|iPad/.test(navigator.platform) && event.ctrlKey),
        active: false,
        pointerId: event.pointerId,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y);
      if (!drag.active && distance < 5) return;
      if (!drag.active) {
        drag.active = true;
        suppressClickRef.current = true;
        onStartRef.current?.();
        try {
          host.setPointerCapture(event.pointerId);
        } catch {
          // Some hosts reject capture; window listeners still track the drag.
        }
      }
      event.preventDefault();
      const { marquee, overlay } = overlayFrom(drag.origin, { x: event.clientX, y: event.clientY });
      setOverlayRect(overlay);
      onSelectRef.current(hitIds(marquee), drag.additive);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.active) {
        const { marquee } = overlayFrom(drag.origin, { x: event.clientX, y: event.clientY });
        onSelectRef.current(hitIds(marquee), drag.additive);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 80);
      } else if (!isTaskRowTarget(event.target) && !isMarqueeExempt(event.target) && !drag.additive) {
        onClearRef.current?.();
      }
      finish();
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [containerRef, enabled]);

  const overlay = overlayRect ? (
    <View pointerEvents="none" style={[styles.marquee, { left: overlayRect.x, top: overlayRect.y, width: overlayRect.width, height: overlayRect.height }]} />
  ) : null;

  return { registerRow, suppressClickRef, overlay };
}

const styles = StyleSheet.create({
  marquee: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 6,
    borderColor: "rgba(10, 100, 214, 0.92)",
    backgroundColor: "rgba(10, 100, 214, 0.16)",
    zIndex: 20,
  },
});
