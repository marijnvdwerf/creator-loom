import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMemo, useState } from 'react'
import { getDb } from '@/db/client'
import { twitchClips, twitchVods, creators } from '@/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { TrendingUp, Clock } from 'lucide-react'
import { Database } from 'bun:sqlite'

// Event date range
const EVENT_START = new Date('2025-11-09T00:00:00Z')
const EVENT_END = new Date('2025-11-30T23:59:59Z')

type ClipWithVodAndCreator = {
  clip: {
    id: number
    clipId: string
    url: string
    embedUrl: string
    title: string
    thumbnailUrl: string
    viewCount: number
    createdAt: number
    vodOffset: number | null
    duration: number
    vodId: number | null
  }
  vod: {
    id: number
    vodId: string
    createdAt: number
    duration: string
    title: string
  } | null
  creator: {
    id: number
    name: string
    team: number | null
  } | null
  realWorldTime: number
}

type ClipCluster = {
  clips: ClipWithVodAndCreator[]
  startTime: number
  endTime: number
  totalViewCount: number
}

type ClipStack = {
  clips: ClipWithVodAndCreator[]
  totalViewCount: number
  bestClip: ClipWithVodAndCreator
  creatorId: number
}

// Get all dates that have clips
const getDatesWithClips = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  console.time('getDatesWithClips')

  const sqlite = new Database('./smp-timeline.db')

  // Calculate dates in SQLite:
  // 1. Real-world time = vod.created_at + (clip.vod_offset * 1000)
  // 2. Subtract 5 hours to shift day boundary
  // 3. Convert to date in Amsterdam timezone (UTC+1 for CET, UTC+2 for CEST)
  // For November 2025, we use CET (UTC+1)
  const query = `
    SELECT DISTINCT
      DATE(
        ("twitch_vods"."created_at" + (COALESCE("twitch_clips"."vod_offset", 0) * 1000) - (5 * 60 * 60 * 1000)) / 1000,
        'unixepoch',
        '+1 hour'
      ) as date
    FROM "twitch_clips"
    INNER JOIN "twitch_vods" ON "twitch_clips"."vod_id" = "twitch_vods"."id"
    ORDER BY date
  `

  const stmt = sqlite.prepare(query)
  const results = stmt.values() as [string][]
  const dates = results.map(row => row[0])

  sqlite.close()
  console.timeEnd('getDatesWithClips')

  return dates
})

