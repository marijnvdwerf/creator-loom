import { useState } from 'react'
import { Timeline } from './components/Timeline'
import { TwitchPlayer } from './components/TwitchPlayer'
import { VOD, Creator } from './types/vod'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

function App() {
  // Default to today, or Nov 9 if before event
  const today = new Date();
  const eventStart = new Date('2025-11-09T00:00:00Z');
  const defaultDate = today >= eventStart ? today : eventStart;

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [selectedVod, setSelectedVod] = useState<{ vod: VOD; creator: Creator; timestamp: number } | null>(null);

  const handleVodClick = (vod: VOD, creator: Creator, clickTimestamp: number) => {
    setSelectedVod({ vod, creator, timestamp: clickTimestamp });
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-screen w-full">
      <ResizablePanel defaultSize={50} minSize={30}>
        <Timeline
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          onVodClick={handleVodClick}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={50} minSize={30}>
        <TwitchPlayer selectedVod={selectedVod} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export default App
