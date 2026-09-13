"use client";

import React from "react";
import { Loader2, CheckCircle2, AlertCircle, Sparkles, Layers } from "lucide-react";

export type PipelineStatus =
  | "idle"
  | "uploading"
  | "inspecting"
  | "ready"
  | "processing"
  | "validating"
  | "complete"
  | "error";

interface ProcessingStatusProps {
  status: PipelineStatus;
  errorMessage?: string | null;
  c2paAction?: "removed" | "preserved" | "absent" | null;
  batchTotal?: number;
  batchCurrent?: number;
  batchCurrentFilename?: string;
}

export function ProcessingStatus({
  status,
  errorMessage,
  c2paAction,
  batchTotal = 1,
  batchCurrent = 1,
  batchCurrentFilename,
}: ProcessingStatusProps) {
  if (status === "idle" || status === "ready") {
    return null;
  }

  const isBatch = batchTotal > 1;
  const progressPercent = isBatch ? Math.round(((batchCurrent - 1) / batchTotal) * 100) : 0;
  const completePercent = 100;

  const getStatusContent = () => {
    switch (status) {
      case "uploading":
        return {
          icon: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />,
          title: isBatch ? `Uploading Batch (${batchTotal} Images)` : "Uploading Image",
          description: "Transferring files to ephemeral processing session...",
          color: "border-blue-900/50 bg-blue-950/20 text-blue-300",
        };
      case "inspecting":
        return {
          icon: <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />,
          title: isBatch
            ? `Inspecting Image ${batchCurrent} of ${batchTotal}`
            : "Inspecting Image & Metadata",
          description: isBatch && batchCurrentFilename
            ? `Analyzing ${batchCurrentFilename} for format, EXIF, and C2PA manifests...`
            : "Verifying MIME magic bytes, dimensions, and C2PA manifests...",
          color: "border-indigo-900/50 bg-indigo-950/20 text-indigo-300",
        };
      case "processing":
        return {
          icon: <Loader2 className="w-5 h-5 text-red-500 animate-spin" />,
          title: isBatch
            ? `Processing Image ${batchCurrent} of ${batchTotal}`
            : "Applying Canon EOS 70D Profile",
          description: isBatch && batchCurrentFilename
            ? `Applying Canon profile, timing interval, and stripping C2PA from ${batchCurrentFilename}...`
            : "Removing unwanted provenance manifests and composing camera EXIF...",
          color: "border-red-900/50 bg-red-950/20 text-red-300",
        };
      case "validating":
        return {
          icon: <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />,
          title: isBatch
            ? `Validating Image ${batchCurrent} of ${batchTotal}`
            : "Validating Output & C2PA Status",
          description: "Verifying C2PA absence, checking camera metadata, and testing image decode...",
          color: "border-amber-900/50 bg-amber-950/20 text-amber-300",
        };
      case "complete":
        let completionDesc = isBatch
          ? `All ${batchTotal} images processed with authentic Canon EOS 70D profile and realistic capture timing.`
          : "All Canon EOS 70D parameters verified and pixel integrity preserved.";
        if (c2paAction === "removed") {
          completionDesc = isBatch
            ? `All ${batchTotal} images processed. C2PA / Content Credentials removed from all files.`
            : "✓ C2PA / Content Credentials removed. No replacement provenance credential was created.";
        }

        return {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
          title: isBatch ? `Batch Completed (${batchTotal} Images)` : "Metadata Applied Successfully",
          description: completionDesc,
          color: "border-emerald-900/50 bg-emerald-950/20 text-emerald-300",
        };
      case "error":
        const isC2paFail = errorMessage && errorMessage.includes("C2PA removal could not be verified");
        return {
          icon: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
          title: isC2paFail ? "⚠ C2PA Verification Failed" : "Processing Failed",
          description: errorMessage || "An error occurred during processing. Original file unmodified.",
          color: "border-rose-900/50 bg-rose-950/30 text-rose-300",
        };
    }
  };

  const current = getStatusContent();

  return (
    <div className={`p-4 rounded-2xl border ${current.color} transition-all duration-200 space-y-3`}>
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 shrink-0">{current.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold truncate">{current.title}</h4>
            {isBatch && (status === "processing" || status === "validating" || status === "inspecting") && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700/50 shrink-0">
                {batchCurrent} / {batchTotal}
              </span>
            )}
          </div>
          <p className="text-xs opacity-80 mt-0.5 whitespace-pre-line">{current.description}</p>
        </div>
      </div>

      {/* Batch Progress Bar */}
      {isBatch && (status === "processing" || status === "validating" || status === "inspecting") && (
        <div className="pt-1">
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-red-600 to-rose-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, progressPercent)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