// Fetch clips for a specific date with VOD and creator data
const getClipsForDate = createServerFn({ method: 'GET' })
  .inputValidator((dateString: string) => dateString)
  .handler(async ({ data: dateString }): Promise<ClipWithVodAndCreator[]> => {
    const db = getDb()

    // Parse and validate date
    const date = new Date(dateString)
    if (isNaN(date.getTime()) || date < EVENT_START || date > EVENT_END) {
      throw new Error('Invalid date or date outside event range (Nov 9 - Dec 2, 2025)')
    }

    // Get start and end of day in Amsterdam timezone
    // Day starts at 05:00 and ends at 04:59:59 the next day
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Europe/Amsterdam',
    })

    const amsParts = formatter.formatToParts(date)
    const amsYear = parseInt(amsParts.find(p => p.type === 'year')!.value)
    const amsMonth = parseInt(amsParts.find(p => p.type === 'month')!.value)
    const amsDay = parseInt(amsParts.find(p => p.type === 'day')!.value)

    // Create day boundaries in UTC (starting at 05:00 Amsterdam time)
    const dayStart = new Date(Date.UTC(amsYear, amsMonth - 1, amsDay))
    const dayEnd = new Date(Date.UTC(amsYear, amsMonth - 1, amsDay + 1))

    // Adjust for Amsterdam timezone offset (CEST +2 or CET +1)
    const offset = date.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'short' }).includes('CEST') ? -2 : -1
    // Add 5 hours to shift the day start from 00:00 to 05:00 Amsterdam time
    const startMs = dayStart.getTime() + (offset * 60 * 60 * 1000) + (5 * 60 * 60 * 1000)
    const endMs = dayEnd.getTime() + (offset * 60 * 60 * 1000) + (5 * 60 * 60 * 1000)

    // Fetch clips filtered by calculated real-world time at the database level
    // Real-world time = vod.createdAt + (clip.vodOffset * 1000)
    console.time('getClipsForDate:dbQuery')
    let clipsData: any[]

    if (false) {
      const realWorldTimeExpr = sql`${twitchVods.createdAt} + (COALESCE(${twitchClips.vodOffset}, 0) * 1000)`

      clipsData = await db
        .select({
          clip: twitchClips,
          vod: twitchVods,
          creator: creators,
        })
        .from(twitchClips)
        .innerJoin(twitchVods, eq(twitchClips.vodId, twitchVods.id))
        .leftJoin(creators, eq(twitchClips.creatorId, creators.id))
        .where(
          and(
            sql`${realWorldTimeExpr} >= ${startMs}`,
            sql`${realWorldTimeExpr} < ${endMs}`
          )
        )
        .all()
    } else {
      const sqlite = new Database('./smp-timeline.db')
      const rawQuery = `
        select "twitch_clips"."id", "twitch_clips"."clip_id", "twitch_clips"."url", "twitch_clips"."embed_url", "twitch_clips"."broadcaster_id", "twitch_clips"."broadcaster_name", "twitch_clips"."creator_id_twitch", "twitch_clips"."creator_name", "twitch_clips"."title", "twitch_clips"."language", "twitch_clips"."thumbnail_url", "twitch_clips"."view_count", "twitch_clips"."created_at", "twitch_clips"."video_id", "twitch_clips"."vod_offset", "twitch_clips"."duration", "twitch_clips"."vod_id", "twitch_clips"."creator_id", "twitch_vods"."id", "twitch_vods"."vod_id", "twitch_vods"."stream_id", "twitch_vods"."user_id", "twitch_vods"."user_login", "twitch_vods"."user_name", "twitch_vods"."title", "twitch_vods"."description", "twitch_vods"."created_at", "twitch_vods"."published_at", "twitch_vods"."url", "twitch_vods"."thumbnail_url", "twitch_vods"."viewable", "twitch_vods"."view_count", "twitch_vods"."language", "twitch_vods"."type", "twitch_vods"."duration", "twitch_vods"."creator_id", "creators"."id", "creators"."name", "creators"."team", "creators"."state", "creators"."avatar_url", "creators"."last_seen", "creators"."death_time", "creators"."death_message", "creators"."death_clips", "creators"."twitch", "creators"."youtube", "creators"."instagram", "creators"."tiktok"
        from "twitch_clips"
        inner join "twitch_vods" on "twitch_clips"."vod_id" = "twitch_vods"."id"
        left join "creators" on "twitch_clips"."creator_id" = "creators"."id"
        where ("twitch_vods"."created_at" + (COALESCE("twitch_clips"."vod_offset", 0) * 1000) >= ?1 and "twitch_vods"."created_at" + (COALESCE("twitch_clips"."vod_offset", 0) * 1000) < ?2)
      `
      const stmt = sqlite.prepare(rawQuery)
      const rawResults = stmt.values(startMs, endMs) as any[]

      // Map raw results to drizzle format
      clipsData = rawResults.map(row => ({
        clip: {
          id: row[0],
          clipId: row[1],
          url: row[2],
          embedUrl: row[3],
          broadcasterId: row[4],
          broadcasterName: row[5],
          creatorIdTwitch: row[6],
          creatorName: row[7],
          title: row[8],
          language: row[9],
          thumbnailUrl: row[10],
          viewCount: row[11],
          createdAt: row[12],
          videoId: row[13],
          vodOffset: row[14],
          duration: row[15],
          vodId: row[16],
          creatorId: row[17],
        },
        vod: {
          id: row[18],
          vodId: row[19],
          streamId: row[20],
          userId: row[21],
          userLogin: row[22],
          userName: row[23],
          title: row[24],
          description: row[25],
          createdAt: row[26],
          publishedAt: row[27],
          url: row[28],
          thumbnailUrl: row[29],
          viewable: row[30],
          viewCount: row[31],
          language: row[32],
          type: row[33],
          duration: row[34],
          creatorId: row[35],
        },
        creator: row[36] !== null ? {
          id: row[36],
          name: row[37],
          team: row[38],
          state: row[39],
          avatarUrl: row[40],
          lastSeen: row[41],
          deathTime: row[42],
          deathMessage: row[43],
          deathClips: row[44],
          twitch: row[45],
          youtube: row[46],
          instagram: row[47],
          tiktok: row[48],
        } : null,
      }))

      sqlite.close()
    }

    console.timeEnd('getClipsForDate:dbQuery')

    // Transform to include calculated real-world time
    const clipsWithRealTime: ClipWithVodAndCreator[] = clipsData
      .map(row => {
        const realWorldTime = row.vod.createdAt + ((row.clip.vodOffset || 0) * 1000)
        return {
          clip: {
            id: row.clip.id,
            clipId: row.clip.clipId,
            url: row.clip.url,
            embedUrl: row.clip.embedUrl,
            title: row.clip.title,
            thumbnailUrl: row.clip.thumbnailUrl,
            viewCount: row.clip.viewCount,
            createdAt: row.clip.createdAt,
            vodOffset: row.clip.vodOffset,
            duration: row.clip.duration,
            vodId: row.clip.vodId,
          },
          vod: row.vod ? {
            id: row.vod.id,
            vodId: row.vod.vodId,
            createdAt: row.vod.createdAt,
            duration: row.vod.duration,
            title: row.vod.title,
          } : null,
          creator: row.creator ? {
            id: row.creator.id,
            name: row.creator.name,
            team: row.creator.team,
          } : null,
          realWorldTime,
        }
      })

    return clipsWithRealTime
  })

