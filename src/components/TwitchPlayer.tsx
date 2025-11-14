import { VOD, Creator } from '@/types/vod';
import { format } from 'date-fns';

interface TwitchPlayerProps {
  selectedVod: { vod: VOD; creator: Creator } | null;
}

export function TwitchPlayer({ selectedVod }: TwitchPlayerProps) {
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

      {/* Player placeholder */}
      <div className="flex-1 bg-muted/30 flex items-center justify-center overflow-auto">
        {selectedVod ? (
          <div className="text-center p-8">
            <div className="text-6xl mb-4">▶️</div>
            <p className="text-muted-foreground mb-2">Twitch Player Placeholder</p>
            <p className="text-xs text-muted-foreground">VOD ID: {selectedVod.vod.id}</p>
            <p className="text-xs text-muted-foreground">
              Started: {format(new Date(selectedVod.vod.createdAt), 'MMM d, HH:mm')}
            </p>
            <p className="text-xs text-muted-foreground">Views: {selectedVod.vod.viewCount.toLocaleString()}</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-4">▶️</div>
            <p className="text-muted-foreground">No VOD selected</p>
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
