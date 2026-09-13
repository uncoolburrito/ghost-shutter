import fs from "fs/promises";
import path from "path";

/**
 * Default location of the pre-extracted Photoshop APP13 segment.
 */
const DEFAULT_APP13_PATH = path.join(
  process.cwd(),
  "config",
  "templates",
  "photoshop_app13.bin"
);

/**
 * Injects or replaces the APP13 (Photoshop 3.0 / 8BIM) segment in a JPEG buffer.
 * If an APP13 segment is already present, it is replaced with the authentic template segment.
 * If not present, it is inserted right after the EXIF APP1 segment (or after SOI if no APP1).
 */
export function injectPhotoshopApp13(
  jpegBuffer: Buffer,
  app13Segment: Buffer
): Buffer {
  if (jpegBuffer.length < 4 || jpegBuffer[0] !== 0xff || jpegBuffer[1] !== 0xd8) {
    // Not a valid JPEG, return as-is
    return jpegBuffer;
  }

  // Find any existing APP13 segment, or find insertion point after APP1 / APP0
  let pos = 2;
  let existingStart = -1;
  let existingEnd = -1;
  let insertPos = 2;

  while (pos < jpegBuffer.length - 4) {
    if (jpegBuffer[pos] !== 0xff) {
      break;
    }

    const marker = jpegBuffer[pos + 1];
    // Start of scan (SOS) marks end of header segments
    if (marker === 0xda) {
      break;
    }

    const length = jpegBuffer.readUInt16BE(pos + 2);
    const segmentEnd = pos + 2 + length;

    if (marker === 0xed) {
      // Found existing APP13
      existingStart = pos;
      existingEnd = segmentEnd;
      break;
    }

    // Prefer inserting right after APP1 (0xE1) or APP0 (0xE0)
    if (marker === 0xe1 || marker === 0xe0) {
      insertPos = segmentEnd;
    } else if (marker === 0xdb || marker === 0xc0) {
      // DQT or SOF reached, don't insert past here if we haven't found APP1
      if (insertPos === 2) {
        insertPos = pos;
      }
      break;
    }

    pos = segmentEnd;
  }

  if (existingStart !== -1 && existingEnd !== -1) {
    // Replace existing APP13
    return Buffer.concat([
      jpegBuffer.subarray(0, existingStart),
      app13Segment,
      jpegBuffer.subarray(existingEnd),
    ]);
  } else {
    // Insert new APP13
    return Buffer.concat([
      jpegBuffer.subarray(0, insertPos),
      app13Segment,
      jpegBuffer.subarray(insertPos),
    ]);
  }
}

/**
 * Injects authentic Photoshop APP13 segment into a JPEG file on disk.
 */
export async function injectPhotoshopApp13ToFile(
  filePath: string,
  app13Path: string = DEFAULT_APP13_PATH
): Promise<void> {
  const [fileBuf, app13Buf] = await Promise.all([
    fs.readFile(filePath),
    fs.readFile(app13Path),
  ]);

  const updatedBuf = injectPhotoshopApp13(fileBuf, app13Buf);
  await fs.writeFile(filePath, updatedBuf);
}
