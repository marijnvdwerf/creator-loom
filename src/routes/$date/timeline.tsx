import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMemo } from 'react'
import { Database } from 'bun:sqlite'

// Event date range
const EVENT_START = new Date('2025-11-09T00:00:00Z')
const EVENT_END = new Date('2025-11-30T23:59:59Z')

type ClipForTimeline = {
  id: number
  clipId: string
  url: string
  title: string
  viewCount: number
  duration: number
  realWorldTime: number
  creatorId: number
  creatorName: string
  team: number | null
}

// Get all dates that have clips
const getDatesWithClips = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  const sqlite = new Database('./smp-timeline.db')

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
  return dates
})

// Fetch clips for a specific date with calculated real-world time
const getClipsForTimeline = createServerFn({ method: 'GET' })
  .inputValidator((dateString: string) => dateString)
  .handler(async ({ data: dateString }): Promise<ClipForTimeline[]> => {
    const date = new Date(dateString)
    if (isNaN(date.getTime()) || date < EVENT_START || date > EVENT_END) {
      throw new Error('Invalid date or date outside event range (Nov 9 - Dec 2, 2025)')
    }

    // Timeline shows clips from 13:00 today to 01:00 tomorrow (12 hours)
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

    // Start at 13:00 Amsterdam time
    const dayStart = new Date(Date.UTC(amsYear, amsMonth - 1, amsDay))
    const offset = date.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'short' }).includes('CEST') ? -2 : -1
    const startMs = dayStart.getTime() + (offset * 60 * 60 * 1000) + (13 * 60 * 60 * 1000)
    const endMs = startMs + (12 * 60 * 60 * 1000) // 12 hours later (01:00 next day)

    const sqlite = new Database('./smp-timeline.db')
    const rawQuery = `
      select
        "twitch_clips"."id",
        "twitch_clips"."clip_id",
        "twitch_clips"."url",
        "twitch_clips"."title",
        "twitch_clips"."view_count",
        "twitch_clips"."duration",
        "twitch_clips"."vod_offset",
        "twitch_vods"."created_at",
        "creators"."id",
        "creators"."name",
        "creators"."team"
      from "twitch_clips"
      inner join "twitch_vods" on "twitch_clips"."vod_id" = "twitch_vods"."id"
      left join "creators" on "twitch_clips"."creator_id" = "creators"."id"
      where ("twitch_vods"."created_at" + (COALESCE("twitch_clips"."vod_offset", 0) * 1000) >= ?1
        and "twitch_vods"."created_at" + (COALESCE("twitch_clips"."vod_offset", 0) * 1000) < ?2)
    `
    const stmt = sqlite.prepare(rawQuery)
    const rawResults = stmt.values(startMs, endMs) as any[]

    const clips: ClipForTimeline[] = rawResults
      .filter(row => row[8] !== null) // Filter out clips without creators
      .map(row => {
        const vodCreatedAt = row[7]
        const vodOffset = row[6] || 0
        const realWorldTime = vodCreatedAt + (vodOffset * 1000)

        return {
          id: row[0],
          clipId: row[1],
          url: row[2],
          title: row[3],
          viewCount: row[4],
          duration: row[5],
          realWorldTime,
          creatorId: row[8],
          creatorName: row[9],
          team: row[10],
        }
      })

    sqlite.close()
    return clips
  })

export const Route = createFileRoute('/$date/timeline')({
  loader: async ({ params }) => {
    const [clips, datesWithClips] = await Promise.all([
      getClipsForTimeline({ data: params.date }),
      getDatesWithClips(),
    ])
    return { clips, datesWithClips }
  },
  component: TimelinePage,
})

interface CalendarProps {
  selectedDate: string
  datesWithClips: string[]
  onDateSelect: (date: string) => void
}

