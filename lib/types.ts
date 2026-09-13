export interface CameraLensProfile {
  make: string;
  model: string;
  serialNumber: string;
}

export interface CameraProfileDefaults {
  exposureTime: string;
  fNumber: number;
  iso: number;
  focalLength: number;
  focalLength35mm: number;
  meteringMode: string;
  whiteBalance: string;
  flash: boolean;
  driveMode: string;
  liveView: boolean;
}

export interface ImageDefaults {
  colorSpace: string;
  orientation: number;
  resolutionX: number;
  resolutionY: number;
  resolutionUnit: string;
}

export interface CameraProfile {
  make: string;
  model: string;
  firmware: string;
  bodySerialNumber: string;
  internalSerialNumber: string;
  lens: CameraLensProfile;
  ownerName: string;
  artist: string;
  copyright: string;
  cropFactor: number;
  defaults: CameraProfileDefaults;
  imageDefaults: ImageDefaults;
}

export interface CaptureProfile {
  name: string;
  description: string;
  exposureTime: string;
  fNumber: number;
  iso: number;
  focalLength: number;
  focalLength35mm: number;
  meteringMode: string;
  whiteBalance: string;
  flash: boolean;
  driveMode: string;
  liveView: boolean;
}

export interface AppConfig {
  timezone: string;
  maxUploadMB: number;
  defaultCaptureProfile: string;
  preserveICC: boolean;
  preserveGPS: boolean;
  preserveCreator: boolean;
  addSoftwareTag: boolean;
  softwareName: string;
  allowedMimeTypes: string[];
}

export interface InspectMetadataSummary {
  make?: string;
  model?: string;
  lens?: string;
  dateTimeOriginal?: string;
  iso?: number | string;
  fNumber?: number | string;
  exposureTime?: string;
  focalLength?: number | string;
  software?: string;
  artist?: string;
  copyright?: string;
  gps?: {
    latitude?: number | string;
    longitude?: number | string;
  };
}

export interface C2PADetails {
  issuer?: string;
  claimGenerator?: string;
  actions?: string[];
  created?: string;
}

export interface C2PAStatus {
  detected: boolean;
  removable: boolean;
  details?: C2PADetails;
}

export type C2PAHandling = "remove" | "preserve" | "ignore";

export interface InspectResult {
  format: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  hasGps: boolean;
  hasC2pa: boolean;
  c2paStatus?: C2PAStatus;
  hasIcc: boolean;
  metadata: InspectMetadataSummary;
  rawMetadata?: Record<string, any>;
  warnings?: string[];
}

export type MetadataStrategy = "clean_and_apply" | "replace_camera" | "merge";

export interface ProcessOptions {
  captureDateMode?: "today" | "custom";
  customDate?: string; // YYYY-MM-DD
  captureTimeMode?: "current" | "custom";
  customTime?: string; // HH:MM:SS
  captureProfileKey?: string;
  metadataStrategy?: MetadataStrategy;
  c2paHandling?: C2PAHandling;
  removeEditingSoftwareMetadata?: boolean;
  preserveIcc?: boolean;
  preserveGps?: boolean;
  preserveCreator?: boolean;
  addSoftwareTag?: boolean;
  customOutputFilename?: string;
  batchTimingMode?: "natural" | "quick" | "posed" | "custom";
  batchCustomSeconds?: number;
  batchNamingPattern?: "canon_sequence" | "photoshop";
  batchStartFrame?: number;
  manualOverrides?: {
    exposureTime?: string;
    fNumber?: number;
    iso?: number;
    focalLength?: number;
    whiteBalance?: string;
    meteringMode?: string;
  };
}

export type BatchTimingMode = "natural" | "quick" | "posed" | "custom";
export type BatchNamingPattern = "canon_sequence" | "photoshop";

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  inspection: InspectResult | null;
  status: "idle" | "inspecting" | "ready" | "processing" | "complete" | "error";
  error?: string;
  customFilename?: string;
  outputFilename?: string;
  processedBlobUrl?: string;
  diff?: MetadataDiffItem[];
  summary?: {
    camera: string;
    lens: string;
    captureTime: string;
    settings: string;
    dimensions: string;
    colorSpace: string;
  };
  validation?: ValidationResult;
  c2paAction?: "removed" | "preserved" | "absent" | null;
}

export interface ValidationFieldCheck {
  field: string;
  expected: any;
  actual: any;
  passed: boolean;
  note?: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationFieldCheck[];
  warnings: string[];
  errors: string[];
}

export interface MetadataDiffItem {
  field: string;
  status: "added" | "modified" | "preserved" | "removed" | "unchanged";
  before?: string;
  after: string;
}

export interface ProcessResult {
  success: boolean;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  metadataValidation: ValidationResult;
  diff: MetadataDiffItem[];
  outputSummary: {
    camera: string;
    lens: string;
    captureTime: string;
    settings: string;
    dimensions: string;
    colorSpace: string;
  };
}
