"use client";

import React from "react";
import { Camera, Aperture, Clock, Sliders, MapPin, Palette, Maximize2 } from "lucide-react";
import { InspectResult, ProcessOptions } from "@/lib/types";
import { CAMERA_PROFILE, CAPTURE_PROFILES } from "@/lib/metadata-builder";

interface MetadataPreviewProps {
  inspection: InspectResult | null;
  options: ProcessOptions;
}

export function MetadataPreview({ inspection, options }: MetadataPreviewProps) {
  const profileKey = options.captureProfileKey || "default";
  const profile = CAPTURE_PROFILES[profileKey] || CAPTURE_PROFILES.default;

  const exposureTime = options.manualOverrides?.exposureTime || profile.exposureTime;
  const fNumber = options.manualOverrides?.fNumber || profile.fNumber;
  const iso = options.manualOverrides?.iso || profile.iso;
  const focalLength = options.manualOverrides?.focalLength || profile.focalLength;
  const focalLength35mm = Math.round(focalLength * (CAMERA_PROFILE.cropFactor || 1.6));

  const dateLabel =
    options.captureDateMode === "custom" && options.customDate
      ? options.customDate
      : "Today";

  const timeLabel =
    options.captureTimeMode === "custom" && options.customTime
      ? options.customTime
      : "Current time";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-red-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Target Camera Profile
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-900/40">
          Canon EOS 70D
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        {/* Camera Identity */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
          <Camera className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-slate-400 text-[11px]">Body & Lens</div>
            <div className="font-medium text-slate-200 mt-0.5">Canon EOS 70D</div>
            <div className="text-slate-400 text-[11px] truncate">
              EF-S 55-250mm f/4-5.6 IS II
            </div>
          </div>
        </div>

        {/* Capture Timing */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
          <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-slate-400 text-[11px]">Capture Timestamp</div>
            <div className="font-medium text-slate-200 mt-0.5">
              {dateLabel} · {timeLabel}
            </div>
            <div className="text-slate-400 text-[11px]">Timezone: Asia/Kolkata</div>
          </div>
        </div>

        {/* Exposure Settings */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
          <Sliders className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-slate-400 text-[11px]">Exposure Settings</div>
            <div className="font-mono font-medium text-slate-200 mt-0.5">
              {exposureTime} · f/{fNumber} · ISO {iso}
            </div>
            <div className="text-slate-400 text-[11px]">
              {focalLength}mm ({focalLength35mm}mm eq)
            </div>
          </div>
        </div>

        {/* Image Dimensions */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
          <Maximize2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-slate-400 text-[11px]">Dimensions</div>
            <div className="font-mono font-medium text-slate-200 mt-0.5">
              {inspection ? `${inspection.width} × ${inspection.height}` : "Auto-detected"}
            </div>
            <div className="text-slate-400 text-[11px]">72 DPI (preserved)</div>
          </div>
        </div>

        {/* Color Space */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
          <Palette className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-slate-400 text-[11px]">Color Space</div>
            <div className="font-medium text-slate-200 mt-0.5">sRGB</div>
            <div className="text-slate-400 text-[11px]">
              {options.preserveIcc ? "Preserve embedded ICC" : "Default profile"}
            </div>
          </div>
        </div>

        {/* Location / Privacy */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-slate-400 text-[11px]">GPS Coordinates</div>
            <div className="font-medium text-slate-200 mt-0.5">
              {options.preserveGps && inspection?.hasGps ? "Preserve existing" : "None (Stripped)"}
            </div>
            <div className="text-slate-400 text-[11px]">Zero coordinates fabricated</div>
          </div>
        </div>
      </div>
    </div>
  );
}
