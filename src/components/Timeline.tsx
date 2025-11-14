import { useMemo } from 'react';
import { DaySelector } from './DaySelector';
import { TimeRuler } from './TimeRuler';
import { TimelineRow } from './TimelineRow';
import { TimeIndicator } from './TimeIndicator';
import { VODData, Creator, VOD } from '@/types/vod';
import vodData from '@/data/vods.json';

interface TimelineProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onVodClick?: (vod: VOD, creator: Creator, clickTimestamp: number) => void;
  playerCurrentTime: number;
  selectedVod: { vod: VOD; creator: Creator; timestamp: number } | null;
}

export function Timeline({ selectedDate, onDateSelect, onVodClick, playerCurrentTime, selectedVod }: TimelineProps) {
  const data = vodData as VODData;

  // Server opens 13:00, closes 00:00 (next day)
  const startMinute = 13 * 60; // 780 minutes (13:00)
  const endMinute = 24 * 60;   // 1440 minutes (00:00/24:00)

  // Group and sort creators by team
  const { team0, team1 } = useMemo(() => {
    const team0Creators: Creator[] = [];
    const team1Creators: Creator[] = [];

    data.creators.forEach((creator) => {
      if (creator.team === 0) {
        team0Creators.push(creator);
      } else if (creator.team === 1) {
        team1Creators.push(creator);
      }
    });

    // Sort: alive by name, dead by death date (oldest at bottom)
    const sortCreators = (creators: Creator[]) => {
      const alive = creators.filter(c => c.alive !== false).sort((a, b) => a.name.localeCompare(b.name));
      const dead = creators.filter(c => c.alive === false).sort((a, b) => {
        const dateA = a.deathDate ? new Date(a.deathDate).getTime() : 0;
        const dateB = b.deathDate ? new Date(b.deathDate).getTime() : 0;
        return dateA - dateB; // Oldest deaths first, will appear at bottom
      });
      return [...alive, ...dead];
    };

    return {
      team0: sortCreators(team0Creators),
      team1: sortCreators(team1Creators),
    };
  }, [data.creators]);

  return (
    <div className="h-full bg-background text-foreground flex flex-col overflow-hidden">
      {/* Day selector */}
      <DaySelector selectedDate={selectedDate} onDateSelect={onDateSelect} />

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {/* Time indicator */}
        <TimeIndicator selectedDate={selectedDate} startMinute={startMinute} endMinute={endMinute} playerCurrentTime={playerCurrentTime} selectedVod={selectedVod} />

        {/* Time ruler */}
        <div className="sticky top-0 z-20">
          <TimeRuler startMinute={startMinute} endMinute={endMinute} />
        </div>

        {/* Team Noord */}
        <div className="mb-2">
          <div className="sticky top-6 z-10 px-4 py-0.5 bg-background border-b border-border/30">
            <h3 className="text-[11px] font-semibold text-blue-400/90">
              NOORD ({team0.filter(c => c.alive !== false).length} alive, {team0.filter(c => c.alive === false).length} dead)
            </h3>
          </div>
          {team0.map((creator) => (
            <TimelineRow
              key={creator.twitchUsername}
              creator={creator}
              selectedDate={selectedDate}
              startMinute={startMinute}
              endMinute={endMinute}
              teamColor="#3b82f6"
              onVodClick={onVodClick}
            />
          ))}
        </div>

        {/* Team Zuid */}
        <div>
          <div className="sticky top-6 z-10 px-4 py-0.5 bg-background border-b border-border/30">
            <h3 className="text-[11px] font-semibold text-red-400/90">
              ZUID ({team1.filter(c => c.alive !== false).length} alive, {team1.filter(c => c.alive === false).length} dead)
            </h3>
          </div>
          {team1.map((creator) => (
            <TimelineRow
              key={creator.twitchUsername}
              creator={creator}
              selectedDate={selectedDate}
              startMinute={startMinute}
              endMinute={endMinute}
              teamColor="#ef4444"
              onVodClick={onVodClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
