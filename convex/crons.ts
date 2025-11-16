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

// Sync clips every 5 minutes during event hours (13:00-01:59) from Nov 9 to Dec 2
// "3,8,13,18,23,28,33,38,43,48,53,58 13-23,0-1 * 11-12 *"
// Minutes: 3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58 (every 5 minutes starting at :03)
// Hours: 13-23, 0-1 (13:00-23:59 and 00:00-01:59 UTC)
// Months: 11-12 (November and December)
crons.cron(
  "sync clips",
  "3,8,13,18,23,28,33,38,43,48,53,58 13-23,0-1 * 11-12 *",
  internal.clips.sync,
  {}
);

export default crons;
