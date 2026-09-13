import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { writeExifMetadata } from "../../lib/exiftool";

const FIXTURES_DIR = path.join(__dirname);

async function createFixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });

  console.log("Generating test fixtures in", FIXTURES_DIR);

  // 1. Clean JPEG without metadata (3840x2560)
  const cleanJpegPath = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
  await sharp({
    create: {
      width: 3840,
      height: 2560,
      channels: 3,
      background: { r: 120, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toFile(cleanJpegPath);

  // 2. JPEG with smartphone metadata and GPS
  const phoneJpegPath = path.join(FIXTURES_DIR, "phone-exif.jpg");
  await sharp({
    create: {
      width: 4032,
      height: 3024,
      channels: 3,
      background: { r: 210, g: 180, b: 140 },
    },
  })
    .jpeg({ quality: 85 })
    .toFile(phoneJpegPath);

  await writeExifMetadata(phoneJpegPath, [
    "-Make=Apple",
    "-Model=iPhone 13",
    "-Software=iOS 16.5",
    "-ISO=32",
    "-ExposureTime=1/1200",
    "-FNumber=1.6",
    "-GPSLatitude=12.9716",
    "-GPSLatitudeRef=N",
    "-GPSLongitude=77.5946",
    "-GPSLongitudeRef=E",
  ]);

  // 3. Clean PNG (1920x1080)
  const pngPath = path.join(FIXTURES_DIR, "sample-png.png");
  await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 4,
      background: { r: 80, g: 100, b: 120, alpha: 1 },
    },
  })
    .png()
    .toFile(pngPath);

  // 4. WebP (1280x720)
  const webpPath = path.join(FIXTURES_DIR, "sample-webp.webp");
  await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: 90, g: 130, b: 90 },
    },
  })
    .webp({ quality: 80 })
    .toFile(webpPath);

  // 5. AI-edited JPEG with Photoshop / C2PA hint
  const aiJpegPath = path.join(FIXTURES_DIR, "ai-edited.jpg");
  await sharp({
    create: {
      width: 2048,
      height: 1365,
      channels: 3,
      background: { r: 180, g: 120, b: 160 },
    },
  })
    .jpeg({ quality: 92 })
    .toFile(aiJpegPath);

  await writeExifMetadata(aiJpegPath, [
    "-Software=Adobe Photoshop 2024 (Macintosh)",
    "-XMP-dc:Description=AI Enhanced Color Grading",
  ]);

  console.log("All test fixtures successfully created!");
}

createFixtures().catch((err) => {
  console.error("Failed to create fixtures:", err);
  process.exit(1);
});
