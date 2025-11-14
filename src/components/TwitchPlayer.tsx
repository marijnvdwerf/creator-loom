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
  onTimeUpdate?: (currentTime: number) => void;
}

export function TwitchPlayer({ selectedVod, onTimeUpdate }: TwitchPlayerProps) {
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const playerInitialized = useRef(false);
  const timeUpdateInterval = useRef<number | null>(null);

  useEffect(() => {
    // Wait for Twitch embed script to load
    if (!window.Twitch) {
      console.warn('Twitch embed script not loaded yet');
      return;
    }

    // Initialize player once on mount
    if (!playerInitialized.current) {
      const options: TwitchPlayerOptions = {
        width: '100%',
        height: '100%',
        parent: ['localhost', '127.0.0.1'],
        autoplay: true,
      };

      // Set initial video if available
      if (selectedVod) {
        options.video = selectedVod.vod.id;
      }

      try {
        playerRef.current = new window.Twitch.Player('twitch-player', options);
        playerInitialized.current = true;

        // Add event listeners to track playback
        const updateTime = () => {
          if (playerRef.current && onTimeUpdate) {
            onTimeUpdate(playerRef.current.getCurrentTime());
          }
        };

        playerRef.current.addEventListener('Twitch.Player.PLAYING', updateTime);
        playerRef.current.addEventListener('Twitch.Player.SEEK', updateTime);

        // Start polling current time while playing
        timeUpdateInterval.current = window.setInterval(() => {
          if (playerRef.current && onTimeUpdate) {
            onTimeUpdate(playerRef.current.getCurrentTime());
          }
        }, 250);

        // If we have a timestamp, seek to it after player is ready
        if (selectedVod && selectedVod.timestamp > 0) {
          // Twitch player needs a moment to initialize before seeking
          setTimeout(() => {
            playerRef.current?.seek(selectedVod.timestamp);
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to create Twitch player:', error);
      }
    } else if (selectedVod && playerRef.current) {
      // Player exists, change the video and seek to timestamp
      playerRef.current.setVideo(selectedVod.vod.id, selectedVod.timestamp);
    }

    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
      }
    };
  }, [selectedVod, onTimeUpdate]);

  return (
    <div className="h-full bg-black flex items-center justify-center overflow-hidden">
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
