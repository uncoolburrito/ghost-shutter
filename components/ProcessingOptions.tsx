"use client";

import React, { useEffect, useMemo } from "react";
import {
  Calendar,
  Clock,
  Sliders,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Sun,
  Sunset,
  Sunrise,
  ArrowLeft,
  ArrowRight,
  FileEdit,
  Camera,
} from "lucide-react";
import { ProcessOptions, InspectResult } from "@/lib/types";
import { CAPTURE_PROFILES } from "@/lib/metadata-builder";
import {
  generateCanonCameraFilename,
  getOutputFilename,
  formatCanonFrame,
  getRandomCanonFrame,
  generateCanonSequence,
} from "@/lib/file-naming";
import { calculateBatchTimestamps } from "@/lib/batch-timing";

interface ProcessingOptionsProps {
  options: ProcessOptions;
  inspection: InspectResult | null;
  fileName?: string;
  itemCount?: number;
  onChange: (options: ProcessOptions) => void;
}

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTimeString(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function ProcessingOptions({
  options,
  inspection,
  fileName = "image.png",
  itemCount = 1,
  onChange,
}: ProcessingOptionsProps) {
  const isCustom = options.captureDateMode === "custom" || options.captureTimeMode === "custom";

  // Original uploaded file name preserved with .png
  const originalUploadedFilename = useMemo(() => {
    return getOutputFilename(fileName || "image.png");
  }, [fileName]);

  // Authentic Canon camera frame default (e.g. IMG_6442.png) so every processed image looks like it was captured on a camera by default
  const defaultCanonFilename = useMemo(() => {
    const base = fileName ? fileName.replace(/\.[^/.]+$/, "") : "image";
    if (/^IMG_\d{4}$/i.test(base)) {
      return `${base.toUpperCase()}.png`;
    }
    return generateCanonCameraFilename();
  }, [fileName]);

  // Pre-initialize custom values if switching to custom so user never sees empty fields
  const activeDate = options.customDate || getLocalDateString();
  const activeTime = options.customTime || getLocalTimeString();

  // Batch frame numbering
  const currentStartFrame = options.batchStartFrame || 4819;
  const batchSequenceNames = useMemo(() => {
    if (itemCount <= 1) return [];
    return generateCanonSequence(currentStartFrame, itemCount);
  }, [currentStartFrame, itemCount]);

  // Batch timestamp progression
  const batchTimestamps = useMemo(() => {
    if (itemCount <= 1) return [];
    return calculateBatchTimestamps(
      activeDate,
      activeTime,
      itemCount,
      options.batchTimingMode || "natural",
      options.batchCustomSeconds
    );
  }, [itemCount, activeDate, activeTime, options.batchTimingMode, options.batchCustomSeconds]);

  const originalDate = useMemo(() => {
    if (!inspection?.metadata?.dateTimeOriginal) return null;
    // Format YYYY:MM:DD HH:MM:SS
    const match = inspection.metadata.dateTimeOriginal.match(
      /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/
    );
    if (match) {
      return {
        raw: inspection.metadata.dateTimeOriginal,
        date: `${match[1]}-${match[2]}-${match[3]}`,
        time: match[4].length === 5 ? `${match[4]}:00` : match[4],
      };
    }
    return null;
  }, [inspection]);

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    onChange({
      ...options,
      [key]: value,
    });
  };

  const handleSelectToday = () => {
    onChange({
      ...options,
      captureDateMode: "today",
      captureTimeMode: "current",
      customDate: undefined,
      customTime: undefined,
    });
  };

  const handleSelectCustom = () => {
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: activeDate,
      customTime: activeTime,
    });
  };

  const handleSelectOriginal = () => {
    if (!originalDate) return;
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: originalDate.date,
      customTime: originalDate.time,
    });
  };

  const setNow = () => {
    const now = new Date();
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: getLocalDateString(now),
      customTime: getLocalTimeString(now),
    });
  };

  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: getLocalDateString(d),
      customTime: getLocalTimeString(d),
    });
  };

  const shiftDays = (delta: number) => {
    const [y, m, d] = activeDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + delta);
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: getLocalDateString(dateObj),
      customTime: activeTime,
    });
  };

  const shiftHours = (delta: number) => {
    const [h, m, s] = activeTime.split(":").map(Number);
    let newH = (h + delta) % 24;
    if (newH < 0) newH += 24;
    const timeStr = `${String(newH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:${String(s || 0).padStart(2, "0")}`;
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: activeDate,
      customTime: timeStr,
    });
  };

  const setPresetTime = (timeString: string) => {
    onChange({
      ...options,
      captureDateMode: "custom",
      captureTimeMode: "custom",
      customDate: activeDate,
      customTime: timeString,
    });
  };

  // Formatted preview text
  const previewTimestampText = useMemo(() => {
    if (!isCustom) {
      return "Current processing time in Asia/Kolkata (+05:30)";
    }
    try {
      const [y, m, d] = activeDate.split("-").map(Number);
      const [hh, mm, ss] = activeTime.split(":").map(Number);
      const dateObj = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
      const formatted = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      return `${formatted} at ${activeTime} (+05:30)`;
    } catch {
      return `${activeDate} ${activeTime}`;
    }
  }, [isCustom, activeDate, activeTime]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden text-xs space-y-6 p-5">
      {/* Header - Always Open per user request */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-red-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Camera & Capture Settings
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
          Always Active
        </span>
      </div>

      {/* C2PA Alert & Option if detected or available */}
      <div className="p-4 rounded-xl bg-purple-950/25 border border-purple-800/40 text-purple-200 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-purple-100">
                {inspection?.hasC2pa ? "Content Credentials Detected" : "Content Credentials (C2PA) Policy"}
              </span>
              {inspection?.hasC2pa && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50">
                  Manifest Detected
                </span>
              )}
            </div>
            <p className="text-xs text-purple-200/90 mt-1">
              {inspection?.hasC2pa
                ? `This image contains an existing C2PA provenance manifest${inspection.c2paStatus?.details?.claimGenerator ? ` from ${inspection.c2paStatus.details.claimGenerator}` : ""}. The existing embedded provenance will be removed from the output. No replacement C2PA credential or cryptographic signature will be created.`
                : "Configure how any embedded Content Credentials or editing provenance manifests are handled."}
            </p>
          </div>
        </div>

        {/* C2PA Handling Selector */}
        <div className="pt-2 border-t border-purple-900/40">
          <div className="text-[11px] font-medium text-purple-300 mb-1.5">
            C2PA / Content Credentials Action:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                (options.c2paHandling || "remove") === "remove"
                  ? "bg-purple-900/50 border-purple-500 text-purple-100 shadow-sm"
                  : "bg-slate-900/50 border-purple-900/30 text-purple-300/70 hover:text-purple-200"
              }`}
            >
              <input
                type="radio"
                name="c2paHandling"
                checked={(options.c2paHandling || "remove") === "remove"}
                onChange={() => updateOption("c2paHandling", "remove")}
                className="mt-0.5 text-purple-600 focus:ring-0"
              />
              <div>
                <div className="font-semibold text-xs">Remove existing (Default)</div>
                <div className="text-[10px] text-purple-300/70">
                  Strips C2PA manifest. No replacement credential created.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                options.c2paHandling === "preserve"
                  ? "bg-purple-900/50 border-purple-500 text-purple-100 shadow-sm"
                  : "bg-slate-900/50 border-purple-900/30 text-purple-300/70 hover:text-purple-200"
              }`}
            >
              <input
                type="radio"
                name="c2paHandling"
                checked={options.c2paHandling === "preserve"}
                onChange={() => updateOption("c2paHandling", "preserve")}
                className="mt-0.5 text-purple-600 focus:ring-0"
              />
              <div>
                <div className="font-semibold text-xs">Preserve existing</div>
                <div className="text-[10px] text-purple-300/70">
                  Keeps existing C2PA manifest intact in output file.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                options.c2paHandling === "ignore"
                  ? "bg-purple-900/50 border-purple-500 text-purple-100 shadow-sm"
                  : "bg-slate-900/50 border-purple-900/30 text-purple-300/70 hover:text-purple-200"
              }`}
            >
              <input
                type="radio"
                name="c2paHandling"
                checked={options.c2paHandling === "ignore"}
                onChange={() => updateOption("c2paHandling", "ignore")}
                className="mt-0.5 text-purple-600 focus:ring-0"
              />
              <div>
                <div className="font-semibold text-xs">Do not modify</div>
                <div className="text-[10px] text-purple-300/70">
                  Bypasses C2PA manifest manipulation.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Output File Name (Single vs Batch) */}
      {itemCount > 1 ? (
        <div className="space-y-3 p-4 rounded-xl bg-slate-950/40 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-slate-200 font-semibold flex items-center gap-1.5">
              <FileEdit className="w-3.5 h-3.5 text-red-500" />
              Batch File Naming ({itemCount} Images)
            </label>
            <span className="text-[11px] text-slate-400">
              Photoshop / Canon DSLR naming
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                (options.batchNamingPattern || "photoshop") === "photoshop"
                  ? "bg-red-950/40 border-red-500 text-red-100"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <input
                type="radio"
                name="batchNamingPattern"
                checked={(options.batchNamingPattern || "photoshop") === "photoshop"}
                onChange={() => updateOption("batchNamingPattern", "photoshop")}
                className="mt-0.5 text-red-600 focus:ring-0"
              />
              <div>
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <FileEdit className="w-3.5 h-3.5 text-slate-400" />
                  Photoshop Default
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Retains each image's base name with lowercase .png
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                options.batchNamingPattern === "canon_sequence"
                  ? "bg-red-950/40 border-red-500 text-red-100"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <input
                type="radio"
                name="batchNamingPattern"
                checked={options.batchNamingPattern === "canon_sequence"}
                onChange={() => updateOption("batchNamingPattern", "canon_sequence")}
                className="mt-0.5 text-red-600 focus:ring-0"
              />
              <div>
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-red-400" />
                  Canon Sequence (Continuous)
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Sequential DSLR frame numbering (IMG_XXXX.png)
                </div>
              </div>
            </label>
          </div>

          {options.batchNamingPattern === "canon_sequence" && (
            <div className="pt-2 border-t border-slate-800/60 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">Starting Frame Number:</span>
                <span className="text-slate-400 font-mono">Rolls over at 9999 → 0001</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 font-mono text-xs text-slate-500">IMG_</span>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    value={currentStartFrame}
                    onChange={(e) => updateOption("batchStartFrame", parseInt(e.target.value) || 1000)}
                    className="w-full pl-12 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => updateOption("batchStartFrame", getRandomCanonFrame())}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
                  title="Generate a random starting Canon frame number"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  Randomize
                </button>
              </div>

              {batchSequenceNames.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-slate-300 flex items-center justify-between">
                  <span className="text-slate-400">Sequence Preview:</span>
                  <span className="text-red-300 font-medium">
                    {batchSequenceNames[0]} → {batchSequenceNames[batchSequenceNames.length - 1]} ({itemCount} photos)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-4 rounded-xl bg-slate-950/40 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-slate-200 font-semibold flex items-center gap-1.5">
              <FileEdit className="w-3.5 h-3.5 text-red-500" />
              Output File Name
            </label>
            <span className="text-[11px] text-slate-400">
              Photoshop Export convention (.png)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={options.customOutputFilename ?? originalUploadedFilename}
                onChange={(e) => updateOption("customOutputFilename", e.target.value)}
                placeholder="e.g. IMG_6442.png"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => updateOption("customOutputFilename", originalUploadedFilename)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-xs font-medium transition-colors"
                title="Photoshop default: keep original base name with .png"
              >
                Photoshop Default
              </button>

              <button
                type="button"
                onClick={() => updateOption("customOutputFilename", generateCanonCameraFilename())}
                className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/60 text-red-200 text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Generate real Canon EOS DSLR style filename (e.g. IMG_6442.png)"
              >
                <Camera className="w-3.5 h-3.5 text-red-400" />
                Canon Style (IMG_XXXX.png)
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Photoshop preserves the original base name by default without appending suffixes. You can customize the name or use Canon Style anytime.
          </p>
        </div>
      )}

      {/* 1. Capture Date & Time - Redesigned for Maximum Convenience */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-slate-200 font-semibold flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Capture Date & Time
          </label>
          <span className="text-[11px] text-slate-400 font-mono">
            {previewTimestampText}
          </span>
        </div>

        {/* Convenient Mode Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleSelectToday}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border font-medium transition-all ${
              !isCustom
                ? "bg-red-950/50 text-red-300 border-red-700/80 shadow-sm"
                : "bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Today (Now)</span>
          </button>

          <button
            type="button"
            onClick={handleSelectCustom}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border font-medium transition-all ${
              isCustom && (!originalDate || options.customDate !== originalDate.date)
                ? "bg-red-950/50 text-red-300 border-red-700/80 shadow-sm"
                : "bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Custom Date & Time</span>
          </button>

          {originalDate && (
            <button
              type="button"
              onClick={handleSelectOriginal}
              className={`col-span-2 sm:col-span-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border font-medium transition-all ${
                isCustom && options.customDate === originalDate.date && options.customTime === originalDate.time
                  ? "bg-emerald-950/50 text-emerald-300 border-emerald-700/80 shadow-sm"
                  : "bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate">Original Photo Date</span>
            </button>
          )}
        </div>

        {/* Custom Date & Time Inputs & Quick Modifiers */}
        {isCustom && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3.5 animate-in fade-in duration-200">
            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800/60">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Presets:</span>
              <button
                type="button"
                onClick={setNow}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
              >
                Now
              </button>
              <button
                type="button"
                onClick={setYesterday}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => shiftDays(-1)}
                className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60 transition-colors flex items-center gap-1"
                title="Subtract 1 day"
              >
                <ArrowLeft className="w-3 h-3" /> 1 Day
              </button>
              <button
                type="button"
                onClick={() => shiftDays(1)}
                className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60 transition-colors flex items-center gap-1"
                title="Add 1 day"
              >
                +1 Day <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => shiftHours(-1)}
                className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60 transition-colors flex items-center gap-1"
                title="Subtract 1 hour"
              >
                <ArrowLeft className="w-3 h-3" /> 1 Hour
              </button>
              <button
                type="button"
                onClick={() => shiftHours(1)}
                className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60 transition-colors flex items-center gap-1"
                title="Add 1 hour"
              >
                +1 Hour <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={activeDate}
                    onChange={(e) => updateOption("customDate", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Time (HH:MM:SS)
                </label>
                <div className="relative">
                  <input
                    type="time"
                    step="1"
                    value={activeTime}
                    onChange={(e) => updateOption("customTime", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Time of Day Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Time of Day:</span>
              <button
                type="button"
                onClick={() => setPresetTime("09:00:00")}
                className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <Sunrise className="w-3 h-3 text-amber-400" /> Morning (09:00)
              </button>
              <button
                type="button"
                onClick={() => setPresetTime("12:30:00")}
                className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <Sun className="w-3 h-3 text-yellow-400" /> Noon (12:30)
              </button>
              <button
                type="button"
                onClick={() => setPresetTime("18:15:00")}
                className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <Sunset className="w-3 h-3 text-rose-400" /> Sunset / Golden Hour (18:15)
              </button>
            </div>
          </div>
        )}

        {/* Batch Timing Interval Selector */}
        {itemCount > 1 && (
          <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-200 font-semibold flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                Realistic Shoot Spacing Between Photos
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {batchTimestamps.length > 0 && `${batchTimestamps[0].time} → ${batchTimestamps[batchTimestamps.length - 1].time}`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              In professional single-frame photography, timestamps are spaced naturally. Subtle organic variance is applied so intervals aren't mechanically identical.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => updateOption("batchTimingMode", "natural")}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  (options.batchTimingMode || "natural") === "natural"
                    ? "bg-red-950/50 border-red-500 text-red-100 shadow-sm"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-xs">Natural Session</div>
                <div className="text-[10px] opacity-75 mt-0.5">~12s (organic ±3s)</div>
              </button>

              <button
                type="button"
                onClick={() => updateOption("batchTimingMode", "quick")}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  options.batchTimingMode === "quick"
                    ? "bg-red-950/50 border-red-500 text-red-100 shadow-sm"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-xs">Quick Series</div>
                <div className="text-[10px] opacity-75 mt-0.5">~7s rapid shooting</div>
              </button>

              <button
                type="button"
                onClick={() => updateOption("batchTimingMode", "posed")}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  options.batchTimingMode === "posed"
                    ? "bg-red-950/50 border-red-500 text-red-100 shadow-sm"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-xs">Posed / Studio</div>
                <div className="text-[10px] opacity-75 mt-0.5">~30s repositioning</div>
              </button>

              <div
                className={`p-2 rounded-xl border transition-colors flex flex-col justify-between ${
                  options.batchTimingMode === "custom"
                    ? "bg-red-950/50 border-red-500 text-red-100"
                    : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">Custom</span>
                  <span className="text-[10px] font-mono">seconds</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={options.batchCustomSeconds || 15}
                  onChange={(e) => {
                    updateOption("batchTimingMode", "custom");
                    updateOption("batchCustomSeconds", Math.max(1, parseInt(e.target.value) || 1));
                  }}
                  className="w-full mt-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                />
              </div>
            </div>

            {batchTimestamps.length > 0 && (
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-slate-300 flex flex-wrap items-center gap-2">
                <span className="text-slate-500 font-sans font-medium">Timeline:</span>
                {batchTimestamps.slice(0, 3).map((ts, i) => (
                  <span key={i} className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    #{i + 1}: {ts.time}
                  </span>
                ))}
                {batchTimestamps.length > 4 && <span className="text-slate-500">...</span>}
                {batchTimestamps.length > 3 && (
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    #{batchTimestamps.length}: {batchTimestamps[batchTimestamps.length - 1].time}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Shooting Preset / Capture Profile */}
      <div className="space-y-1.5">
        <label className="text-slate-200 font-semibold block">
          Shooting Preset / Capture Profile
        </label>
        <select
          value={options.captureProfileKey || "default"}
          onChange={(e) => updateOption("captureProfileKey", e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-medium focus:outline-none focus:border-red-500 transition-colors"
        >
          {Object.entries(CAPTURE_PROFILES).map(([key, prof]) => (
            <option key={key} value={key}>
              {prof.name} ({prof.exposureTime} • f/{prof.fNumber} • ISO {prof.iso} • {prof.focalLength}mm)
            </option>
          ))}
        </select>
      </div>

      {/* 3. Metadata Strategy */}
      <div className="space-y-2">
        <label className="text-slate-200 font-semibold block">
          Metadata Strategy
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
              (options.metadataStrategy || "clean_and_apply") === "clean_and_apply"
                ? "bg-slate-800/90 border-red-800/60 text-slate-100 shadow-sm"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <input
              type="radio"
              name="strategy"
              checked={(options.metadataStrategy || "clean_and_apply") === "clean_and_apply"}
              onChange={() => updateOption("metadataStrategy", "clean_and_apply")}
              className="mt-0.5 text-red-600 focus:ring-0"
            />
            <div>
              <div className="font-medium">Clean + Apply</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Strips stale software/AI tags, preserves ICC, applies Canon profile.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
              options.metadataStrategy === "replace_camera"
                ? "bg-slate-800/90 border-red-800/60 text-slate-100 shadow-sm"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <input
              type="radio"
              name="strategy"
              checked={options.metadataStrategy === "replace_camera"}
              onChange={() => updateOption("metadataStrategy", "replace_camera")}
              className="mt-0.5 text-red-600 focus:ring-0"
            />
            <div>
              <div className="font-medium">Replace Camera</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Overwrites only camera & lens tags, keeping other existing tags.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
              options.metadataStrategy === "merge"
                ? "bg-slate-800/90 border-red-800/60 text-slate-100 shadow-sm"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <input
              type="radio"
              name="strategy"
              checked={options.metadataStrategy === "merge"}
              onChange={() => updateOption("metadataStrategy", "merge")}
              className="mt-0.5 text-red-600 focus:ring-0"
            />
            <div>
              <div className="font-medium">Merge Valid Tags</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Preserves valid surviving capture settings if detected in file.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 4. Fine-grained Preservation Toggles */}
      <div className="pt-3 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={options.preserveIcc ?? true}
            onChange={(e) => updateOption("preserveIcc", e.target.checked)}
            className="rounded border-slate-700 text-red-600 focus:ring-0 bg-slate-900"
          />
          <span className="text-slate-300">Preserve embedded ICC profile</span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={options.preserveGps ?? false}
            onChange={(e) => updateOption("preserveGps", e.target.checked)}
            className="rounded border-slate-700 text-red-600 focus:ring-0 bg-slate-900"
          />
          <span className="text-slate-300">Preserve existing GPS (disabled by default)</span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={options.addSoftwareTag ?? true}
            onChange={(e) => updateOption("addSoftwareTag", e.target.checked)}
            className="rounded border-slate-700 text-red-600 focus:ring-0 bg-slate-900"
          />
          <span className="text-slate-300">Set Software tag to &quot;Adobe Photoshop 26.3 (Windows)&quot;</span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={options.preserveCreator ?? true}
            onChange={(e) => updateOption("preserveCreator", e.target.checked)}
            className="rounded border-slate-700 text-red-600 focus:ring-0 bg-slate-900"
          />
          <span className="text-slate-300">Preserve Creator / Copyright if present</span>
        </label>
      </div>
    </div>
  );
}