// Clustering algorithm: group clips within ±30 seconds of each other
function clusterClips(clips: ClipWithVodAndCreator[]): ClipCluster[] {
  if (clips.length === 0) return []

  // Sort clips by real-world time
  const sortedClips = [...clips].sort((a, b) => a.realWorldTime - b.realWorldTime)

  // Create intervals with ±30 seconds buffer
  type Interval = {
    start: number
    end: number
    clipIndices: number[]
  }

  const intervals: Interval[] = sortedClips.map((clip, index) => ({
    start: clip.realWorldTime - 30000, // -30 seconds
    end: clip.realWorldTime + 30000,   // +30 seconds
    clipIndices: [index],
  }))

  // Merge overlapping intervals
  const mergedIntervals: Interval[] = []
  let current = intervals[0]

  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i]

    if (next.start <= current.end) {
      // Overlapping - merge
      current.end = Math.max(current.end, next.end)
      current.clipIndices.push(...next.clipIndices)
    } else {
      // Non-overlapping - save current and start new
      mergedIntervals.push(current)
      current = next
    }
  }
  mergedIntervals.push(current)

  // Convert merged intervals to clusters
  const clusters: ClipCluster[] = mergedIntervals.map(interval => {
    const clusterClips = interval.clipIndices.map(i => sortedClips[i])

    // Sort clips within cluster by view count (descending)
    clusterClips.sort((a, b) => b.clip.viewCount - a.clip.viewCount)

    const totalViewCount = clusterClips.reduce((sum, c) => sum + c.clip.viewCount, 0)

    return {
      clips: clusterClips,
      startTime: interval.start + 30000, // Add back the buffer to get actual earliest clip time
      endTime: interval.end - 30000,     // Subtract buffer to get actual latest clip time
      totalViewCount,
    }
  })

  return clusters
}

