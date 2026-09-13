import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs/promises";
import { createJobDirectory, cleanupJobDirectory } from "../lib/cleanup";
import { inspectImageFile } from "../lib/image-validator";
import { buildExiftoolArgs } from "../lib/metadata-builder";
import { writeExifMetadata, readExifMetadata } from "../lib/exiftool";
import { validateOutputMetadata } from "../lib/metadata-validator";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("Golden Camera Metadata Profile (Section 61)", () => {
  it("strictly validates all Canon EOS 70D golden tags in output JPEG", async () => {
    const { jobDir } = await createJobDirectory();

    try {
      const src = path.join(FIXTURES_DIR, "clean-jpeg.jpg");
      const target = path.join(jobDir, "golden_output.jpg");
      await fs.copyFile(src, target);

      const inspection = await inspectImageFile(target);
      const processingDate = new Date("2026-09-13T04:25:00+05:30");

      const buildResult = buildExiftoolArgs({
        width: inspection.width,
        height: inspection.height,
        format: "JPEG",
        processingDate,
        processOptions: {
          metadataStrategy: "clean_and_apply",
        },
      });

      await writeExifMetadata(target, buildResult.args);

      // 1. Post-write validator verification
      const { validation } = await validateOutputMetadata({
        outputPath: target,
        expectedDimensions: { width: inspection.width, height: inspection.height },
        buildResult,
        format: "JPEG",
      });

      expect(validation.passed).toBe(true);

      // 2. Direct ExifTool raw tag assertions against Section 61 Golden spec
      const meta = await readExifMetadata(target);

      // Camera identity
      expect(meta.Make).toBe("Canon");
      expect(meta.Model).toBe("Canon EOS 70D");
      expect(meta.Firmware || meta.FirmwareVersion || meta["Canon:FirmwareVersion"]).toBe("1.1.1");
      // Camera serial (standard EXIF)
      expect(meta.SerialNumber || meta.CanonSerialNumber).toBe("082024004039");
      // Proprietary internal serial (gracefully skipped if unsupported per Section 22)
      if (meta.InternalSerialNumber) {
        expect(meta.InternalSerialNumber).toBe("FA0631074");
      }

      // Lens identity
      expect(meta.LensMake).toBe("Canon");
      expect(meta.LensModel || meta.Lens).toContain("EF-S 55-250mm");
      expect(meta.LensSerialNumber).toBe("0000338ce6");

      // Exposure settings
      const expFloat = Number(meta.ExposureTime);
      expect(Math.abs(expFloat - 1 / 640)).toBeLessThan(0.0001);
      expect(meta.FNumber).toBe(4);
      expect(meta.ISO).toBe(100);
      expect(meta.FocalLength).toBe(70);
      expect(meta.FocalLengthIn35mmFormat).toBe(112);

      // Enums & Version
      expect(meta.MeteringMode).toBe(5); // 5 = Evaluative
      expect(meta.WhiteBalance).toBe(1); // 1 = Manual (EXIF spec legal value)
      expect(meta["Canon:WhiteBalance"]).toBe(3); // 3 = Tungsten in Canon MakerNotes
      expect(meta.ExifVersion).toBe("0230"); // Native Canon 70D ExifVersion
      expect(meta.Software).toBe("Adobe Photoshop 26.3 (Windows)");
      expect(meta.InternalSerialNumber).toBe("FA0631074");
      expect(String(meta.CameraTemperature)).toContain("31");

      // Image & Color
      expect(meta.ColorSpace).toBe(1); // 1 = sRGB
      expect(meta.ExifImageWidth || meta.ImageWidth).toBe(inspection.width);
      expect(meta.ExifImageHeight || meta.ImageHeight).toBe(inspection.height);

      // GPS absent
      expect(meta.GPSLatitude).toBeUndefined();
      expect(meta.GPSLongitude).toBeUndefined();
      expect(meta.GPSPosition).toBeUndefined();

      // Timestamps (Canon 70D does NOT write OffsetTime tags)
      expect(meta.DateTimeOriginal).toBe("2026:09:13 04:25:00");
      expect(meta.OffsetTime).toBeUndefined();
      expect(meta.OffsetTimeOriginal).toBeUndefined();
      expect(meta.OffsetTimeDigitized).toBeUndefined();
    } finally {
      await cleanupJobDirectory(jobDir);
    }
  });
});
