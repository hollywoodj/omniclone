export function asDomElement(node: unknown): HTMLElement | null {
  if (!node || typeof node !== "object") return null;
  if (typeof (node as HTMLElement).addEventListener === "function") return node as HTMLElement;
  const nested = node as { getNode?: () => unknown; _nativeNode?: unknown };
  if (nested._nativeNode) return asDomElement(nested._nativeNode);
  if (typeof nested.getNode === "function") return asDomElement(nested.getNode());
  return null;
}
