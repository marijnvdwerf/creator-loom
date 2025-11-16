import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

interface CreatorSMPCreator {
  uuid: string;
  name: string;
  team: number | null;
  state: number;
  avatarUrl?: string;
  lastSeen?: string;
  deathTime?: string | null;
  deathMessage?: string | null;
  deathClips?: string;
  social?: {
    twitch?: string;
    youtube?: string;
    instagram?: string;
    tiktok?: string;
  };
}

interface CreatorSMPResponse {
  version: number;
  generatedAt: string;
  count: number;
  creators: CreatorSMPCreator[];
}

function cleanTwitchUrl(url?: string): string | undefined {
  if (!url) return undefined;

  // Extract username from various Twitch URL formats
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^\/\?]+)/i);
  if (match) {
    return match[1].toLowerCase();
  }

  // If no match and doesn't look like a URL, assume it's already a username
  if (!url.includes('/') && !url.includes('.')) {
    return url.toLowerCase();
  }

  return undefined;
}

function convertCreator(creator: CreatorSMPCreator) {
  // Parse deathClips from JSON string to array
  let deathClips: string[] | undefined;
  if (creator.deathClips) {
    try {
      deathClips = JSON.parse(creator.deathClips);
    } catch {
      deathClips = undefined;
    }
  }

  const result: any = {
    name: creator.name,
    team: creator.team,
    state: creator.state,
  };

  // Only include optional fields if they have values
  if (creator.avatarUrl) result.avatarUrl = creator.avatarUrl;
  if (creator.lastSeen) result.lastSeen = creator.lastSeen;
  if (creator.deathTime !== undefined && creator.deathTime !== null) result.deathTime = creator.deathTime;
  if (creator.deathMessage !== undefined && creator.deathMessage !== null) result.deathMessage = creator.deathMessage;
  if (deathClips && deathClips.length > 0) result.deathClips = deathClips;

  const twitchUsername = cleanTwitchUrl(creator.social?.twitch);
  if (twitchUsername) result.twitch = twitchUsername;
  if (creator.social?.youtube) result.youtube = creator.social.youtube;
  if (creator.social?.instagram) result.instagram = creator.social.instagram;
  if (creator.social?.tiktok) result.tiktok = creator.social.tiktok;

  return result;
}

export const sync = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Generate timestamp in YYYYMMDDHHmm format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}${month}${day}${hours}${minutes}`;

    // Fetch creators from CreatorSMP API
    const response = await fetch(`https://api.creatorsmp.nl/public/snapshot?t=${timestamp}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch creators: ${response.statusText}`);
    }
    const data: CreatorSMPResponse = await response.json();

    // Convert and upsert each creator
    for (const creator of data.creators) {
      const converted = convertCreator(creator);
      await ctx.runMutation(internal.creators.upsert, converted);
    }

    console.log(`Synced ${data.creators.length} creators`);
    return null;
  },
});

export const upsert = internalMutation({
  args: {
    name: v.string(),
    team: v.union(v.number(), v.null()),
    state: v.number(),
    avatarUrl: v.optional(v.string()),
    lastSeen: v.optional(v.string()),
    deathTime: v.optional(v.union(v.string(), v.null())),
    deathMessage: v.optional(v.union(v.string(), v.null())),
    deathClips: v.optional(v.array(v.string())),
    twitch: v.optional(v.string()),
    youtube: v.optional(v.string()),
    instagram: v.optional(v.string()),
    tiktok: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find existing creator by name
    const existing = await ctx.db
      .query("creators")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      // Update existing creator
      await ctx.db.patch(existing._id, args);
    } else {
      // Insert new creator
      await ctx.db.insert("creators", args);
    }

    return null;
  },
});
