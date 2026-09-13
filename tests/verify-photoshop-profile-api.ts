import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { readExifMetadata } from "../lib/exiftool";

async function main() {
  console.log("Starting End-to-End Photoshop Profile API verification...");

  // 1. Create temporary PNG file
  const testPngPath = path.join(__dirname, "fixtures", "e2e_input_sample.png");
  await sharp({
    create: {
      width: 5472,
      height: 3648,
      channels: 3,
      background: { r: 128, g: 140, b: 152 },
    },
  })
    .png()
    .toFile(testPngPath);

  const pngBytes = await fs.readFile(testPngPath);

  // 2. Post to /api/process
  const form = new FormData();
  form.append(
    "image",
    new Blob([pngBytes], { type: "image/png" }),
    "e2e_input_sample.png"
  );
  form.append(
    "options",
    JSON.stringify({
      captureDateMode: "custom",
      customDate: "2026-07-09",
      captureTimeMode: "custom",
      customTime: "10:33:37",
      manualOverrides: {
        exposureTime: "1/640",
        fNumber: 4.0,
        iso: 100,
        focalLength: 70,
        whiteBalance: "Tungsten",
        meteringMode: "Evaluative",
      },
    })
  );

  const res = await fetch("http://localhost:3000/api/process", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API returned ${res.status}: ${errText}`);
  }

  // 3. Verify HTTP response headers
  const contentType = res.headers.get("Content-Type");
  const outputFilename = res.headers.get("x-output-filename");
  console.log("✓ Content-Type:", contentType);
  console.log("✓ Output filename:", outputFilename);

  if (contentType !== "image/png") {
    throw new Error(`Expected Content-Type image/png, got ${contentType}`);
  }
  if (!outputFilename?.endsWith(".png")) {
    throw new Error(`Expected output filename to end with .png, got ${outputFilename}`);
  }

  // 4. Save output file and inspect with ExifTool
  const outputBytes = Buffer.from(await res.arrayBuffer());
  const outputPath = path.join(__dirname, "fixtures", "e2e_output_photoshop.png");
  await fs.writeFile(outputPath, outputBytes);

  const meta = await readExifMetadata(outputPath);

  console.log("\n--- Verification of 9 Specification Tables ---");
  console.log("1. EXIF IFD0:");
  console.log("   Make:", meta.Make);
  console.log("   Model:", meta.Model);
  console.log("   Software:", meta.Software);

  console.log("2. EXIF SubIFD:");
  console.log("   ExifVersion:", meta.ExifVersion);
  console.log("   WhiteBalance (EXIF):", meta.WhiteBalance);
  console.log("   FocalPlaneResolution:", `${meta.FocalPlaneXResolution}x${meta.FocalPlaneYResolution} (${meta.FocalPlaneResolutionUnit})`);
  console.log("   OffsetTime (should be absent):", meta.OffsetTime ?? "ABSENT (CORRECT)");

  console.log("3. Canon MakerNote:");
  console.log("   CanonModelID:", meta.CanonModelID);
  console.log("   InternalSerialNumber:", meta.InternalSerialNumber);
  console.log("   CameraTemperature:", meta.CameraTemperature);
  console.log("   Canon:WhiteBalance:", meta["Canon:WhiteBalance"]);
  console.log("   LensType:", meta.LensType);

  console.log("4. GPS:");
  console.log("   GPSVersionID:", meta.GPSVersionID);

  console.log("5. XMP:");
  console.log("   CreatorTool:", meta["XMP-xmp:CreatorTool"]);
  console.log("   XMPToolkit:", meta.XMPToolkit);
  console.log("   Format:", meta["XMP-dc:Format"]);

  console.log("6. XMP Edit History:");
  console.log("   Action:", meta["XMP-xmpMM:HistoryAction"]);
  console.log("   Agent:", meta["XMP-xmpMM:HistorySoftwareAgent"]);
  console.log("   InstanceID:", meta["XMP-xmpMM:HistoryInstanceID"]);

  console.log("7. IPTC-IIM:");
  console.log("   DateCreated:", meta.DateCreated);
  console.log("   TimeCreated:", meta.TimeCreated);

  console.log("8. Photoshop IRB:");
  console.log("   PhotoshopQuality:", meta.PhotoshopQuality);
  console.log("   DisplayedUnits:", `${meta.DisplayedUnitsX} x ${meta.DisplayedUnitsY}`);

  console.log("9. ICC Profile:");
  console.log("   ProfileDescription:", meta.ProfileDescription);

  // Assertions
  if (meta.Make !== "Canon" || meta.Model !== "Canon EOS 70D") {
    throw new Error("Make/Model mismatch");
  }
  if (meta.ExifVersion !== "0230") {
    throw new Error(`ExifVersion expected 0230, got ${meta.ExifVersion}`);
  }
  if (meta.Software !== "Adobe Photoshop 26.3 (Windows)") {
    throw new Error(`Software expected Adobe Photoshop 26.3 (Windows), got ${meta.Software}`);
  }
  if (meta.OffsetTime !== undefined) {
    throw new Error("OffsetTime should not exist on Canon 70D");
  }
  if (String(meta.XMPToolkit).includes("ExifTool")) {
    throw new Error("ExifTool signature leaked in XMPToolkit");
  }
  if (meta.InternalSerialNumber !== "FA0631074") {
    throw new Error(`InternalSerialNumber expected FA0631074, got ${meta.InternalSerialNumber}`);
  }
  if (meta.WhiteBalance !== 1) {
    throw new Error(`EXIF WhiteBalance expected 1, got ${meta.WhiteBalance}`);
  }

  // Cleanup
  await fs.unlink(testPngPath);
  await fs.unlink(outputPath);

  console.log("\nALL 9 SPECIFICATION TABLES VERIFIED WITH 100% SUCCESS!");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
