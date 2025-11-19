import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMemo, useState } from 'react'
import { getDb } from '@/db/client'
import { twitchClips, twitchVods, creators } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { TrendingUp, Clock } from 'lucide-react'

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

// Get all dates that have clips
const getDatesWithClips = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  const db = getDb()

  // Fetch all clips with VODs
  const clipsData = await db
    .select({
      clip: twitchClips,
      vod: twitchVods,
    })
    .from(twitchClips)
    .innerJoin(twitchVods, eq(twitchClips.vodId, twitchVods.id))
    .all()

  // Calculate real-world time for each clip and group by date
  // Day ends at 05:00, so subtract 5 hours before determining the date
  const datesSet = new Set<string>()

  clipsData.forEach(row => {
    const realWorldTime = row.vod.createdAt + ((row.clip.vodOffset || 0) * 1000)
    // Subtract 5 hours (in ms) to shift the day boundary
    const adjustedTime = realWorldTime - (5 * 60 * 60 * 1000)
    const date = new Date(adjustedTime)

    // Convert to Amsterdam timezone date string
    const dateString = date.toLocaleDateString('en-CA', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    datesSet.add(dateString)
  })

  return Array.from(datesSet).sort()
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

    // Fetch all clips with their VODs and creators
    // We'll filter by calculated real-world time in memory
    const clipsData = await db
      .select({
        clip: twitchClips,
        vod: twitchVods,
        creator: creators,
      })
      .from(twitchClips)
      .innerJoin(twitchVods, eq(twitchClips.vodId, twitchVods.id))
      .leftJoin(creators, eq(twitchClips.creatorId, creators.id))
      .all()

    // Calculate real-world time and filter by date
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
      .filter(item => item.realWorldTime >= startMs && item.realWorldTime < endMs)

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

export const Route = createFileRoute('/$date/clips')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      sort: (search.sort as 'viewCount' | 'time') || 'viewCount',
    }
  },
  loader: async ({ params }) => {
    const [clips, datesWithClips] = await Promise.all([
      getClipsForDate({ data: params.date }),
      getDatesWithClips(),
    ])
    return { clips, datesWithClips }
  },
  component: ClipsPage,
})

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

interface ClusterProps {
  cluster: ClipCluster
  formatTime: (timestamp: number) => string
}

function Cluster({ cluster, formatTime }: ClusterProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Get filtered clips (top per creator when not expanded)
  const visibleClips = useMemo(() => {
    if (isExpanded) {
      return cluster.clips
    }

    // Show only the highest view count clip per creator
    const topClipsPerCreator = new Map<number, typeof cluster.clips[0]>()

    cluster.clips.forEach(clip => {
      const creatorId = clip.creator?.id
      if (!creatorId) return

      const existing = topClipsPerCreator.get(creatorId)
      if (!existing || clip.clip.viewCount > existing.clip.viewCount) {
        topClipsPerCreator.set(creatorId, clip)
      }
    })

    return Array.from(topClipsPerCreator.values()).sort((a, b) =>
      b.clip.viewCount - a.clip.viewCount
    )
  }, [cluster.clips, isExpanded])

  const hasMore = cluster.clips.length > 1

  return (
    <div>
      {/* Cluster Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {formatTime(cluster.startTime)} - {formatTime(cluster.endTime)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {cluster.clips.length} clips · {cluster.totalViewCount.toLocaleString()} views
        </p>
      </div>

      {/* Clips Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleClips.map((item) => (
          <a
            key={item.clip.clipId}
            href={item.clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group cursor-pointer"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted overflow-hidden mb-2">
              <img
                src={item.clip.thumbnailUrl}
                alt={item.clip.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              {/* Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="flex items-center justify-between text-white text-xs">
                  <span>{formatTime(item.realWorldTime)}</span>
                  <span>{item.clip.viewCount.toLocaleString()} views</span>
                </div>
              </div>
            </div>

            {/* Clip Info */}
            <div>
              <h3 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                {item.clip.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {item.creator?.name || 'Unknown creator'}
              </p>
            </div>
          </a>
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
  const { sort } = Route.useSearch()

  // Cluster clips
  const clusters = useMemo(() => {
    const clustered = clusterClips(clips)

    // Sort clusters
    if (sort === 'viewCount') {
      return clustered.sort((a, b) => b.totalViewCount - a.totalViewCount)
    } else {
      return clustered.sort((a, b) => a.startTime - b.startTime)
    }
  }, [clips, sort])

  const handleDateSelect = (newDate: string) => {
    navigate({ to: `/${newDate}/clips`, search: { sort } })
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
            <div className="lg:sticky lg:top-8 space-y-6">
              {/* Title */}
              <div>
                <h2 className="text-lg font-semibold">CreatorSMP3 Clips</h2>
              </div>

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
                    onClick={() => navigate({ search: { sort: 'viewCount' } })}
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
                    onClick={() => navigate({ search: { sort: 'time' } })}
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
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Clips for {formatDate(date)}</h1>
              <p className="text-muted-foreground">
                Found {clips.length} clips in {clusters.length} clusters
              </p>
            </div>

            <div className="space-y-12">
              {clusters.map((cluster, clusterIndex) => (
                <Cluster
                  key={clusterIndex}
                  cluster={cluster}
                  formatTime={formatTime}
                />
              ))}

              {clusters.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No clips found for this date.
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
