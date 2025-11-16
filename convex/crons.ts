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

// Sync VODs from Twitch every hour between 13:00 and 01:00 (server hours) during November
// "0 13-23,0-1 * 11 *" = every hour from 13:00-23:59 and 00:00-01:59 UTC
crons.cron(
  "sync vods",
  "0 13-23,0-1 * 11 *",
  internal.vods.sync,
  {}
);

export default crons;
