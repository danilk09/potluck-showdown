// Fills a dev deployment with demo data:  npm run seed
// Internal, so only someone with deploy access can run it.
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashPassword } from "./auth";

export const DEMO_PASSWORD = "password123";

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; message: string }> => {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    return await ctx.runMutation(internal.seed.defaultSeed, { passwordHash });
  },
});
