interface TimeIndicatorProps {
  startMinute: number;
  endMinute: number;
  playerCurrentTimeMinutes: number;
}

export function TimeIndicator({ startMinute, endMinute, playerCurrentTimeMinutes }: TimeIndicatorProps) {
  // Don't show if position is outside the range
  if (playerCurrentTimeMinutes < startMinute || playerCurrentTimeMinutes > endMinute) {
    return null;
  }

  const totalMinutes = endMinute - startMinute;
  const creatorNameWidthPx = 160; // w-40 = 10rem ≈ 160px

  // Calculate percentage within the timeline area only (after the creator name column)
  const timelinePercent = ((playerCurrentTimeMinutes - startMinute) / totalMinutes) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-cyan-500/80 pointer-events-none z-30"
      style={{
        left: `calc(160px + ${timelinePercent}%)`,
        boxShadow: '0 0 10px rgba(6, 182, 212, 0.6)',
      }}
    />
  );
}
