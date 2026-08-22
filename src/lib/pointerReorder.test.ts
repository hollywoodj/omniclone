import assert from "node:assert/strict";
import test from "node:test";
import { rowIdFromTarget } from "./pointerReorder.ts";

test("rowIdFromTarget reads data-perspective-id from the row or a child", () => {
  const row = {
    closest(selector: string) {
      return selector === "[data-perspective-id]" ? { getAttribute: (name: string) => name === "data-perspective-id" ? "projects" : null } : null;
    },
  };
  assert.equal(rowIdFromTarget(row as unknown as EventTarget), "projects");
  assert.equal(rowIdFromTarget(null), null);
});
