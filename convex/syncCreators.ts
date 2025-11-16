"use node";

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
    // Fetch creators from CreatorSMP API
    const response = await fetch('https://api.creatorsmp.nl/public/snapshot?t=202511141543');
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

