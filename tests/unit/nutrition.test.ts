import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateHealthScore, scoreNutrition } from "../../convex/nutrition";

const beans = {
  grams: 250,
  nutrients: { calories: 160, sodium: 5, saturatedFat: 0.2, addedSugar: 0, fiber: 7, protein: 8 },
};

describe("nutrition rubric", () => {
  it("uses nutrient density and includes sodium from salt with no energy entry", () => {
    const unsalted = scoreNutrition([beans]);
    expect(scoreNutrition([{ ...beans, grams: 500 }])).toBe(unsalted);
    const salted = scoreNutrition([beans, { grams: 5, nutrients: { sodium: 39_300 } }]);
    expect(unsalted - salted).toBe(20);
  });

  it("treats missing added sugar as unknown and rejects insufficient core data", () => {
    const withoutSugarData = { ...beans, nutrients: { ...beans.nutrients, addedSugar: undefined } };
    expect(scoreNutrition([withoutSugarData])).toBeLessThan(scoreNutrition([beans]));
    expect(() => scoreNutrition([beans, { grams: 250, nutrients: {} }])).toThrow("isn’t enough nutrition data");
  });
});

describe("nutrition provider lookup", () => {
  const complete = (value: object) => Response.json({
    choices: [{ message: { content: JSON.stringify(value) } }],
  });
  const normalized = () => complete({
    ingredients: [{ keyword: "beans", query: "cooked beans", grams: beans.grams, branded: false }],
  });
  const usdaBeans = () => Response.json({ foods: [{
    description: "Beans, cooked",
    foodNutrients: [
      { nutrientId: 2048, unitName: "KCAL", value: 160 },
      { nutrientId: 1093, unitName: "MG", value: 5 },
      { nutrientId: 1258, unitName: "G", value: 0.2 },
      { nutrientId: 1079, unitName: "G", value: 7 },
      { nutrientId: 1003, unitName: "G", value: 8 },
    ],
  }] });
  const openFoodFactsBeans = () => Response.json({ hits: [{
    product_name: "Cooked beans",
    brands: ["Example Foods"],
    nutriments: {
      "energy-kj_100g": 669.44,
      "salt_100g": 0.0125,
      "saturated-fat_100g": 0.2,
      fiber_100g: 7,
      proteins_100g: 8,
    },
  }] });
  const recipe = { ingredients: ["250 g cooked beans"] };
  const keys = { privateKey: "test-model-key", usdaKey: "test-usda-key" };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("scores USDA nutrient amounts for a candidate selected by GLM Flash", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(normalized())
      .mockResolvedValueOnce(usdaBeans())
      .mockResolvedValueOnce(complete({ matches: [[0, "none"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(calculateHealthScore(recipe, keys)).resolves.toBe(scoreNutrition([beans]));
    const [modelUrl, modelInit] = fetchMock.mock.calls[0];
    expect(String(modelUrl)).toBe("https://proxyless-api.privatemode.ai/v1/chat/completions");
    expect(JSON.parse(String(modelInit?.body)).model).toBe("glm-5.3-flash");
    const [usdaUrl, usdaInit] = fetchMock.mock.calls[1];
    expect(String(usdaUrl)).toBe("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=test-usda-key");
    expect(JSON.parse(String(usdaInit?.body)).query).toBe("+beans cooked beans");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const matchRequest = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(JSON.parse(matchRequest.messages[1].content).rows).toEqual([
      ["250 g cooked beans", [[0, "Beans, cooked", "", true]]],
    ]);
  });

  it.each([
    ["finds no candidates", () => Response.json({ foods: [] })],
    ["is unavailable", () => new Response(null, { status: 503 })],
  ])("uses an Open Food Facts match when USDA %s", async (_, usdaResponse) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(normalized())
      .mockResolvedValueOnce(usdaResponse())
      .mockResolvedValueOnce(openFoodFactsBeans())
      .mockResolvedValueOnce(complete({ matches: [[0, "none"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(calculateHealthScore(recipe, keys)).resolves.toBe(scoreNutrition([beans]));
    const [backupUrl, backupInit] = fetchMock.mock.calls[2];
    expect(String(backupUrl)).toBe("https://search.openfoodfacts.org/search");
    expect(new Headers(backupInit?.headers).get("User-Agent")).toContain("PotluckShowdown");
    expect(JSON.parse(String(backupInit?.body)).q).toBe("cooked beans");
  });

  it("looks up rejected USDA matches in Open Food Facts", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(normalized())
      .mockResolvedValueOnce(usdaBeans())
      .mockResolvedValueOnce(complete({ matches: [[null, "unknown"]] }))
      .mockResolvedValueOnce(openFoodFactsBeans())
      .mockResolvedValueOnce(complete({ matches: [[0, "none"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(calculateHealthScore(recipe, keys)).resolves.toBe(scoreNutrition([beans]));
    expect(String(fetchMock.mock.calls[3][0])).toBe("https://search.openfoodfacts.org/search");
  });
});
