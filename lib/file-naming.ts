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
export function generateCanonCameraFilename(
  counter?: number,
  format: "jpeg" | "png" = "jpeg"
): string {
  if (counter !== undefined && counter > 0) {
    return formatCanonFrame(counter, format);
  }
  // If not provided, generate a plausible Canon 70D frame number between 1000 and 9999
  return formatCanonFrame(getRandomCanonFrame(), format);
}

/**
 * Formats a frame number into standard Canon 4-digit format: IMG_XXXX.jpg (or IMG_XXXX.png)
 * Handles rollover at 9999 -> 0001.
 */
export function formatCanonFrame(
  frame: number,
  format: "jpeg" | "png" = "jpeg"
): string {
  const ext = format === "png" ? "png" : "jpg";
  const normalized = ((Math.max(1, frame) - 1) % 9999) + 1;
  return `IMG_${String(normalized).padStart(4, "0")}.${ext}`;
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
export function generateCanonSequence(
  startFrame: number,
  count: number,
  format: "jpeg" | "png" = "jpeg"
): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(formatCanonFrame(startFrame + i, format));
  }
  return result;
}

/**
 * Generates an output filename matching selected format (JPEG default, PNG optional):
 * 1. If a custom filename is provided by the user, sanitizes and uses it with target extension.
 * 2. Default: Preserves the original base name and applies target extension (.jpg or .png).
 *
 * Examples (format = "jpeg"):
 *   "IMG_6442.PNG" -> "IMG_6442.jpg"
 *   "portrait_sunset.png" -> "portrait_sunset.jpg"
 *   "portrait_sunset.png" with custom "IMG_6442" -> "IMG_6442.jpg"
 */
export function getOutputFilename(
  inputFilename: string,
  customOrTargetName?: string,
  format: "jpeg" | "png" = "jpeg"
): string {
  const ext = format === "png" ? "png" : "jpg";

  // If a custom filename is provided (and it's not just a file extension like ".jpg")
  if (customOrTargetName && !customOrTargetName.startsWith(".")) {
    const customSanitized = sanitizeFilename(customOrTargetName);
    const customBase = path.basename(customSanitized, path.extname(customSanitized));
    return `${customBase || "image"}.${ext}`;
  }

  const sanitized = sanitizeFilename(inputFilename);
  const nameWithoutExt = path.basename(sanitized, path.extname(sanitized));

  return `${nameWithoutExt || "image"}.${ext}`;
}

