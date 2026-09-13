import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { createJobDirectory, cleanupJobDirectory } from "../lib/cleanup";
import { inspectImageFile, detectFileFormat } from "../lib/image-validator";
import { buildExiftoolArgs } from "../lib/metadata-builder";
import { writeExifMetadata, readExifMetadata } from "../lib/exiftool";
import { validateOutputMetadata } from "../lib/metadata-validator";
import { injectPhotoshopApp13ToFile } from "../lib/photoshop-irb";
import { getOutputFilename } from "../lib/file-naming";

describe("Authentic Canon EOS 70D + Adobe Photoshop Profile Verification", () => {
  it("converts a PNG input to JPEG and writes the complete Photoshop + Canon 70D metadata profile", async () => {
    const { jobDir } = await createJobDirectory();

    try {
      // 1. Create a synthetic PNG input (to verify Canon 70D cannot produce PNG)
      const pngInputPath = path.join(jobDir, "my_real_photo.png");
      await sharp({
        create: {
          width: 5472,
          height: 3648,
          channels: 3,
          background: { r: 100, g: 120, b: 140 },
        },
      })
        .png()
        .toFile(pngInputPath);

      // Verify input is detected as PNG
      const inputFormat = await detectFileFormat(pngInputPath);
      expect(inputFormat.format).toBe("PNG");

      // Verify filename helper outputs .png preserving original basename (Photoshop default)
      const finalFilename = getOutputFilename("my_real_photo.png");
      expect(finalFilename).toBe("my_real_photo.png");

      // Verify custom filename override
      const customFilename = getOutputFilename("my_real_photo.png", "IMG_6442");
      expect(customFilename).toBe("IMG_6442.png");

      // 2. Normalization: Output is authentic PNG exported from Photoshop
      const outputBasename = path.basename("my_real_photo.png", ".png");
      const outputPath = path.join(jobDir, `out_${outputBasename}.png`);

      await fs.copyFile(pngInputPath, outputPath);

      // Verify normalized output is a valid PNG
      const postConversionFormat = await detectFileFormat(outputPath);
      expect(postConversionFormat.format).toBe("PNG");
      expect(postConversionFormat.mimeType).toBe("image/png");

      // 4. Build arguments with explicit test timestamp
      const inspection = await inspectImageFile(outputPath);
      const processingDate = new Date("2026-07-15T14:22:08+02:00");
      const buildResult = buildExiftoolArgs({
        width: inspection.width,
        height: inspection.height,
        format: "PNG",
        processingDate,
        processOptions: {
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
        },
      });

      // 5. Apply metadata via ExifTool
      await writeExifMetadata(outputPath, buildResult.args);

      // 6. Validate output metadata
      const { validation, actualMetadata: meta } = await validateOutputMetadata({
        outputPath,
        expectedDimensions: { width: 5472, height: 3648 },
        buildResult,
        format: "PNG",
      });

      expect(validation.passed).toBe(true);
      expect(validation.errors).toEqual([]);

      // ==========================================
      // Table 1: EXIF — IFD0
      // ==========================================
      expect(meta.Make).toBe("Canon");
      expect(meta.Model).toBe("Canon EOS 70D");
      expect(meta.Orientation).toBe(1);
      expect(meta.XResolution).toBe(72);
      expect(meta.YResolution).toBe(72);
      expect(meta.ResolutionUnit).toBe(2); // inches
      expect(meta.Software).toBe("Adobe Photoshop 26.3 (Windows)");
      expect(meta.DateTime || meta.ModifyDate).toContain("2026:07:15");

      // ==========================================
      // Table 2: EXIF — Sub IFD
      // ==========================================
      const expFloat = Number(meta.ExposureTime);
      expect(Math.abs(expFloat - 1 / 640)).toBeLessThan(0.0001);
      expect(meta.FNumber).toBe(4.0);
      expect(meta.ExposureProgram).toBe(1); // Manual
      expect(meta.ISO).toBe(100);
      expect(meta.ExifVersion).toBe("0230"); // strictly 0230, not 0232!
      expect(meta.DateTimeOriginal).toBe("2026:07:09 10:33:37");
      expect(meta.CreateDate).toBe("2026:07:09 10:33:37");
      expect(meta.ExposureCompensation).toBe(0);
      expect(meta.MaxApertureValue).toBe(4.0);
      expect(meta.MeteringMode).toBe(5); // Evaluative / Multi-segment
      expect(meta.Flash).toBe(16); // Off, Did not fire
      expect(meta.FocalLength).toBe(70.0);
      expect(meta.ColorSpace).toBe(1); // sRGB
      expect(meta.ExifImageWidth).toBe(5472);
      expect(meta.ExifImageHeight).toBe(3648);
      expect(meta.FocalPlaneXResolution).toBe(5472);
      expect(meta.FocalPlaneYResolution).toBe(3648);
      expect(meta.FocalPlaneResolutionUnit).toBe(3); // cm
      expect(meta.CustomRendered).toBe(0); // Normal
      expect(meta.ExposureMode).toBe(1); // Manual
      expect(meta.WhiteBalance).toBe(1); // Manual (legal EXIF value)
      expect(meta.SceneCaptureType).toBe(0); // Standard
      expect(meta.SerialNumber).toBe("082024004039");
      expect(meta.LensInfo === "55-250mm f/4-5.6" || meta.LensInfo === "55 250 4 5.6").toBe(true);
      expect(meta.LensModel).toContain("EF-S 55-250mm f/4-5.6 IS II");
      expect(meta.LensSerialNumber).toBe("0000338ce6");

      // OffsetTime tags MUST be completely absent on Canon 70D
      expect(meta.OffsetTime).toBeUndefined();
      expect(meta.OffsetTimeOriginal).toBeUndefined();
      expect(meta.OffsetTimeDigitized).toBeUndefined();

      // ==========================================
      // Table 3: Canon MakerNote
      // ==========================================
      expect(meta.CanonModelID === "EOS 70D" || meta.CanonModelID === 2147484453).toBe(true);
      expect(meta.FirmwareVersion || meta.Firmware).toBe("1.1.1");
      expect(meta.InternalSerialNumber).toBe("FA0631074");
      expect(String(meta.CameraTemperature)).toContain("31");
      expect(meta["Canon:WhiteBalance"]).toBe(3); // 3 = Tungsten in Canon MakerNotes
      expect(meta.ColorTemperature).toBe(3200);
      expect(meta.ContinuousDrive).toBe(0); // 0 = Single
      expect(meta.CanonImageType).toBe("Canon EOS 70D");
      expect(meta.LensType === 54 || String(meta.LensType).includes("55-250mm")).toBe(true);
      expect(meta.MaxFocalLength).toBe(250);
      expect(meta.MinFocalLength).toBe(55);

      // ==========================================
      // Table 4: GPS
      // ==========================================
      expect(meta.GPSVersionID === "2.3.0.0" || meta.GPSVersionID === "2 3 0 0").toBe(true);

      // ==========================================
      // Table 5: XMP
      // ==========================================
      expect(meta["XMP-xmp:CreatorTool"] || meta.CreatorTool).toBe("Adobe Photoshop 26.3 (Windows)");
      expect(meta["XMP-dc:Format"] || meta.Format).toBe("image/png");
      expect(meta["XMP-photoshop:ColorMode"]).toBe(3); // RGB
      expect(meta["XMP-photoshop:ICCProfileName"]).toBe("sRGB IEC61966-2.1");
      expect(meta.XMPToolkit).not.toContain("ExifTool");
      expect(meta.XMPToolkit).toContain("Adobe XMP Core");

      // ==========================================
      // Table 6: XMP Edit History (Authentic conversion from JPEG to PNG)
      // ==========================================
      expect(meta["XMP-xmpMM:HistoryAction"]).toBeDefined();
      expect(meta["XMP-xmpMM:HistoryParameters"]).toContain("from image/jpeg to image/png");
      expect(meta["XMP-xmpMM:HistorySoftwareAgent"]).toContain("Adobe Photoshop 26.3 (Windows)");

      // ==========================================
      // Table 7: IPTC-IIM
      // ==========================================
      expect(meta.ApplicationRecordVersion).toBe(4);
      expect(meta.DateCreated).toContain("2026:07:09");
      expect(meta.TimeCreated).toContain("10:33:37");

      // ==========================================
      // Table 8: Resolution & Dimensions
      // ==========================================
      expect(meta.ImageWidth || meta.ExifImageWidth).toBe(5472);
      expect(meta.ImageHeight || meta.ExifImageHeight).toBe(3648);

      // ==========================================
      // Table 9: ICC Profile
      // ==========================================
      expect(meta.ProfileDescription).toBe("sRGB IEC61966-2.1");
      expect(meta.ProfileClass === "mntr" || meta.ProfileClass === "Display Device Profile").toBe(true);
      expect(String(meta.ColorSpaceData).trim()).toBe("RGB");
      expect(String(meta.ProfileConnectionSpace).trim()).toBe("XYZ");
      expect(String(meta.ProfileCreator).trim()).toBe("HP");
      expect(meta.ProfileCopyright).toContain("Hewlett-Packard Company");
    } finally {
      await cleanupJobDirectory(jobDir);
    }
  });
});
