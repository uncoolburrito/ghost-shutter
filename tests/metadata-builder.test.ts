import { describe, it, expect } from "vitest";
import {
  buildExiftoolArgs,
  mapWhiteBalanceToExif,
  mapMeteringModeToExif,
  CAMERA_PROFILE,
} from "../lib/metadata-builder";
import { resolveTimestamps, getTimezoneOffsetString } from "../lib/timestamp";

describe("Metadata Builder & Timestamps", () => {
  it("resolves timezone offset correctly for Asia/Kolkata (+05:30)", () => {
    const offset = getTimezoneOffsetString("Asia/Kolkata", new Date("2026-09-13T12:00:00Z"));
    expect(offset).toBe("+05:30");
  });

  it("formats timestamps into standard EXIF format YYYY:MM:DD HH:MM:SS", () => {
    const date = new Date("2026-09-13T04:25:00+05:30");
    const ts = resolveTimestamps(date, "Asia/Kolkata");
    expect(ts.captureExif).toBe("2026:09:13 04:25:00");
    expect(ts.offsetString).toBe("+05:30");
    expect(ts.captureXmp).toContain("2026-09-13T04:25:00+05:30");
  });

  it("supports custom date and custom time overrides", () => {
    const procDate = new Date("2026-09-13T04:25:00+05:30");
    const ts = resolveTimestamps(procDate, "Asia/Kolkata", {
      captureDateMode: "custom",
      customDate: "2025-06-20",
      captureTimeMode: "custom",
      customTime: "14:30:15",
    });
    expect(ts.captureExif).toBe("2025:06:20 14:30:15");
  });

  it("maps white balance and metering mode to standard EXIF numeric enums", () => {
    // In standard EXIF (tag 0xA433), valid values are 0 (Auto) or 1 (Manual)
    expect(mapWhiteBalanceToExif("Tungsten")).toBe(1);
    expect(mapWhiteBalanceToExif("Daylight")).toBe(1);
    expect(mapWhiteBalanceToExif("Auto")).toBe(0);

    expect(mapMeteringModeToExif("Evaluative")).toBe(5);
    expect(mapMeteringModeToExif("Spot")).toBe(3);
    expect(mapMeteringModeToExif("Center-weighted")).toBe(2);
  });

  it("builds semantic ExifTool arguments preserving actual image dimensions", () => {
    const date = new Date("2026-09-13T10:00:00+05:30");
    const result = buildExiftoolArgs({
      width: 3840,
      height: 2560,
      format: "JPEG",
      processingDate: date,
    });

    const argsStr = result.args.join(" ");

    // Check camera identity
    expect(argsStr).toContain(`-Make=${CAMERA_PROFILE.make}`);
    expect(argsStr).toContain(`-Model=${CAMERA_PROFILE.model}`);
    expect(argsStr).toContain(`-SerialNumber=${CAMERA_PROFILE.bodySerialNumber}`);
    expect(argsStr).toContain(`-Canon:InternalSerialNumber=${CAMERA_PROFILE.internalSerialNumber}`);
    expect(argsStr).toContain(`-LensModel=${CAMERA_PROFILE.lens.model}`);
    expect(argsStr).toContain(`-LensSerialNumber=${CAMERA_PROFILE.lens.serialNumber}`);

    // Check dimensions are 3840x2560, NOT hardcoded 5472x3648
    expect(argsStr).toContain("-ExifImageWidth=3840");
    expect(argsStr).toContain("-ExifImageHeight=2560");

    // Check default capture profile
    expect(argsStr).toContain("-ExposureTime=1/640");
    expect(argsStr).toContain("-FNumber=4");
    expect(argsStr).toContain("-ISO=100");
    expect(argsStr).toContain("-FocalLength=70");
    expect(argsStr).toContain("-FocalLengthIn35mmFormat=112");
    expect(argsStr).toContain("-MeteringMode#=5");
    expect(argsStr).toContain("-WhiteBalance#=1"); // 1 = Manual in EXIF

    // Check software tag and toolkit
    expect(argsStr).toContain("-Software=Adobe Photoshop 26.3 (Windows)");
    expect(argsStr).not.toContain("-Software=Canon EOS 70D");
    expect(argsStr).toContain("-XMP-x:XMPToolkit=Adobe XMP Core");
    expect(argsStr).toContain("-ExifIFD:ExifVersion=0230");
  });

  it("sanitizes impossible or malformed manual override values", () => {
    const date = new Date();
    const result = buildExiftoolArgs({
      width: 1920,
      height: 1080,
      format: "JPEG",
      processingDate: date,
      processOptions: {
        manualOverrides: {
          iso: -100,
          focalLength: 0,
          fNumber: -4,
        },
      },
    });

    expect(result.effectiveSettings.iso).toBe(100);
    expect(result.effectiveSettings.focalLength).toBe(70);
    expect(result.effectiveSettings.fNumber).toBe(4);
  });
});
