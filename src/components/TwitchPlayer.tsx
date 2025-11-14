import { useEffect, useRef } from 'react';
import { VOD, Creator } from '@/types/vod';
import { format } from 'date-fns';

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
}

interface TwitchPlayerProps {
  selectedVod: { vod: VOD; creator: Creator; timestamp: number } | null;
}

export function TwitchPlayer({ selectedVod }: TwitchPlayerProps) {
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const playerInitialized = useRef(false);

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
        parent: ['localhost'], // Add your production domain here when deploying
        autoplay: true,
      };

      // Set initial video if available
      if (selectedVod) {
        options.video = selectedVod.vod.id;
      }

      try {
        playerRef.current = new window.Twitch.Player('twitch-player', options);
        playerInitialized.current = true;

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
  }, [selectedVod]);

  return (
    <div className="h-full bg-background text-foreground flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-lg font-semibold">Player</h2>
        {selectedVod ? (
          <div>
            <p className="text-sm font-medium">{selectedVod.creator.name}</p>
            <p className="text-xs text-muted-foreground">{selectedVod.vod.title}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Click a VOD to start playback</p>
        )}
      </div>

      {/* Twitch player container */}
      <div className="flex-1 bg-black overflow-hidden relative">
        <div id="twitch-player" className="w-full h-full" />
        {!selectedVod && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/95">
            <div className="text-center">
              <div className="text-6xl mb-4">▶️</div>
              <p className="text-muted-foreground">No VOD selected</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls placeholder */}
      <div className="p-3 bg-muted/30 border-t border-border">
        <div className="text-xs font-mono text-muted-foreground">
          Current time: --:--:--
        </div>
      </div>
    </div>
  );
}
