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

  return {
    name: creator.name,
    team: creator.team,
    state: creator.state,
    avatarUrl: creator.avatarUrl,
    lastSeen: creator.lastSeen,
    deathTime: creator.deathTime,
    deathMessage: creator.deathMessage,
    deathClips,
    twitch: cleanTwitchUrl(creator.social?.twitch),
    youtube: creator.social?.youtube,
    instagram: creator.social?.instagram,
    tiktok: creator.social?.tiktok,
  };
}

async function main() {
  console.log('Fetching creators from CreatorSMP API...');
  const creators = await fetchCreators();
  console.log(`Fetched ${creators.length} creators`);

  const converted = creators.map(convertCreator);

  // Output as JSON for inspection
  console.log('\nConverted creators:');
  console.log(JSON.stringify(converted, null, 2));

  // TODO: Import into Convex
  console.log('\n⚠️  Convex import not yet implemented');
}

main().catch(console.error);
