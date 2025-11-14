import { useMemo } from 'react';
import { VOD, Creator } from '@/types/vod';
import { getMinutesSinceMidnight } from '@/utils/time';

interface TimeIndicatorProps {
  selectedDate: Date;
  startMinute: number;
  endMinute: number;
  playerCurrentTime: number;
  selectedVod: { vod: VOD; creator: Creator; timestamp: number } | null;
}

export function TimeIndicator({ selectedDate, startMinute, endMinute, playerCurrentTime, selectedVod }: TimeIndicatorProps) {
  // Calculate the position on the timeline based on the playing VOD's start time
  const playerCurrentMinute = useMemo(() => {
    if (!selectedVod) return null;

    // Get the start time of the VOD in Amsterdam timezone
    const vodStartDate = new Date(selectedVod.vod.createdAt);
    const vodStartMinute = getMinutesSinceMidnight(vodStartDate);

    // Player current time is in seconds, convert to minutes and add to VOD start
    return vodStartMinute + playerCurrentTime / 60;
  }, [playerCurrentTime, selectedVod]);

  // Don't show if we don't have position info or if it's outside the range
  if (playerCurrentMinute === null || playerCurrentMinute < startMinute || playerCurrentMinute > endMinute) {
    return null;
  }

  const totalMinutes = endMinute - startMinute;
  const leftPercent = ((playerCurrentMinute - startMinute) / totalMinutes) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-cyan-500/80 pointer-events-none z-30"
      style={{
        left: `${leftPercent}%`,
        boxShadow: '0 0 10px rgba(6, 182, 212, 0.6)',
      }}
    />
  );
}
