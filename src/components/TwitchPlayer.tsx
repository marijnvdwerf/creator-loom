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

  // Helper to calculate real world time and format it
  const getRealWorldTimeInfo = (playerCurrentSeconds: number): { minutes: number; formatted: string } | null => {
    if (!selectedVod) return null;

    const vodStartDate = new Date(selectedVod.vod.createdAt);
    const vodStartDateAms = new Date(vodStartDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    const vodStartMinuteOfDay = vodStartDateAms.getHours() * 60 + vodStartDateAms.getMinutes();
    const totalMinutes = vodStartMinuteOfDay + playerCurrentSeconds / 60;

    // Format as HH:MM
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = Math.floor(totalMinutes % 60);
    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return { minutes: totalMinutes, formatted };
  };

  // Helper to update time and log it
  const updateTime = (eventName?: string) => {
    console.log(`[Twitch Player] updateTime called with event: ${eventName || 'none'}`);

    if (!playerRef.current) {
      console.warn('[Twitch Player] playerRef.current is null, cannot update time');
      return;
    }

    if (!onTimeUpdate) {
      console.warn('[Twitch Player] onTimeUpdate callback is not set');
      return;
    }

    try {
      const playerTime = playerRef.current.getCurrentTime();
      console.log(`[Twitch Player] Got player time: ${playerTime}`);

      const timeInfo = getRealWorldTimeInfo(playerTime);

      if (timeInfo !== null) {
        console.log(`[Twitch Player] Time update${eventName ? ` (${eventName})` : ''}: player=${playerTime.toFixed(2)}s, realWorldTime=${timeInfo.formatted} (${timeInfo.minutes.toFixed(2)}min), vodId=${selectedVod?.vod.id}`);
        onTimeUpdate(timeInfo.minutes);
      } else {
        console.warn('[Twitch Player] Could not get real world time (selectedVod is null?)');
      }
    } catch (error) {
      console.error('[Twitch Player] Error updating time:', error);
    }
  };

  // Helper to setup event listeners
  const setupEventListeners = () => {
    if (!playerRef.current) {
      console.warn('[Twitch Player] Cannot setup listeners - playerRef.current is null');
      return;
    }

    console.log('[Twitch Player] Setting up event listeners on player instance:', playerRef.current);

    const playingHandler = () => {
      console.log('[Twitch Player] *** PLAYING event fired ***');
      updateTime('PLAYING');
    };
    const seekHandler = () => {
      console.log('[Twitch Player] *** SEEK event fired ***');
      updateTime('SEEK');
    };
    const pauseHandler = () => {
      console.log('[Twitch Player] *** PAUSE event fired ***');
      updateTime('PAUSE');
    };

    playerRef.current.addEventListener('Twitch.Player.PLAYING', playingHandler);
    playerRef.current.addEventListener('Twitch.Player.SEEK', seekHandler);
    playerRef.current.addEventListener('Twitch.Player.PAUSE', pauseHandler);

    console.log('[Twitch Player] Event listeners registered successfully');
  };

  // Initialize player and handle video changes
  useEffect(() => {
    console.log('[Twitch Player] useEffect triggered, selectedVod:', selectedVod?.vod.id);

    // Wait for Twitch embed script to load
    if (!window.Twitch) {
      console.warn('Twitch embed script not loaded yet');
      return;
    }

    // Don't initialize until we have a video to play
    if (!selectedVod) {
      console.log('[Twitch Player] Waiting for selectedVod before initializing player');
      return;
    }

    // Initialize player on first selectedVod
    if (!playerInitialized.current) {
      console.log('[Twitch Player] Initializing player with video:', selectedVod.vod.id);
      const options: TwitchPlayerOptions = {
        video: selectedVod.vod.id,
        width: '100%',
        height: '100%',
        parent: ['localhost', '127.0.0.1'],
        autoplay: true,
      };

      try {
        console.log('[Twitch Player] Creating Twitch.Player instance...');
        playerRef.current = new window.Twitch.Player('twitch-player', options);
        console.log('[Twitch Player] Player instance created successfully');
        playerInitialized.current = true;

        // Setup event listeners
        console.log('[Twitch Player] About to call setupEventListeners()');
        setupEventListeners();
        console.log('[Twitch Player] setupEventListeners() completed');

        // Seek to timestamp if provided
        if (selectedVod.timestamp > 0) {
          setTimeout(() => {
            console.log(`[Twitch Player] Seeking to ${selectedVod.timestamp}s`);
            playerRef.current?.seek(selectedVod.timestamp);
            updateTime('INITIAL_SEEK');
          }, 1000);
        } else {
          console.log('[Twitch Player] No initial seek timestamp provided');
          // Try calling updateTime manually to test
          setTimeout(() => {
            console.log('[Twitch Player] Testing updateTime manually');
            updateTime('TEST');
          }, 500);
        }
      } catch (error) {
        console.error('Failed to create Twitch player:', error);
      }
    } else if (playerRef.current) {
      // Player already initialized, change the video and re-setup listeners
      console.log(`[Twitch Player] Changing video to ${selectedVod.vod.id}, seeking to ${selectedVod.timestamp}s`);
      playerRef.current.setVideo(selectedVod.vod.id, selectedVod.timestamp);

      // Re-register event listeners after video change
      console.log('[Twitch Player] Re-registering event listeners after video change');
      setupEventListeners();

      // Trigger initial time update after video loads
      setTimeout(() => {
        console.log('[Twitch Player] Initial time update after video change');
        updateTime('VIDEO_CHANGED');
      }, 500);
    }
  }, [selectedVod]);

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
