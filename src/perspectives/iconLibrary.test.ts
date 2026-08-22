import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterPerspectiveIcons,
  isPerspectiveIconName,
  perspectiveIconCategories,
  perspectiveIconChoices,
  perspectiveIconLabel,
  perspectiveIconsForCategory,
} from "./iconLibrary.ts";

describe("perspective icon library", () => {
  it("exposes unique icons across categories", () => {
    const seen = new Set<string>();
    for (const category of perspectiveIconCategories) {
      assert.ok(category.icons.length > 0, `${category.id} should include icons`);
      for (const icon of category.icons) {
        assert.ok(!seen.has(icon), `duplicate icon ${icon}`);
        seen.add(icon);
      }
    }
    assert.equal(perspectiveIconChoices.length, seen.size);
    assert.ok(perspectiveIconChoices.length >= 100);
  });

  it("labels icons for search", () => {
    assert.equal(perspectiveIconLabel("calendar-month-outline"), "Calendar Month");
    assert.equal(perspectiveIconLabel("star-four-points-outline"), "Star Four Points");
  });

  it("filters icons by name and label", () => {
    const calendar = filterPerspectiveIcons("calendar");
    assert.ok(calendar.some((icon) => icon.includes("calendar")));
    const coffee = filterPerspectiveIcons("Coffee");
    assert.ok(coffee.includes("coffee-outline"));
  });

  it("returns category icons", () => {
    const travel = perspectiveIconsForCategory("travel");
    assert.ok(travel.includes("airplane"));
    assert.deepEqual(perspectiveIconsForCategory("missing"), []);
  });

  it("validates known icons", () => {
    assert.equal(isPerspectiveIconName("coffee-outline"), true);
    assert.equal(isPerspectiveIconName("not-a-real-icon"), false);
  });
});
