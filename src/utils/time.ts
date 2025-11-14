// Parse duration like "1h34m9s" or "PT1H34M9S" to seconds
export function parseDuration(duration: string): number {
  // Try lowercase format first (1h34m9s)
  let matches = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);

  // If no match, try ISO 8601 format (PT1H34M9S)
  if (!matches || !matches[0]) {
    matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  }

  if (!matches) return 0;

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Format seconds to "HH:MM:SS"
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Get time in minutes since midnight in Europe/Amsterdam timezone
export function getMinutesSinceMidnight(date: Date): number {
  // Convert to Amsterdam time
  const amsterdamTime = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
  return amsterdamTime.getHours() * 60 + amsterdamTime.getMinutes();
}

// Format time as HH:MM
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
