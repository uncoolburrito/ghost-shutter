import {
  ValidationResult,
  ValidationFieldCheck,
  MetadataDiffItem,
  ProcessOptions,
} from "./types";
import { CAMERA_PROFILE, APP_CONFIG, BuildArgsResult } from "./metadata-builder";
import { readExifMetadata } from "./exiftool";
import { detectC2PA } from "./c2pa-handler";

export interface ValidateOutputOptions {
  outputPath: string;
  expectedDimensions: { width: number; height: number };
  buildResult: BuildArgsResult;
  format: string;
  processOptions?: ProcessOptions;
  beforeMetadata?: Record<string, any>;
}

export interface ValidationAndDiffResult {
  validation: ValidationResult;
  diff: MetadataDiffItem[];
  actualMetadata: Record<string, any>;
}

/**
 * Validates the metadata written to an output file by re-reading it through ExifTool.
 * Generates an internal verification report and a visual diff.
 */
export async function validateOutputMetadata(
  options: ValidateOutputOptions
): Promise<ValidationAndDiffResult> {
  const {
    outputPath,
    expectedDimensions,
    buildResult,
    format,
    processOptions = {},
    beforeMetadata = {},
  } = options;

  const actual = await readExifMetadata(outputPath);
  const checks: ValidationFieldCheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const isPng = format.toUpperCase() === "PNG";

  // Helper to test equality or numeric equivalence
  const checkField = (
    name: string,
    expected: any,
    actualVal: any,
    comparator?: (exp: any, act: any) => boolean,
    isCritical = true
  ) => {
    let passed = false;
    if (comparator) {
      passed = comparator(expected, actualVal);
    } else {
      passed = String(actualVal).trim().toLowerCase() === String(expected).trim().toLowerCase();
    }

    const check: ValidationFieldCheck = {
      field: name,
      expected,
      actual: actualVal !== undefined ? actualVal : "absent",
      passed,
    };

    if (!passed) {
      if (isCritical) {
        errors.push(`Validation failed for ${name}: expected ${expected}, got ${actualVal}`);
      } else {
        warnings.push(`Field ${name} was not applied (unsupported or skipped by format)`);
        check.note = "unsupported";
      }
    }

    checks.push(check);
  };

  // 1. Output Format: Converted in Photoshop to PNG (or JPEG)
  const isSupportedFormat =
    format.toUpperCase() === "PNG" ||
    format.toUpperCase() === "JPEG" ||
    format.toUpperCase() === "JPG";
  checkField(
    "Output Format",
    format,
    format,
    () => isSupportedFormat
  );

  // 2. Make & Model (Critical)
  checkField("Make", CAMERA_PROFILE.make, actual.Make);
  checkField("Model", CAMERA_PROFILE.model, actual.Model);

  // 3. Lens Model & Specification
  checkField(
    "LensModel",
    CAMERA_PROFILE.lens.model,
    actual.LensModel || actual.Lens,
    (exp, act) => Boolean(act && String(act).includes("55-250mm")),
    true
  );

  // 4. Serial Numbers
  checkField(
    "CameraSerialNumber",
    CAMERA_PROFILE.bodySerialNumber,
    actual.SerialNumber || actual.CanonSerialNumber,
    undefined,
    false
  );

  // 5. ExifVersion: Canon EOS 70D strictly writes 0230, not 0232!
  const exifVer = actual["ExifIFD:ExifVersion"] || actual.ExifVersion;
  checkField(
    "ExifVersion",
    "0230",
    exifVer,
    (exp, act) => String(act).trim() === "0230" || String(act).trim() === "02.30"
  );

  // 6. Timestamps
  const dtOrig = actual["ExifIFD:DateTimeOriginal"] || actual.DateTimeOriginal;
  checkField(
    "DateTimeOriginal",
    buildResult.timestamps.captureExif,
    dtOrig,
    (exp, act) => {
      if (!act) return false;
      const normalize = (s: string) => String(s).replace(/[-:\s]/g, "").slice(0, 14);
      return normalize(exp) === normalize(act);
    }
  );

  // 7. Exposure Settings
  checkField(
    "ExposureTime",
    buildResult.effectiveSettings.exposureTime,
    actual.ExposureTime,
    (exp, act) => {
      if (!act) return false;
      if (String(act).trim() === String(exp).trim()) return true;
      const toFloat = (v: any) => {
        if (typeof v === "string" && v.includes("/")) {
          const [num, den] = v.split("/").map(Number);
          return den ? num / den : NaN;
        }
        return Number(v);
      };
      const expFloat = toFloat(exp);
      const actFloat = toFloat(act);
      if (!isNaN(expFloat) && !isNaN(actFloat)) {
        return Math.abs(expFloat - actFloat) < 0.0005 || Math.abs(expFloat - actFloat) / expFloat < 0.05;
      }
      return false;
    }
  );

  checkField(
    "FNumber",
    buildResult.effectiveSettings.fNumber,
    actual.FNumber,
    (exp, act) => Math.abs(Number(exp) - Number(act)) < 0.05
  );

  checkField(
    "ISO",
    buildResult.effectiveSettings.iso,
    actual.ISO,
    (exp, act) => Number(exp) === Number(act)
  );

  checkField(
    "FocalLength",
    buildResult.effectiveSettings.focalLength,
    actual.FocalLength,
    (exp, act) => Math.abs(Number(exp) - Number(act)) < 0.1
  );

  checkField(
    "FocalLengthIn35mmFormat",
    buildResult.effectiveSettings.focalLength35mm,
    actual.FocalLengthIn35mmFormat,
    (exp, act) => Number(exp) === Number(act),
    false
  );

  // 8. WhiteBalance: In standard EXIF, valid values are 0 (Auto) or 1 (Manual), NEVER 3!
  const wbVal =
    actual["ExifIFD:WhiteBalance"] !== undefined
      ? actual["ExifIFD:WhiteBalance"]
      : actual.WhiteBalance;
  checkField(
    "EXIF WhiteBalance",
    "Manual (1) or Auto (0)",
    wbVal,
    (_, act) => {
      if (act === undefined || act === null) return false;
      const actStr = String(act).toLowerCase();
      return actStr === "manual" || actStr === "auto" || actStr === "1" || actStr === "0";
    }
  );

  // 9. OffsetTime: Canon EOS 70D firmware does NOT write OffsetTime tags
  const hasOffsetTime = actual.OffsetTime || actual.OffsetTimeOriginal || actual.OffsetTimeDigitized;
  if (hasOffsetTime) {
    errors.push("OffsetTime tags were found in output; Canon EOS 70D does not support OffsetTime.");
    checks.push({
      field: "OffsetTime",
      expected: "absent",
      actual: String(hasOffsetTime),
      passed: false,
    });
  } else {
    checks.push({
      field: "OffsetTime",
      expected: "absent",
      actual: "absent",
      passed: true,
    });
  }

  // 10. Software Tag & XMPToolkit cloaking (No 'GhostShutter', No ExifTool)
  const expectedSoftware = APP_CONFIG.softwareName || "Adobe Photoshop 26.3 (Windows)";
  if (APP_CONFIG.addSoftwareTag) {
    checkField("Software", expectedSoftware, actual.Software);
  }

  if (actual.XMPToolkit && String(actual.XMPToolkit).includes("ExifTool")) {
    errors.push(`ExifTool signature detected in XMPToolkit: ${actual.XMPToolkit}`);
    checks.push({
      field: "XMPToolkit",
      expected: "Adobe XMP Core",
      actual: actual.XMPToolkit,
      passed: false,
    });
  } else {
    checks.push({
      field: "XMPToolkit",
      expected: "Adobe XMP Core",
      actual: actual.XMPToolkit || "Adobe XMP Core",
      passed: true,
    });
  }

  // 11. Canon MakerNotes: internal serial & camera temperature
  if (actual.InternalSerialNumber) {
    checkField(
      "Canon InternalSerialNumber",
      CAMERA_PROFILE.internalSerialNumber,
      actual.InternalSerialNumber
    );
  }
  if (actual.CameraTemperature) {
    checkField(
      "Canon CameraTemperature",
      "31 C",
      actual.CameraTemperature,
      (_, act) => String(act).includes("31")
    );
  }

  // 12. Dimensions (Must match actual image, never hardcoded!)
  const actualW = actual.ExifImageWidth || actual.ImageWidth;
  const actualH = actual.ExifImageHeight || actual.ImageHeight;
  checkField("ImageWidth", expectedDimensions.width, actualW, (exp, act) => Number(exp) === Number(act));
  checkField("ImageHeight", expectedDimensions.height, actualH, (exp, act) => Number(exp) === Number(act));

  // 13. GPS Policy Check
  const preserveGps = Boolean(processOptions.preserveGps);
  const hasGpsInOutput = Boolean(actual.GPSLatitude || actual.GPSPosition);
  if (!preserveGps) {
    if (hasGpsInOutput) {
      errors.push("GPS data was found in output file despite preserveGPS = false.");
      checks.push({
        field: "GPS",
        expected: "none",
        actual: "present",
        passed: false,
      });
    } else {
      checks.push({
        field: "GPS",
        expected: "none",
        actual: "none",
        passed: true,
      });
    }
  }

  // 14. C2PA / Content Credentials Check
  const c2paHandling = processOptions.c2paHandling || "remove";
  const c2paStatusOutput = await detectC2PA(outputPath, actual);
  const hadC2paBefore = Boolean(beforeMetadata.c2paDetected || beforeMetadata.hasC2pa);

  if (c2paHandling === "remove") {
    if (c2paStatusOutput.detected) {
      errors.push("C2PA removal could not be verified. Content Credentials remain in output file.");
      checks.push({
        field: "C2PA / Content Credentials",
        expected: "absent",
        actual: "present",
        passed: false,
        note: "Failed verification",
      });
    } else {
      checks.push({
        field: "C2PA / Content Credentials",
        expected: "absent",
        actual: "absent",
        passed: true,
        note: "Removed successfully",
      });
    }
  } else if (c2paHandling === "preserve" && hadC2paBefore) {
    if (!c2paStatusOutput.detected) {
      warnings.push("C2PA was configured to be preserved but was not detected in output.");
    }
  }

  // 15. Overall pass/fail
  const passed = errors.length === 0;

  // Build Visual Metadata Diff
  const diff: MetadataDiffItem[] = [
    {
      field: "Format & Lineage",
      status: "modified",
      before: beforeMetadata.Format || beforeMetadata.MIMEType || format,
      after: "PNG (image/png) • Converted in Photoshop from Canon JPEG",
    },
    {
      field: "Camera",
      status: beforeMetadata.Model ? (beforeMetadata.Model === CAMERA_PROFILE.model ? "unchanged" : "modified") : "added",
      before: beforeMetadata.Model ? `${beforeMetadata.Make || ""} ${beforeMetadata.Model}`.trim() : "None",
      after: `${CAMERA_PROFILE.make} ${CAMERA_PROFILE.model}`,
    },
    {
      field: "Lens",
      status: beforeMetadata.LensModel ? "modified" : "added",
      before: beforeMetadata.LensModel || "None",
      after: CAMERA_PROFILE.lens.model,
    },
    {
      field: "Canon MakerNotes",
      status: actual.InternalSerialNumber ? "added" : "unchanged",
      before: beforeMetadata.InternalSerialNumber || "None",
      after: actual.InternalSerialNumber ? `FA0631074 (${actual.CameraTemperature || "31 °C"})` : "None",
    },
    {
      field: "ExifVersion",
      status: "modified",
      before: beforeMetadata.ExifVersion || "None",
      after: "0230",
    },
    {
      field: "Software Agent",
      status: "modified",
      before: beforeMetadata.Software || "None",
      after: expectedSoftware,
    },
    {
      field: "Capture Date",
      status: beforeMetadata.DateTimeOriginal ? "modified" : "added",
      before: beforeMetadata.DateTimeOriginal || "None",
      after: buildResult.timestamps.captureExif,
    },
    {
      field: "Exposure",
      status: beforeMetadata.ExposureTime ? "modified" : "added",
      before: beforeMetadata.ExposureTime ? String(beforeMetadata.ExposureTime) : "None",
      after: buildResult.effectiveSettings.exposureTime,
    },
    {
      field: "Aperture",
      status: beforeMetadata.FNumber ? "modified" : "added",
      before: beforeMetadata.FNumber ? `f/${beforeMetadata.FNumber}` : "None",
      after: `f/${buildResult.effectiveSettings.fNumber}`,
    },
    {
      field: "ISO",
      status: beforeMetadata.ISO ? "modified" : "added",
      before: beforeMetadata.ISO ? String(beforeMetadata.ISO) : "None",
      after: String(buildResult.effectiveSettings.iso),
    },
    {
      field: "Focal Length",
      status: beforeMetadata.FocalLength ? "modified" : "added",
      before: beforeMetadata.FocalLength ? `${beforeMetadata.FocalLength}mm` : "None",
      after: `${buildResult.effectiveSettings.focalLength}mm (${buildResult.effectiveSettings.focalLength35mm}mm eq)`,
    },
    {
      field: "White Balance",
      status: "modified",
      before: beforeMetadata.WhiteBalance ? String(beforeMetadata.WhiteBalance) : "None",
      after: `${buildResult.effectiveSettings.whiteBalance} (EXIF: Manual, Canon: Tungsten)`,
    },
    {
      field: "Dimensions",
      status: "preserved",
      before: `${expectedDimensions.width} × ${expectedDimensions.height}`,
      after: `${expectedDimensions.width} × ${expectedDimensions.height}`,
    },
    {
      field: "Content Credentials (C2PA)",
      status: hadC2paBefore ? (c2paStatusOutput.detected ? "preserved" : "removed") : "unchanged",
      before: hadC2paBefore ? (beforeMetadata.c2paGenerator ? `Present (${beforeMetadata.c2paGenerator})` : "Present") : "None",
      after: c2paStatusOutput.detected ? "Preserved" : "Removed (No replacement)",
    },
    {
      field: "GPS",
      status: hasGpsInOutput ? "preserved" : (beforeMetadata.GPSLatitude ? "removed" : "unchanged"),
      before: beforeMetadata.GPSLatitude ? "Present" : "None",
      after: hasGpsInOutput ? "Preserved" : "None (Strip / Absent)",
    },
  ];

  return {
    validation: {
      passed,
      checks,
      warnings,
      errors,
    },
    diff,
    actualMetadata: actual,
  };
}
