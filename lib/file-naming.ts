import path from "path";

/**
 * Sanitizes a filename to prevent path traversal and shell injection risks.
 * Replaces illegal characters with underscores.
 */
export function sanitizeFilename(rawFilename: string): string {
  // Strip path information (directory traversal prevention)
  const basename = path.basename(rawFilename);

  // Strip all shell metacharacters and unsafe characters, keeping only safe alphanumeric, dash, dot, and underscore
  const cleaned = basename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();

  return cleaned || "image";
}

/**
 * Generates an authentic Canon EOS DSLR default camera filename.
 * Canon EOS bodies name images in the standard format: "IMG_XXXX.jpg" (e.g. "IMG_6442.jpg").
 */
export function generateCanonCameraFilename(counter?: number): string {
  if (counter !== undefined && counter > 0) {
    return formatCanonFrame(counter);
  }
  // If not provided, generate a plausible Canon 70D frame number between 1000 and 9999
  return formatCanonFrame(getRandomCanonFrame());
}

/**
 * Formats a frame number into standard Canon 4-digit format: IMG_XXXX.png
 * Handles rollover at 9999 -> 0001.
 */
export function formatCanonFrame(frame: number): string {
  const normalized = ((Math.max(1, frame) - 1) % 9999) + 1;
  return `IMG_${String(normalized).padStart(4, "0")}.png`;
}

/**
 * Returns a plausible starting Canon frame number between 1000 and 9000.
 */
export function getRandomCanonFrame(): number {
  return Math.floor(1000 + Math.random() * 8000);
}

/**
 * Generates a sequence of Canon filenames starting at startFrame.
 */
export function generateCanonSequence(startFrame: number, count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(formatCanonFrame(startFrame + i));
  }
  return result;
}

/**
 * Generates an output filename matching Adobe Photoshop PNG Export behavior:
 * 1. If a custom filename is provided by the user, sanitizes and uses it (enforcing lowercase .png).
 * 2. Default: Photoshop preserves the original base name and applies lowercase .png.
 * 3. Enforces lowercase ".png" extension.
 *
 * Examples:
 *   "IMG_6442.JPG" -> "IMG_6442.png"
 *   "portrait_sunset.jpg" -> "portrait_sunset.png"
 *   "portrait_sunset.png" with custom "IMG_6442" -> "IMG_6442.png"
 */
export function getOutputFilename(
  inputFilename: string,
  customOrTargetName?: string
): string {
  // If a custom filename is provided (and it's not just a file extension like ".png")
  if (customOrTargetName && !customOrTargetName.startsWith(".")) {
    const customSanitized = sanitizeFilename(customOrTargetName);
    const customBase = path.basename(customSanitized, path.extname(customSanitized));
    return `${customBase || "image"}.png`;
  }

  const sanitized = sanitizeFilename(inputFilename);
  const nameWithoutExt = path.basename(sanitized, path.extname(sanitized));

  return `${nameWithoutExt || "image"}.png`;
}

