import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Timeline } from '@/components/Timeline'
import { TwitchPlayer } from '@/components/TwitchPlayer'
import { Doc } from '../../convex/_generated/dataModel'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

type Creator = Doc<'creators'>
type TwitchVod = Doc<'twitch_vods'>

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  // Default to today, or Nov 9 if before event
  const today = new Date()
  const eventStart = new Date('2025-11-09T00:00:00Z')
  const defaultDate = today >= eventStart ? today : eventStart

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate)
  const [selectedVod, setSelectedVod] = useState<{ vod: TwitchVod; creator: Creator; timestamp: number } | null>(null)
  const [playerCurrentTimeSeconds, setPlayerCurrentTimeSeconds] = useState<number>(0)

  // Format date as YYYY-MM-DD for query
  const dateString = selectedDate.toISOString().split('T')[0]
  const creators = useQuery(api.creators.getForDate, { date: dateString })

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

  if (!creators) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-screen w-full">
      <ResizablePanel defaultSize={50} minSize={30}>
        <Timeline
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
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
