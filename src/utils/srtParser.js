/**
 * Converts a time string "HH:MM:SS,MMM" to milliseconds.
 */
export function timeStringToMs(timeString) {
  const [time, ms] = timeString.split(',');
  const [hours, minutes, seconds] = time.split(':');
  
  return (
    parseInt(hours, 10) * 3600000 +
    parseInt(minutes, 10) * 60000 +
    parseInt(seconds, 10) * 1000 +
    parseInt(ms, 10)
  );
}

/**
 * Parses an SRT string into an array of subtitle objects.
 * Format: [{ id: number, start: number, end: number, text: string }]
 */
export function parseSrt(srtText) {
  if (!srtText) return [];

  // Normalize line endings to \n
  const normalizedText = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split by double newline to get blocks
  const blocks = normalizedText.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  return blocks.map((block) => {
    const lines = block.split('\n');
    const id = parseInt(lines[0], 10);
    const timeLine = lines[1];
    
    const [startStr, endStr] = timeLine.split(' --> ');
    const text = lines.slice(2).join('\n');

    return {
      id: isNaN(id) ? Date.now() : id, // Fallback if format is slightly off
      start: timeStringToMs(startStr),
      end: timeStringToMs(endStr),
      text: text,
      // Store original strings for easy mapping if needed, but ms is better for sync
      startString: startStr,
      endString: endStr,
    };
  });
}
