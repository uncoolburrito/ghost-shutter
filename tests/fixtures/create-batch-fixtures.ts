import sharp from "sharp";
import path from "path";

async function makeBatchFixtures() {
  const colors = [
    { r: 210, g: 105, b: 30 },  // Ochre / portrait warm
    { r: 100, g: 149, b: 237 }, // Sky blue
    { r: 46, g: 139, b: 87 },   // Forest green
    { r: 220, g: 20, b: 60 },   // Crimson
    { r: 72, g: 61, b: 139 },   // Dark slate
    { r: 218, g: 165, b: 32 },  // Goldenrod
    { r: 112, g: 128, b: 144 }, // Slate gray
  ];

  for (let i = 0; i < colors.length; i++) {
    const filename = path.join(__dirname, `batch_sample_${i + 1}.jpg`);
    await sharp({
      create: {
        width: 1920,
        height: 1280,
        channels: 3,
        background: colors[i],
      },
    })
      .jpeg({ quality: 90 })
      .toFile(filename);
    console.log(`Created ${filename}`);
  }
}

makeBatchFixtures().catch(console.error);
