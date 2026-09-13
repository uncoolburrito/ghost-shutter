import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { C2PAStatus, C2PADetails } from "./types";
import { getExiftoolPath } from "./exiftool";

const execFileAsync = promisify(execFile);

// C2PA Manifest Store UUID: 84966848-0742-4571-9782-4bfced7f53ce
export const C2PA_UUID = Buffer.from([
  0x84, 0x96, 0x68, 0x48, 0x07, 0x42, 0x45, 0x71,
  0x97, 0x82, 0x4b, 0xfc, 0xed, 0x7f, 0x53, 0xce,
]);

/**
 * Checks if a byte sequence represents a C2PA JUMBF marker or chunk.
 */
function scanBufferForC2paSignatures(buffer: Buffer): {
  detected: boolean;
  format?: "JPEG_APP11" | "PNG_CAPI" | "WEBP_JUMB" | "RAW_UUID";
} {
  if (buffer.length < 12) {
    return { detected: false };
  }

  // 1. PNG structural chunk check (PNG signature: 89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      const totalChunkLength = 12 + length;

      if (type === "caPI" || type === "c2pa" || type === "jumb") {
        return { detected: true, format: "PNG_CAPI" };
      }

      if (type !== "IDAT" && offset + totalChunkLength <= buffer.length) {
        const chunkData = buffer.subarray(offset + 8, offset + 8 + length);
        if (chunkData.includes(C2PA_UUID)) {
          return { detected: true, format: "PNG_CAPI" };
        }
      }

      offset += totalChunkLength;
      if (type === "IEND") {
        if (offset < buffer.length) {
          return { detected: true, format: "PNG_CAPI" };
        }
        break;
      }
    }
    return { detected: false };
  }

  // 2. JPEG structural marker check (SOI: 0xFF 0xD8)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= buffer.length) {
      if (buffer[i] === 0xff) {
        const marker = buffer[i + 1];
        // Stop scanning at Start of Scan (0xFF 0xDA) or End of Image (0xFF 0xD9)
        if (marker === 0xda || marker === 0xd9) {
          break;
        }
        // Standalone markers with no length payload
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          i += 2;
          continue;
        }

        const segLen = buffer.readUInt16BE(i + 2);
        if (segLen < 2) break;

        if (marker === 0xeb) { // APP11
          const segSlice = buffer.subarray(i + 4, Math.min(buffer.length, i + 2 + segLen));
          if (
            segSlice.includes(C2PA_UUID) ||
            segSlice.includes(Buffer.from("c2pa", "utf8")) ||
            segSlice.includes(Buffer.from("jumb", "utf8")) ||
            (segSlice[0] === 0x4a && segSlice[1] === 0x50) // 'JP'
          ) {
            return { detected: true, format: "JPEG_APP11" };
          }
        }
        i += 2 + segLen;
      } else {
        i++;
      }
    }
    return { detected: false };
  }

  // 3. WebP structural RIFF chunk check
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const fourCC = buffer.subarray(offset, offset + 4).toString("ascii");
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (fourCC === "JUMB" || fourCC === "C2PA") {
        return { detected: true, format: "WEBP_JUMB" };
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    return { detected: false };
  }

  // 4. Raw UUID fallback check
  if (buffer.includes(C2PA_UUID)) {
    return { detected: true, format: "RAW_UUID" };
  }

  return { detected: false };
}

/**
 * Extracts manifest details (claim generator, issuer, actions, created) from JUMBF/CBOR/XMP payload.
 */
