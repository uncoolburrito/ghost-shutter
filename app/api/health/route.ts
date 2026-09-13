import { NextResponse } from "next/server";
import { getExiftoolVersion } from "@/lib/exiftool";
import { CAMERA_PROFILE, APP_CONFIG } from "@/lib/metadata-builder";

export async function GET() {
  const exiftoolStatus = await getExiftoolVersion();

  return NextResponse.json({
    status: exiftoolStatus.available ? "healthy" : "degraded",
    exiftool: exiftoolStatus,
    camera: {
      make: CAMERA_PROFILE.make,
      model: CAMERA_PROFILE.model,
      lens: CAMERA_PROFILE.lens.model,
      firmware: CAMERA_PROFILE.firmware,
    },
    config: {
      timezone: APP_CONFIG.timezone,
      maxUploadMB: APP_CONFIG.maxUploadMB,
      defaultCaptureProfile: APP_CONFIG.defaultCaptureProfile,
    },
  });
}
