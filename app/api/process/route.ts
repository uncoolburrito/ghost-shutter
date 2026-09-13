import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { createJobDirectory, cleanupJobDirectory } from "@/lib/cleanup";
import { detectFileFormat, inspectImageFile } from "@/lib/image-validator";
import { readExifMetadata, writeExifMetadata } from "@/lib/exiftool";
import { detectC2PA, removeC2PA, verifyC2PAAbsent, stripPngC2paChunks } from "@/lib/c2pa-handler";
import { buildExiftoolArgs, APP_CONFIG } from "@/lib/metadata-builder";
import { validateOutputMetadata } from "@/lib/metadata-validator";
import { getOutputFilename, sanitizeFilename } from "@/lib/file-naming";
import { injectPhotoshopApp13ToFile } from "@/lib/photoshop-irb";
import { ProcessOptions } from "@/lib/types";

export async function POST(req: NextRequest) {
  let jobDir: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    const optionsRaw = formData.get("options") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided in request." },
        { status: 400 }
      );
    }

    // Parse options if provided
    let options: ProcessOptions = {};
    if (optionsRaw) {
      try {
        options = JSON.parse(optionsRaw);
      } catch {
        // Fallback to default options
      }
    }

    const c2paHandling = options.c2paHandling || (APP_CONFIG as any).defaultC2PAHandling || "remove";

    // Size limit verification
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

    const originalName = sanitizeFilename(file.name || "image.png");
    const inputPath = path.join(jobDir, `orig_${originalName}`);
    // Output is native PNG with authentic Photoshop conversion lineage
    const outputBasename = path.basename(originalName, path.extname(originalName));
    const outputPath = path.join(jobDir, `out_${outputBasename}.png`);

    // Ephemerally write input
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(inputPath, Buffer.from(arrayBuffer));

    // 1. Identify MIME & file format via magic bytes
    const formatInfo = await detectFileFormat(inputPath);
    if (!formatInfo.valid) {
      return NextResponse.json(
        { error: formatInfo.error || "Unsupported file format." },
        { status: 415 }
      );
    }

    // 2. Read existing metadata for diff & precedence inspection
    let existingMetadata: Record<string, any> = {};
    try {
      existingMetadata = await readExifMetadata(inputPath);
    } catch {
      // Ignored if missing
    }

    // 2b. Detect C2PA in uploaded file before processing
    const c2paBefore = await detectC2PA(inputPath, existingMetadata);
    existingMetadata.c2paDetected = c2paBefore.detected;
    existingMetadata.hasC2pa = c2paBefore.detected;
    existingMetadata.c2paGenerator = c2paBefore.details?.claimGenerator;

    // 3. Inspect image dimensions
    const inspection = await inspectImageFile(inputPath);

    // 4. Single authoritative processing timestamp
    const processingDate = new Date();

    // 5. Construct metadata payload (outputting PNG with Photoshop conversion lineage)
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "PNG",
      processingDate,
      processOptions: options,
      existingMetadata,
      useTemplate: true,
    });

    // 6. Normalization: Output is authentic PNG exported from Photoshop
    // If input is already PNG, strip C2PA chunks if needed and write to outputPath
    // If input is JPEG/WebP/TIFF, convert to lossless PNG via Sharp
    if (formatInfo.format === "PNG") {
      const inputBuffer = await fs.readFile(inputPath);
      if (c2paHandling === "remove") {
        const { newBuffer } = stripPngC2paChunks(inputBuffer);
        await fs.writeFile(outputPath, newBuffer);
      } else {
        await fs.writeFile(outputPath, inputBuffer);
      }
    } else {
      await sharp(inputPath)
        .png({ compressionLevel: 9 })
        .toFile(outputPath);
    }

    // 7. Write metadata
    await writeExifMetadata(outputPath, buildResult.args);

    // 7b. If C2PA removal requested, ensure raw container cleanup
    if (c2paHandling === "remove" && (c2paBefore.detected || formatInfo.format === "PNG")) {
      await removeC2PA(outputPath);
    }

    // 8. Re-open output and validate metadata
    const { validation, diff } = await validateOutputMetadata({
      outputPath,
      expectedDimensions: { width: inspection.width, height: inspection.height },
      buildResult,
      format: "PNG",
      processOptions: options,
      beforeMetadata: existingMetadata,
    });

    if (!validation.passed) {
      console.error("[GhostShutter] Metadata validation failed for file:", originalName);
      console.error("[GhostShutter] Validation errors:", validation.errors);
      console.error(
        "[GhostShutter] Failed checks:",
        validation.checks.filter((c) => !c.passed)
      );
      return NextResponse.json(
        {
          error: "The metadata was written, but validation failed. The original image was not modified.",
          validationErrors: validation.errors,
          validationChecks: validation.checks,
        },
        { status: 422 }
      );
    }

    // 8b. Mandatory C2PA post-processing verification
    if (c2paHandling === "remove") {
      const c2paVerify = await verifyC2PAAbsent(outputPath);
      if (!c2paVerify.absent) {
        return NextResponse.json(
          {
            error: "C2PA removal could not be verified. Content Credentials remain in output file.",
            remainingIndicators: c2paVerify.remainingIndicators,
          },
          { status: 422 }
        );
      }
    }

    // 9. Validate image integrity by decoding output with sharp
    const postInspection = await inspectImageFile(outputPath);
    if (postInspection.width !== inspection.width || postInspection.height !== inspection.height) {
      return NextResponse.json(
        { error: "Output image dimension integrity check failed." },
        { status: 500 }
      );
    }

    // 10. Generate output filename (Photoshop default or custom user specified)
    const finalFilename = getOutputFilename(originalName, options.customOutputFilename);

    // Read processed output buffer
    const outputBuffer = await fs.readFile(outputPath);

    // Encode validation summary into response headers (base64 encoded JSON for safe ASCII transport)
    const summaryData = {
      camera: buildResult.effectiveSettings.camera,
      lens: buildResult.effectiveSettings.lens,
      captureTime: buildResult.timestamps.captureExif,
      settings: `${buildResult.effectiveSettings.exposureTime} · f/${buildResult.effectiveSettings.fNumber} · ISO ${buildResult.effectiveSettings.iso} · ${buildResult.effectiveSettings.focalLength}mm`,
      dimensions: `${inspection.width} × ${inspection.height}`,
      colorSpace: "sRGB",
    };

    const headers = new Headers();
    headers.set("Content-Type", "image/png");
    headers.set("Content-Length", outputBuffer.length.toString());
    headers.set(
      "Content-Disposition",
      `attachment; filename="${finalFilename}"`
    );
    headers.set(
      "x-metadata-validation",
      Buffer.from(JSON.stringify(validation)).toString("base64")
    );
    headers.set(
      "x-metadata-diff",
      Buffer.from(JSON.stringify(diff)).toString("base64")
    );
    headers.set(
      "x-metadata-summary",
      Buffer.from(JSON.stringify(summaryData)).toString("base64")
    );
    const c2paAction = c2paBefore.detected
      ? (c2paHandling === "preserve" ? "preserved" : "removed")
      : "absent";
    headers.set("x-c2pa-action", c2paAction);
    headers.set(
      "x-output-filename",
      finalFilename
    );

    return new NextResponse(outputBuffer, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "An error occurred during metadata processing." },
      { status: 500 }
    );
  } finally {
    // 11. Ephemeral cleanup
    if (jobDir) {
      await cleanupJobDirectory(jobDir);
    }
  }
}
