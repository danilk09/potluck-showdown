import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("purge expired sessions and reset codes", { hourUTC: 9, minuteUTC: 0 }, internal.authStore.purgeExpired, {});

export default crons;
