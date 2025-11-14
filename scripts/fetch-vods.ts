#!/usr/bin/env bun

/**
 * Fetches all Twitch VODs for CreatorSMP creators
 * Usage: bun run scripts/fetch-vods.ts
 *
 * Environment variables required:
 * - TWITCH_CLIENT_ID: Your Twitch application client ID
 * - TWITCH_CLIENT_SECRET: Your Twitch application client secret
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";

// ============================================================================
// Type Definitions
// ============================================================================

interface Creator {
  name: string;
  team: number;
  alive: boolean;
  deathDate: string | null;
  social: {
    twitch?: string;
  };
}

interface SnapshotResponse {
  creators: Creator[];
}

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
}

interface TwitchUsersResponse {
  data: TwitchUser[];
}

interface TwitchVideo {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
}

interface TwitchVideosResponse {
  data: TwitchVideo[];
  pagination?: {
    cursor?: string;
  };
}

interface VodOutput {
  id: string;
  title: string;
  createdAt: string;
  duration: string;
  thumbnailUrl: string;
  viewCount: number;
}

interface CreatorOutput {
  name: string;
  twitchUsername: string;
  team: number;
  alive: boolean;
  deathDate: string | null;
  vods: VodOutput[];
}

interface OutputData {
  lastUpdated: string;
  creators: CreatorOutput[];
}

// ============================================================================
// Configuration
// ============================================================================

const CREATORS_API_URL = "https://api.creatorsmp.nl/public/snapshot?t=202511141543";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_API_BASE = "https://api.twitch.tv/helix";
const OUTPUT_PATH = join(process.cwd(), "src", "data", "vods.json");

// Date range for VOD filtering (Nov 9-30, 2025)
const START_DATE = new Date("2025-11-09T00:00:00Z");
const END_DATE = new Date("2025-11-30T23:59:59Z");

// Rate limiting
const REQUESTS_PER_MINUTE = 800;
const DELAY_BETWEEN_REQUESTS = Math.ceil(60000 / REQUESTS_PER_MINUTE); // ~75ms

// ============================================================================
// Utility Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isWithinDateRange(dateStr: string): boolean {
  const date = new Date(dateStr);
  return date >= START_DATE && date <= END_DATE;
}

function validateEnvironment(): void {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    throw new Error(
      "Missing required environment variables: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET"
    );
  }
}

function extractUsernameFromUrl(url: string): string {
  // Extract username from URLs like "https://www.twitch.tv/username" or "https://twitch.tv/username"
  const match = url.match(/twitch\.tv\/([^\/\s?]+)/i);
  return match ? match[1] : url;
}

// ============================================================================
// Twitch API Functions
// ============================================================================

async function getAppAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  console.log("Obtaining Twitch app access token...");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = (await response.json()) as TwitchTokenResponse;
  console.log("Successfully obtained access token");
  return data.access_token;
}

async function getUserId(
  username: string,
  token: string,
  clientId: string
): Promise<string | null> {
  const url = `${TWITCH_API_BASE}/users?login=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    });

    if (!response.ok) {
      console.error(`Failed to get user ID for ${username}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as TwitchUsersResponse;

    if (data.data.length === 0) {
      console.warn(`No Twitch user found for username: ${username}`);
      return null;
    }

    return data.data[0].id;
  } catch (error) {
    console.error(`Error fetching user ID for ${username}:`, error);
    return null;
  }
}

async function fetchVideosPage(
  userId: string,
  token: string,
  clientId: string,
  cursor?: string
): Promise<TwitchVideosResponse> {
  let url = `${TWITCH_API_BASE}/videos?user_id=${userId}&type=archive&first=100`;

  if (cursor) {
    url += `&after=${cursor}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch videos: ${response.statusText}`);
  }

  return await response.json() as TwitchVideosResponse;
}

async function getAllVideosForUser(
  userId: string,
  token: string,
  clientId: string
): Promise<TwitchVideo[]> {
  const allVideos: TwitchVideo[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchVideosPage(userId, token, clientId, cursor);

    // Filter videos by date range
    const filteredVideos = response.data.filter(video =>
      isWithinDateRange(video.created_at)
    );

    allVideos.push(...filteredVideos);

    // Check if we need to continue pagination
    cursor = response.pagination?.cursor;
    hasMore = !!cursor;

    // If the last video in this page is before our start date, stop paginating
    if (response.data.length > 0) {
      const lastVideoDate = new Date(response.data[response.data.length - 1].created_at);
      if (lastVideoDate < START_DATE) {
        hasMore = false;
      }
    }

    // Respect rate limits
    if (hasMore) {
      await delay(DELAY_BETWEEN_REQUESTS);
    }
  }

  return allVideos;
}

// ============================================================================
// Main Functions
// ============================================================================

async function fetchCreators(): Promise<Creator[]> {
  console.log("Fetching creators from CreatorSMP API...");

  const response = await fetch(CREATORS_API_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch creators: ${response.statusText}`);
  }

  const data = (await response.json()) as SnapshotResponse;
  console.log(`Found ${data.creators.length} creators`);

  return data.creators;
}

function convertToVodOutput(video: TwitchVideo): VodOutput {
  return {
    id: video.id,
    title: video.title,
    createdAt: video.created_at,
    duration: video.duration,
    thumbnailUrl: video.thumbnail_url,
    viewCount: video.view_count,
  };
}

async function processCreator(
  creator: Creator,
  token: string,
  clientId: string
): Promise<CreatorOutput | null> {
  const twitchUrl = creator.social.twitch;

  if (!twitchUrl) {
    console.log(`Skipping ${creator.name}: No Twitch username`);
    return null;
  }

  // Extract username from URL
  const twitchUsername = extractUsernameFromUrl(twitchUrl);

  console.log(`Processing ${creator.name} (${twitchUrl})...`);

  // Get user ID
  await delay(DELAY_BETWEEN_REQUESTS);
  const userId = await getUserId(twitchUsername, token, clientId);

  if (!userId) {
    console.error(`Could not find Twitch user ID for ${twitchUsername}`);
    return null;
  }

  // Fetch all VODs
  console.log(`Fetching VODs for ${creator.name}...`);
  await delay(DELAY_BETWEEN_REQUESTS);

  try {
    const videos = await getAllVideosForUser(userId, token, clientId);
    const vods = videos.map(convertToVodOutput);

    console.log(`Found ${vods.length} VODs for ${creator.name}`);

    return {
      name: creator.name,
      twitchUsername,
      team: creator.team,
      alive: creator.alive,
      deathDate: creator.deathDate,
      vods,
    };
  } catch (error) {
    console.error(`Error fetching VODs for ${creator.name}:`, error);
    return null;
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("CreatorSMP VOD Fetcher");
  console.log("=".repeat(60));
  console.log();

  // Validate environment
  validateEnvironment();

  const clientId = process.env.TWITCH_CLIENT_ID!;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!;

  try {
    // Get Twitch access token
    const token = await getAppAccessToken(clientId, clientSecret);
    console.log();

    // Fetch creators
    const creators = await fetchCreators();
    console.log();

    // Filter creators with Twitch usernames
    const creatorsWithTwitch = creators.filter(c => c.social.twitch);
    console.log(`Processing ${creatorsWithTwitch.length} creators with Twitch accounts`);
    console.log();

    // Process each creator
    const results: CreatorOutput[] = [];

    for (const creator of creatorsWithTwitch) {
      const result = await processCreator(creator, token, clientId);

      if (result) {
        results.push(result);
      }

      console.log();
    }

    // Sort results by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    // Prepare output data
    const outputData: OutputData = {
      lastUpdated: new Date().toISOString(),
      creators: results,
    };

    // Ensure output directory exists
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });

    // Write to file
    await writeFile(
      OUTPUT_PATH,
      JSON.stringify(outputData, null, 2),
      "utf-8"
    );

    console.log("=".repeat(60));
    console.log(`Successfully saved VODs for ${results.length} creators`);
    console.log(`Total VODs: ${results.reduce((sum, c) => sum + c.vods.length, 0)}`);
    console.log(`Output file: ${OUTPUT_PATH}`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
main();
