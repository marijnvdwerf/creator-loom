/**
 * Script to fetch creators from CreatorSMP API and import them into Convex
 *
 * Usage: bun run scripts/import-creators.ts
 */

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

async function fetchCreators(): Promise<CreatorSMPCreator[]> {
  const response = await fetch('https://api.creatorsmp.nl/public/snapshot?t=202511141543');
  if (!response.ok) {
    throw new Error(`Failed to fetch creators: ${response.statusText}`);
  }
  const data: CreatorSMPResponse = await response.json();
  return data.creators;
}

function cleanTwitchUrl(url?: string): string | undefined {
  if (!url) return undefined;

  // Extract username from various Twitch URL formats
  // https://www.twitch.tv/username -> username
  // https://twitch.tv/username -> username
  // twitch.tv/username -> username
  // username -> username

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

async function main() {
  const creators = await fetchCreators();
  const converted = creators.map(convertCreator);
  console.log(JSON.stringify(converted, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
