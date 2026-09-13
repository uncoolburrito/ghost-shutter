import path from "path";
import crypto from "crypto";
import cameraProfileJson from "../config/camera-profile.json";
import captureProfilesJson from "../config/capture-profiles.json";
import appConfigJson from "../config/application-config.json";
import {
  CameraProfile,
  CaptureProfile,
  AppConfig,
  ProcessOptions,
  MetadataStrategy,
} from "./types";
import { resolveTimestamps, FormattedTimestamps } from "./timestamp";

export const CAMERA_PROFILE: CameraProfile = cameraProfileJson as CameraProfile;
export const CAPTURE_PROFILES: Record<string, CaptureProfile> = captureProfilesJson as Record<string, CaptureProfile>;
export const APP_CONFIG: AppConfig = appConfigJson as AppConfig;

export interface BuildArgsOptions {
  width: number;
  height: number;
  format: string;
  processingDate: Date;
  processOptions?: ProcessOptions;
  existingMetadata?: Record<string, any>;
  useTemplate?: boolean;
}

export interface BuildArgsResult {
  args: string[];
  timestamps: FormattedTimestamps;
  effectiveSettings: {
    camera: string;
    lens: string;
    exposureTime: string;
    fNumber: number;
    iso: number;
    focalLength: number;
    focalLength35mm: number;
    whiteBalance: string;
    meteringMode: string;
    flash: string;
    software: string;
  };
}

/**
 * Maps human-readable White Balance to standard EXIF enum value (tag 0xA433).
 * In EXIF standard, the only valid values are:
 * 0 = Auto
 * 1 = Manual
 */
export function mapWhiteBalanceToExif(wb: string): number {
  const lower = (wb || "").toLowerCase();
  if (lower === "auto") {
    return 0;
  }
  return 1; // Manual for Tungsten, Daylight, Custom, etc.
}

/**
 * Maps human-readable Metering Mode to EXIF standard enum value.
 */
export function mapMeteringModeToExif(metering: string): number {
  const lower = (metering || "").toLowerCase();
  switch (lower) {
    case "average":
      return 1;
    case "center-weighted average":
    case "center-weighted":
      return 2;
    case "spot":
      return 3;
    case "multi-spot":
      return 4;
    case "evaluative":
    case "pattern":
    case "multi-segment":
      return 5;
    case "partial":
      return 6;
    default:
      return 5; // Default Evaluative per spec
  }
}

/**
 * Builds the ExifTool argument array for modifying an image according to the
 * specified camera profile, capture settings, and Photoshop specifications.
 */
