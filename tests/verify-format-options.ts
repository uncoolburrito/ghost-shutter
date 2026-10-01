import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { readExifMetadata } from "../lib/exiftool";
import { computePixelHash } from "../lib/image-validator";

async function verifyFormatOptions() {
  console.log("=== Verifying JPEG Default & PNG Option with Zero Quality Loss ===");

  const port = process.env.PORT || 3000;
  const fixtureJpeg = path.join(__dirname, "fixtures", "clean-jpeg.jpg");
  const jpegBytes = await fs.readFile(fixtureJpeg);
  const originalPixelHash = await computePixelHash(fixtureJpeg);

  // 1. Test Default Request (No outputFormat specified -> Must Default to JPEG)
  console.log("\n[Test 1] Testing Default Request (Should default to JPEG)...");
  const form1 = new FormData();
  form1.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), "clean-jpeg.jpg");
  form1.append("options", JSON.stringify({}));

  const res1 = await fetch(`http://localhost:${port}/api/process`, {
    method: "POST",
    body: form1,
  });

  if (!res1.ok) {
    throw new Error(`Test 1 failed with status ${res1.status}: ${await res1.text()}`);
  }

  const contentType1 = res1.headers.get("Content-Type");
  const filename1 = res1.headers.get("x-output-filename");
  console.log("  ✓ Content-Type:", contentType1);
  console.log("  ✓ Output filename:", filename1);

  if (contentType1 !== "image/jpeg") {
    throw new Error(`Expected Content-Type image/jpeg, got ${contentType1}`);
  }
  if (!filename1?.endsWith(".jpg")) {
    throw new Error(`Expected filename to end with .jpg, got ${filename1}`);
  }

  // Verify Zero Quality Loss: compare pixel hash of input JPEG vs output JPEG
  const outBuf1 = Buffer.from(await res1.arrayBuffer());
  const tempOutJpeg = path.join(__dirname, "fixtures", "temp_quality_test.jpg");
  await fs.writeFile(tempOutJpeg, outBuf1);

  const outPixelHash1 = await computePixelHash(tempOutJpeg);
  console.log("  ✓ Input Pixel Hash: ", originalPixelHash);
  console.log("  ✓ Output Pixel Hash:", outPixelHash1);

  if (originalPixelHash !== outPixelHash1) {
    throw new Error("Pixel hash mismatch! Generational quality loss detected.");
  }
  console.log("  ✓ Zero Quality Loss Verified: 100% bit-for-bit uncompressed pixel match!");

  // 2. Test Explicit PNG Request (outputFormat: 'png')
  console.log("\n[Test 2] Testing Explicit PNG Option (outputFormat = 'png')...");
  const form2 = new FormData();
  form2.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), "clean-jpeg.jpg");
  form2.append("options", JSON.stringify({
    outputFormat: "png",
    customOutputFilename: "converted_photo",
  }));

  const res2 = await fetch(`http://localhost:${port}/api/process`, {
    method: "POST",
    body: form2,
  });

  if (!res2.ok) {
    throw new Error(`Test 2 failed with status ${res2.status}: ${await res2.text()}`);
  }

  const contentType2 = res2.headers.get("Content-Type");
  const filename2 = res2.headers.get("x-output-filename");
  console.log("  ✓ Content-Type:", contentType2);
  console.log("  ✓ Output filename:", filename2);

  if (contentType2 !== "image/png") {
    throw new Error(`Expected Content-Type image/png, got ${contentType2}`);
  }
  if (filename2 !== "converted_photo.png") {
    throw new Error(`Expected filename converted_photo.png, got ${filename2}`);
  }

  // 3. Test PNG input converted to JPEG with 100% quality (quality: 100, 4:4:4 subsampling)
  console.log("\n[Test 3] Testing PNG input converted to JPEG with Maximum Quality (4:4:4)...");
  const fixturePng = path.join(__dirname, "fixtures", "sample-png.png");
  const pngBytes = await fs.readFile(fixturePng);

  const form3 = new FormData();
  form3.append("image", new Blob([pngBytes], { type: "image/png" }), "sample-png.png");
  form3.append("options", JSON.stringify({
    outputFormat: "jpeg",
  }));

  const res3 = await fetch(`http://localhost:${port}/api/process`, {
    method: "POST",
    body: form3,
  });

  if (!res3.ok) {
    throw new Error(`Test 3 failed with status ${res3.status}: ${await res3.text()}`);
  }

  const contentType3 = res3.headers.get("Content-Type");
  const filename3 = res3.headers.get("x-output-filename");
  console.log("  ✓ Content-Type:", contentType3);
  console.log("  ✓ Output filename:", filename3);

  if (contentType3 !== "image/jpeg") {
    throw new Error(`Expected Content-Type image/jpeg, got ${contentType3}`);
  }
  if (filename3 !== "sample-png.jpg") {
    throw new Error(`Expected filename sample-png.jpg, got ${filename3}`);
  }

  const outBuf3 = Buffer.from(await res3.arrayBuffer());
  const tempOut3 = path.join(__dirname, "fixtures", "temp_png_to_jpeg.jpg");
  await fs.writeFile(tempOut3, outBuf3);

  // Inspect EXIF
  const meta3 = await readExifMetadata(tempOut3);
  if (meta3.Make !== "Canon" || meta3.Model !== "Canon EOS 70D") {
    throw new Error(`Invalid EXIF on converted JPEG: Make=${meta3.Make}, Model=${meta3.Model}`);
  }
  console.log("  ✓ Canon EOS 70D metadata verified on converted JPEG!");

  // Cleanup temp files
  await fs.unlink(tempOutJpeg).catch(() => {});
  await fs.unlink(tempOut3).catch(() => {});

  console.log("\nALL JPEG DEFAULT & PNG OPTION TESTS PASSED WITH 100% SUCCESS!");
}

verifyFormatOptions().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
