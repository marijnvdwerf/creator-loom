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
    <div className="group h-6 bg-[#0f0f0f] hover:bg-[#141414] border-b border-border/20 flex items-center">
      {/* Creator name */}
      <div
        className={`w-40 flex-shrink-0 px-2 text-[11px] truncate border-l`}
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
              className="absolute top-0.5 bottom-0.5 bg-gradient-to-b from-[#2a2a2a] to-[#252525] border border-border/40 rounded-sm cursor-pointer hover:from-[#353535] hover:to-[#2f2f2f] hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 transition-all overflow-hidden"
              style={{
                left: `${Math.max(0, leftPercent)}%`,
                width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
              }}
              onClick={() => onVodClick?.(vod, creator)}
              title={`${vod.title}\n${format(vodStartDate, 'HH:mm')} - ${Math.floor(vodDurationMinutes / 60)}h ${Math.floor(vodDurationMinutes % 60)}m`}
            >
              <div className="h-full px-1.5 flex items-center text-[10px] text-muted-foreground/80 truncate">
                {vod.title}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
