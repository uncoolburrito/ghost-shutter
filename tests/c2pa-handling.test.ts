import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { createJobDirectory, cleanupJobDirectory } from "../lib/cleanup";
import { inspectImageFile, computePixelHash } from "../lib/image-validator";
import { detectC2PA, removeC2PA, verifyC2PAAbsent } from "../lib/c2pa-handler";
import { buildExiftoolArgs, CAMERA_PROFILE } from "../lib/metadata-builder";
import { writeExifMetadata, readExifMetadata } from "../lib/exiftool";
import { validateOutputMetadata } from "../lib/metadata-validator";
import { generateC2paFixture } from "./fixtures/create-c2pa-fixture";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("C2PA / Content Credentials Handling (Section 15 Tests)", () => {
  let tempDir: string;
  let c2paTestFixture: string;

  beforeAll(async () => {
    const job = await createJobDirectory();
    tempDir = job.jobDir;
    c2paTestFixture = path.join(tempDir, "sample_ai_c2pa.jpg");
    await generateC2paFixture(
      c2paTestFixture,
      "Adobe Photoshop Generative Fill 2024",
      "Adobe Inc."
    );
  });

  afterAll(async () => {
    await cleanupJobDirectory(tempDir);
  });

  // Test A — C2PA present
  it("Test A: detects C2PA on input and completely removes it when c2paHandling = 'remove'", async () => {
    const target = path.join(tempDir, "testA_out.jpg");
    await fs.copyFile(c2paTestFixture, target);

    // 1. Detect C2PA on input
    const initialStatus = await detectC2PA(target);
    expect(initialStatus.detected).toBe(true);
    expect(initialStatus.details?.claimGenerator).toContain("Adobe Photoshop");

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
        metadataStrategy: "clean_and_apply",
      },
      existingMetadata: { c2paDetected: true },
    });

    // Apply metadata & C2PA removal
    await writeExifMetadata(target, buildResult.args);
    await removeC2PA(target);

    // 2. Strict verification of C2PA absence
    const verify = await verifyC2PAAbsent(target);
    expect(verify.absent).toBe(true);
    expect(verify.remainingIndicators).toHaveLength(0);

    // 3. Post-write validator verification
    const { validation, diff } = await validateOutputMetadata({
      outputPath: target,
      expectedDimensions: { width: inspection.width, height: inspection.height },
      buildResult,
      format: "JPEG",
      processOptions: { c2paHandling: "remove" },
      beforeMetadata: { c2paDetected: true },
    });

    expect(validation.passed).toBe(true);

    // 4. Verify camera metadata is properly present
    const meta = await readExifMetadata(target);
    expect(meta.Make).toBe("Canon");
    expect(meta.Model).toBe("Canon EOS 70D");
    expect(meta.LensModel || meta.Lens).toContain("55-250mm");
    expect(meta.ISO).toBe(100);

    // 5. Image integrity & decodability
    const postInspection = await inspectImageFile(target);
    expect(postInspection.width).toBe(inspection.width);
    expect(postInspection.height).toBe(inspection.height);

    // 6. Diff reflects removal
    const c2paDiff = diff.find((d) => d.field.includes("C2PA"));
    expect(c2paDiff).toBeDefined();
    expect(c2paDiff?.status).toBe("removed");
  });

  // Test B — C2PA absent
  it("Test B: processes normally with no errors when input does not contain C2PA", async () => {
    const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
    const target = path.join(tempDir, "testB_out.jpg");
    await fs.copyFile(src, target);

    const initialStatus = await detectC2PA(target);
    expect(initialStatus.detected).toBe(false);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
      },
    });

    await writeExifMetadata(target, buildResult.args);

    const { validation } = await validateOutputMetadata({
      outputPath: target,
      expectedDimensions: { width: inspection.width, height: inspection.height },
      buildResult,
      format: "JPEG",
      processOptions: { c2paHandling: "remove" },
    });

    expect(validation.passed).toBe(true);
    const meta = await readExifMetadata(target);
    expect(meta.Make).toBe("Canon");
  });

  // Test C — Preserve mode
  it("Test C: preserves C2PA manifest when c2paHandling = 'preserve'", async () => {
    const target = path.join(tempDir, "testC_out.jpg");
    await fs.copyFile(c2paTestFixture, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "preserve",
        metadataStrategy: "replace_camera", // Replace only camera tags, keep JUMBF
      },
      existingMetadata: { c2paDetected: true },
    });

    await writeExifMetadata(target, buildResult.args);

    // Verify C2PA is still detected
    const statusAfter = await detectC2PA(target);
    expect(statusAfter.detected).toBe(true);

    // Verify camera metadata was also applied
    const meta = await readExifMetadata(target);
    expect(meta.Make).toBe("Canon");
    expect(meta.Model).toBe("Canon EOS 70D");
  });

  // Test D — Removal verification failure simulation
  it("Test D: rejects output and fails validation if C2PA manifest remains after removal", async () => {
    // We intentionally validate an uncleaned file as if removal was requested
    const uncleanedFile = c2paTestFixture;
    const inspection = await inspectImageFile(uncleanedFile);

    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
      },
    });

    const { validation } = await validateOutputMetadata({
      outputPath: uncleanedFile, // still has C2PA!
      expectedDimensions: { width: inspection.width, height: inspection.height },
      buildResult,
      format: "JPEG",
      processOptions: { c2paHandling: "remove" },
      beforeMetadata: { c2paDetected: true },
    });

    // Validation must strictly fail because C2PA is present
    expect(validation.passed).toBe(false);
    expect(validation.errors.some((e) => e.includes("C2PA removal could not be verified"))).toBe(true);
  });

  // Test E — Existing ICC profile preserved in Smart mode
  it("Test E: preserves ICC profile independently of C2PA removal", async () => {
    const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
    const target = path.join(tempDir, "testE_out.jpg");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
        preserveIcc: true,
      },
    });

    await writeExifMetadata(target, buildResult.args);
    const postInspection = await inspectImageFile(target);
    expect(postInspection.space).toBe("srgb");
  });

  // Test F — Missing ICC profile defaults to sRGB
  it("Test F: applies default sRGB color space when no ICC profile is present", async () => {
    const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
    const target = path.join(tempDir, "testF_out.jpg");
    await fs.copyFile(src, target);

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
        preserveIcc: false,
      },
    });

    await writeExifMetadata(target, buildResult.args);
    const meta = await readExifMetadata(target);
    expect(meta.ColorSpace).toBe(1); // 1 = sRGB
  });

  // Test G — AI editing metadata cleanup
  it("Test G: removes AI/software editing metadata while composing camera metadata", async () => {
    const target = path.join(tempDir, "testG_out.jpg");
    await fs.copyFile(c2paTestFixture, target);

    const initial = await readExifMetadata(target);
    expect(initial.Software).toContain("Adobe Photoshop");

    const inspection = await inspectImageFile(target);
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
        removeEditingSoftwareMetadata: true,
        addSoftwareTag: true,
      },
      existingMetadata: { c2paDetected: true },
    });

    await writeExifMetadata(target, buildResult.args);
    await removeC2PA(target);

    const meta = await readExifMetadata(target);
    expect(meta.Software).toBe("Adobe Photoshop 26.3 (Windows)");
    expect(meta.Software).not.toBe("Camera Metadata Composer");
    expect(meta.Make).toBe("Canon");
    expect(meta.Model).toBe("Canon EOS 70D");
  });

  // Test H — Normal photograph
  it("Test H: processes normal photograph with existing camera EXIF without pixel degradation", async () => {
    const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
    const target = path.join(tempDir, "testH_out.jpg");
    await fs.copyFile(src, target);

    const pixelHashBefore = await computePixelHash(target);
    const inspection = await inspectImageFile(target);

    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: "JPEG",
      processingDate: new Date(),
      processOptions: {
        c2paHandling: "remove",
        metadataStrategy: "clean_and_apply",
      },
    });

    await writeExifMetadata(target, buildResult.args);

    const pixelHashAfter = await computePixelHash(target);
    expect(pixelHashAfter).toBe(pixelHashBefore); // Pixels 100% untouched!

    const meta = await readExifMetadata(target);
    expect(meta.Make).toBe("Canon");
    expect(meta.Model).toBe("Canon EOS 70D");
  });
});
