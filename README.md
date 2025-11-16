# SMP Timeline

An interactive timeline viewer for Minecraft CreatorSMP events, displaying VOD streams from multiple creators across two teams with synchronized playback.

## Overview

This application shows a DAW-style timeline of all streams during the CreatorSMP event (November 9-30, 2025, 13:00-00:00 Europe/Amsterdam timezone). You can:

- View all creator streams for a selected day
- Click on any VOD bar to play it in the Twitch player
- See the current playback position as a cyan indicator line
- Watch multiple creators' perspectives of the same real-world events
- Filter by selected date

## Architecture

The application uses a clean separation of concerns:

### App (Smart Component)
- Manages selected VOD and playback time state
- Calculates VOD start time in Amsterdam timezone
- Converts player time (seconds) to real-world time (seconds)
- Passes simple props to child components

### TwitchPlayer (Dumb Component)
- Just a wrapper around the Twitch embed iframe
- Takes: `video` (ID), `timestamp` (seconds), `onTimeChange` callback
- Emits raw player time in seconds
- Listens to PLAYING/PAUSE events to start/stop polling
- No business logic or domain knowledge

### Timeline Components
- **Timeline**: Main container, groups creators by team
- **TimelineRow**: One row per creator with VOD bars
- **TimeRuler**: Hour marks showing 13:00-00:00
- **TimeIndicator**: Cyan vertical line showing current playback position
- **DaySelector**: Buttons to switch between event days

## Tech Stack

- **React 18** + TypeScript
- **TanStack Start** (full-stack framework with file-based routing)
- **TanStack Router** (type-safe routing)
- **Vite** (build tool via TanStack Start)
- **Nitro** (server runtime)
- **Tailwind CSS v4** (styling)
- **shadcn/ui** (component library)
- **date-fns** (date utilities)
- **react-resizable-panels** (split view)
- **Twitch Embed SDK** (video player)

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up Twitch credentials and fetch VODs (optional - `src/data/vods.json` is already committed):
```bash
TWITCH_CLIENT_ID=your_id TWITCH_CLIENT_SECRET=your_secret bun run scripts/fetch-vods.ts
```

3. Start dev server:
```bash
bun run dev
```

This starts the TanStack Start dev server on port 3000 with:
- File-based routing from `src/routes/`
- Server-side rendering with Nitro
- Hot module reloading (HMR)

## Key Features

### Timezone Handling
All times are calculated in Europe/Amsterdam timezone:
- VOD display times match the event's local timezone
- Real-world time indicator accounts for VOD start times
- Day boundaries respect Amsterdam timezone

### Team Organization
- **Team Noord** (Blue): Sorted alphabetically, dead creators at bottom
- **Team Zuid** (Red): Sorted alphabetically, dead creators at bottom
- Visual indication of player status (alive/dead)

### Synchronized Playback
- Click any VOD bar to play from that position
- Timeline indicator moves with playback
- Click position determines seek time within VOD
- Time indicator spans full height, aligned with time ruler

### Responsive Layout
- Resizable left/right panels
- Left panel: scrollable timeline
- Right panel: full-screen Twitch player
- All components aligned on same timeline scale

## Component Details

### TimelineRow
- Creator name in fixed left column (160px)
- VOD bars positioned by start time and duration
- Bars highlight on hover, change color when selected
- Click position within bar determines playback start time

### TimeRuler
- Hour marks from 13:00 to 00:00 (24:00)
- Left padding matches creator column width
- Fixed header that sticks during scroll

### TimeIndicator
- Cyan vertical line showing current player time
- Only visible when time is within event hours
- Spans full height of timeline
- Updates on player events (play, seek, pause)

### TwitchPlayer
- Initializes when first video is selected
- Polls time every 100ms during playback
- Stops polling when paused
- Re-initializes player when video changes

## Data Flow

```
Timeline (user clicks VOD)
  → handleVodClick(vod, creator, clickTimestamp)
    → setSelectedVod
      → App calculates vodStartSeconds (useMemo)
      → TwitchPlayer receives video + timestamp
        → Twitch player emits player time
          → onTimeChange(playerSeconds)
            → App: realWorldSeconds = vodStartSeconds + playerSeconds
              → setPlayerCurrentTimeSeconds
                → TimeIndicator positions line based on seconds
```

## Time Units

- **Player time**: Seconds since start of VOD (0-duration)
- **Real-world seconds**: Seconds since midnight in Amsterdam timezone (0-86400)
- **Minutes**: For positioning (0-1440 for 13:00-00:00)

TimelineRow uses minutes for positioning (0-660 = 13:00-23:00).

## Future Enhancements

- [ ] Timeline markers for deaths/events
- [ ] Dim non-Minecraft segments
- [ ] Thumbnail previews on hover
- [ ] Clips integration
- [ ] Search/filter creators
- [ ] Keyboard shortcuts for playback control
- [ ] Persistent selected VOD across day changes
- [ ] Download VOD data from API on app start

## Known Limitations

- Twitch player doesn't support events (PLAYING, SEEK, PAUSE) until player is ready
- Some Twitch VODs may be restricted/unavailable
- Event listeners re-established when video changes (Twitch limitation)
- Polling during playback uses fixed 100ms interval (not Twitch event-driven)

## File Structure

```
src/
├── routes/
│   ├── __root.tsx           # Root layout with HTML shell
│   └── index.tsx            # Home page (main app component)
├── components/
│   ├── DaySelector.tsx       # Date picker
│   ├── Timeline.tsx          # Main timeline container
│   ├── TimelineRow.tsx       # Creator VOD row
│   ├── TimeRuler.tsx         # Hour marks
│   ├── TimeIndicator.tsx     # Playback position line
│   ├── TwitchPlayer.tsx      # Twitch iframe wrapper
│   └── ui/                   # shadcn components
├── types/
│   └── vod.ts               # Type definitions
├── utils/
│   └── time.ts              # Time utilities
├── data/
│   └── vods.json            # VOD metadata
├── router.tsx               # TanStack Router configuration
├── styles.css               # Global styles
└── routeTree.gen.ts         # Auto-generated route tree

scripts/
└── fetch-vods.ts            # Twitch API scraper
```

## Development

The component hierarchy is kept shallow to avoid prop drilling. The App component is the "smart" orchestrator, while presentation components (Timeline, TwitchPlayer, etc.) are "dumb" and reusable.

When adding features:
1. Keep business logic in App
2. Pass simple props to child components
3. Emit events (callbacks) for state changes
4. Use composition over complex component logic
