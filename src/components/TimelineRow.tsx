import { Creator, VOD } from '@/types/vod';
import { parseDuration, getMinutesSinceMidnight } from '@/utils/time';
import { format, isSameDay } from 'date-fns';

interface TimelineRowProps {
  creator: Creator;
  selectedDate: Date;
  startMinute: number;
  endMinute: number;
  teamColor: string;
  onVodClick?: (vod: VOD, creator: Creator) => void;
}

export function TimelineRow({
  creator,
  selectedDate,
  startMinute,
  endMinute,
  teamColor,
  onVodClick,
}: TimelineRowProps) {
  const totalMinutes = endMinute - startMinute;

  // Filter VODs for the selected day
  const dayVods = creator.vods.filter((vod) => {
    const vodDate = new Date(vod.createdAt);
    return isSameDay(vodDate, selectedDate);
  });

  return (
    <div className="group h-8 bg-[#141414] hover:bg-[#1a1a1a] border-b border-border/50 flex items-center">
      {/* Creator name */}
      <div
        className={`w-40 flex-shrink-0 px-2 text-xs truncate border-l-2`}
        style={{ borderLeftColor: teamColor }}
      >
        <span className="font-medium">{creator.name}</span>
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative h-full">
        {dayVods.map((vod) => {
          const vodStartDate = new Date(vod.createdAt);
          const vodStartMinute = getMinutesSinceMidnight(vodStartDate);
          const vodDurationSeconds = parseDuration(vod.duration);
          const vodDurationMinutes = vodDurationSeconds / 60;

          // Calculate position and width
          const leftPercent = ((vodStartMinute - startMinute) / totalMinutes) * 100;
          const widthPercent = (vodDurationMinutes / totalMinutes) * 100;

          // Skip if completely outside visible range
          if (vodStartMinute + vodDurationMinutes < startMinute || vodStartMinute > endMinute) {
            return null;
          }

          return (
            <div
              key={vod.id}
              className="absolute top-1 bottom-1 bg-[#2a2a2a] border border-border rounded cursor-pointer hover:bg-[#3a3a3a] hover:border-primary/50 transition-colors overflow-hidden"
              style={{
                left: `${Math.max(0, leftPercent)}%`,
                width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
              }}
              onClick={() => onVodClick?.(vod, creator)}
              title={`${vod.title}\n${format(vodStartDate, 'HH:mm')} - ${Math.floor(vodDurationMinutes / 60)}h ${Math.floor(vodDurationMinutes % 60)}m`}
            >
              <div className="h-full px-1 flex items-center text-[10px] text-muted-foreground truncate">
                {vod.title}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
