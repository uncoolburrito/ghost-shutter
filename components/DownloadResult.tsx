"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Download,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  FileEdit,
  Camera,
  RotateCcw,
  Check,
  Loader2,
} from "lucide-react";
import { MetadataDiffItem, ValidationResult } from "@/lib/types";
import { MetadataDiff } from "./MetadataDiff";
import { generateCanonCameraFilename } from "@/lib/file-naming";

export interface BatchResultItem {
  id: string;
  originalName: string;
  outputFilename: string;
  previewUrl: string;
  downloadUrl: string;
  summary: {
    camera: string;
    lens: string;
    captureTime: string;
    settings: string;
    dimensions: string;
    colorSpace: string;
  };
  c2paAction?: "removed" | "preserved" | "absent" | null;
  validation?: ValidationResult;
  diff?: MetadataDiffItem[];
}

interface DownloadResultProps {
  // Single image mode props
  downloadUrl?: string;
  filename?: string;
  summary?: {
    camera: string;
    lens: string;
    captureTime: string;
    settings: string;
    dimensions: string;
    colorSpace: string;
  };
  validation?: ValidationResult;
  diff?: MetadataDiffItem[];
  // Batch mode props
  batchItems?: BatchResultItem[];
  onReset: () => void;
}

export function DownloadResult({
  downloadUrl,
  filename = "IMG_6442.png",
  summary,
  validation,
  diff = [],
  batchItems = [],
  onReset,
}: DownloadResultProps) {
  // Single item editable filename
  const [editableFilename, setEditableFilename] = useState(filename);
  const [showSingleDiff, setShowSingleDiff] = useState(false);

  // Batch items editable filenames map { [id]: filename }
  const [batchNames, setBatchNames] = useState<Record<string, string>>({});
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    setEditableFilename(filename);
  }, [filename]);

  useEffect(() => {
    if (batchItems && batchItems.length > 0) {
      const initial: Record<string, string> = {};
      batchItems.forEach((it) => {
        initial[it.id] = it.outputFilename;
      });
      setBatchNames(initial);
    }
  }, [batchItems]);

  const finalSingleDownloadName = useMemo(() => {
    const trimmed = editableFilename.trim();
    if (!trimmed) return filename || "IMG_6442.png";
    const lower = trimmed.toLowerCase();
    if (lower.endsWith(".png")) {
      return trimmed;
    }
    return `${trimmed}.png`;
  }, [editableFilename, filename]);

  const getResolvedBatchName = (item: BatchResultItem): string => {
    const custom = batchNames[item.id]?.trim();
    if (!custom) return item.outputFilename;
    const lower = custom.toLowerCase();
    if (lower.endsWith(".png")) {
      return custom;
    }
    return `${custom}.png`;
  };

  // Master Download All function (sequential downloads without ZIP)
  const handleDownloadAll = async () => {
    if (!batchItems || batchItems.length === 0) return;
    setIsDownloadingAll(true);

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      setDownloadProgress({ current: i + 1, total: batchItems.length });

      if (item.downloadUrl) {
        const link = document.createElement("a");
        link.href = item.downloadUrl;
        link.download = getResolvedBatchName(item);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Pause 250ms between downloads so browser doesn't throttle or block
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    setDownloadProgress(null);
    setIsDownloadingAll(false);
  };

  // 1. Batch Result View
  if (batchItems && batchItems.length > 1) {
    const firstSummary = batchItems[0]?.summary;
    const lastSummary = batchItems[batchItems.length - 1]?.summary;

    return (
      <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-6 space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Batch Metadata Applied Successfully ({batchItems.length} Images)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Canon EOS 70D profile written & C2PA credentials removed across all {batchItems.length} images.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/50 flex items-center gap-1.5 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Process Another Batch
          </button>
        </div>

        {/* Applied Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1.5">
            <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">
              Camera & Profile
            </div>
            <div className="font-semibold text-slate-100 text-sm">
              {firstSummary?.camera || "Canon EOS 70D"}
            </div>
            <div className="text-slate-300">
              {firstSummary?.lens || "EF-S 55-250mm f/4-5.6 IS II"}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Capture Session Timeline
            </div>
            <div className="font-mono text-slate-200">
              {firstSummary?.captureTime} → {lastSummary?.captureTime}
            </div>
            <div className="text-slate-400 text-[11px]">
              {batchItems.length} images spaced with authentic shooting intervals
            </div>
          </div>
        </div>

        {/* Master Download All Action */}
        <div>
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={isDownloadingAll}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-950/50 flex items-center justify-center gap-2.5 transition-all duration-200 disabled:opacity-60 cursor-pointer"
          >
            {isDownloadingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading ({downloadProgress?.current} of {downloadProgress?.total})...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download All ({batchItems.length} Images)
              </>
            )}
          </button>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            Downloads all {batchItems.length} images sequentially to your browser's download folder.
          </p>
        </div>

        {/* Individual Image Download List */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Individual Files ({batchItems.length})
          </div>

          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {batchItems.map((item, idx) => {
              const currentName = getResolvedBatchName(item);
              const isDiffOpen = expandedDiffId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 hover:border-slate-700/80 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.previewUrl}
                          alt={item.originalName}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 right-0 px-1 text-[9px] font-mono bg-black/80 text-slate-300">
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={batchNames[item.id] ?? item.outputFilename}
                            onChange={(e) =>
                              setBatchNames((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500 w-44 sm:w-56"
                            placeholder="filename.png"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setBatchNames((prev) => ({
                                ...prev,
                                [item.id]: generateCanonCameraFilename(),
                              }))
                            }
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
                            title="Generate Canon name"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                          <span className="font-mono">{item.summary.captureTime}</span>
                          <span>•</span>
                          <span>{item.summary.dimensions}</span>
                          {item.c2paAction === "removed" && (
                            <>
                              <span>•</span>
                              <span className="text-purple-300">C2PA Removed</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setExpandedDiffId(isDiffOpen ? null : item.id)}
                        className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs flex items-center gap-1 transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        {isDiffOpen ? "Hide Diff" : "Diff"}
                      </button>

                      <a
                        href={item.downloadUrl}
                        download={currentName}
                        className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    </div>
                  </div>

                  {/* Expandable Diff for this image */}
                  {isDiffOpen && item.diff && item.diff.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <MetadataDiff diff={item.diff} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 2. Single Image Result View
  return (
    <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-6 space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Metadata Applied Successfully
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Canon EOS 70D profile written & validated with ExifTool. Zero visual degradation.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/50 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Process Another
        </button>
      </div>

      {/* Applied Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2">
            <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">
              Camera & Lens
            </div>
            <div className="font-semibold text-slate-100 text-sm">{summary.camera}</div>
            <div className="text-slate-300">{summary.lens}</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Capture & Output
            </div>
            <div className="font-mono text-slate-200">{summary.captureTime}</div>
            <div className="font-mono text-slate-300 font-medium">{summary.settings}</div>
            <div className="text-slate-400 text-[11px]">
              {summary.dimensions} • {summary.colorSpace}
            </div>
          </div>
        </div>
      )}

      {/* Customizable File Name Before Download */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <FileEdit className="w-3.5 h-3.5 text-red-400" />
            File Name for Download
          </label>
          <span className="text-[11px] text-slate-400 font-mono">
            Will save as: {finalSingleDownloadName}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={editableFilename}
            onChange={(e) => setEditableFilename(e.target.value)}
            placeholder="e.g. IMG_6442.png"
            className="flex-1 px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500 transition-colors"
          />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditableFilename(generateCanonCameraFilename())}
              className="px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-800/60 text-red-200 text-xs font-medium transition-colors flex items-center gap-1"
              title="Change to real Canon DSLR filename (e.g. IMG_6442.png)"
            >
              <Camera className="w-3 h-3 text-red-400" />
              Canon Style
            </button>

            {editableFilename !== filename && (
              <button
                type="button"
                onClick={() => setEditableFilename(filename)}
                className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1"
                title="Reset to default name"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      {downloadUrl && (
        <div className="pt-1">
          <a
            href={downloadUrl}
            download={finalSingleDownloadName}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-950/50 flex items-center justify-center gap-2.5 transition-all duration-200 transform hover:scale-[1.01]"
          >
            <Download className="w-4 h-4" />
            Download Image ({finalSingleDownloadName})
          </a>
        </div>
      )}

      {/* Diff Inspector Toggle */}
      {diff && diff.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowSingleDiff(!showSingleDiff)}
            className="w-full flex items-center justify-between py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>{showSingleDiff ? "Hide Detailed Metadata Diff" : "Inspect Metadata Changes (Diff)"}</span>
            </div>
            {showSingleDiff ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showSingleDiff && (
            <div className="mt-3">
              <MetadataDiff diff={diff} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
