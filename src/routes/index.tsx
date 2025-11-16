import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { Timeline } from '@/components/Timeline'
import { TwitchPlayer } from '@/components/TwitchPlayer'
import { VOD, Creator, VODData } from '@/types/vod'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  // Default to today, or Nov 9 if before event
  const today = new Date()
  const eventStart = new Date('2025-11-09T00:00:00Z')
  const defaultDate = today >= eventStart ? today : eventStart

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate)
  const [selectedVod, setSelectedVod] = useState<{ vod: VOD; creator: Creator; timestamp: number } | null>(null)
  const [playerCurrentTimeSeconds, setPlayerCurrentTimeSeconds] = useState<number>(0)

  // Calculate VOD start time in seconds since midnight (Amsterdam timezone)
  const vodStartSeconds = useMemo(() => {
    if (!selectedVod) return 0

    const vodStartDate = new Date(selectedVod.vod.createdAt)
    const amsDate = new Date(vodStartDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
    return amsDate.getHours() * 3600 + amsDate.getMinutes() * 60
  }, [selectedVod?.vod.id])

  const handleVodClick = (vod: VOD, creator: Creator, clickTimestamp: number) => {
    setSelectedVod({ vod, creator, timestamp: clickTimestamp })
  }

  const handlePlayerTimeChange = (playerSeconds: number) => {
    const realWorldSeconds = vodStartSeconds + playerSeconds
    setPlayerCurrentTimeSeconds(realWorldSeconds)
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
