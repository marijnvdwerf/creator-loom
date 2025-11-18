import { defineTask } from 'nitro/task'
import { getDb } from '@/db/client'
import { creators, twitchVods, twitchClips } from '@/db/schema'
import { eq } from 'drizzle-orm'

// Date range for clip filtering (Nov 9 - Dec 2, 2025)
const START_DATE = new Date('2025-11-09T00:00:00Z')
const END_DATE = new Date('2025-12-02T23:59:59Z')

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TWITCH_API_BASE = 'https://api.twitch.tv/helix'

interface TwitchTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface TwitchUser {
  id: string
  login: string
  display_name: string
}

interface TwitchUsersResponse {
  data: TwitchUser[]
}

interface TwitchVideo {
  id: string
  stream_id?: string
  user_id: string
  user_login: string
  user_name: string
  title: string
  description: string
  created_at: string
  published_at: string
  url: string
  thumbnail_url: string
  viewable: string
  view_count: number
  language: string
  type: string
  duration: string
}

interface TwitchVideosResponse {
  data: TwitchVideo[]
  pagination?: {
    cursor?: string
  }
}

interface TwitchClip {
  id: string
  url: string
  embed_url: string
  broadcaster_id: string
  broadcaster_name: string
  creator_id: string
  creator_name: string
  video_id: string
  game_id: string
  language: string
  title: string
  view_count: number
  created_at: string
  thumbnail_url: string
  duration: number
  vod_offset?: number
}

interface TwitchClipsResponse {
  data: TwitchClip[]
  pagination?: {
    cursor?: string
  }
}

async function getAppAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  const response = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to get access token: ${response.statusText} - ${body}`)
  }

  const data = (await response.json()) as TwitchTokenResponse
  return data.access_token
}

async function getUserId(
  username: string,
  token: string,
  clientId: string
): Promise<string | null> {
  const url = `${TWITCH_API_BASE}/users?login=${encodeURIComponent(username)}`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as TwitchUsersResponse
    return data.data.length > 0 ? data.data[0].id : null
  } catch {
    return null
  }
}

async function getSingleVideo(
  videoId: string,
  token: string,
  clientId: string
): Promise<TwitchVideo | null> {
  const url = `${TWITCH_API_BASE}/videos?id=${videoId}`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as TwitchVideosResponse
    return data.data.length > 0 ? data.data[0] : null
  } catch {
    return null
  }
}

async function getAllClipsForBroadcaster(
  broadcasterId: string,
  token: string,
  clientId: string
): Promise<TwitchClip[]> {
  const allClips: TwitchClip[] = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    let url = `${TWITCH_API_BASE}/clips?broadcaster_id=${broadcasterId}&started_at=${encodeURIComponent(START_DATE.toISOString())}&ended_at=${encodeURIComponent(END_DATE.toISOString())}&first=100`
    if (cursor) {
      url += `&after=${cursor}`
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch clips: ${response.statusText}`)
    }

    const data = (await response.json()) as TwitchClipsResponse

    allClips.push(...data.data)

    // Check if we need to continue pagination
    cursor = data.pagination?.cursor
    hasMore = !!cursor

    // If the last clip in this page is before our start date, stop paginating
    if (data.data.length > 0) {
      const lastClipDate = new Date(data.data[data.data.length - 1].created_at)
      if (lastClipDate < START_DATE) {
        hasMore = false
      }
    }
  }

  return allClips
}

async function syncClips() {
  const db = getDb()
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Missing required environment variables: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET')
  }

  // Get Twitch access token
  const token = await getAppAccessToken(clientId, clientSecret)

  // Get all creators with Twitch accounts
  const creatorsData = await db
    .select({ id: creators.id, name: creators.name, twitch: creators.twitch })
    .from(creators)
    .all()

  // Track VODs we've seen to avoid duplicate fetches
  const vodIdMap = new Map<string, number>()

  // Process each creator
  for (const creator of creatorsData) {
    if (!creator.twitch) continue

    // Get Twitch user ID
    const userId = await getUserId(creator.twitch, token, clientId)
    if (!userId) continue

    // Fetch all clips for this broadcaster
    const clips = await getAllClipsForBroadcaster(userId, token, clientId)

    // Upsert each clip
    for (const clip of clips) {
      let vodDbId: number | null = null

      // Handle video_id if present
      if (clip.video_id) {
        // Check if we've already processed this VOD
        if (vodIdMap.has(clip.video_id)) {
          vodDbId = vodIdMap.get(clip.video_id)!
        } else {
          // Check if VOD exists in database
          const existingVod = await db
            .select()
            .from(twitchVods)
            .where(eq(twitchVods.vodId, clip.video_id))
            .get()

          if (existingVod) {
            vodDbId = existingVod.id
            vodIdMap.set(clip.video_id, existingVod.id)
          } else {
            // Fetch VOD from Twitch
            const video = await getSingleVideo(clip.video_id, token, clientId)
            if (video) {
              const vodData = {
                vodId: video.id,
                streamId: video.stream_id,
                userId: video.user_id,
                userLogin: video.user_login,
                userName: video.user_name,
                title: video.title,
                description: video.description,
                createdAt: new Date(video.created_at).getTime(),
                publishedAt: video.published_at,
                url: video.url,
                thumbnailUrl: video.thumbnail_url,
                viewable: video.viewable,
                viewCount: video.view_count,
                language: video.language,
                type: video.type,
                duration: video.duration,
                creatorId: creator.id,
              }

              const result = await db.insert(twitchVods).values(vodData).returning()
              if (result[0]) {
                vodDbId = result[0].id
                vodIdMap.set(clip.video_id, result[0].id)
              }
            }
          }
        }
      }

      // Upsert clip
      const existing = await db
        .select()
        .from(twitchClips)
        .where(eq(twitchClips.clipId, clip.id))
        .get()

      const clipData = {
        clipId: clip.id,
        url: clip.url,
        embedUrl: clip.embed_url,
        broadcasterId: clip.broadcaster_id,
        broadcasterName: clip.broadcaster_name,
        creatorIdTwitch: clip.creator_id,
        creatorName: clip.creator_name,
        title: clip.title,
        language: clip.language,
        thumbnailUrl: clip.thumbnail_url,
        viewCount: clip.view_count,
        createdAt: new Date(clip.created_at).getTime(),
        videoId: clip.video_id || null,
        vodOffset: clip.vod_offset || null,
        duration: clip.duration,
        vodId: vodDbId,
        creatorId: creator.id,
      }

      if (existing) {
        // Update existing clip
        await db
          .update(twitchClips)
          .set(clipData)
          .where(eq(twitchClips.id, existing.id))
      } else {
        // Insert new clip
        await db.insert(twitchClips).values(clipData)
      }
    }
  }

  console.log('Synced clips from all creators')
}

export default defineTask({
  meta: {
    name: 'sync:clips',
    description: 'Sync clips from Twitch API',
  },
  async run() {
    console.log('[Task] Syncing clips...')
    await syncClips()
    console.log('[Task] Clips sync complete')
    return { result: 'success' }
  },
})
