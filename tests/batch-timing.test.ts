import { describe, it, expect } from "vitest";
import { calculateBatchTimestamps } from "../lib/batch-timing";
import { formatCanonFrame, generateCanonSequence } from "../lib/file-naming";

describe("Batch Timing & Realism", () => {
  it("calculates realistic time-spaced timestamps for a series of photos", () => {
    const timestamps = calculateBatchTimestamps("2026-07-09", "10:33:00", 7, "natural");
    expect(timestamps).toHaveLength(7);
    expect(timestamps[0].date).toBe("2026-07-09");
    expect(timestamps[0].time).toBe("10:33:00");

    // Check that timestamps strictly advance forward
    for (let i = 1; i < timestamps.length; i++) {
      const prev = new Date(`${timestamps[i - 1].date}T${timestamps[i - 1].time}`).getTime();
      const curr = new Date(`${timestamps[i].date}T${timestamps[i].time}`).getTime();
      expect(curr).toBeGreaterThan(prev);

      // Verify the interval is realistic (between 5 and 25 seconds for natural mode)
      const diffSec = (curr - prev) / 1000;
      expect(diffSec).toBeGreaterThanOrEqual(5);
      expect(diffSec).toBeLessThanOrEqual(25);
    }
  });

  it("calculates quick session timestamps", () => {
    const timestamps = calculateBatchTimestamps("2026-07-09", "14:00:00", 5, "quick");
    expect(timestamps).toHaveLength(5);
    for (let i = 1; i < timestamps.length; i++) {
      const prev = new Date(`${timestamps[i - 1].date}T${timestamps[i - 1].time}`).getTime();
      const curr = new Date(`${timestamps[i].date}T${timestamps[i].time}`).getTime();
      const diffSec = (curr - prev) / 1000;
      expect(diffSec).toBeGreaterThanOrEqual(4);
      expect(diffSec).toBeLessThanOrEqual(12);
    }
  });

  it("calculates posed studio timestamps", () => {
    const timestamps = calculateBatchTimestamps("2026-07-09", "16:00:00", 4, "posed");
    expect(timestamps).toHaveLength(4);
    for (let i = 1; i < timestamps.length; i++) {
      const prev = new Date(`${timestamps[i - 1].date}T${timestamps[i - 1].time}`).getTime();
      const curr = new Date(`${timestamps[i].date}T${timestamps[i].time}`).getTime();
      const diffSec = (curr - prev) / 1000;
      expect(diffSec).toBeGreaterThanOrEqual(20);
      expect(diffSec).toBeLessThanOrEqual(40);
    }
  });
});

describe("Canon Sequence Generation", () => {
  it("generates sequential Canon frame filenames", () => {
    const sequence = generateCanonSequence(4820, 5);
    expect(sequence).toEqual([
      "IMG_4820.png",
      "IMG_4821.png",
      "IMG_4822.png",
      "IMG_4823.png",
      "IMG_4824.png",
    ]);
  });

  it("handles rollover at 9999 to 0001", () => {
    expect(formatCanonFrame(9999)).toBe("IMG_9999.png");
    expect(formatCanonFrame(10000)).toBe("IMG_0001.png");
    expect(formatCanonFrame(10001)).toBe("IMG_0002.png");
  });
});
