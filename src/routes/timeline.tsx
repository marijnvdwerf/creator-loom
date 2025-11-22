import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getDb } from '@/db/client'
import { creators, twitchVods } from '@/db/schema'
import { Timeline } from '@/components/Timeline'
import { TwitchPlayer } from '@/components/TwitchPlayer'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import type { Creator, TwitchVod } from '@/types'

const getAllCreators = createServerFn().handler(async () => {
  const db = getDb()

  // Fetch all creators
  const creatorsData = await db.select().from(creators).all()
  // Fetch all VODs (no date filtering)
  const vodsData = await db.select().from(twitchVods).all()

  // Join: attach all vods to creators
  const data = creatorsData.map(creator => ({
    _id: creator.id.toString(),
    id: creator.id,
    name: creator.name,
    team: creator.team,
    state: creator.state,
    avatarUrl: creator.avatarUrl,
    lastSeen: creator.lastSeen,
    deathTime: creator.deathTime,
    deathMessage: creator.deathMessage,
    deathClips: creator.deathClips ? JSON.parse(creator.deathClips) : undefined,
    twitch: creator.twitch,
    youtube: creator.youtube,
    instagram: creator.instagram,
    tiktok: creator.tiktok,
    vods: vodsData
      .filter(v => v.creatorId === creator.id)
      .map(vod => ({
        _id: vod.id.toString(),
        id: vod.vodId,
        stream_id: vod.streamId,
        user_id: vod.userId,
        user_login: vod.userLogin,
        user_name: vod.userName,
        title: vod.title,
        description: vod.description,
        created_at: vod.createdAt,
        published_at: vod.publishedAt,
        url: vod.url,
        thumbnail_url: vod.thumbnailUrl,
        viewable: vod.viewable,
        view_count: vod.viewCount,
        language: vod.language,
        type: vod.type,
        duration: vod.duration,
        creatorId: vod.creatorId,
      })),
  }))

  return data
})

// Get default date
function getDefaultDate() {
  const today = new Date()
  const eventStart = new Date('2025-11-09T00:00:00Z')
  const defaultDate = today >= eventStart ? today : eventStart
  return defaultDate.toISOString().split('T')[0]
}

// Filter VODs by date (Amsterdam timezone)
function filterVodsByDate(vods: TwitchVod[], dateString: string) {
  const date = new Date(dateString)

  // Get start and end of day in Amsterdam timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Europe/Amsterdam',
  })

  // Get the current date in Amsterdam time to determine day boundaries
  const amsParts = formatter.formatToParts(date)
  const amsYear = parseInt(amsParts.find(p => p.type === 'year')!.value)
  const amsMonth = parseInt(amsParts.find(p => p.type === 'month')!.value)
  const amsDay = parseInt(amsParts.find(p => p.type === 'day')!.value)

  // Create day boundaries in UTC
  const dayStart = new Date(Date.UTC(amsYear, amsMonth - 1, amsDay))
  const dayEnd = new Date(Date.UTC(amsYear, amsMonth - 1, amsDay + 1))

  // Adjust for Amsterdam timezone offset (CEST +2 or CET +1)
  const offset = date.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'short' }).includes('CEST') ? -2 : -1
  const startMs = dayStart.getTime() + (offset * 60 * 60 * 1000)
  const endMs = dayEnd.getTime() + (offset * 60 * 60 * 1000)

  return vods.filter(vod => vod.created_at >= startMs && vod.created_at < endMs)
}

export const Route = createFileRoute('/timeline')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      date: (search.date as string) || getDefaultDate(),
    }
  },
    loader: async () => {
      return await getAllCreators()
  },
  component: App,
})

function App() {
  const allCreators = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const { date } = Route.useSearch()

  const selectedDate = new Date(date)

  // Filter creators' VODs by selected date
  const creators = useMemo(() => {
    return allCreators.map((creator: Creator) => ({
      ...creator,
      vods: filterVodsByDate(creator.vods, date)
    }))
  }, [allCreators, date])
  const [selectedVod, setSelectedVod] = useState<{ vod: TwitchVod; creator: Creator; timestamp: number } | null>(null)
  const [playerCurrentTimeSeconds, setPlayerCurrentTimeSeconds] = useState<number>(0)

  const handleDateSelect = (newDate: Date) => {
    const dateString = newDate.toISOString().split('T')[0]
    navigate({ search: { date: dateString } })
  }

  const handleVodClick = (vod: TwitchVod, creator: Creator, clickTimestamp: number) => {
    setSelectedVod({ vod, creator, timestamp: clickTimestamp })
  }

  const handlePlayerTimeChange = (playerSeconds: number) => {
    if (!selectedVod) {
      setPlayerCurrentTimeSeconds(0)
      return
    }

    // Calculate VOD start time in seconds since midnight (Amsterdam timezone)
    const vodStartDate = new Date(selectedVod.vod.created_at)
    const amsDate = new Date(vodStartDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
    const vodStartSeconds = amsDate.getHours() * 3600 + amsDate.getMinutes() * 60

    const realWorldSeconds = vodStartSeconds + playerSeconds
    setPlayerCurrentTimeSeconds(realWorldSeconds)
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-screen w-full">
      <ResizablePanel defaultSize={50} minSize={30}>
        <Timeline
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          onVodClick={handleVodClick}
          playerCurrentTimeSeconds={playerCurrentTimeSeconds}
          selectedVod={selectedVod}
          creators={creators}
        />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize={50} minSize={30}>
        <TwitchPlayer
          video={selectedVod?.vod.id}
          timestamp={selectedVod?.timestamp}
          onTimeChange={handlePlayerTimeChange}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
