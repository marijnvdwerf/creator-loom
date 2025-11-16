import { useEffect, useRef } from 'react';

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

declare global {
  interface Window {
    Twitch?: {
      Player: new (elementId: string, options: TwitchPlayerOptions) => TwitchPlayerInstance;
      Player: {
        PLAYING: string;
        SEEK: string;
        PAUSE: string;
      };
    };
  }
}

interface TwitchPlayerProps {
  video?: string;
  timestamp?: number;
  onTimeChange?: (seconds: number) => void;
}

export function TwitchPlayer({ video, timestamp, onTimeChange }: TwitchPlayerProps) {
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const playerInitialized = useRef(false);
  const timeIntervalRef = useRef<number | null>(null);

  // Emit current player time
  const emitTime = () => {
    if (!playerRef.current || !onTimeChange) return;
    try {
      const time = playerRef.current.getCurrentTime();
      onTimeChange(time);
    } catch {
      // Silently ignore errors
    }
  };

  // Start polling time during playback
  const startTimeTracking = () => {
    if (timeIntervalRef.current) return;
    timeIntervalRef.current = window.setInterval(emitTime, 100);
  };

  // Stop polling time
  const stopTimeTracking = () => {
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = null;
    }
  };

  // Initialize or change video
  useEffect(() => {
    if (!window.Twitch || !video) {
      stopTimeTracking();
      return;
    }

    // Initialize player on first video
    if (!playerInitialized.current) {
      const options: TwitchPlayerOptions = {
        video,
        width: '100%',
        height: '100%',
        parent: [window.location.hostname],
        autoplay: true,
      };

      try {
        playerRef.current = new window.Twitch.Player('twitch-player', options);
        playerInitialized.current = true;

        // Setup event listeners
        const { Player } = window.Twitch;
        playerRef.current.addEventListener(Player.PLAYING, startTimeTracking);
        playerRef.current.addEventListener(Player.PAUSE, stopTimeTracking);
        playerRef.current.addEventListener(Player.SEEK, emitTime);

        // Seek to timestamp if provided
        if (timestamp && timestamp > 0) {
          setTimeout(() => {
            playerRef.current?.seek(timestamp);
            emitTime();
          }, 500);
        }
      } catch {
        // Silently ignore player creation errors
      }
    } else if (playerRef.current) {
      // Change video on existing player
      playerRef.current.setVideo(video, timestamp);
      emitTime();
    }
  }, [video, timestamp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimeTracking();
    };
  }, []);

  return (
    <div className="h-full bg-black relative overflow-hidden">
      <div id="twitch-player" className="w-full h-full" />
    </div>
  );
}
