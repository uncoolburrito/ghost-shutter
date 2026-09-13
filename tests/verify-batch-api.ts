import fs from "fs/promises";
import path from "path";
import { calculateBatchTimestamps } from "../lib/batch-timing";
import { generateCanonSequence } from "../lib/file-naming";
import { readExifMetadata } from "../lib/exiftool";

async function verifyBatchApi() {
  console.log("Starting End-to-End Batch API Verification (7 Images)...");

  const startFrame = 5120;
  const count = 7;
  const canonNames = generateCanonSequence(startFrame, count);
  const timestamps = calculateBatchTimestamps("2026-08-14", "15:20:00", count, "natural");

  console.log(`Generated sequence: ${canonNames[0]} → ${canonNames[count - 1]}`);
  console.log(`Timeline: ${timestamps[0].time} → ${timestamps[count - 1].time}`);

  for (let i = 0; i < count; i++) {
    const fixturePath = path.join(__dirname, "fixtures", `batch_sample_${i + 1}.jpg`);
    const fileBytes = await fs.readFile(fixturePath);

    const form = new FormData();
    form.append("image", new Blob([fileBytes], { type: "image/jpeg" }), `batch_sample_${i + 1}.jpg`);
    form.append(
      "options",
      JSON.stringify({
        captureDateMode: "custom",
        customDate: timestamps[i].date,
        captureTimeMode: "custom",
        customTime: timestamps[i].time,
        customOutputFilename: canonNames[i],
      })
    );

    const port = process.env.PORT || 3001;
    const res = await fetch(`http://localhost:${port}/api/process`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Failed to process image ${i + 1}: ${res.status} ${await res.text()}`);
    }

    const outputName = res.headers.get("x-output-filename");
    console.log(`✓ Image ${i + 1} processed: filename=${outputName}, timestamp=${timestamps[i].time}`);

    if (outputName !== canonNames[i]) {
      throw new Error(`Expected filename ${canonNames[i]}, got ${outputName}`);
    }

    // Save ephemeral and inspect with ExifTool
    const outputBuffer = Buffer.from(await res.arrayBuffer());
    const tempOut = path.join(__dirname, "fixtures", `temp_batch_out_${i + 1}.png`);
    await fs.writeFile(tempOut, outputBuffer);

    const meta = await readExifMetadata(tempOut);
    await fs.unlink(tempOut);

    if (meta.Make !== "Canon" || meta.Model !== "Canon EOS 70D") {
      throw new Error(`Invalid EXIF in output ${i + 1}: Make=${meta.Make}, Model=${meta.Model}`);
    }
  }

  console.log("\nALL 7 BATCH IMAGES VERIFIED WITH 100% SUCCESS!");
}

verifyBatchApi().catch((err) => {
  console.error("Batch verification failed:", err);
  process.exit(1);
});
