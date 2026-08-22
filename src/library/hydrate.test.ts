import { defaultSettings, type AppSettings, type CustomPerspective } from "../model.ts";
import { settingsWithCustomBarItems } from "./hydrate.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("adds custom perspectives to the default bar on first hydrate", () => {
  const custom: CustomPerspective[] = [{
    id: "c1",
    name: "Errands",
    icon: "star",
    color: "#000",
    combinator: "all",
    rules: [],
    structure: "flexible",
    organizeBy: "actions",
    groupBy: "none",
    sortBy: "projects",
    keepSidebarHidden: false,
  }];
  const next = settingsWithCustomBarItems(defaultSettings, custom);
  assert.ok(next.perspectiveBarIds.includes("custom:c1"));
  assert.ok(next.perspectiveOrderIds.includes("custom:c1"));
});

test("does not rewrite a customized perspective bar", () => {
  const settings: AppSettings = { ...defaultSettings, perspectiveBarIds: ["inbox", "forecast"] };
  const custom: CustomPerspective[] = [{
    id: "c1",
    name: "Errands",
    icon: "star",
    color: "#000",
    combinator: "all",
    rules: [],
    structure: "flexible",
    organizeBy: "actions",
    groupBy: "none",
    sortBy: "projects",
    keepSidebarHidden: false,
  }];
  const next = settingsWithCustomBarItems(settings, custom);
  assert.deepEqual(next.perspectiveBarIds, ["inbox", "forecast"]);
});
