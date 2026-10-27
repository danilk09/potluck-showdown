import { mutation } from "./_generated/server";

export const defaultSeed = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Wipe all existing collections
    const collections = ["users", "potlucks", "dishes", "ballots", "inviteCodes", "images"] as const;
    for (const coll of collections) {
      const records = await ctx.db.query(coll).collect();
      for (const rec of records) {
        await ctx.db.delete(rec._id);
      }
    }

    const now = Date.now();
    const day = (offsetDays: number, hour = 18) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      d.setHours(hour, 30, 0, 0);
      return d.getTime();
    };

    // 2. Create Users
    const PASSWORD = "password123";
    const youId = await ctx.db.insert("users", {
      email: "you@example.com",
      password: PASSWORD,
      displayName: "Alex Rivera",
      photoURL: null,
      frame: null,
      isGuest: false,
      sessionToken: "tok_you_demo",
      createdAt: now,
      lastSeenAt: now,
    });

    const mayaId = await ctx.db.insert("users", {
      email: "maya@example.com",
      password: PASSWORD,
      displayName: "Maya Chen",
      photoURL: null,
      frame: null,
      isGuest: false,
      sessionToken: "tok_maya_demo",
      createdAt: now,
      lastSeenAt: now,
    });

    const leoId = await ctx.db.insert("users", {
      email: "leo@example.com",
      password: PASSWORD,
      displayName: "Leo Martinez",
      photoURL: null,
      frame: null,
      isGuest: false,
      sessionToken: "tok_leo_demo",
      createdAt: now,
      lastSeenAt: now,
    });

    const priyaId = await ctx.db.insert("users", {
      email: "priya@example.com",
      password: PASSWORD,
      displayName: "Priya Shah",
      photoURL: null,
      frame: null,
      isGuest: false,
      sessionToken: "tok_priya_demo",
      createdAt: now,
      lastSeenAt: now,
    });

    const everyone = [youId, mayaId, leoId, priyaId];

    const defaultScoring = [
      { id: "c0", name: "Deliciousness", description: "Flavor, taste, and how much you’d want another bite.", weight: 60 },
      { id: "c1", name: "Healthiness", description: "Whole ingredients, balance, and nutrition.", weight: 40 },
    ];

    const categories = (names: string[]) => names.map((name, i) => ({ id: `k${i}`, name, needed: 2 }));

    // --- Potluck 1: Healthy Harvest Cook-Off (Closed) ---
    const p1Id = await ctx.db.insert("potlucks", {
      title: "Healthy Harvest Cook-Off",
      theme: "Plant-based comfort food",
      format: "classic",
      formatDetail: "",
      location: "Hawthorne Hall rooftop",
      description: "Bring a shareable, healthy dish and compete for the tastiest, most nutritious plate.",
      startsAt: day(-7),
      votingOpensAt: null,
      votingClosesAt: null,
      maxGuests: 0,
      scoring: defaultScoring,
      categoryIds: ["c0", "c1"],
      dishCategories: categories(["Main dishes", "Salads", "Desserts"]),
      coverImage: null,
      inviteCode: "HARVEST-7K2Q",
      hostId: youId,
      memberIds: everyone,
      status: "closed",
      podium: [youId, mayaId, priyaId],
      results: {
        totalVotes: 12,
        averageRating: 4.4,
        winningRating: 5.0,
        dishCount: 4,
        guestCount: 4,
        publishedAt: now,
      },
      createdAt: day(-8),
      updatedAt: day(-7),
    });

    await ctx.db.insert("inviteCodes", {
      code: "HARVEST-7K2Q",
      potluckId: p1Id,
      hostId: youId,
      createdAt: day(-8),
    });

    // Dishes for Potluck 1
    const d1_you = await ctx.db.insert("dishes", {
      potluckId: p1Id,
      authorId: youId,
      name: "Green Shakshuka",
      categoryId: "k0",
      serves: "6 people",
      ingredients: ["spinach", "leeks", "6 eggs", "feta", "cumin", "olive oil"],
      steps: "Sauté leeks, wilt the spinach, make wells, crack in eggs, cover until set. Finish with feta.",
      dietary: ["Vegetarian", "Gluten-free"],
      allergens: ["Eggs", "Milk"],
      prepMinutes: 30,
      calories: 280,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: { c0: 15, c1: 15 },
      ratingCount: 3,
      likedBy: [mayaId, priyaId],
      createdAt: day(-8),
      updatedAt: day(-7),
    });

    const d1_maya = await ctx.db.insert("dishes", {
      potluckId: p1Id,
      authorId: mayaId,
      name: "Spicy Sesame Noodles",
      categoryId: "k0",
      serves: "6 people",
      ingredients: ["8 oz wheat noodles", "2 tbsp sesame paste", "1 tbsp soy sauce", "2 scallions", "1 tsp chili crisp"],
      steps: "1. Boil the noodles and rinse with cold water.\n2. Whisk sesame paste, soy sauce, and chili crisp.\n3. Toss everything and top with scallions.",
      dietary: ["Vegan"],
      allergens: ["Sesame", "Soy", "Wheat"],
      prepMinutes: 15,
      calories: 320,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: { c0: 15, c1: 12 },
      ratingCount: 3,
      likedBy: [youId],
      createdAt: day(-8),
      updatedAt: day(-7),
    });

    const d1_priya = await ctx.db.insert("dishes", {
      potluckId: p1Id,
      authorId: priyaId,
      name: "Rainbow Crunch Salad",
      categoryId: "k1",
      serves: "8 people",
      ingredients: ["kale", "red cabbage", "carrots", "edamame", "peanut dressing"],
      steps: "Chop everything finely, toss with the dressing, and let it sit 10 minutes.",
      dietary: ["Vegan", "Gluten-free"],
      allergens: ["Peanuts", "Soy"],
      prepMinutes: 20,
      calories: 210,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: { c0: 12, c1: 15 },
      ratingCount: 3,
      likedBy: [leoId],
      createdAt: day(-8),
      updatedAt: day(-7),
    });

    const d1_leo = await ctx.db.insert("dishes", {
      potluckId: p1Id,
      authorId: leoId,
      name: "Brown Butter Brownies",
      categoryId: "k2",
      serves: "12 squares",
      ingredients: ["1 cup butter", "3/4 cup cocoa", "1 cup sugar", "2 eggs", "1/2 cup flour"],
      steps: "Brown the butter, whisk in cocoa and sugar, add eggs, fold in flour. Bake 25 minutes at 350°F.",
      dietary: ["Vegetarian"],
      allergens: ["Milk", "Eggs", "Wheat"],
      prepMinutes: 40,
      calories: 420,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: { c0: 12, c1: 6 },
      ratingCount: 3,
      likedBy: [],
      createdAt: day(-8),
      updatedAt: day(-7),
    });

    // Award silver frame to Maya
    await ctx.db.patch(mayaId, {
      frame: { tier: "silver", potluckId: p1Id },
    });

    // --- Potluck 2: Sunset Rooftop Supper (Voting Open) ---
    const p2Id = await ctx.db.insert("potlucks", {
      title: "Sunset Rooftop Supper",
      theme: "Mediterranean Challenge",
      format: "regional",
      formatDetail: "Mediterranean",
      location: "Kuykendall Hall roof",
      description: "Mezze, mains, and sweets from around the Mediterranean.",
      startsAt: day(0, 18),
      votingOpensAt: null,
      votingClosesAt: null,
      maxGuests: 12,
      scoring: [
        { id: "c0", name: "Deliciousness", description: "Flavor, taste, and how much you’d want another bite.", weight: 50 },
        { id: "c1", name: "Healthiness", description: "Whole ingredients, balance, and nutrition.", weight: 30 },
        { id: "c2", name: "Creativity", description: "Originality and how unique the dish feels.", weight: 20 },
      ],
      categoryIds: ["c0", "c1", "c2"],
      dishCategories: categories(["Mezze", "Mains", "Sweets"]),
      coverImage: null,
      inviteCode: "SUNSET-4MXR",
      hostId: priyaId,
      memberIds: everyone,
      status: "voting",
      podium: [],
      results: null,
      createdAt: day(-2),
      updatedAt: now,
    });

    await ctx.db.insert("inviteCodes", {
      code: "SUNSET-4MXR",
      potluckId: p2Id,
      hostId: priyaId,
      createdAt: day(-2),
    });

    // Dishes for Potluck 2
    await ctx.db.insert("dishes", {
      potluckId: p2Id,
      authorId: mayaId,
      name: "Roasted Beet Hummus",
      categoryId: "k0",
      serves: "10 people",
      ingredients: ["chickpeas", "roasted beets", "tahini", "lemon", "garlic"],
      steps: "Blend everything until silky. Drizzle with olive oil.",
      dietary: ["Vegan", "Gluten-free"],
      allergens: ["Sesame"],
      prepMinutes: 15,
      calories: 180,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: { c0: 5, c1: 5, c2: 4 },
      ratingCount: 1,
      likedBy: [youId],
      createdAt: day(-1),
      updatedAt: now,
    });

    await ctx.db.insert("dishes", {
      potluckId: p2Id,
      authorId: leoId,
      name: "Crispy Chickpea Tacos",
      categoryId: "k1",
      serves: "8 tacos",
      ingredients: ["chickpeas", "corn tortillas", "avocado", "lime", "slaw"],
      steps: "Roast spiced chickpeas until crisp, pile into warm tortillas with slaw and avocado.",
      dietary: ["Vegan"],
      allergens: [],
      prepMinutes: 35,
      calories: 350,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: { c0: 4, c1: 4, c2: 5 },
      ratingCount: 1,
      likedBy: [priyaId],
      createdAt: day(-1),
      updatedAt: now,
    });

    await ctx.db.insert("dishes", {
      potluckId: p2Id,
      authorId: priyaId,
      name: "Fattoush Crunch Salad",
      categoryId: "k0",
      serves: "8 people",
      ingredients: ["cucumber", "tomatoes", "radishes", "pita chips", "sumac vinaigrette"],
      steps: "Toss fresh vegetables with crispy pita and tart sumac dressing.",
      dietary: ["Vegan"],
      allergens: ["Wheat"],
      prepMinutes: 20,
      calories: 190,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: {},
      ratingCount: 0,
      likedBy: [],
      createdAt: day(-1),
      updatedAt: now,
    });

    await ctx.db.insert("dishes", {
      potluckId: p2Id,
      authorId: youId,
      name: "Classic Shakshuka",
      categoryId: "k1",
      serves: "6 people",
      ingredients: ["tomatoes", "bell peppers", "onions", "eggs", "paprika", "crusty bread"],
      steps: "Simmer tomatoes and peppers with cumin and paprika, crack eggs into sauce, bake until soft.",
      dietary: ["Vegetarian"],
      allergens: ["Eggs", "Wheat"],
      prepMinutes: 30,
      calories: 290,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: {},
      ratingCount: 0,
      likedBy: [],
      createdAt: day(-1),
      updatedAt: now,
    });

    // Ballots for Potluck 2
    await ctx.db.insert("ballots", {
      potluckId: p2Id,
      dishId: d1_maya,
      userId: leoId,
      scores: { c0: 5, c1: 5, c2: 4 },
      createdAt: now,
    });

    await ctx.db.insert("ballots", {
      potluckId: p2Id,
      dishId: d1_leo,
      userId: mayaId,
      scores: { c0: 4, c1: 4, c2: 5 },
      createdAt: now,
    });

    // --- Potluck 3: Study Break Brunch (Upcoming) ---
    const p3Id = await ctx.db.insert("potlucks", {
      title: "Study Break Brunch",
      theme: "Plant-Based Challenge",
      format: "courses",
      formatDetail: "",
      location: "Hale Aloha lounge",
      description: "Finals fuel! Each course is its own bracket.",
      startsAt: day(4, 11),
      votingOpensAt: null,
      votingClosesAt: null,
      maxGuests: 10,
      scoring: defaultScoring,
      categoryIds: ["c0", "c1"],
      dishCategories: categories(["Sweet", "Savory", "Drinks"]),
      coverImage: null,
      inviteCode: "BRUNCH-9PLT",
      hostId: mayaId,
      memberIds: [youId, leoId, priyaId, mayaId],
      status: "open",
      podium: [],
      results: null,
      createdAt: day(-1),
      updatedAt: now,
    });

    await ctx.db.insert("inviteCodes", {
      code: "BRUNCH-9PLT",
      potluckId: p3Id,
      hostId: mayaId,
      createdAt: day(-1),
    });

    await ctx.db.insert("dishes", {
      potluckId: p3Id,
      authorId: mayaId,
      name: "Berry Oat Waffles",
      categoryId: "k0",
      serves: "8 waffles",
      ingredients: ["oat flour", "oat milk", "banana", "baking powder", "mixed berries"],
      steps: "Blend the batter, rest 5 minutes, cook in a hot waffle iron, top with berries.",
      dietary: ["Vegan", "Dairy-free"],
      allergens: [],
      prepMinutes: 25,
      calories: 300,
      photo: null,
      recipePhoto: null,
      usedRequired: false,
      scoreSums: {},
      ratingCount: 0,
      likedBy: [],
      createdAt: day(-1),
      updatedAt: now,
    });

    // --- Potluck 4: Dorm Dumpling Night (Join code test) ---
    const p4Id = await ctx.db.insert("potlucks", {
      title: "Dorm Dumpling Night",
      theme: "Mystery Basket",
      format: "mystery",
      formatDetail: "cabbage, ginger, mushrooms",
      location: "Frear Hall kitchen",
      description: "Every dish must use all three basket ingredients.",
      startsAt: day(9, 19),
      votingOpensAt: null,
      votingClosesAt: null,
      maxGuests: 0,
      scoring: defaultScoring,
      categoryIds: ["c0", "c1"],
      dishCategories: categories(["Dumplings", "Sides"]),
      coverImage: null,
      inviteCode: "DUMPLING-3QZ",
      hostId: leoId,
      memberIds: [leoId],
      status: "open",
      podium: [],
      results: null,
      createdAt: day(-1),
      updatedAt: now,
    });

    await ctx.db.insert("inviteCodes", {
      code: "DUMPLING-3QZ",
      potluckId: p4Id,
      hostId: leoId,
      createdAt: day(-1),
    });

    return {
      success: true,
      message: "Demo data created: 4 users, 4 potlucks, dishes, and ratings.",
    };
  },
});
