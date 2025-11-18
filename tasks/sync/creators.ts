import { defineTask } from 'nitro/task'
import { getDb } from '@/db/client'
import { creators } from '@/db/schema'
import { eq } from 'drizzle-orm'

interface CreatorSMPCreator {
  uuid: string
  name: string
  team: number | null
  state: number
  avatarUrl?: string
  lastSeen?: string
  deathTime?: string | null
  deathMessage?: string | null
  deathClips?: string
  social?: {
    twitch?: string
    youtube?: string
    instagram?: string
    tiktok?: string
  }
}

interface CreatorSMPResponse {
  version: number
  generatedAt: string
  count: number
  creators: CreatorSMPCreator[]
}

function cleanTwitchUrl(url?: string): string | undefined {
  if (!url) return undefined

  // Extract username from various Twitch URL formats
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^\/\?]+)/i)
  if (match) {
    return match[1].toLowerCase()
  }

  // If no match and doesn't look like a URL, assume it's already a username
  if (!url.includes('/') && !url.includes('.')) {
    return url.toLowerCase()
  }

  return undefined
}

async function syncCreators() {
  const db = getDb()

  // Generate timestamp in YYYYMMDDHHmm format
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const timestamp = `${year}${month}${day}${hours}${minutes}`

  // Fetch creators from CreatorSMP API
  const response = await fetch(`https://api.creatorsmp.nl/public/snapshot?t=${timestamp}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch creators: ${response.statusText}`)
  }
  const data: CreatorSMPResponse = await response.json()

  // Upsert each creator
  for (const creator of data.creators) {
    // Parse deathClips from JSON string to array
    let deathClips: string | undefined
    if (creator.deathClips) {
      try {
        const parsed = JSON.parse(creator.deathClips)
        if (Array.isArray(parsed) && parsed.length > 0) {
          deathClips = creator.deathClips // Keep as JSON string
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    const twitchUsername = cleanTwitchUrl(creator.social?.twitch)

    // Check if creator exists
    const existing = await db
      .select()
      .from(creators)
      .where(eq(creators.name, creator.name))
      .get()

    const creatorData = {
      name: creator.name,
      team: creator.team,
      state: creator.state,
      avatarUrl: creator.avatarUrl,
      lastSeen: creator.lastSeen,
      deathTime: creator.deathTime,
      deathMessage: creator.deathMessage,
      deathClips,
      twitch: twitchUsername,
      youtube: creator.social?.youtube,
      instagram: creator.social?.instagram,
      tiktok: creator.social?.tiktok,
    }

    if (existing) {
      // Update existing creator
      await db
        .update(creators)
        .set(creatorData)
        .where(eq(creators.id, existing.id))
    } else {
      // Insert new creator
      await db.insert(creators).values(creatorData)
    }
  }

  console.log(`Synced ${data.creators.length} creators`)
}

export default defineTask({
  meta: {
    name: 'sync:creators',
    description: 'Sync creators from CreatorSMP API',
  },
  async run() {
    console.log('[Task] Syncing creators...')
    await syncCreators()
    console.log('[Task] Creators sync complete')
    return { result: 'success' }
  },
})
