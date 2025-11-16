import { formatTime } from '@/utils/time';

interface TimeRulerProps {
  startMinute: number; // Minutes since midnight (e.g., 13*60 = 780 for 13:00)
  endMinute: number;   // Minutes since midnight (e.g., 24*60 = 1440 for 00:00)
}

export function TimeRuler({ startMinute, endMinute }: TimeRulerProps) {
  const totalMinutes = endMinute - startMinute;
  const hourMarks: number[] = [];

  // Generate hour marks
  for (let minute = startMinute; minute <= endMinute; minute += 60) {
    hourMarks.push(minute);
  }

  return (
    <div className="h-6 bg-muted/20 border-b border-border/30 flex items-center">
      {/* Left padding to match creator name column (w-40 = 160px) */}
      <div className="w-40 flex-shrink-0" />

      {/* Time ruler area */}
      <div className="flex-1 relative h-full">
        {hourMarks.map((minute) => {
          const offsetPercent = ((minute - startMinute) / totalMinutes) * 100;

          return (
            <div
              key={minute}
              className="absolute top-0 bottom-0"
              style={{ left: `${offsetPercent}%` }}
            >
              <div className="h-full border-l border-border/20" />
              <div className="absolute top-0.5 -translate-x-1/2 text-[10px] font-mono text-muted-foreground/70">
                {formatTime(minute)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
