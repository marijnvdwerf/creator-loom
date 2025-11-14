import { Creator, VOD } from '@/types/vod';
import { parseDuration, getMinutesSinceMidnight } from '@/utils/time';
import { format, isSameDay } from 'date-fns';

interface TimelineRowProps {
  creator: Creator;
  selectedDate: Date;
  startMinute: number;
  endMinute: number;
  teamColor: string;
  onVodClick?: (vod: VOD, creator: Creator, clickTimestamp: number) => void;
  selectedVod?: { vod: VOD; creator: Creator; timestamp: number } | null;
}

export function TimelineRow({
  creator,
  selectedDate,
  startMinute,
  endMinute,
  teamColor,
  onVodClick,
  selectedVod,
}: TimelineRowProps) {
  const totalMinutes = endMinute - startMinute;

  // Filter VODs for the selected day (in Amsterdam timezone)
  const dayVods = creator.vods.filter((vod) => {
    const vodDate = new Date(vod.createdAt);
    // Convert to Amsterdam timezone for comparison
    const amsterdamDate = new Date(vodDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    return isSameDay(amsterdamDate, selectedDate);
  });

  return (
    <div className="group h-6 bg-muted/20 hover:bg-muted/30 border-b border-border/20 flex items-center">
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

          const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
            if (!onVodClick) return;

            // Calculate where in the VOD the user clicked
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickPercent = clickX / rect.width;

            // Calculate the timestamp in seconds from the start of the VOD
            const clickTimestamp = Math.floor(vodDurationSeconds * clickPercent);

            onVodClick(vod, creator, clickTimestamp);
          };

          const isSelected = selectedVod?.vod.id === vod.id && selectedVod?.creator.twitchUsername === creator.twitchUsername;
          const baseClasses = "absolute top-0.5 bottom-0.5 border rounded-sm cursor-pointer transition-all overflow-hidden";
          const selectedClasses = isSelected
            ? "bg-primary/80 border-primary/80 shadow-lg shadow-primary/40"
            : "bg-gradient-to-b from-muted to-muted/80 border-border/40 hover:from-accent hover:to-accent/80 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20";

          return (
            <div
              key={vod.id}
              className={`${baseClasses} ${selectedClasses}`}
              style={{
                left: `${Math.max(0, leftPercent)}%`,
                width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
              }}
              onClick={handleClick}
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
