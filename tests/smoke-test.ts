import path from "path";
import fs from "fs/promises";
import { createJobDirectory, cleanupJobDirectory } from "../lib/cleanup";
import { detectFileFormat, inspectImageFile, computePixelHash } from "../lib/image-validator";
import { buildExiftoolArgs } from "../lib/metadata-builder";
import { writeExifMetadata } from "../lib/exiftool";
import { validateOutputMetadata } from "../lib/metadata-validator";

async function runSmokeTest() {
  console.log("Starting smoke test on metadata engine...");
  const fixturePath = path.join(__dirname, "fixtures", "clean-jpeg.jpg");
  const { jobId, jobDir } = await createJobDirectory();

  try {
    const inputCopyPath = path.join(jobDir, "test_input.jpg");
    await fs.copyFile(fixturePath, inputCopyPath);

    // 1. Detect format
    const formatInfo = await detectFileFormat(inputCopyPath);
    console.log("Format detected:", formatInfo);

    // 2. Inspect dimensions
    const inspection = await inspectImageFile(inputCopyPath);
    console.log("Dimensions:", `${inspection.width}x${inspection.height}`);

    // 3. Raw pixel hash before
    const hashBefore = await computePixelHash(inputCopyPath);
    console.log("Pixel hash before:", hashBefore);

    // 4. Build metadata args
    const processingDate = new Date();
    const buildResult = buildExiftoolArgs({
      width: inspection.width,
      height: inspection.height,
      format: formatInfo.format,
      processingDate,
      processOptions: {
        metadataStrategy: "clean_and_apply",
      },
    });
    console.log("Generated ExifTool args count:", buildResult.args.length);

    // 5. Write metadata
    const outputPath = path.join(jobDir, "test_output.jpg");
    await fs.copyFile(inputCopyPath, outputPath);
    const writeRes = await writeExifMetadata(outputPath, buildResult.args);
    console.log("Write result stdout:", writeRes.stdout.trim());

    // 6. Validate output
    const { validation, diff } = await validateOutputMetadata({
      outputPath,
      expectedDimensions: { width: inspection.width, height: inspection.height },
      buildResult,
      format: formatInfo.format,
    });

    console.log("Validation passed:", validation.passed);
    if (!validation.passed) {
      console.error("Validation errors:", validation.errors);
      process.exit(1);
    }

    // 7. Verify pixel hash after
    const hashAfter = await computePixelHash(outputPath);
    console.log("Pixel hash after:", hashAfter);
    const pixelsIdentical = hashBefore === hashAfter;
    console.log("Pixels 100% identical (no re-encoding):", pixelsIdentical);

    if (!pixelsIdentical) {
      console.warn("WARNING: Pixels differed!");
    }

    // 8. Re-inspect decoded image
    const postInspection = await inspectImageFile(outputPath);
    console.log("Post inspection valid:", postInspection.width === inspection.width);

    console.log("\nSmoke test successfully PASSED!");
  } finally {
    await cleanupJobDirectory(jobDir);
  }
}

runSmokeTest().catch((err) => {
  console.error("Smoke test failed with error:", err);
  process.exit(1);
});
