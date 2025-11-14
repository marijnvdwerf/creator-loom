import { useState } from 'react'
import { ResizablePanels } from './components/ResizablePanels'
import { Timeline } from './components/Timeline'
import { TwitchPlayer } from './components/TwitchPlayer'
import { VOD, Creator } from './types/vod'

function App() {
  // Default to today, or Nov 9 if before event
  const today = new Date();
  const eventStart = new Date('2025-11-09T00:00:00Z');
  const defaultDate = today >= eventStart ? today : eventStart;

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [selectedVod, setSelectedVod] = useState<{ vod: VOD; creator: Creator } | null>(null);

  const handleVodClick = (vod: VOD, creator: Creator) => {
    setSelectedVod({ vod, creator });
  };

  return (
    <ResizablePanels
      left={
        <Timeline
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          onVodClick={handleVodClick}
        />
      }
      right={<TwitchPlayer selectedVod={selectedVod} />}
      defaultLeftWidth={50}
    />
  )
}

export default App
