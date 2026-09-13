/**
 * Date and timestamp formatting utilities for EXIF/XMP metadata.
 * Ensures consistent single-authoritative timestamping per job
 * and proper timezone offset handling (default: Asia/Kolkata).
 */

export interface FormattedTimestamps {
  captureExif: string;        // "YYYY:MM:DD HH:MM:SS"
  modifyExif: string;         // "YYYY:MM:DD HH:MM:SS"
  captureXmp: string;         // "YYYY-MM-DDTHH:MM:SS+05:30"
  modifyXmp: string;          // "YYYY-MM-DDTHH:MM:SS+05:30"
  offsetString: string;       // "+05:30"
  datePart: string;           // "YYYY-MM-DD"
  timePart: string;           // "HH:MM:SS"
}

/**
 * Computes the GMT/UTC offset string (e.g. "+05:30" or "-04:00") for a specific timezone and date.
 */
export function getTimezoneOffsetString(timezone: string, date: Date = new Date()): string {
  try {
    // Format date with timezone name / offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart && tzPart.value.startsWith("GMT")) {
      const offset = tzPart.value.replace("GMT", "");
      if (offset === "") return "+00:00";
      return offset;
    }
  } catch {
    // Fallback if timezone not recognized
  }
  return "+05:30"; // default fallback for Asia/Kolkata
}

/**
 * Gets date components (year, month, day, hours, minutes, seconds) in the specified timezone.
 */
export function getDatePartsInTimezone(date: Date, timezone: string): {
  year: string;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  let hours = getPart("hour");
  if (hours === "24") hours = "00";

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hours,
    minutes: getPart("minute"),
    seconds: getPart("second"),
  };
}

/**
 * Formats a Date object into EXIF standard format "YYYY:MM:DD HH:MM:SS" in the specified timezone.
 */
export function formatExifDateTime(date: Date, timezone: string): string {
  const p = getDatePartsInTimezone(date, timezone);
  return `${p.year}:${p.month}:${p.day} ${p.hours}:${p.minutes}:${p.seconds}`;
}

/**
 * Resolves capture date and time according to user options and processing timestamp.
 */
export function resolveTimestamps(
  processingDate: Date,
  timezone: string,
  options?: {
    captureDateMode?: "today" | "custom";
    customDate?: string; // YYYY-MM-DD
    captureTimeMode?: "current" | "custom";
    customTime?: string; // HH:MM:SS
  }
): FormattedTimestamps {
  const procParts = getDatePartsInTimezone(processingDate, timezone);
  const offsetString = getTimezoneOffsetString(timezone, processingDate);

  let year = procParts.year;
  let month = procParts.month;
  let day = procParts.day;
  let hours = procParts.hours;
  let minutes = procParts.minutes;
  let seconds = procParts.seconds;

  // Custom date override (YYYY-MM-DD)
  if (options?.captureDateMode === "custom" && options?.customDate) {
    const match = options.customDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      year = match[1];
      month = match[2];
      day = match[3];
    }
  }

  // Custom time override (HH:MM:SS or HH:MM)
  if (options?.captureTimeMode === "custom" && options?.customTime) {
    const match = options.customTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      hours = match[1];
      minutes = match[2];
      seconds = match[3] || "00";
    }
  }

  const captureExif = `${year}:${month}:${day} ${hours}:${minutes}:${seconds}`;
  const modifyExif = `${procParts.year}:${procParts.month}:${procParts.day} ${procParts.hours}:${procParts.minutes}:${procParts.seconds}`;
  const captureXmp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetString}`;
  const modifyXmp = `${procParts.year}-${procParts.month}-${procParts.day}T${procParts.hours}:${procParts.minutes}:${procParts.seconds}${offsetString}`;

  return {
    captureExif,
    modifyExif,
    captureXmp,
    modifyXmp,
    offsetString,
    datePart: `${year}-${month}-${day}`,
    timePart: `${hours}:${minutes}:${seconds}`,
  };
}
