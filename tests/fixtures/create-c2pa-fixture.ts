import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { C2PA_UUID } from "../../lib/c2pa-handler";
import { writeExifMetadata } from "../../lib/exiftool";

export function createC2paApp11Segment(
  claimGenerator = "Adobe Photoshop Generative Fill 2024",
  issuer = "Adobe Inc."
): Buffer {
  // Description box 'jumd'
  const jumdType = C2PA_UUID;
  const jumdLabel = Buffer.from("c2pa\0", "utf8");
  const jumdBoxLen = 8 + 16 + 1 + jumdLabel.length; // len(4) + 'jumd'(4) + type(16) + toggles(1) + label
  const jumdBox = Buffer.alloc(jumdBoxLen);
  jumdBox.writeUInt32BE(jumdBoxLen, 0);
  jumdBox.write("jumd", 4, "ascii");
  jumdType.copy(jumdBox, 8);
  jumdBox.writeUInt8(0x01, 24); // toggles: has label
  jumdLabel.copy(jumdBox, 25);

  // Content box 'c2pa' (claim payload with generator, issuer, actions)
  const payload = Buffer.from(
    `c2pa.claim: generator=${claimGenerator}, issuer=${issuer}, action=c2pa.color_graded, action=c2pa.edited, created=2026-09-12T14:30:00Z`,
    "utf8"
  );
  const c2paBoxLen = 8 + payload.length;
  const c2paBox = Buffer.alloc(c2paBoxLen);
  c2paBox.writeUInt32BE(c2paBoxLen, 0);
  c2paBox.write("c2pa", 4, "ascii");
  payload.copy(c2paBox, 8);

  // JUMBF container box 'jumb'
  const jumbLen = 8 + jumdBoxLen + c2paBoxLen;
  const jumbBox = Buffer.alloc(jumbLen);
  jumbBox.writeUInt32BE(jumbLen, 0);
  jumbBox.write("jumb", 4, "ascii");
  jumdBox.copy(jumbBox, 8);
  c2paBox.copy(jumbBox, 8 + jumdBoxLen);

  // JPEG APP11 Marker Segment: 0xFF 0xEB, 2 bytes length (including length itself), 'JP\0', then JUMBF box
  const app11Header = Buffer.from([0x4a, 0x50, 0x00]); // JP\0
  const segLen = 2 + app11Header.length + jumbLen;
  const segment = Buffer.alloc(2 + segLen);
  segment.writeUInt8(0xff, 0);
  segment.writeUInt8(0xeb, 1); // APP11 marker
  segment.writeUInt16BE(segLen, 2);
  app11Header.copy(segment, 4);
  jumbBox.copy(segment, 4 + app11Header.length);

  return segment;
}

export async function generateC2paFixture(
  outputPath: string,
  generator = "Adobe Photoshop Generative Fill 2024",
  issuer = "Adobe Inc."
): Promise<string> {
  // Create base JPEG
  const rawBuffer = await sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 3,
      background: { r: 140, g: 170, b: 210 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const app11 = createC2paApp11Segment(generator, issuer);
  const c2paJpeg = Buffer.concat([
    rawBuffer.subarray(0, 2),
    app11,
    rawBuffer.subarray(2),
  ]);

  await fs.writeFile(outputPath, c2paJpeg);

  // Also embed editing metadata
  await writeExifMetadata(outputPath, [
    `-Software=${generator}`,
    "-XMP-photoshop:History=AI Inpainting Generative Fill",
    "-XMP-dc:Description=AI Edited Color Grade",
  ]);

  return outputPath;
}