export function buildExiftoolArgs(options: BuildArgsOptions): BuildArgsResult {
  const {
    width,
    height,
    format,
    processingDate,
    processOptions = {},
    existingMetadata = {},
    useTemplate = true,
  } = options;

  const timezone = APP_CONFIG.timezone || "Asia/Kolkata";
  const timestamps = resolveTimestamps(processingDate, timezone, {
    captureDateMode: processOptions.captureDateMode,
    customDate: processOptions.customDate,
    captureTimeMode: processOptions.captureTimeMode,
    customTime: processOptions.customTime,
  });

  const strategy: MetadataStrategy =
    processOptions.metadataStrategy || "clean_and_apply";

  const preserveIcc =
    processOptions.preserveIcc !== undefined
      ? processOptions.preserveIcc
      : APP_CONFIG.preserveICC;

  const preserveGps =
    processOptions.preserveGps !== undefined
      ? processOptions.preserveGps
      : APP_CONFIG.preserveGPS;

  const addSoftware =
    processOptions.addSoftwareTag !== undefined
      ? processOptions.addSoftwareTag
      : APP_CONFIG.addSoftwareTag;

  // 1. Resolve Capture Profile & Overrides
  const profileKey = processOptions.captureProfileKey || APP_CONFIG.defaultCaptureProfile || "default";
  const selectedProfile: CaptureProfile = CAPTURE_PROFILES[profileKey] || CAPTURE_PROFILES.default;

  // Precedence:
  // 1. Explicit user manual overrides
  // 2. Existing valid metadata (if strategy is 'merge' and tag exists)
  // 3. Selected capture profile
  // 4. Default camera profile
  let exposureTime =
    processOptions.manualOverrides?.exposureTime ||
    (strategy === "merge" && existingMetadata.ExposureTime ? String(existingMetadata.ExposureTime) : null) ||
    selectedProfile.exposureTime ||
    CAMERA_PROFILE.defaults.exposureTime;

  let fNumber =
    processOptions.manualOverrides?.fNumber ||
    (strategy === "merge" && existingMetadata.FNumber ? Number(existingMetadata.FNumber) : null) ||
    selectedProfile.fNumber ||
    CAMERA_PROFILE.defaults.fNumber;

  let iso =
    processOptions.manualOverrides?.iso ||
    (strategy === "merge" && existingMetadata.ISO ? Number(existingMetadata.ISO) : null) ||
    selectedProfile.iso ||
    CAMERA_PROFILE.defaults.iso;

  let focalLength =
    processOptions.manualOverrides?.focalLength ||
    (strategy === "merge" && existingMetadata.FocalLength ? Number(existingMetadata.FocalLength) : null) ||
    selectedProfile.focalLength ||
    CAMERA_PROFILE.defaults.focalLength;

  // Validate impossible combinations
  if (iso <= 0) iso = 100;
  if (focalLength <= 0) focalLength = 70;
  if (fNumber <= 0) fNumber = 4;

  const cropFactor = CAMERA_PROFILE.cropFactor || 1.6;
  const focalLength35mm = Math.round(focalLength * cropFactor);

  const whiteBalanceName =
    processOptions.manualOverrides?.whiteBalance ||
    selectedProfile.whiteBalance ||
    CAMERA_PROFILE.defaults.whiteBalance ||
    "Tungsten";

  const meteringModeName =
    processOptions.manualOverrides?.meteringMode ||
    selectedProfile.meteringMode ||
    CAMERA_PROFILE.defaults.meteringMode ||
    "Evaluative";

  const whiteBalanceEnum = mapWhiteBalanceToExif(whiteBalanceName);
  const meteringModeEnum = mapMeteringModeToExif(meteringModeName);

  const c2paHandling =
    processOptions.c2paHandling ||
    (APP_CONFIG as any).defaultC2PAHandling ||
    "remove";

  const removeEditingSoftware =
    processOptions.removeEditingSoftwareMetadata !== undefined
      ? processOptions.removeEditingSoftwareMetadata
      : ((APP_CONFIG as any).removeEditingSoftwareMetadata ?? true);

  const softwareName = APP_CONFIG.softwareName || "Adobe Photoshop 26.3 (Windows)";

  const args: string[] = [];

  // Template paths
  const templatePath = path.join(
    process.cwd(),
    "config",
    "templates",
    "canon_70d_template.jpg"
  );
  const iccPath = path.join(
    process.cwd(),
    "config",
    "templates",
    "sRGB_IEC61966-2-1.icc"
  );

  // If using template, inject authentic Canon 70D MakerNotes and base EXIF structure
  if (useTemplate) {
    args.push("-tagsFromFile", templatePath, "-all:all");
  } else if (strategy === "clean_and_apply") {
    args.push("-all=");
  }

  // Preserve ICC profile or GPS if requested from existing metadata
  if (preserveIcc && strategy === "clean_and_apply" && !useTemplate) {
    args.push("-tagsFromFile", "@", "-icc_profile");
  }
  if (preserveGps && existingMetadata.GPSLatitude) {
    args.push("-tagsFromFile", "@", "-gps:all");
  } else if (!preserveGps) {
    args.push("-gps:all=");
  }

  if (processOptions.preserveCreator && (existingMetadata.Artist || existingMetadata.Creator)) {
    args.push("-tagsFromFile", "@", "-Artist", "-XMP-dc:Creator");
  }

  // C2PA Handling: remove existing manifest and provenance
  if (c2paHandling === "remove") {
    args.push("-jumbf:all=");
    args.push("-XMP-c2pa:all=");
    args.push("-XMP-xmpMM:History=");
    args.push("-XMP-xmpMM:Ingredients=");
  }

  // Remove editing/AI software metadata if requested
  if (removeEditingSoftware) {
    args.push("-CreatorTool=");
    args.push("-Producer=");
    args.push("-History=");
    args.push("-DocumentID=");
    args.push("-InstanceID=");
    args.push("-XMP-photoshop:History=");
  }

  // 1. EXIF — IFD0
  args.push(`-Make=${CAMERA_PROFILE.make}`);
  args.push(`-Model=${CAMERA_PROFILE.model}`);
  args.push(`-Orientation#=1`); // Horizontal (normal)
  args.push(`-XResolution=72`);
  args.push(`-YResolution=72`);
  args.push(`-ResolutionUnit#=2`); // 2 = inches
  if (addSoftware) {
    args.push(`-Software=${softwareName}`);
  }
  args.push(`-ModifyDate=${timestamps.modifyExif}`);

  if (!processOptions.preserveCreator) {
    args.push("-Artist=");
    args.push("-Copyright=");
  }

  // 2. EXIF — SubIFD
  args.push(`-ExposureTime=${exposureTime}`);
  args.push(`-FNumber=${fNumber}`);
  args.push(`-ExposureProgram#=1`); // Manual
  args.push(`-ISO=${iso}`);
  args.push(`-ExifIFD:ExifVersion=0230`); // Canon 70D strictly writes 0230, not 0232!
  args.push(`-DateTimeOriginal=${timestamps.captureExif}`);
  args.push(`-CreateDate=${timestamps.captureExif}`); // DateTimeDigitized
  args.push(`-ShutterSpeedValue=${exposureTime}`);
  args.push(`-ApertureValue=${fNumber}`);
  args.push(`-ExposureCompensation=0`);
  args.push(`-MaxApertureValue=4.0`);
  args.push(`-MeteringMode#=${meteringModeEnum}`);
  args.push(`-Flash#=16`); // 16 = Off, Did not fire
  args.push(`-FocalLength=${focalLength}`);
  args.push(`-FocalLengthIn35mmFormat=${focalLength35mm}`);
  args.push(`-ColorSpace#=1`); // 1 = sRGB
  args.push(`-ExifImageWidth=${width}`);
  args.push(`-ExifImageHeight=${height}`);
  args.push(`-FocalPlaneXResolution=5472`);
  args.push(`-FocalPlaneYResolution=3648`);
  args.push(`-FocalPlaneResolutionUnit#=3`); // 3 = cm
  args.push(`-CustomRendered#=0`); // Normal
  args.push(`-ExposureMode#=1`); // Manual
  args.push(`-WhiteBalance#=${whiteBalanceEnum}`); // 0 = Auto, 1 = Manual (EXIF legal values)
  args.push(`-SceneCaptureType#=0`); // Standard
  args.push(`-SerialNumber=${CAMERA_PROFILE.bodySerialNumber}`);
  args.push(`-LensMake=${CAMERA_PROFILE.lens.make}`);
  args.push(`-LensInfo=55-250mm f/4-5.6`);
  args.push(`-LensModel=${CAMERA_PROFILE.lens.model}`);
  args.push(`-LensSerialNumber=${CAMERA_PROFILE.lens.serialNumber}`);

  // Canon 70D does NOT support OffsetTime tags; strictly omit / remove them
  args.push("-OffsetTime=");
  args.push("-OffsetTimeOriginal=");
  args.push("-OffsetTimeDigitized=");

  // 3. Canon MakerNotes
  args.push(`-Canon:CanonModelID=EOS 70D`);
  args.push(`-Canon:FirmwareVersion=${CAMERA_PROFILE.firmware}`);
  args.push(`-Canon:InternalSerialNumber=${CAMERA_PROFILE.internalSerialNumber}`);
  args.push(`-Canon:OwnerName=`);
  args.push(`-CameraTemperature=31`);
  args.push(`-Canon:WhiteBalance=${whiteBalanceName}`);
  args.push(`-ColorTemperature=3200`);
  args.push(`-Canon:ContinuousDrive=Single`);
  args.push(`-Canon:FocusMode=One-shot AF`);
  args.push(`-Canon:MeteringMode=Evaluative`);
  args.push(`-Canon:LiveViewShooting=Off`);
  args.push(`-Canon:CanonImageType=Canon EOS 70D`);
  args.push(`-Canon:LensType=Canon EF-S 55-250mm f/4-5.6 IS II`);
  args.push(`-Canon:LensSerialNumber=${CAMERA_PROFILE.lens.serialNumber}`);
  args.push(`-Canon:FocalLength=${focalLength} mm`);
  args.push(`-Canon:MaxFocalLength=250 mm`);
  args.push(`-Canon:MinFocalLength=55 mm`);

  // 4. GPS
  if (preserveGps && existingMetadata.GPSLatitude) {
    args.push("-GPS:GPSVersionID=2.3.0.0");
  } else {
    args.push("-GPS:GPSVersionID=2.3.0.0");
  }

  // 5. Adobe Photoshop XMP Profile (Authentic JPEG -> PNG conversion lineage)
  const origDocId = `xmp.did:${crypto.randomUUID()}`;
  const docId = `xmp.did:${crypto.randomUUID()}`;
  const xmpInstanceId1 = `xmp.iid:${crypto.randomUUID()}`;
  const xmpInstanceId2 = `xmp.iid:${crypto.randomUUID()}`;

  // Parse capture dates for XMP / IPTC
  const [capDate, capTime] = timestamps.captureExif.split(" ");
  const isoCaptureDate = `${capDate.replace(/:/g, "-")}T${capTime}`;
  const iptcDate = capDate;
  const iptcTime = capTime;

  args.push(`-XMP-xmp:CreatorTool=${softwareName}`);
  args.push(`-XMP-xmp:CreateDate=${isoCaptureDate}`);
  args.push(`-XMP-xmp:ModifyDate=${timestamps.modifyXmp}`);
  args.push(`-XMP-xmp:MetadataDate=${timestamps.modifyXmp}`);
  args.push(`-XMP-dc:format=image/png`);
  args.push(`-XMP-photoshop:ColorMode#=3`); // RGB
  args.push(`-XMP-photoshop:ICCProfileName=sRGB IEC61966-2.1`);
  args.push(`-XMP-photoshop:DateCreated=${isoCaptureDate}`);
  args.push(`-XMP-xmpMM:DocumentID=${docId}`);
  args.push(`-XMP-xmpMM:OriginalDocumentID=${origDocId}`);

  // Authentic 3-step Photoshop format conversion history (captured as JPEG, edited & converted to PNG)
  // Step 1: Initial edit & save in Photoshop
  args.push(`-XMP-xmpMM:HistoryAction=saved`);
  args.push(`-XMP-xmpMM:HistoryInstanceID=${xmpInstanceId1}`);
  args.push(`-XMP-xmpMM:HistoryWhen=${isoCaptureDate}`);
  args.push(`-XMP-xmpMM:HistorySoftwareAgent=${softwareName}`);
  args.push(`-XMP-xmpMM:HistoryChanged=/`);

  // Step 2: Format conversion in Photoshop (from image/jpeg to image/png)
  args.push(`-XMP-xmpMM:HistoryAction=converted`);
  args.push(`-XMP-xmpMM:HistoryParameters=from image/jpeg to image/png`);

  // Step 3: Final save as PNG in Photoshop
  args.push(`-XMP-xmpMM:HistoryAction=saved`);
  args.push(`-XMP-xmpMM:HistoryInstanceID=${xmpInstanceId2}`);
  args.push(`-XMP-xmpMM:HistoryWhen=${timestamps.modifyXmp}`);
  args.push(`-XMP-xmpMM:HistorySoftwareAgent=${softwareName}`);
  args.push(`-XMP-xmpMM:HistoryChanged=/`);
  args.push(`-icc_profile<=${iccPath}`);

  // Cloak ExifTool in XMPToolkit with authentic Adobe XMP Core signature
  args.push(`-XMP-x:XMPToolkit=Adobe XMP Core 9.1-c002 79.a6444e2, 2024/10/28-01:45:00`);

  // 6. IPTC-IIM Profile
  args.push(`-IPTC:CodedCharacterSet=UTF8`);
  args.push(`-IPTC:ApplicationRecordVersion=4`);
  args.push(`-IPTC:DateCreated=${iptcDate}`);
  args.push(`-IPTC:TimeCreated=${iptcTime}`);
  args.push(`-IPTC:DigitalCreationDate=${iptcDate}`);
  args.push(`-IPTC:DigitalCreationTime=${iptcTime}`);
  if (!processOptions.preserveCreator) {
    args.push("-IPTC:By-line=");
    args.push("-IPTC:By-lineTitle=");
    args.push("-IPTC:City=");
    args.push("-IPTC:Province-State=");
    args.push("-IPTC:Country-PrimaryLocationName=");
    args.push("-IPTC:Headline=");
    args.push("-IPTC:Caption-Abstract=");
    args.push("-IPTC:CopyrightNotice=");
    args.push("-IPTC:Keywords=");
  }

  // 7. Photoshop IRB Tags
  args.push(`-Photoshop:DisplayedUnitsX=inches`);
  args.push(`-Photoshop:DisplayedUnitsY=inches`);
  args.push(`-Photoshop:GlobalAngle=30`);
  args.push(`-Photoshop:GlobalAltitude=30`);
  args.push(`-Photoshop:PhotoshopQuality=10`);

  // 8. ICC Profile (Standard sRGB IEC61966-2.1)
  args.push(`-icc_profile<=${iccPath}`);

  const effectiveSettings = {
    camera: `${CAMERA_PROFILE.make} ${CAMERA_PROFILE.model}`,
    lens: CAMERA_PROFILE.lens.model,
    exposureTime,
    fNumber,
    iso,
    focalLength,
    focalLength35mm,
    whiteBalance: whiteBalanceName,
    meteringMode: meteringModeName,
    flash: "Off (did not fire)",
    software: addSoftware ? softwareName : "Unchanged",
  };

  return {
    args,
    timestamps,
    effectiveSettings,
  };
}
