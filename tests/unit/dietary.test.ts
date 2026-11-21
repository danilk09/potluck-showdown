import { describe, expect, it } from "vitest";
import { dietaryConflicts } from "../../src/lib/dietary";

describe("dietaryConflicts", () => {
  it("flags meat in a vegetarian dish", () => {
    expect(dietaryConflicts(["2 lb pork shoulder", "salt"], ["Vegetarian"])).toEqual([{ label: "Vegetarian", word: "pork" }]);
  });

  it("flags eggs and dairy in a vegan dish", () => {
    expect(dietaryConflicts(["1 cup flour", "2 eggs"], ["Vegan"])).toEqual([{ label: "Vegan", word: "eggs" }]);
  });

  it("ignores plant-based and gluten-free swaps", () => {
    expect(dietaryConflicts(["1 cup oat milk", "2 tbsp vegan butter"], ["Vegan", "Dairy-free"])).toEqual([]);
    expect(dietaryConflicts(["2 cups gluten-free flour"], ["Gluten-free"])).toEqual([]);
  });

  it("matches whole words only", () => {
    // "hamachi" and "graham" contain "ham" but aren't ham.
    expect(dietaryConflicts(["graham crackers", "eggplant"], ["Halal", "Vegetarian"])).toEqual([]);
  });

  it("ignores labels it has no rule for", () => {
    expect(dietaryConflicts(["sugar"], ["Spicy", "Low-sugar"])).toEqual([]);
  });
});
