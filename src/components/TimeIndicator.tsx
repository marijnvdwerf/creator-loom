import { useMemo } from 'react';

interface TimeIndicatorProps {
  selectedDate: Date;
  startMinute: number;
  endMinute: number;
  playerCurrentTime: number;
}

export function TimeIndicator({ selectedDate, startMinute, endMinute, playerCurrentTime }: TimeIndicatorProps) {
  // Convert player current time (seconds since start of VOD) to minutes
  const playerCurrentMinute = useMemo(() => {
    return startMinute + playerCurrentTime / 60;
  }, [playerCurrentTime, startMinute]);

  // Don't show if current time is outside the range
  if (playerCurrentMinute < startMinute || playerCurrentMinute > endMinute) {
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
