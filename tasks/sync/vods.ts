import { defineTask } from 'nitro/task'
import { getDb } from '@/db/client'
import { creators, twitchVods } from '@/db/schema'
import { eq } from 'drizzle-orm'

// Date range for VOD filtering (Nov 9-30, 2025)
const START_DATE = new Date('2025-11-09T00:00:00Z')
const END_DATE = new Date('2025-11-30T23:59:59Z')

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

function isWithinDateRange(dateStr: string): boolean {
  const date = new Date(dateStr)
  return date >= START_DATE && date <= END_DATE
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

async function getAllVideosForUser(
  userId: string,
  token: string,
  clientId: string
): Promise<TwitchVideo[]> {
  const allVideos: TwitchVideo[] = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    let url = `${TWITCH_API_BASE}/videos?user_id=${userId}&type=archive&first=100`
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
      throw new Error(`Failed to fetch videos: ${response.statusText}`)
    }

    const data = (await response.json()) as TwitchVideosResponse

    // Filter videos by date range
    const filteredVideos = data.data.filter((video) =>
      isWithinDateRange(video.created_at)
    )

    allVideos.push(...filteredVideos)

    // Check if we need to continue pagination
    cursor = data.pagination?.cursor
    hasMore = !!cursor

    // If the last video in this page is before our start date, stop paginating
    if (data.data.length > 0) {
      const lastVideoDate = new Date(data.data[data.data.length - 1].created_at)
      if (lastVideoDate < START_DATE) {
        hasMore = false
      }
    }
  }

  return allVideos
}

async function syncVods() {
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

  // Process each creator
  for (const creator of creatorsData) {
    if (!creator.twitch) continue

    // Get Twitch user ID
    const userId = await getUserId(creator.twitch, token, clientId)
    if (!userId) continue

    // Fetch all VODs for this creator
    const videos = await getAllVideosForUser(userId, token, clientId)

    // Upsert each VOD
    for (const video of videos) {
      // Check if VOD exists
      const existing = await db
        .select()
        .from(twitchVods)
        .where(eq(twitchVods.vodId, video.id))
        .get()

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

      if (existing) {
        // Update existing VOD
        await db
          .update(twitchVods)
          .set(vodData)
          .where(eq(twitchVods.id, existing.id))
      } else {
        // Insert new VOD
        await db.insert(twitchVods).values(vodData)
      }
    }
  }

  console.log('Synced VODs for all creators')
}

export default defineTask({
  meta: {
    name: 'sync:vods',
    description: 'Sync VODs from Twitch API',
  },
  async run() {
    console.log('[Task] Syncing VODs...')
    await syncVods()
    console.log('[Task] VODs sync complete')
    return { result: 'success' }
  },
})
