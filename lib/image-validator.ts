import fs from "fs/promises";
import crypto from "crypto";
import sharp from "sharp";

export interface MagicNumberValidation {
  valid: boolean;
  mimeType: string;
  format: string;
  error?: string;
}

/**
 * Detects the actual image format from file header magic bytes rather than trusting file extensions.
 */
export async function detectFileFormat(filePath: string): Promise<MagicNumberValidation> {
  const handle = await fs.open(filePath, "r");
  const buffer = Buffer.alloc(16);
  await handle.read(buffer, 0, 16, 0);
  await handle.close();

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg", format: "JPEG" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
    return { valid: true, mimeType: "image/png", format: "PNG" };
  }

  // WebP: RIFF ... WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { valid: true, mimeType: "image/webp", format: "WEBP" };
  }

  // TIFF: Little-endian (II*\0) or Big-endian (MM\0*)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return { valid: true, mimeType: "image/tiff", format: "TIFF" };
  }

  // HEIC/HEIF: ftypheic, ftypmif1, ftypmsf1
  const ftyp = buffer.subarray(4, 12).toString("ascii");
  if (ftyp.includes("ftyp")) {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "mif1", "msf1", "hevc"].includes(brand)) {
      return { valid: true, mimeType: "image/heic", format: "HEIC" };
    }
  }

  return {
    valid: false,
    mimeType: "application/octet-stream",
    format: "UNKNOWN",
    error: "Unsupported file format. Please upload a JPEG, PNG, WebP, or TIFF image.",
  };
}

export interface ImageInspection {
  format: string;
  width: number;
  height: number;
  channels: number;
  space: string;
  hasProfile: boolean;
  fileSize: number;
}

/**
 * Validates and decodes the image using sharp to ensure image integrity.
 */
export async function inspectImageFile(filePath: string): Promise<ImageInspection> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    throw new Error("File is empty (0 bytes).");
  }

  try {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Image has invalid or missing dimensions.");
    }

    return {
      format: (metadata.format || "unknown").toUpperCase(),
      width: metadata.width,
      height: metadata.height,
      channels: metadata.channels || 3,
      space: metadata.space || "srgb",
      hasProfile: Boolean(metadata.hasProfile),
      fileSize: stat.size,
    };
  } catch (err: any) {
    throw new Error(`Image could not be decoded or is corrupted: ${err.message}`);
  }
}

/**
 * Computes a SHA-256 hash of the uncompressed raw pixel buffer.
 * Used to verify that metadata modification operations do NOT alter image pixels.
 */
export async function computePixelHash(filePath: string): Promise<string> {
  try {
    const { data } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    // For unsupported raw extraction or non-decodable streams, fallback to empty
    return "";
  }
}

import { detectC2PA } from "./c2pa-handler";

/**
 * Checks for C2PA (Content Credentials) manifests or JUMBF boxes in the image file.
 */
export async function detectC2pa(filePath: string, exifMetadata?: Record<string, any>): Promise<boolean> {
  const status = await detectC2PA(filePath, exifMetadata);
  return status.detected;
}

