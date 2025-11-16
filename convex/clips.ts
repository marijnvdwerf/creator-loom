import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// Date range for clip filtering (Nov 9 - Dec 2, 2025)
const START_DATE = new Date("2025-11-09T00:00:00Z");
const END_DATE = new Date("2025-12-02T23:59:59Z");

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

interface TwitchClip {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
  vod_offset?: number;
}

interface TwitchClipsResponse {
  data: TwitchClip[];
  pagination?: {
    cursor?: string;
  };
}

interface TwitchVideo {
  id: string;
  stream_id?: string;
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
    const body = await response.text();
    throw new Error(`Failed to get access token: ${response.statusText} - ${body}`);
  }

  const data = JSON.parse(await response.text()) as TwitchTokenResponse;
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

async function getSingleVideo(
  videoId: string,
  token: string,
  clientId: string
): Promise<TwitchVideo | null> {
  const url = `${TWITCH_API_BASE}/videos?id=${videoId}`;

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

    const data = (await response.json()) as TwitchVideosResponse;
    return data.data.length > 0 ? data.data[0] : null;
  } catch {
    return null;
  }
}

async function getAllClipsForBroadcaster(
  broadcasterId: string,
  token: string,
  clientId: string
): Promise<TwitchClip[]> {
  const allClips: TwitchClip[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    let url = `${TWITCH_API_BASE}/clips?broadcaster_id=${broadcasterId}&started_at=${encodeURIComponent(START_DATE.toISOString())}&ended_at=${encodeURIComponent(END_DATE.toISOString())}&first=100`;
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
      throw new Error(`Failed to fetch clips: ${response.statusText}`);
    }

    const data = (await response.json()) as TwitchClipsResponse;

    allClips.push(...data.data);

    // Check if we need to continue pagination
    cursor = data.pagination?.cursor;
    hasMore = !!cursor;

    // If the last clip in this page is before our start date, stop paginating
    if (data.data.length > 0) {
      const lastClipDate = new Date(data.data[data.data.length - 1].created_at);
      if (lastClipDate < START_DATE) {
        hasMore = false;
      }
    }
  }

  return allClips;
}

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

export const upsertVodById = internalMutation({
  args: {
    videoId: v.string(),
    creatorId: v.id("creators"),
  },
  returns: v.union(v.id("twitch_vods"), v.null()),
  handler: async (ctx, args) => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing required environment variables: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET"
      );
    }

    // Get access token
    const token = await getAppAccessToken(clientId, clientSecret);

    // Fetch the video
    const video = await getSingleVideo(args.videoId, token, clientId);
    if (!video) {
      return null;
    }

    // Check if VOD already exists
    const existing = await ctx.db
      .query("twitch_vods")
      .filter((q) => q.eq(q.field("id"), video.id))
      .unique();

    const vodData = {
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
      creatorId: args.creatorId,
    };

    if (existing) {
      await ctx.db.patch(existing._id, vodData);
      return existing._id;
    } else {
      return await ctx.db.insert("twitch_vods", vodData);
    }
  },
});

export const upsertClip = internalMutation({
  args: {
    id: v.string(),
    url: v.string(),
    embed_url: v.string(),
    broadcaster_id: v.string(),
    broadcaster_name: v.string(),
    creator_id: v.string(),
    creator_name: v.string(),
    title: v.string(),
    language: v.string(),
    thumbnail_url: v.string(),
    view_count: v.number(),
    created_at: v.number(),
    video_id: v.optional(v.string()),
    vod_offset: v.optional(v.number()),
    duration: v.number(),
    vodId: v.optional(v.id("twitch_vods")),
    creatorId: v.id("creators"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find existing clip by id
    const existing = await ctx.db
      .query("twitch_clips")
      .filter((q) => q.eq(q.field("id"), args.id))
      .unique();

    if (existing) {
      // Update existing clip
      await ctx.db.patch(existing._id, args);
    } else {
      // Insert new clip
      await ctx.db.insert("twitch_clips", args);
    }

    return null;
  },
});

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

      // Fetch all clips for this broadcaster
      const clips = await getAllClipsForBroadcaster(userId, token, clientId);

      // Upsert each clip
      for (const clip of clips) {
        let vodId: string | null = null;

        // Handle video_id if present
        if (clip.video_id) {
          // Try to upsert the VOD if it doesn't exist
          const newVodId = await ctx.runMutation(internal.clips.upsertVodById, {
            videoId: clip.video_id,
            creatorId: creator._id,
          });
          if (newVodId) {
            vodId = newVodId;
          }
        }

        await ctx.runMutation(internal.clips.upsertClip, {
          id: clip.id,
          url: clip.url,
          embed_url: clip.embed_url,
          broadcaster_id: clip.broadcaster_id,
          broadcaster_name: clip.broadcaster_name,
          creator_id: clip.creator_id,
          creator_name: clip.creator_name,
          title: clip.title,
          language: clip.language,
          thumbnail_url: clip.thumbnail_url,
          view_count: clip.view_count,
          created_at: new Date(clip.created_at).getTime(),
          video_id: clip.video_id || undefined,
          vod_offset: clip.vod_offset,
          duration: clip.duration,
          vodId: vodId as any,
          creatorId: creator._id,
        });
      }
    }

    console.log(`Synced clips from ${creators.length} creators`);
    return null;
  },
});
