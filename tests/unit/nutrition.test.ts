import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateHealthScore, edibleGrams, scoreNutrition } from "../../convex/nutrition";

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

describe("USDA household measures", () => {
  const portions = [
    { amount: 1, grams: 6, text: "tsp" },
    { amount: 1, grams: 18, text: "tbsp" },
    { amount: 0, grams: 192, text: "1 cup" },
    { amount: 0, grams: 14, text: "1 tablespoon" },
    { amount: 1, grams: 3, text: "clove" },
    { amount: 0, grams: 60, text: "1 regular carrot" },
    { amount: 0, grams: 148, text: "1 whole" },
    { amount: 0, grams: 15, text: "1 slice" },
  ];

  it("uses USDA gram weights for household measures and keeps mass units exact", () => {
    expect(edibleGrams(0.5, "tsp", portions, "1/2 tsp salt")).toBe(3);
    expect(edibleGrams(1, "tbsp", portions, "1 tbsp salt")).toBe(18);
    expect(edibleGrams(1, "cup", portions, "1 cup lentils")).toBe(192);
    expect(edibleGrams(1, "tbsp", [{ amount: 0, grams: 14, text: "1 tablespoon" }], "1 tbsp olive oil")).toBe(14);
    expect(edibleGrams(3, "clove", portions, "3 cloves garlic")).toBe(9);
    expect(edibleGrams(2, "piece", [
      { amount: 0, grams: 60, text: "1 regular carrot" },
      { amount: 0, grams: 120, text: "1 cup" },
      { amount: 0, grams: 5, text: "1 piece/slice" },
    ], "2 carrots")).toBe(120);
    expect(edibleGrams(1, "piece", [
      { amount: 0, grams: 160, text: "1 cup" },
      { amount: 0, grams: 148, text: "1 whole" },
      { amount: 0, grams: 15, text: "1 slice" },
    ], "1 medium onion")).toBe(148);
    expect(edibleGrams(14.5, "oz", [], "14.5 oz tomatoes")).toBeCloseTo(411.068, 3);
    expect(edibleGrams(115, "g", [], "115 g butter")).toBe(115);
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

  it("counts granulated sugar as added sugar when the model misses it", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(complete({
        ingredients: [{ keyword: "sugar", query: "granulated", grams: 100, branded: false }],
      }))
      .mockResolvedValueOnce(Response.json({ foods: [{
        description: "Sugars, granulated",
        foodNutrients: [
          { nutrientId: 1008, unitName: "KCAL", value: 387 },
          { nutrientId: 1093, unitName: "MG", value: 1 },
          { nutrientId: 1258, unitName: "G", value: 0 },
          { nutrientId: 2000, unitName: "G", value: 99.8 },
          { nutrientId: 1079, unitName: "G", value: 0 },
          { nutrientId: 1003, unitName: "G", value: 0 },
        ],
      }] }))
      .mockResolvedValueOnce(complete({ matches: [[0, "none"]] }));
    vi.stubGlobal("fetch", fetchMock);
    const expected = scoreNutrition([{
      grams: 100,
      nutrients: { calories: 387, sodium: 1, saturatedFat: 0, addedSugar: 99.8, totalSugar: 99.8, fiber: 0, protein: 0 },
    }]);

    await expect(calculateHealthScore({ ingredients: ["100 g white granulated sugar"] }, keys)).resolves.toBe(expected);
  });

  it("requires one USDA term when the model names a two-word food", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(complete({
        ingredients: [{ keyword: "pinto beans", query: "boiled without salt", grams: beans.grams, branded: false }],
      }))
      .mockResolvedValueOnce(usdaBeans())
      .mockResolvedValueOnce(complete({ matches: [[0, "none"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(calculateHealthScore(recipe, keys)).resolves.toBe(scoreNutrition([beans]));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).query).toBe("+beans pinto boiled without salt");
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

  it("replaces a guessed teaspoon with the USDA gram weight", async () => {
    const beansNutrients = { calories: 160, sodium: 5, saturatedFat: 0.2, addedSugar: 0, fiber: 7, protein: 8 };
    const saltNutrients = { calories: 0, sodium: 38_800, saturatedFat: 0, addedSugar: 0, fiber: 0, protein: 0 };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(complete({ ingredients: [
        { keyword: "beans", query: "cooked beans", grams: 1000, quantity: 1000, unit: "g", branded: false },
        { keyword: "salt", query: "table salt", grams: 18, quantity: "1/2", unit: "tsp", branded: false },
      ] }))
      .mockResolvedValueOnce(usdaBeans())
      .mockResolvedValueOnce(Response.json({ foods: [{
        fdcId: 5,
        description: "Salt, table",
        foodNutrients: [
          { nutrientId: 1008, unitName: "KCAL", value: 0 },
          { nutrientId: 1093, unitName: "MG", value: 38_800 },
          { nutrientId: 1258, unitName: "G", value: 0 },
          { nutrientId: 1079, unitName: "G", value: 0 },
          { nutrientId: 1003, unitName: "G", value: 0 },
        ],
      }] }))
      .mockResolvedValueOnce(complete({ matches: [[0, "none"], [0, "none"]] }))
      .mockResolvedValueOnce(Response.json([{
        fdcId: 5,
        foodPortions: [{ amount: 1, gramWeight: 6, modifier: "tsp", measureUnit: { name: "undetermined" } }],
      }]));
    vi.stubGlobal("fetch", fetchMock);
    const expected = scoreNutrition([
      { grams: 1000, nutrients: beansNutrients },
      { grams: 3, nutrients: saltNutrients },
    ]);

    await expect(calculateHealthScore({
      ingredients: ["1000 g cooked beans", "1/2 tsp table salt"],
    }, keys)).resolves.toBe(expected);
    expect(expected).not.toBe(scoreNutrition([
      { grams: 1000, nutrients: beansNutrients },
      { grams: 18, nutrients: saltNutrients },
    ]));
    expect(String(fetchMock.mock.calls[4][0])).toBe("https://api.nal.usda.gov/fdc/v1/foods?api_key=test-usda-key");
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body)).fdcIds).toEqual([5]);
  });

  it("uses a cup weight returned by USDA search without another request", async () => {
    const lentils = { calories: 100, sodium: 2, saturatedFat: 0.1, addedSugar: 0, fiber: 10, protein: 9 };
    const salt = { calories: 0, sodium: 38_800, saturatedFat: 0, addedSugar: 0, fiber: 0, protein: 0 };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(complete({ ingredients: [
        { keyword: "lentils", query: "lentils raw", grams: 50, quantity: 1, unit: "cup", branded: false },
        { keyword: "salt", query: "table salt", grams: 1, quantity: 1, unit: "g", branded: false },
      ] }))
      .mockResolvedValueOnce(Response.json({ foods: [{
        fdcId: 8,
        description: "Lentils, raw",
        foodNutrients: [
          { nutrientId: 1008, unitName: "KCAL", value: 100 },
          { nutrientId: 1093, unitName: "MG", value: 2 },
          { nutrientId: 1258, unitName: "G", value: 0.1 },
          { nutrientId: 1079, unitName: "G", value: 10 },
          { nutrientId: 1003, unitName: "G", value: 9 },
        ],
        foodMeasures: [{ disseminationText: "1 cup", gramWeight: 192, measureUnitName: "undetermined" }],
      }] }))
      .mockResolvedValueOnce(Response.json({ foods: [{
        fdcId: 5,
        description: "Salt, table",
        foodNutrients: [
          { nutrientId: 1008, unitName: "KCAL", value: 0 },
          { nutrientId: 1093, unitName: "MG", value: 38_800 },
          { nutrientId: 1258, unitName: "G", value: 0 },
          { nutrientId: 1079, unitName: "G", value: 0 },
          { nutrientId: 1003, unitName: "G", value: 0 },
        ],
      }] }))
      .mockResolvedValueOnce(complete({ matches: [[0, "none"], [0, "none"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(calculateHealthScore({
      ingredients: ["1 cup dried lentils", "1 g salt"],
    }, keys)).resolves.toBe(scoreNutrition([
      { grams: 192, nutrients: lentils },
      { grams: 1, nutrients: salt },
    ]));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain("https://api.nal.usda.gov/fdc/v1/foods?api_key=test-usda-key");
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
