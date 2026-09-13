import { BatchTimingMode } from "./types";

export interface BatchTimestamp {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  formatted: string; // e.g. "10:33:37"
  isoString: string;
}

/**
 * Returns the average interval in seconds and max jitter for each timing mode.
 */
function getTimingParams(mode: BatchTimingMode, customSeconds?: number): { baseSec: number; jitterSec: number } {
  switch (mode) {
    case "quick":
      return { baseSec: 7, jitterSec: 2 };
    case "posed":
      return { baseSec: 30, jitterSec: 5 };
    case "custom":
      const custom = Math.max(1, customSeconds || 15);
      return { baseSec: custom, jitterSec: custom > 6 ? 2 : 0 };
    case "natural":
    default:
      return { baseSec: 12, jitterSec: 3 };
  }
}

/**
 * Calculates a sequence of realistic capture timestamps starting from a base date/time.
 * Adds subtle organic jitter to mimic a real photographer pausing, adjusting framing, and shooting.
 */
export function calculateBatchTimestamps(
  baseDateStr: string,
  baseTimeStr: string,
  count: number,
  mode: BatchTimingMode = "natural",
  customSeconds?: number,
  useJitter: boolean = true
): BatchTimestamp[] {
  if (count <= 0) return [];

  // Parse base date & time
  const [year, month, day] = (baseDateStr || new Date().toISOString().split("T")[0])
    .split("-")
    .map(Number);
  const [hours, minutes, seconds] = (baseTimeStr || "12:00:00")
    .split(":")
    .map(Number);

  const baseDate = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, seconds || 0);

  const { baseSec, jitterSec } = getTimingParams(mode, customSeconds);

  const timestamps: BatchTimestamp[] = [];
  let currentDate = new Date(baseDate.getTime());

  // Deterministic subtle offsets if useJitter is enabled
  const jitterPatterns = [0, 2, -1, 3, -2, 1, 4, -3, 2, -1];

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      let stepSec = baseSec;
      if (useJitter && jitterSec > 0) {
        const jitterOffset = jitterPatterns[i % jitterPatterns.length] % (jitterSec + 1);
        stepSec = Math.max(2, baseSec + jitterOffset);
      }
      currentDate = new Date(currentDate.getTime() + stepSec * 1000);
    }

    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, "0");
    const d = String(currentDate.getDate()).padStart(2, "0");
    const hh = String(currentDate.getHours()).padStart(2, "0");
    const mm = String(currentDate.getMinutes()).padStart(2, "0");
    const ss = String(currentDate.getSeconds()).padStart(2, "0");

    timestamps.push({
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}:${ss}`,
      formatted: `${hh}:${mm}:${ss}`,
      isoString: currentDate.toISOString(),
    });
  }

  return timestamps;
}
