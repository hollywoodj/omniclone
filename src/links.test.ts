import assert from "node:assert/strict";
import test from "node:test";
import { attachmentLabelFromUrl, documentTitle, normalizeAttachmentUrl, parseOmniCloneUrl, resolveOmniCloneOpen } from "./links.ts";

test("parses omniclone task and perspective URLs", () => {
  assert.deepEqual(parseOmniCloneUrl("omniclone://task/abc"), { kind: "task", id: "abc" });
  assert.deepEqual(parseOmniCloneUrl("omniclone://perspective/inbox"), { kind: "perspective", id: "inbox" });
  assert.deepEqual(parseOmniCloneUrl("#/task/hello%20world"), { kind: "task", id: "hello world" });
  assert.equal(parseOmniCloneUrl("https://example.com"), null);
});

test("resolves open-url targets against the current library", () => {
  assert.deepEqual(resolveOmniCloneOpen("omniclone://perspective/flagged", []), { kind: "perspective", id: "flagged" });
  assert.deepEqual(
    resolveOmniCloneOpen("omniclone://task/a1", [{ id: "a1", projectId: "p1" }]),
    { kind: "task", id: "a1", projectId: "p1" },
  );
  assert.equal(resolveOmniCloneOpen("omniclone://task/missing", [{ id: "a1", projectId: "p1" }]), null);
});

test("window title uses the perspective or focused name", () => {
  assert.equal(documentTitle("Projects"), "Projects — OmniClone");
  assert.equal(documentTitle("Projects", "Website"), "Website — OmniClone");
});

test("attachment URLs gain a scheme and a host label", () => {
  assert.equal(normalizeAttachmentUrl("example.com/file"), "https://example.com/file");
  assert.equal(normalizeAttachmentUrl("https://notes.example/a"), "https://notes.example/a");
  assert.equal(attachmentLabelFromUrl("https://www.example.com/path"), "example.com");
});
