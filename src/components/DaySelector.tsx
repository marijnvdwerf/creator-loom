import { format, addDays } from 'date-fns';

interface DaySelectorProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

export function DaySelector({ selectedDate, onDateSelect }: DaySelectorProps) {
  // Generate dates from Nov 9 to Nov 30, 2025
  const startDate = new Date('2025-11-09T00:00:00Z');
  const endDate = new Date('2025-11-30T23:59:59Z');

  const days: Date[] = [];
  let currentDate = startDate;
  while (currentDate <= endDate) {
    days.push(new Date(currentDate));
    currentDate = addDays(currentDate, 1);
  }

  const isSelected = (date: Date) => {
    return format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  };

  return (
    <div className="bg-[#141414] border-b border-border px-4 py-2">
      <div className="flex gap-1 overflow-x-auto">
        {days.map((day) => {
          const dayNum = format(day, 'd');
          const monthShort = format(day, 'MMM');
          const selected = isSelected(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateSelect(day)}
              className={`
                flex-shrink-0 px-3 py-2 rounded text-xs font-medium transition-colors
                ${selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-[#1f1f1f] text-muted-foreground hover:bg-[#2a2a2a] hover:text-foreground'
                }
              `}
            >
              <div className="text-center">
                <div className="font-semibold">{dayNum}</div>
                <div className="text-[10px] opacity-70">{monthShort}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
