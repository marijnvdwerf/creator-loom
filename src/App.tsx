import { ResizablePanels } from './components/ResizablePanels'
import { Timeline } from './components/Timeline'
import { TwitchPlayer } from './components/TwitchPlayer'

function App() {
  return (
    <ResizablePanels
      left={<Timeline />}
      right={<TwitchPlayer />}
      defaultLeftWidth={50}
    />
  )
}

export default App