function Calendar({ selectedDate, datesWithClips, onDateSelect }: CalendarProps) {
  const datesSet = useMemo(() => new Set(datesWithClips), [datesWithClips])

  const SMP_START_DAY = 9
  const SMP_END_DAY = 30

  const generateCalendarDays = () => {
    const days: { date: string; day: number; month: number; isSmpDay: boolean; hasClips: boolean }[] = []
    const novDaysInMonth = 30

    const nov9 = new Date(2025, 10, 9)
    const nov9DayOfWeek = nov9.getDay()
    const nov9Offset = nov9DayOfWeek === 0 ? 6 : nov9DayOfWeek - 1
    const firstWeekStartDay = SMP_START_DAY - nov9Offset

    for (let day = firstWeekStartDay; day <= novDaysInMonth; day++) {
      if (day < 1) {
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

function TimelinePage() {
  const { clips, datesWithClips } = Route.useLoaderData()
  const { date } = Route.useParams()
  const navigate = Route.useNavigate()

  // Group clips by team and creator
  const teamCreatorClips = useMemo(() => {
    // First group by creator
    const creatorMap = new Map<number, {
      creatorId: number
      creatorName: string
      team: number | null
      clips: ClipForTimeline[]
    }>()

    clips.forEach(clip => {
      if (!creatorMap.has(clip.creatorId)) {
        creatorMap.set(clip.creatorId, {
          creatorId: clip.creatorId,
          creatorName: clip.creatorName,
          team: clip.team,
          clips: [],
        })
      }
      creatorMap.get(clip.creatorId)!.clips.push(clip)
    })

    // Then group creators by team
    const teamMap = new Map<number | null, typeof creatorMap extends Map<number, infer T> ? T[] : never>()

    creatorMap.forEach(creator => {
      if (!teamMap.has(creator.team)) {
        teamMap.set(creator.team, [])
      }
      teamMap.get(creator.team)!.push(creator)
    })

    // Sort teams and creators within teams
    return Array.from(teamMap.entries())
      .map(([teamNumber, creators]) => ({
        teamNumber,
        creators: creators.sort((a, b) => a.creatorName.localeCompare(b.creatorName)),
      }))
      .sort((a, b) => {
        if (a.teamNumber === null) return 1
        if (b.teamNumber === null) return -1
        return a.teamNumber - b.teamNumber
      })
  }, [clips])

  const handleDateSelect = (newDate: string) => {
    navigate({ to: `/${newDate}/timeline` })
  }

  // Calculate opacity range based on view counts
  const { minViews, maxViews } = useMemo(() => {
    if (clips.length === 0) return { minViews: 0, maxViews: 1 }
    const views = clips.map(c => c.viewCount)
    return {
      minViews: Math.min(...views),
      maxViews: Math.max(...views),
    }
  }, [clips])

  const getOpacity = (viewCount: number) => {
    if (maxViews === minViews) return 1
    const normalized = (viewCount - minViews) / (maxViews - minViews)
    return 0.1 + (normalized * 0.9) // 10% to 100%
  }

  // Timeline spans from 13:00 to 01:00 (12 hours)
  const timelineStart = useMemo(() => {
    const d = new Date(date)
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Europe/Amsterdam',
    })
    const amsParts = formatter.formatToParts(d)
    const amsYear = parseInt(amsParts.find(p => p.type === 'year')!.value)
    const amsMonth = parseInt(amsParts.find(p => p.type === 'month')!.value)
    const amsDay = parseInt(amsParts.find(p => p.type === 'day')!.value)

    const dayStart = new Date(Date.UTC(amsYear, amsMonth - 1, amsDay))
    const offset = d.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'short' }).includes('CEST') ? -2 : -1
    return dayStart.getTime() + (offset * 60 * 60 * 1000) + (13 * 60 * 60 * 1000)
  }, [date])

  const timelineEnd = timelineStart + (12 * 60 * 60 * 1000)
  const timelineDuration = timelineEnd - timelineStart

  // Convert timestamp to percentage position
  const getPosition = (timestamp: number) => {
    return ((timestamp - timelineStart) / timelineDuration) * 100
  }

  // Generate hour markers (13:00, 14:00, ..., 00:00, 01:00)
  const hourMarkers = useMemo(() => {
    const markers: { hour: string; position: number }[] = []
    for (let i = 0; i <= 12; i++) {
      const hourTime = timelineStart + (i * 60 * 60 * 1000)
      const hour = new Date(hourTime).getHours()
      markers.push({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        position: (i / 12) * 100,
      })
    }
    return markers
  }, [timelineStart])

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 p-4 border-r border-border">
        <div className="sticky top-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-2">Timeline</h2>
            <div className="text-xs text-muted-foreground">
              {clips.length} clips · {teamCreatorClips.reduce((sum, t) => sum + t.creators.length, 0)} creators
            </div>
          </div>

          <Calendar
            selectedDate={date}
            datesWithClips={datesWithClips}
            onDateSelect={handleDateSelect}
          />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 font-mono">
        {/* Time ruler */}
        <div className="mb-1 ml-16">
          <div className="relative h-6 border-b border-border">
            {hourMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex flex-col items-center"
                style={{ left: `${marker.position}%` }}
              >
                <div className="h-2 w-px bg-border" />
                <div className="text-[10px] text-muted-foreground leading-none mt-0.5">
                  {marker.hour}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team sections with creator rows */}
        <div className="space-y-2">
          {teamCreatorClips.map((team, teamIdx) => (
            <div key={teamIdx}>
              {/* Team header */}
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-16 text-xs font-semibold text-foreground flex-shrink-0 text-right">
                  {team.teamNumber !== null ? `Team ${team.teamNumber}` : 'No Team'}
                </div>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              {/* Creator rows */}
              <div className="space-y-0.5">
                {team.creators.map(creator => (
                  <div key={creator.creatorId} className="flex items-center gap-2">
                    {/* Creator name */}
                    <div className="w-16 text-xs truncate text-muted-foreground flex-shrink-0 text-right">
                      {creator.creatorName}
                    </div>

                    {/* Timeline track */}
                    <div className="flex-1 relative h-4 bg-muted/30 border-l border-r border-border">
                      {creator.clips.map(clip => {
                        const startPos = getPosition(clip.realWorldTime)
                        const endPos = getPosition(clip.realWorldTime + clip.duration * 1000)
                        const width = endPos - startPos
                        const opacity = getOpacity(clip.viewCount)

                        return (
                          <div
                            key={clip.id}
                            className="absolute top-1/2 -translate-y-1/2"
                            style={{
                              left: `${startPos}%`,
                              width: `${width}%`,
                              height: '4px',
                            }}
                          >
                            <a
                              href={clip.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block relative h-full group"
                              title={`${clip.title} (${clip.viewCount.toLocaleString('en-US')} views)`}
                            >
                              {/* Pill that extends 2px outside */}
                              <div
                                className="absolute inset-0 -left-[2px] -right-[2px] bg-primary rounded-full transition-opacity hover:opacity-100"
                                style={{ opacity }}
                              />
                            </a>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {teamCreatorClips.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No clips found for this time range
          </div>
        )}
      </main>
    </div>
  )
}
