import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// Date range for VOD filtering (Nov 9-30, 2025)
const START_DATE = new Date("2025-11-09T00:00:00Z");
const END_DATE = new Date("2025-11-30T23:59:59Z");

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_API_BASE = "https://api.twitch.tv/helix";

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

function isWithinDateRange(dateStr: string): boolean {
  const date = new Date(dateStr);
  return date >= START_DATE && date <= END_DATE;
}

async function getAppAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
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
      return null;
    }

    const data = (await response.json()) as TwitchUsersResponse;
    return data.data.length > 0 ? data.data[0].id : null;
  } catch {
    return null;
  }
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

    const data = (await response.json()) as TwitchVideosResponse;

    // Filter videos by date range
    const filteredVideos = data.data.filter((video) =>
      isWithinDateRange(video.created_at)
    );

    allVideos.push(...filteredVideos);

    // Check if we need to continue pagination
    cursor = data.pagination?.cursor;
    hasMore = !!cursor;

    // If the last video in this page is before our start date, stop paginating
    if (data.data.length > 0) {
      const lastVideoDate = new Date(data.data[data.data.length - 1].created_at);
      if (lastVideoDate < START_DATE) {
        hasMore = false;
      }
    }
  }

  return allVideos;
}

export const sync = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing required environment variables: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET"
      );
    }

    // Get Twitch access token
    const token = await getAppAccessToken(clientId, clientSecret);

    // Get all creators
    const creators = await ctx.runQuery(internal.vods.getCreators, {});

    // Process each creator with Twitch account
    for (const creator of creators) {
      if (!creator.twitch) continue;

      // Get Twitch user ID
      const userId = await getUserId(creator.twitch, token, clientId);
      if (!userId) continue;

      // Fetch all VODs for this creator
      const videos = await getAllVideosForUser(userId, token, clientId);

      // Upsert each VOD
      for (const video of videos) {
        await ctx.runMutation(internal.vods.upsertVod, {
          id: video.id,
          stream_id: video.stream_id || undefined,
          user_id: video.user_id,
          user_login: video.user_login,
          user_name: video.user_name,
          title: video.title,
          description: video.description,
          created_at: new Date(video.created_at).getTime(),
          published_at: video.published_at,
          url: video.url,
          thumbnail_url: video.thumbnail_url,
          viewable: video.viewable,
          view_count: video.view_count,
          language: video.language,
          type: video.type,
          duration: video.duration,
          creatorId: creator._id,
        });
      }
    }

    return null;
  },
});

export const getCreators = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("creators"),
      name: v.string(),
      twitch: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const creators = await ctx.db.query("creators").collect();
    return creators.map((c) => ({
      _id: c._id,
      name: c.name,
      twitch: c.twitch,
    }));
  },
});

export const upsertVod = internalMutation({
  args: {
    id: v.string(),
    stream_id: v.optional(v.string()),
    user_id: v.string(),
    user_login: v.string(),
    user_name: v.string(),
    title: v.string(),
    description: v.string(),
    created_at: v.number(),
    published_at: v.string(),
    url: v.string(),
    thumbnail_url: v.string(),
    viewable: v.string(),
    view_count: v.number(),
    language: v.string(),
    type: v.string(),
    duration: v.string(),
    creatorId: v.id("creators"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find existing VOD by id
    const existing = await ctx.db
      .query("twitch_vods")
      .filter((q) => q.eq(q.field("id"), args.id))
      .unique();

    if (existing) {
      // Update existing VOD
      await ctx.db.patch(existing._id, args);
    } else {
      // Insert new VOD
      await ctx.db.insert("twitch_vods", args);
    }

    return null;
  },
});
