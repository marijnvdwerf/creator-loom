import { useEffect, useRef } from 'react';
import { VOD, Creator } from '@/types/vod';

// TypeScript declarations for Twitch embed API
declare global {
  interface Window {
    Twitch?: {
      Player: new (elementId: string, options: TwitchPlayerOptions) => TwitchPlayerInstance;
    };
  }
}

interface TwitchPlayerOptions {
  video?: string;
  width?: string | number;
  height?: string | number;
  parent: string[];
  autoplay?: boolean;
}

interface TwitchPlayerInstance {
  setVideo: (videoId: string, timestamp?: number) => void;
  seek: (timestamp: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  addEventListener: (event: string, callback: () => void) => void;
}

interface TwitchPlayerProps {
  selectedVod: { vod: VOD; creator: Creator; timestamp: number } | null;
  onTimeUpdate?: (realWorldTimeMinutes: number) => void;
}

export function TwitchPlayer({ selectedVod, onTimeUpdate }: TwitchPlayerProps) {
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const playerInitialized = useRef(false);
  const timeUpdateInterval = useRef<number | null>(null);

  // Helper to calculate real world time in minutes
  const getRealWorldTime = (playerCurrentSeconds: number): number | null => {
    if (!selectedVod) return null;

    // Get VOD start time and convert to minutes since midnight
    const vodStartDate = new Date(selectedVod.vod.createdAt);
    const vodStartMinutes = Math.floor(
      vodStartDate.getTime() / 1000 / 60 + // Convert to minutes since epoch
      (new Date().getTimezoneOffset() - 60) // Amsterdam is UTC+1, so adjust
    );

    // Actually, simpler approach: get the createdAt date and extract minutes
    const vodStartDateAms = new Date(vodStartDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    const vodStartMinuteOfDay = vodStartDateAms.getHours() * 60 + vodStartDateAms.getMinutes();

    // Real world time = when VOD started + how far into it we are
    return vodStartMinuteOfDay + playerCurrentSeconds / 60;
  };

  // Helper to update time and log it
  const updateTime = (eventName?: string) => {
    if (playerRef.current && onTimeUpdate) {
      const playerTime = playerRef.current.getCurrentTime();
      const realWorldTime = getRealWorldTime(playerTime);
      if (realWorldTime !== null) {
        console.log(`[Twitch Player] Time update${eventName ? ` (${eventName})` : ''}: player=${playerTime.toFixed(2)}s, realWorldTime=${realWorldTime.toFixed(2)}min`);
        onTimeUpdate(realWorldTime);
      }
    }
  };

  // Helper to setup event listeners on the player
  const setupEventListeners = () => {
    if (!playerRef.current) return;

    console.log('[Twitch Player] Setting up event listeners');
    playerRef.current.addEventListener('Twitch.Player.PLAYING', () => updateTime('PLAYING'));
    playerRef.current.addEventListener('Twitch.Player.SEEK', () => updateTime('SEEK'));
    playerRef.current.addEventListener('Twitch.Player.PAUSE', () => updateTime('PAUSE'));
  };

  useEffect(() => {
    // Wait for Twitch embed script to load
    if (!window.Twitch) {
      console.warn('Twitch embed script not loaded yet');
      return;
    }

    // Initialize player once on mount
    if (!playerInitialized.current) {
      console.log('[Twitch Player] Initializing player');
      const options: TwitchPlayerOptions = {
        width: '100%',
        height: '100%',
        parent: ['localhost', '127.0.0.1'],
        autoplay: true,
      };

      // Set initial video if available
      if (selectedVod) {
        options.video = selectedVod.vod.id;
        console.log(`[Twitch Player] Initial video: ${selectedVod.vod.id}`);
      }

      try {
        playerRef.current = new window.Twitch.Player('twitch-player', options);
        playerInitialized.current = true;

        // Setup event listeners
        setupEventListeners();

        // Start polling current time frequently (100ms for responsive scrubbing)
        if (!timeUpdateInterval.current) {
          timeUpdateInterval.current = window.setInterval(() => {
            if (playerRef.current && onTimeUpdate) {
              const playerTime = playerRef.current.getCurrentTime();
              const realWorldTime = getRealWorldTime(playerTime);
              if (realWorldTime !== null) {
                console.log(`[Twitch Player] Time poll: player=${playerTime.toFixed(2)}s, realWorldTime=${realWorldTime.toFixed(2)}min`);
                onTimeUpdate(realWorldTime);
              }
            }
          }, 100);
        }

        // If we have a timestamp, seek to it after player is ready
        if (selectedVod && selectedVod.timestamp > 0) {
          // Twitch player needs a moment to initialize before seeking
          setTimeout(() => {
            console.log(`[Twitch Player] Seeking to ${selectedVod.timestamp}s`);
            playerRef.current?.seek(selectedVod.timestamp);
            updateTime('INITIAL_SEEK');
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to create Twitch player:', error);
      }
    } else if (selectedVod && playerRef.current) {
      // Player exists, change the video and seek to timestamp
      console.log(`[Twitch Player] Changing video to ${selectedVod.vod.id}, seeking to ${selectedVod.timestamp}s`);
      playerRef.current.setVideo(selectedVod.vod.id, selectedVod.timestamp);

      // Trigger time update after video change
      setTimeout(() => {
        updateTime('VIDEO_CHANGED');
      }, 500);
    }

    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
      }
    };
  }, [selectedVod, onTimeUpdate]);

  return (
    <div className="h-full bg-black relative overflow-hidden">
      <div id="twitch-player" className="w-full h-full" />
      {!selectedVod && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="text-6xl mb-4">▶️</div>
            <p className="text-muted-foreground">Click a VOD to start playback</p>
          </div>
        </div>
      )}
    </div>
  );
}
