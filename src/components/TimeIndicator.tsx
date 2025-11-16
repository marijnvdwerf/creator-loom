interface TimeIndicatorProps {
  startMinute: number;
  endMinute: number;
  playerCurrentTimeSeconds: number;
}

export function TimeIndicator({ startMinute, endMinute, playerCurrentTimeSeconds }: TimeIndicatorProps) {
  // Convert seconds to minutes for calculation
  const playerCurrentTimeMinutes = playerCurrentTimeSeconds / 60;

  // Don't show if position is outside the range
  if (playerCurrentTimeMinutes < startMinute || playerCurrentTimeMinutes > endMinute) {
    return null;
  }

  const totalMinutes = endMinute - startMinute;

  // Calculate percentage within the timeline area (13:00 to 00:00)
  const timelinePercent = ((playerCurrentTimeMinutes - startMinute) / totalMinutes) * 100;

  return (
    <>
      {/* Left padding to match creator name column */}
      <div className="absolute top-0 bottom-0 w-40 pointer-events-none" />

      {/* Time indicator line in the timeline area */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-cyan-500/80 pointer-events-none z-30"
        style={{
          left: `calc(160px + ${timelinePercent}%)`,
          boxShadow: '0 0 10px rgba(6, 182, 212, 0.6)',
        }}
      />
    </>
  );
}
