import { useEffect, useRef } from 'react';
import type { VOD, Creator } from '@/types/vod';

// TypeScript declarations for Twitch embed API
declare global {
  interface Window {
    Twitch?: {
      Player: TwitchPlayerConstructor;
    };
  }
}

interface TwitchPlayerConstructor {
  new (elementId: string, options: TwitchPlayerOptions): TwitchPlayerInstance;
  PLAYING: string;
  SEEK: string;
  PAUSE: string;
  ENDED: string;
  READY: string;
  ONLINE: string;
  OFFLINE: string;
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

  // Calculate real world time from player timestamp
  const getRealWorldTimeMinutes = (playerSeconds: number): number | null => {
    if (!selectedVod) return null;

    const vodStartDate = new Date(selectedVod.vod.createdAt);
    const vodStartDateAms = new Date(vodStartDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    const vodStartMinuteOfDay = vodStartDateAms.getHours() * 60 + vodStartDateAms.getMinutes();
    
    return vodStartMinuteOfDay + playerSeconds / 60;
  };

  // Update timeline position based on current player time
  const updateTime = () => {
    if (!playerRef.current || !onTimeUpdate || !selectedVod) return;

    try {
      const playerTime = playerRef.current.getCurrentTime();
      const realWorldMinutes = getRealWorldTimeMinutes(playerTime);
      
      if (realWorldMinutes !== null) {
        onTimeUpdate(realWorldMinutes);
      }
    } catch {
      // Silently handle errors
    }
  };

  // Initialize player and handle video changes
  useEffect(() => {
    if (!window.Twitch || !selectedVod) return;

    // Initialize player on first use
    if (!playerInitialized.current) {
      const options: TwitchPlayerOptions = {
        video: selectedVod.vod.id,
        width: '100%',
        height: '100%',
        parent: [window.location.hostname],
        autoplay: true,
      };

      try {
        playerRef.current = new window.Twitch.Player('twitch-player', options);
        playerInitialized.current = true;

        // Setup event listeners once
        const { Player } = window.Twitch;
        playerRef.current.addEventListener(Player.PLAYING, updateTime);
        playerRef.current.addEventListener(Player.SEEK, updateTime);
        playerRef.current.addEventListener(Player.PAUSE, updateTime);

        // Seek to timestamp if provided
        if (selectedVod.timestamp > 0) {
          setTimeout(() => {
            playerRef.current?.seek(selectedVod.timestamp);
            updateTime();
          }, 1000);
        }
      } catch {
        // Silently handle player creation errors
      }
    } else if (playerRef.current) {
      // Change video on existing player
      playerRef.current.setVideo(selectedVod.vod.id, selectedVod.timestamp);
      playerRef.current.play();
      setTimeout(() => updateTime(), 500);
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
