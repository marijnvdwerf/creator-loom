import { useEffect, useState } from 'react';
import { getMinutesSinceMidnight } from '@/utils/time';
import { isSameDay } from 'date-fns';

interface TimeIndicatorProps {
  selectedDate: Date;
  startMinute: number;
  endMinute: number;
}

export function TimeIndicator({ selectedDate, startMinute, endMinute }: TimeIndicatorProps) {
  const [currentMinute, setCurrentMinute] = useState<number | null>(null);

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      const now = new Date();
      const nowAmsDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));

      // Only show indicator if it's the selected date
      if (isSameDay(nowAmsDate, selectedDate)) {
        const minute = getMinutesSinceMidnight(now);
        setCurrentMinute(minute);
      } else {
        setCurrentMinute(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedDate]);

  // Don't show if current time is outside the range or not today
  if (currentMinute === null || currentMinute < startMinute || currentMinute > endMinute) {
    return null;
  }

  const totalMinutes = endMinute - startMinute;
  const leftPercent = ((currentMinute - startMinute) / totalMinutes) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-green-500/80 pointer-events-none z-30"
      style={{
        left: `${leftPercent}%`,
        boxShadow: '0 0 10px rgba(34, 197, 94, 0.6)',
      }}
    />
  );
}