// Stacking algorithm: group overlapping clips per creator
function createStacks(clips: ClipWithVodAndCreator[]): ClipStack[] {
  if (clips.length === 0) return []

  // Group clips by creator
  const clipsByCreator = new Map<number, ClipWithVodAndCreator[]>()
  clips.forEach(clip => {
    const creatorId = clip.creator?.id
    if (!creatorId) return

    if (!clipsByCreator.has(creatorId)) {
      clipsByCreator.set(creatorId, [])
    }
    clipsByCreator.get(creatorId)!.push(clip)
  })

  const stacks: ClipStack[] = []

  // For each creator, find overlapping clips
  clipsByCreator.forEach((creatorClips, creatorId) => {
    if (creatorClips.length === 0) return

    // Calculate time ranges for each clip (vodOffset to vodOffset + duration)
    const clipsWithRanges = creatorClips.map(clip => ({
      clip,
      start: (clip.clip.vodOffset || 0) * 1000, // Convert to ms
      end: ((clip.clip.vodOffset || 0) + clip.clip.duration) * 1000, // Convert to ms
    }))

    // Sort by start time
    clipsWithRanges.sort((a, b) => a.start - b.start)

    // Group overlapping clips into stacks
    const processedIndices = new Set<number>()

    clipsWithRanges.forEach((clipRange, index) => {
      if (processedIndices.has(index)) return

      const stackClips: ClipWithVodAndCreator[] = [clipRange.clip]
      processedIndices.add(index)

      // Find all clips that overlap with this one
      for (let j = index + 1; j < clipsWithRanges.length; j++) {
        if (processedIndices.has(j)) continue

        const otherRange = clipsWithRanges[j]

        // Check if ranges overlap (with 0 seconds fuzziness)
        const hasOverlap = clipRange.end > otherRange.start && otherRange.end > clipRange.start

        if (hasOverlap) {
          stackClips.push(otherRange.clip)
          processedIndices.add(j)
          // Expand the range to include this clip for checking further overlaps
          clipRange.end = Math.max(clipRange.end, otherRange.end)
        }
      }

      // Sort clips in stack by view count (descending)
      stackClips.sort((a, b) => b.clip.viewCount - a.clip.viewCount)

      const totalViewCount = stackClips.reduce((sum, c) => sum + c.clip.viewCount, 0)

      stacks.push({
        clips: stackClips,
        totalViewCount,
        bestClip: stackClips[0],
        creatorId,
      })
    })
  })

  // Sort stacks by total view count (descending)
  return stacks.sort((a, b) => b.totalViewCount - a.totalViewCount)
}

export const Route = createFileRoute('/$date/clips')({
  validateSearch: (search: Record<string, unknown>) => {
    const creators = search.creators
    return {
      sort: (search.sort as 'viewCount' | 'time') || 'viewCount',
      creators: Array.isArray(creators)
        ? creators.filter((c): c is string => typeof c === 'string')
        : typeof creators === 'string'
        ? [creators]
        : undefined,
    }
  },
  loader: async ({ params }) => {
    console.time('loader')
    const [clips, datesWithClips] = await Promise.all([
      getClipsForDate({ data: params.date }),
      getDatesWithClips(),
    ])
    console.timeEnd('loader')
    return { clips, datesWithClips }
  },
  component: ClipsPage,
})

type CreatorStats = {
  id: number
  name: string
  clusterCount: number
  totalViews: number
}

interface CalendarProps {
  selectedDate: string
  datesWithClips: string[]
  onDateSelect: (date: string) => void
}

