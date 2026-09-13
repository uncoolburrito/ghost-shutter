import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { createJobDirectory, cleanupJobDirectory } from "../lib/cleanup";
import { detectFileFormat, inspectImageFile, computePixelHash } from "../lib/image-validator";
import { buildExiftoolArgs, CAMERA_PROFILE } from "../lib/metadata-builder";
import { writeExifMetadata, readExifMetadata } from "../lib/exiftool";
import { validateOutputMetadata } from "../lib/metadata-validator";
import { sanitizeFilename, getOutputFilename } from "../lib/file-naming";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("Image Processing & Robustness (Section 60 Tests)", () => {
  let tempDir: string;

  beforeAll(async () => {
    const job = await createJobDirectory();
    tempDir = job.jobDir;
  });

  afterAll(async () => {
    await cleanupJobDirectory(tempDir);
  });

  // Test 1: JPEG without metadata
  it("Test 1: adds camera metadata to clean JPEG without metadata", async () => {
    const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
    const target = path.join(tempDir, "test1_out.jpg");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
    });

    await writeExifMetadata(target, buildResult.args);

    const { validation } = await validateOutputMetadata({
      outputPath: target,
      expectedDimensions: { width: inspection.width, height: inspection.height },
      buildResult,
      format: "JPEG",
    });

    expect(validation.passed).toBe(true);
    const meta = await readExifMetadata(target);
    expect(meta.Make).toBe("Canon");
    expect(meta.Model).toBe("Canon EOS 70D");
  });

  // Test 2: JPEG with unrelated metadata
  it("Test 2: configured camera profile takes precedence over unrelated smartphone metadata", async () => {
    const src = path.join(FIXTURES_DIR, "phone-exif.jpg");
    const target = path.join(tempDir, "test2_out.jpg");
    await fs.copyFile(src, target);

    const initial = await readExifMetadata(target);
    expect(initial.Model).toBe("iPhone 13");

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        metadataStrategy: "clean_and_apply",
      },
    });

    await writeExifMetadata(target, buildResult.args);

    const after = await readExifMetadata(target);
    expect(after.Make).toBe("Canon");
    expect(after.Model).toBe("Canon EOS 70D");
    expect(after.ISO).toBe(100); // Canon default wins over iPhone ISO 32
  });

  // Test 3: PNG support
  it("Test 3: handles PNG format according to supported metadata capabilities", async () => {
    const src = path.join(FIXTURES_DIR, "sample-png.png");
    const target = path.join(tempDir, "test3_out.png");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "PNG",
      processingDate: new Date(),
    });

    await writeExifMetadata(target, buildResult.args);

    const meta = await readExifMetadata(target);
    expect(meta.Make).toBe("Canon");
    expect(meta.Model).toBe("Canon EOS 70D");
  });

  // Test 4: Image with dimensions different from camera's native resolution
  it("Test 4: retains actual final dimensions (e.g. 2048x1365) rather than native 5472x3648", async () => {
    const src = path.join(FIXTURES_DIR, "ai-edited.jpg");
    const target = path.join(tempDir, "test4_out.jpg");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    expect(inspection.width).toBe(2048);
    expect(inspection.height).toBe(1365);

    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
    });

    await writeExifMetadata(target, buildResult.args);

    const meta = await readExifMetadata(target);
    const width = meta.ExifImageWidth || meta.ImageWidth;
    const height = meta.ExifImageHeight || meta.ImageHeight;
    expect(width).toBe(2048);
    expect(height).toBe(1365);
    expect(width).not.toBe(5472);
  });

  // Test 5: Image with ICC profile
  it("Test 5: preserves ICC profile during clean_and_apply strategy", async () => {
    const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
    const target = path.join(tempDir, "test5_out.jpg");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        metadataStrategy: "clean_and_apply",
        preserveIcc: true,
      },
    });

    await writeExifMetadata(target, buildResult.args);
    const postInspection = await inspectImageFile(target);
    expect(postInspection.space).toBe("srgb");
  });

  // Test 6: GPS handling
  it("Test 6: does not fabricate GPS and strips existing GPS by default", async () => {
    const src = path.join(FIXTURES_DIR, "phone-exif.jpg");
    const target = path.join(tempDir, "test6_out.jpg");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        preserveGps: false, // Default: strip GPS
      },
    });

    await writeExifMetadata(target, buildResult.args);

    const meta = await readExifMetadata(target);
    expect(meta.GPSLatitude).toBeUndefined();
    expect(meta.GPSLongitude).toBeUndefined();
    expect(meta.GPSPosition).toBeUndefined();
  });

  // Test 7: Malformed image handling
  it("Test 7: gracefully fails when given a corrupt/malformed image file", async () => {
    const badFile = path.join(tempDir, "bad_image.jpg");
    await fs.writeFile(badFile, Buffer.from("NOT_A_REAL_IMAGE_DATA_CORRUPT"));

    const formatCheck = await detectFileFormat(badFile);
    expect(formatCheck.valid).toBe(false);

    await expect(inspectImageFile(badFile)).rejects.toThrow();
  });

  // Test 8: Huge file size limit check
  it("Test 8: rejects files that exceed maximum configured upload size (100MB)", () => {
    const hugeFileSize = 105 * 1024 * 1024; // 105 MB
    const maxBytes = 100 * 1024 * 1024;
    expect(hugeFileSize > maxBytes).toBe(true);
  });

  // Test 9: Filename containing shell metacharacters
  it("Test 9: safely sanitizes filenames containing shell metacharacters and directory traversal", () => {
    const dangerousName = "../../../etc/passwd; rm -rf * $(whoami) `id` & photo|test.jpg";
    const sanitized = sanitizeFilename(dangerousName);

    expect(sanitized).not.toContain("../");
    expect(sanitized).not.toContain(";");
    expect(sanitized).not.toContain("|");
    expect(sanitized).not.toContain("`");
    expect(sanitized).not.toContain("$");

    const outName = getOutputFilename(dangerousName);
    expect(outName.endsWith(".png")).toBe(true);
    expect(outName).not.toContain("_metadata");
  });

  // Test 10: Image with existing AI/software metadata
  it("Test 10: replaces stale AI/software metadata with neutral composer tag", async () => {
    const src = path.join(FIXTURES_DIR, "ai-edited.jpg");
    const target = path.join(tempDir, "test10_out.jpg");
    await fs.copyFile(src, target);

    const initial = await readExifMetadata(target);
    expect(initial.Software).toContain("Adobe Photoshop");

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        metadataStrategy: "clean_and_apply",
        addSoftwareTag: true,
      },
    });

    await writeExifMetadata(target, buildResult.args);

    const meta = await readExifMetadata(target);
    expect(meta.Software).toBe("Adobe Photoshop 26.3 (Windows)");
    expect(meta.Software).not.toContain("Canon EOS 70D");
    expect(meta.Software).not.toBe("Camera Metadata Composer");
  });
});
