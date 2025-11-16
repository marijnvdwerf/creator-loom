import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync creators from CreatorSMP API every hour during November
// Cron format: minute hour day month day_of_week
// "0 * * 11 *" = at minute 0 of every hour, every day, only in November
crons.cron(
  "sync creators",
  "0 * * 11 *",
  internal.creators.sync,
  {}
);

export default crons;