function Calendar({ selectedDate, datesWithClips, onDateSelect }: CalendarProps) {
  const datesSet = useMemo(() => new Set(datesWithClips), [datesWithClips])

  // SMP date range
  const SMP_START_DAY = 9 // November 9
  const SMP_END_DAY = 30 // November 30

  // Generate calendar grid for November 2025, only showing weeks with SMP days
  const generateCalendarDays = () => {
    const days: { date: string; day: number; month: number; isSmpDay: boolean; hasClips: boolean }[] = []

    // November 2025
    const novDaysInMonth = 30

    // Find the week that contains Nov 9 (first SMP day)
    const nov9 = new Date(2025, 10, 9)
    const nov9DayOfWeek = nov9.getDay()
    const nov9Offset = nov9DayOfWeek === 0 ? 6 : nov9DayOfWeek - 1

    // Calculate the first day of the week containing Nov 9
    const firstWeekStartDay = SMP_START_DAY - nov9Offset

    // Build calendar starting from the week containing Nov 9
    for (let day = firstWeekStartDay; day <= novDaysInMonth; day++) {
      if (day < 1) {
        // Days from October
        const oct2025DaysInMonth = 31
        const octDay = oct2025DaysInMonth + day
        days.push({
          date: `2025-10-${octDay.toString().padStart(2, '0')}`,
          day: octDay,
          month: 10,
          isSmpDay: false,
          hasClips: false,
        })
      } else {
        // Days from November
        const dateStr = `2025-11-${day.toString().padStart(2, '0')}`
        const isSmpDay = day >= SMP_START_DAY && day <= SMP_END_DAY
        days.push({
          date: dateStr,
          day,
          month: 11,
          isSmpDay,
          hasClips: datesSet.has(dateStr),
        })
      }
    }

    // Add days from next month to fill last week (only if needed to complete the week)
    const totalDays = days.length
    const remainingDays = 7 - (totalDays % 7)
    if (remainingDays < 7) {
      for (let day = 1; day <= remainingDays; day++) {
        days.push({
          date: `2025-12-${day.toString().padStart(2, '0')}`,
          day,
          month: 12,
          isSmpDay: false,
          hasClips: false,
        })
      }
    }

    return days
  }

  const calendarDays = useMemo(() => generateCalendarDays(), [datesSet])

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {/* Calendar days */}
        {calendarDays.map((dayInfo) => {
          const isSelected = dayInfo.date === selectedDate
          const isClickable = dayInfo.isSmpDay && dayInfo.hasClips

          return (
            <button
              key={dayInfo.date}
              onClick={() => isClickable && onDateSelect(dayInfo.date)}
              disabled={!isClickable}
              className={`
                aspect-square flex items-center justify-center text-sm rounded-md
                ${isSelected ? 'bg-primary text-primary-foreground font-semibold' : ''}
                ${!isSelected && isClickable ? 'hover:bg-accent cursor-pointer' : ''}
                ${!isClickable ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-foreground'}
                ${!dayInfo.isSmpDay && dayInfo.month === 11 ? 'text-muted-foreground/50' : ''}
                ${dayInfo.month !== 11 ? 'text-muted-foreground/40' : ''}
              `}
            >
              {dayInfo.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface CreatorFilterProps {
  creators: CreatorStats[]
  selectedCreators: string[] | undefined
  onCreatorToggle: (creatorName: string) => void
}

function CreatorFilter({ creators, selectedCreators, onCreatorToggle }: CreatorFilterProps) {
  const [showAll, setShowAll] = useState(false)

  const selectedSet = useMemo(
    () => new Set(selectedCreators || []),
    [selectedCreators]
  )

  const visibleCreators = useMemo(() => {
    if (showAll) return creators

    // Top 7 creators
    const top7 = creators.slice(0, 7)
    const top7Names = new Set(top7.map(c => c.name))

    // Selected creators not in top 7
    const selectedNotInTop7 = creators.filter(
      c => selectedSet.has(c.name) && !top7Names.has(c.name)
    )

    return [...top7, ...selectedNotInTop7]
  }, [creators, showAll, selectedSet])

  const hasMore = creators.length > visibleCreators.length

  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-2 block">Creators</label>
      <div className="space-y-1">
        {/* Individual creators with checkboxes */}
        {visibleCreators.map(creator => {
          const isSelected = selectedSet.has(creator.name)
          return (
            <label
              key={creator.id}
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onCreatorToggle(creator.name)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="flex-1 truncate">{creator.name}</span>
              <span className="text-xs text-muted-foreground">
                {creator.totalViews.toLocaleString('en-US')} views
              </span>
            </label>
          )
        })}

        {/* More/Less Button */}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? 'less' : 'more...'}
          </button>
        )}
      </div>
    </div>
  )
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  stack: ClipStack
  formatTime: (timestamp: number) => string
  selectedCreators?: string[]
}

function Modal({ isOpen, onClose, stack, formatTime, selectedCreators }: ModalProps) {
  if (!isOpen) return null

  const isHighlighted = (creatorName: string | undefined) => {
    if (!selectedCreators || selectedCreators.length === 0 || !creatorName) return false
    return selectedCreators.includes(creatorName)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md overflow-y-auto flex justify-center p-4"
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="fixed top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-background/90 rounded-full hover:bg-accent transition-colors text-foreground"
      >
        ✕
      </button>

      {/* Grid */}
      <div
        className="max-w-7xl w-full my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stack.clips.map((item) => {
            const highlighted = isHighlighted(item.creator?.name)
            return (
              <a
                key={item.clip.clipId}
                href={item.clip.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group cursor-pointer block transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
                style={highlighted ? {
                  filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.4))',
                } : undefined}
              >
                <div className={`relative aspect-video bg-muted overflow-hidden mb-2 ${highlighted ? 'ring-2 ring-yellow-500' : ''}`}
                  style={highlighted ? {
                    filter: 'drop-shadow(0 0 12px var(--color-yellow-500))',
                  } : undefined}
                >
                  <img
                    src={item.clip.thumbnailUrl}
                    alt={item.clip.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="flex items-center justify-between text-white text-xs">
                      <span>{formatTime(item.realWorldTime)}</span>
                      <span>{item.clip.viewCount.toLocaleString('en-US')} views</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {item.clip.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.creator?.name || 'Unknown creator'}
                  </p>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface StackProps {
  stack: ClipStack
  formatTime: (timestamp: number) => string
  selectedCreators?: string[]
}

function Stack({ stack, formatTime, selectedCreators }: StackProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isSingleClip = stack.clips.length === 1
  const visibleStackCount = Math.min(3, stack.clips.length)

  const isHighlighted = (creatorName: string | undefined) => {
    if (!selectedCreators || selectedCreators.length === 0 || !creatorName) return false
    return selectedCreators.includes(creatorName)
  }

  if (isSingleClip) {
    // Render as a regular clip
    const item = stack.bestClip
    const highlighted = isHighlighted(item.creator?.name)
    return (
      <a
        href={item.clip.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group cursor-pointer block transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
        style={highlighted ? {
          filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.4))',
        } : undefined}
      >
        <div className={`relative aspect-video bg-muted overflow-hidden mb-2 ${highlighted ? 'ring-2 ring-yellow-500 drop-shadow-yellow-500' : ''}`}
          style={highlighted ? {
            filter: 'drop-shadow(0 0 12px var(--color-yellow-500))',
          } : undefined}
        >
          <img
            src={item.clip.thumbnailUrl}
            alt={item.clip.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <div className="flex items-center justify-between text-white text-xs">
              <span>{formatTime(item.realWorldTime)}</span>
              <span>{item.clip.viewCount.toLocaleString('en-US')} views</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
            {item.clip.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {item.creator?.name || 'Unknown creator'}
          </p>
        </div>
      </a>
    )
  }

  // Render as a stacked clip
  // Check if any clip in the stack is highlighted
  const hasHighlightedClip = stack.clips.some(clip => isHighlighted(clip.creator?.name))
  return (
    <>
      <div
        className="cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
        onClick={() => setIsModalOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={hasHighlightedClip ? {
          filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.4))',
        } : undefined}
      >
        <div className="relative mb-2">
          {/* Background stacked clips - behind the main item, peeking at top */}
          {stack.clips.slice(1, visibleStackCount).reverse().map((item, reverseIndex) => {
            const index = visibleStackCount - 1 - reverseIndex
            const offsetY = isHovered ? -(index * 10) : -(index * 3)
            const scale = 1 - (index * 0.05)
            const rotation = isHovered ? (index % 2 === 0 ? index : -(index)) : 0
            const isVisible = index < 3 || isHovered
            const overlayOpacity = 0.2 + (index * 0.15)
            const itemHighlighted = isHighlighted(item.creator?.name)

            return (
              <div
                key={item.clip.clipId}
                className="absolute left-0 right-0 top-0 transition-all duration-200"
                style={{
                  transform: `translateY(${offsetY}px) scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: 'top center',
                  zIndex: visibleStackCount - index - 1,
                  opacity: isVisible ? 1 : 0,
                }}
              >
                <div className={`aspect-video bg-muted overflow-hidden relative ${itemHighlighted ? 'ring-2 ring-yellow-500' : ''}`}
                  style={itemHighlighted ? {
                    filter: 'drop-shadow(0 0 12px var(--color-yellow-500))',
                  } : undefined}
                >
                  <img
                    src={item.clip.thumbnailUrl}
                    alt={item.clip.title}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: 'var(--background)',
                      opacity: overlayOpacity,
                    }}
                  />
                </div>
              </div>
            )
          })}

          {/* Front clip with overlay */}
          <div className={`relative aspect-video bg-muted overflow-hidden ${isHighlighted(stack.bestClip.creator?.name) ? 'ring-2 ring-yellow-500' : ''}`}
            style={{
              zIndex: visibleStackCount,
              ...(isHighlighted(stack.bestClip.creator?.name) ? {
                filter: 'drop-shadow(0 0 12px var(--color-yellow-500))',
              } : {})
            }}
          >
            <img
              src={stack.bestClip.clip.thumbnailUrl}
              alt={stack.bestClip.clip.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <div className="flex items-center justify-between text-white text-xs">
                <span>{formatTime(stack.bestClip.realWorldTime)}</span>
                <span>{stack.totalViewCount.toLocaleString('en-US')} views · {stack.clips.length} clips</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-medium line-clamp-2 hover:text-primary transition-colors">
            {stack.bestClip.clip.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {stack.bestClip.creator?.name || 'Unknown creator'}
          </p>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} stack={stack} formatTime={formatTime} selectedCreators={selectedCreators} />
    </>
  )
}

interface ClusterProps {
  cluster: ClipCluster
  formatTime: (timestamp: number) => string
  selectedCreators?: string[]
}

function Cluster({ cluster, formatTime, selectedCreators }: ClusterProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Create stacks from cluster clips
  const stacks = useMemo(() => createStacks(cluster.clips), [cluster.clips])

  // Get top stack per creator when not expanded
  const visibleStacks = useMemo(() => {
    if (isExpanded) {
      return stacks
    }

    // Show only the highest view count stack per creator
    const topStacksPerCreator = new Map<number, ClipStack>()

    stacks.forEach(stack => {
      const existing = topStacksPerCreator.get(stack.creatorId)
      if (!existing || stack.totalViewCount > existing.totalViewCount) {
        topStacksPerCreator.set(stack.creatorId, stack)
      }
    })

    return Array.from(topStacksPerCreator.values()).sort((a, b) =>
      b.totalViewCount - a.totalViewCount
    )
  }, [stacks, isExpanded])

  const hasMore = stacks.length > visibleStacks.length

  return (
    <div>
      {/* Cluster Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {formatTime(cluster.startTime)} - {formatTime(cluster.endTime)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {cluster.clips.length} clips · {cluster.totalViewCount.toLocaleString('en-US')} views
        </p>
      </div>

      {/* Stacks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleStacks.map((stack, index) => (
          <Stack key={`${stack.creatorId}-${index}`} stack={stack} formatTime={formatTime} selectedCreators={selectedCreators} />
        ))}
      </div>

      {/* Meer/Minder Button */}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-4 px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors"
        >
          {isExpanded ? 'minder' : 'meer...'}
        </button>
      )}
    </div>
  )
}

function ClipsPage() {
  const { clips, datesWithClips } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const { date } = Route.useParams()
  const { sort, creators } = Route.useSearch()
  const [isMobileCreatorsExpanded, setIsMobileCreatorsExpanded] = useState(false)

  // Cluster clips (unfiltered, for calculating creator stats)
  const clusters = useMemo(() => {
    const clustered = clusterClips(clips)

    // Sort clusters
    if (sort === 'viewCount') {
      return clustered.sort((a, b) => b.totalViewCount - a.totalViewCount)
    } else {
      return clustered.sort((a, b) => a.startTime - b.startTime)
    }
  }, [clips, sort])

  // Calculate creator statistics from all clusters
  const creatorStats = useMemo(() => {
    const statsMap = new Map<number, CreatorStats>()

    clusters.forEach(cluster => {
      // Get unique creators in this cluster
      const creatorsInCluster = new Set<number>()
      cluster.clips.forEach(clip => {
        if (clip.creator?.id) {
          creatorsInCluster.add(clip.creator.id)
        }
      })

      // Update stats for each creator in this cluster
      creatorsInCluster.forEach(creatorId => {
        const creatorData = cluster.clips.find(c => c.creator?.id === creatorId)?.creator
        if (!creatorData) return

        const existing = statsMap.get(creatorId)
        // Calculate total views for this creator's clips in this cluster
        const creatorViewsInCluster = cluster.clips
          .filter(c => c.creator?.id === creatorId)
          .reduce((sum, c) => sum + c.clip.viewCount, 0)

        if (existing) {
          existing.clusterCount += 1
          existing.totalViews += creatorViewsInCluster
        } else {
          statsMap.set(creatorId, {
            id: creatorId,
            name: creatorData.name,
            clusterCount: 1,
            totalViews: creatorViewsInCluster,
          })
        }
      })
    })

    // Sort by total views descending
    return Array.from(statsMap.values()).sort((a, b) => b.totalViews - a.totalViews)
  }, [clusters])

  // Filter clusters based on selected creators (must contain ALL selected creators)
  const filteredClusters = useMemo(() => {
    if (!creators || creators.length === 0) return clusters

    return clusters.filter(cluster => {
      // Get all unique creator names in this cluster
      const clusterCreators = new Set(
        cluster.clips
          .map(clip => clip.creator?.name)
          .filter((name): name is string => !!name)
      )

      // Check if all selected creators are present in this cluster
      return creators.every(creator => clusterCreators.has(creator))
    })
  }, [clusters, creators])

  const handleDateSelect = (newDate: string) => {
    navigate({ to: `/${newDate}/clips`, search: { sort, creators } })
  }

  const handleCreatorToggle = (creatorName: string) => {
    const currentCreators = creators || []
    const newCreators = currentCreators.includes(creatorName)
      ? currentCreators.filter(c => c !== creatorName)
      : [...currentCreators, creatorName]

    navigate({
      search: {
        sort,
        creators: newCreators.length > 0 ? newCreators : undefined,
      },
    })
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto space-y-6 lg:pb-8">
              {/* Calendar */}
              <Calendar
                selectedDate={date}
                datesWithClips={datesWithClips}
                onDateSelect={handleDateSelect}
              />

              {/* Sort Controls */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Sort by</label>
                <div className="inline-flex rounded-lg border border-border bg-muted p-1 w-full">
                  <button
                    onClick={() => navigate({ search: { sort: 'viewCount', creators } })}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      sort === 'viewCount'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Views
                  </button>
                  <button
                    onClick={() => navigate({ search: { sort: 'time', creators } })}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      sort === 'time'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    Time
                  </button>
                </div>
              </div>

              {/* Creator Filter - Desktop: full list, Mobile: tokens */}
              <div>
                {/* Desktop: full creator list */}
                <div className="hidden lg:block">
                  <CreatorFilter
                    creators={creatorStats}
                    selectedCreators={creators}
                    onCreatorToggle={handleCreatorToggle}
                  />
                </div>

                {/* Mobile: chip list with top 7 + selected visible */}
                <div className="lg:hidden">
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Creators</label>
                  <div className="inline-flex flex-wrap gap-1 border border-border bg-muted p-1 rounded-lg w-full">
                    {(() => {
                      const selectedSet = new Set(creators || [])

                      // Top 7 creators
                      const top7 = creatorStats.slice(0, 7)
                      const top7Names = new Set(top7.map(c => c.name))

                      // Selected creators not in top 7
                      const selectedNotInTop7 = creatorStats.filter(
                        c => selectedSet.has(c.name) && !top7Names.has(c.name)
                      )

                      // Visible creators (top 7 + selected outside top 7)
                      const visibleCreators = [...top7, ...selectedNotInTop7]

                      // Remaining creators (when expanded)
                      const remainingCreators = creatorStats.filter(
                        c => !top7Names.has(c.name) && !selectedSet.has(c.name)
                      )

                      const hasMore = remainingCreators.length > 0

                      return (
                        <>
                          {visibleCreators.map((creator) => {
                            const isSelected = selectedSet.has(creator.name)
                            return (
                              <button
                                key={creator.id}
                                onClick={() => handleCreatorToggle(creator.name)}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                  isSelected
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {creator.name}
                                {isSelected && <span className="text-xs">×</span>}
                              </button>
                            )
                          })}

                          {/* Show remaining creators when expanded */}
                          {isMobileCreatorsExpanded && remainingCreators.map((creator) => (
                            <button
                              key={creator.id}
                              onClick={() => handleCreatorToggle(creator.name)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                              {creator.name}
                            </button>
                          ))}

                          {/* "more" button */}
                          {hasMore && (
                            <button
                              onClick={() => setIsMobileCreatorsExpanded(!isMobileCreatorsExpanded)}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                              {isMobileCreatorsExpanded ? 'less' : 'more...'}
                            </button>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Clips for {formatDate(date)}</h1>
              <p className="text-muted-foreground">
                {creators && creators.length > 0 ? (
                  <>
                    Showing {filteredClusters.length} of {clusters.length} clusters for{' '}
                    {creators.length === 1 ? creators[0] : `${creators.length} creators`}
                  </>
                ) : (
                  <>Found {clips.length} clips in {clusters.length} clusters</>
                )}
              </p>
            </div>

            <div className="space-y-12">
              {filteredClusters.map((cluster, clusterIndex) => (
                <Cluster
                  key={clusterIndex}
                  cluster={cluster}
                  formatTime={formatTime}
                  selectedCreators={creators}
                />
              ))}

              {filteredClusters.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  {creators && creators.length > 0 ? (
                    <>No clips found for the selected creators on this date.</>
                  ) : (
                    <>No clips found for this date.</>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
