import assert from "node:assert/strict";
import test from "node:test";
import type { LocationState } from "../dates.ts";
import { canGoBack, canGoForward, emptyHistory, historyFrom, pushLocation, stepBack, stepForward } from "./history.ts";

function loc(perspective: LocationState["perspective"]): LocationState {
  return {
    perspective,
    projectFilter: null,
    tagFilter: null,
    folderFilter: null,
    forecastDay: "2026-08-17",
    focusedProjectId: null,
  };
}

test("pushing a location drops the unused forward stack", () => {
  let history = historyFrom(loc("inbox"));
  history = pushLocation(history, loc("projects"));
  history = pushLocation(history, loc("flagged"));
  history = stepBack(history).history;
  history = pushLocation(history, loc("tags"));
  assert.equal(canGoForward(history), false);
  assert.deepEqual(history.stack.map((item) => item.perspective), ["inbox", "projects", "tags"]);
});

test("back and forward walk the recorded locations", () => {
  let history = historyFrom(loc("inbox"));
  history = pushLocation(history, loc("projects"));
  const back = stepBack(history);
  assert.equal(back.location?.perspective, "inbox");
  assert.equal(canGoBack(back.history), false);
  assert.equal(canGoForward(back.history), true);
  const forward = stepForward(back.history);
  assert.equal(forward.location?.perspective, "projects");
});

test("empty history cannot move", () => {
  const history = emptyHistory();
  assert.equal(canGoBack(history), false);
  assert.equal(canGoForward(history), false);
  assert.equal(stepBack(history).location, undefined);
  assert.equal(stepForward(history).location, undefined);
});
