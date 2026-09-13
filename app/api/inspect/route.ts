import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createJobDirectory, cleanupJobDirectory } from "@/lib/cleanup";
import { detectFileFormat, inspectImageFile } from "@/lib/image-validator";
import { detectC2PA } from "@/lib/c2pa-handler";
import { readExifMetadata } from "@/lib/exiftool";
import { sanitizeFilename } from "@/lib/file-naming";
import { APP_CONFIG } from "@/lib/metadata-builder";
import { InspectResult, InspectMetadataSummary } from "@/lib/types";

export async function POST(req: NextRequest) {
  let jobDir: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided in request." },
        { status: 400 }
      );
    }

    // Check size limit (Section 52)
    const maxBytes = (APP_CONFIG.maxUploadMB || 100) * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is ${APP_CONFIG.maxUploadMB} MB.`,
        },
        { status: 413 }
      );
    }

    const job = await createJobDirectory();
    jobDir = job.jobDir;

    const safeName = sanitizeFilename(file.name || "upload.tmp");
    const tempInputPath = path.join(jobDir, safeName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempInputPath, buffer);

    // 1. Detect actual file format via magic bytes
    const formatCheck = await detectFileFormat(tempInputPath);
    if (!formatCheck.valid) {
      return NextResponse.json(
        { error: formatCheck.error || "Unsupported file format." },
        { status: 415 }
      );
    }

    // 2. Inspect dimensions and integrity via sharp
    const inspection = await inspectImageFile(tempInputPath);

    // 3. Read metadata via ExifTool
    let rawMetadata: Record<string, any> = {};
    try {
      rawMetadata = await readExifMetadata(tempInputPath);
    } catch {
      // Image has no parseable EXIF, which is expected for raw AI exports
    }

    // 4. Check for GPS
    const hasGps = Boolean(
      rawMetadata.GPSLatitude ||
      rawMetadata.GPSLongitude ||
      rawMetadata.GPSPosition
    );

    // 5. Check for C2PA / Content Credentials
    const c2paStatus = await detectC2PA(tempInputPath, rawMetadata);
    const hasC2pa = c2paStatus.detected;

    // 6. Build sanitized metadata summary (strictly non-sensitive)
    const metadataSummary: InspectMetadataSummary = {
      make: rawMetadata.Make,
      model: rawMetadata.Model,
      lens: rawMetadata.LensModel || rawMetadata.Lens,
      dateTimeOriginal: rawMetadata.DateTimeOriginal,
      iso: rawMetadata.ISO,
      fNumber: rawMetadata.FNumber,
      exposureTime: rawMetadata.ExposureTime,
      focalLength: rawMetadata.FocalLength,
      software: rawMetadata.Software,
      artist: rawMetadata.Artist,
      copyright: rawMetadata.Copyright,
      gps: hasGps
        ? {
            latitude: rawMetadata.GPSLatitude,
            longitude: rawMetadata.GPSLongitude,
          }
        : undefined,
    };

    const warnings: string[] = [];
    if (hasC2pa) {
      const generatorInfo = c2paStatus.details?.claimGenerator ? ` from ${c2paStatus.details.claimGenerator}` : "";
      warnings.push(
        `Content Credentials / C2PA detected${generatorInfo}. Embedded provenance will be removed if configured.`
      );
    }

    const result: InspectResult = {
      format: formatCheck.format,
      mimeType: formatCheck.mimeType,
      width: inspection.width,
      height: inspection.height,
      fileSize: file.size,
      hasGps,
      hasC2pa,
      c2paStatus,
      hasIcc: inspection.hasProfile,
      metadata: metadataSummary,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to inspect image." },
      { status: 500 }
    );
  } finally {
    if (jobDir) {
      await cleanupJobDirectory(jobDir);
    }
  }
}