function extractC2paDetailsFromBuffer(buffer: Buffer): C2PADetails {
  const details: C2PADetails = {};
  const textContent = buffer.toString("binary");

  // Regex patterns to identify standard claim generator / software
  const generatorMatch =
    textContent.match(/(?:claim_generator|generator|claimGenerator)[=:"\s]+([^,;"\r\n}]+)/i) ||
    textContent.match(/(Adobe Photoshop[^\0\r\n"]+)/i) ||
    textContent.match(/(Midjourney[^\0\r\n"]+)/i) ||
    textContent.match(/(DALL[·-]?E[^\0\r\n"]+)/i) ||
    textContent.match(/(Topaz[^\0\r\n"]+)/i);

  if (generatorMatch) {
    details.claimGenerator = generatorMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  // Issuer / Organization
  const issuerMatch =
    textContent.match(/(?:issuer|organization|authority)[=:"\s]+([^,;"\r\n}]+)/i) ||
    textContent.match(/(Adobe Inc\.|Truepic|Microsoft|OpenAI)/i);

  if (issuerMatch) {
    details.issuer = issuerMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  // Actions / Editing steps
  const actions: string[] = [];
  const actionMatches = textContent.matchAll(/c2pa\.([a-zA-Z0-9_]+)/g);
  for (const m of actionMatches) {
    const act = `c2pa.${m[1]}`;
    if (!actions.includes(act)) {
      actions.push(act);
    }
  }
  if (actions.length > 0) {
    details.actions = actions;
  }

  // Creation timestamp
  const createdMatch = textContent.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/);
  if (createdMatch) {
    details.created = createdMatch[1];
  }

  return details;
}

/**
 * Inspects a file for C2PA / Content Credentials manifests and extracts details.
 */
export async function detectC2PA(
  filePath: string,
  exifMetadata?: Record<string, any>
): Promise<C2PAStatus> {
  const buffer = await fs.readFile(filePath);
  const bufferCheck = scanBufferForC2paSignatures(buffer);

  let detected = bufferCheck.detected;
  let details: C2PADetails = {};

  if (detected) {
    details = extractC2paDetailsFromBuffer(buffer);
  }

  // Also cross-reference ExifTool tags
  if (exifMetadata) {
    for (const [key, value] of Object.entries(exifMetadata)) {
      const k = key.toLowerCase();
      if (k.includes("jumbf") || k.includes("c2pa")) {
        detected = true;
        if (!details.claimGenerator && typeof value === "string") {
          details.claimGenerator = value;
        }
      }
    }
  }

  return {
    detected,
    removable: detected,
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

/**
 * Strips C2PA APP11 markers directly from a JPEG buffer without touching image entropy data.
 * Safe container-level marker manipulation.
 */
export function stripJpegApp11C2paMarkers(buffer: Buffer): { stripped: boolean; newBuffer: Buffer } {
  // Must start with JPEG SOI (0xFF 0xD8)
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { stripped: false, newBuffer: buffer };
  }

  const chunks: Buffer[] = [buffer.subarray(0, 2)]; // Keep SOI
  let offset = 2;
  let modified = false;

  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      // Reached entropy data or raw stream
      chunks.push(buffer.subarray(offset));
      break;
    }

    const marker = buffer[offset + 1];

    // Standalone markers without payload
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    // SOS (Start of Scan) - rest of file is entropy image data
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    // Marker with length
    if (offset + 4 > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const segLength = buffer.readUInt16BE(offset + 2);
    const segEnd = offset + 2 + segLength;

    if (segEnd > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    // APP11 marker (0xFF 0xEB)
    if (marker === 0xeb) {
      const segSlice = buffer.subarray(offset + 4, segEnd);
      // Verify this APP11 is indeed JUMBF or C2PA
      if (
        segSlice.includes(C2PA_UUID) ||
        segSlice.includes(Buffer.from("c2pa", "utf8")) ||
        segSlice.includes(Buffer.from("jumb", "utf8")) ||
        (segSlice[0] === 0x4a && segSlice[1] === 0x50)
      ) {
        // Skip this segment entirely (stripping C2PA)
        modified = true;
        offset = segEnd;
        continue;
      }
    }

    // Retain all other standard segments (DQT, DHT, SOF, APP0, APP1, etc.)
    chunks.push(buffer.subarray(offset, segEnd));
    offset = segEnd;
  }

  if (modified) {
    return { stripped: true, newBuffer: Buffer.concat(chunks) };
  }

  return { stripped: false, newBuffer: buffer };
}

/**
 * Strips C2PA chunks (caPI, c2pa, jumb, or chunks containing C2PA manifest UUID)
 * and trailing manifest data after IEND directly from a PNG buffer without touching image pixel data.
 */
export function stripPngC2paChunks(buffer: Buffer): { stripped: boolean; newBuffer: Buffer } {
  if (
    buffer.length < 8 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    return { stripped: false, newBuffer: buffer };
  }

  const chunks: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  let modified = false;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const totalChunkLength = 12 + length;

    if (offset + totalChunkLength > buffer.length) {
      // Truncated chunk; include remainder and exit
      chunks.push(buffer.subarray(offset));
      break;
    }

    const isCriticalChunk = type === "IHDR" || type === "PLTE" || type === "IDAT" || type === "IEND";
    const chunkData = buffer.subarray(offset + 8, offset + 8 + length);
    const isC2paChunk =
      !isCriticalChunk &&
      (type === "caPI" ||
        type === "c2pa" ||
        type === "jumb" ||
        chunkData.includes(C2PA_UUID));

    if (isC2paChunk) {
      modified = true;
      offset += totalChunkLength;
      continue;
    }

    chunks.push(buffer.subarray(offset, offset + totalChunkLength));
    offset += totalChunkLength;

    if (type === "IEND") {
      // Discard any trailing data after IEND
      if (offset < buffer.length) {
        modified = true;
      }
      break;
    }
  }

  if (modified) {
    return { stripped: true, newBuffer: Buffer.concat(chunks) };
  }

  return { stripped: false, newBuffer: buffer };
}

/**
 * Removes C2PA / Content Credentials from an image file safely.
 * 1. Uses ExifTool to delete JUMBF group and XMP provenance.
 * 2. Uses container-level marker & chunk verification (JPEG APP11 and PNG caPI) to ensure no residual data exists.
 */
export async function removeC2PA(filePath: string): Promise<{ success: boolean; removed: boolean }> {
  const bin = getExiftoolPath();

  try {
    // 1. ExifTool JUMBF and XMP-c2pa deletion (with XMPToolkit cloaking)
    await execFileAsync(bin, [
      "-overwrite_original",
      "-jumbf:all=",
      "-XMP-c2pa:all=",
      "-XMP-xmpMM:Ingredients=",
      "-XMP-x:XMPToolkit=Adobe XMP Core 9.1-c002 79.a6444e2, 2024/10/28-01:45:00",
      filePath,
    ], { timeout: 20000 });
  } catch (err: any) {
    // Non-fatal if exiftool exited with minor warning
  }

  // 2. Double check buffer for any residual markers in JPEG and PNG
  try {
    const buffer = await fs.readFile(filePath);
    let currentBuffer = buffer;
    let modified = false;

    // JPEG APP11 check
    const jpegRes = stripJpegApp11C2paMarkers(currentBuffer);
    if (jpegRes.stripped) {
      currentBuffer = jpegRes.newBuffer;
      modified = true;
    }

    // PNG chunk & trailing data check
    const pngRes = stripPngC2paChunks(currentBuffer);
    if (pngRes.stripped) {
      currentBuffer = pngRes.newBuffer;
      modified = true;
    }

    if (modified) {
      await fs.writeFile(filePath, currentBuffer);
    }
  } catch {
    // ignore
  }

  const statusAfter = await detectC2PA(filePath);
  return {
    success: !statusAfter.detected,
    removed: !statusAfter.detected,
  };
}

/**
 * Strict verification that C2PA is absent from the output file.
 */
export async function verifyC2PAAbsent(filePath: string): Promise<{ absent: boolean; remainingIndicators: string[] }> {
  const remainingIndicators: string[] = [];
  const bin = getExiftoolPath();

  // 1. Check ExifTool JUMBF inspection
  try {
    const { stdout } = await execFileAsync(bin, ["-j", "-n", "-jumbf:all", filePath], { timeout: 10000 });
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const keys = Object.keys(parsed[0]).filter((k) => k !== "SourceFile");
      if (keys.length > 0) {
        remainingIndicators.push(`ExifTool JUMBF tags found: ${keys.join(", ")}`);
      }
    }
  } catch {
    // ignore
  }

  // 2. Check binary buffer signatures
  const buffer = await fs.readFile(filePath);
  const scan = scanBufferForC2paSignatures(buffer);
  if (scan.detected) {
    remainingIndicators.push(`Binary signature detected (${scan.format})`);
  }

  return {
    absent: remainingIndicators.length === 0,
    remainingIndicators,
  };
}
