"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Camera, ShieldCheck, Zap, RefreshCw, Cpu, Layers } from "lucide-react";
import { ImageDropzone, DropzoneItem } from "@/components/ImageDropzone";
import { MetadataPreview } from "@/components/MetadataPreview";
import { ProcessingOptions } from "@/components/ProcessingOptions";
import { ProcessingStatus, PipelineStatus } from "@/components/ProcessingStatus";
import { DownloadResult, BatchResultItem } from "@/components/DownloadResult";
import {
  InspectResult,
  ProcessOptions,
  MetadataDiffItem,
  ValidationResult,
} from "@/lib/types";
import {
  getRandomCanonFrame,
  generateCanonCameraFilename,
  generateCanonSequence,
  getOutputFilename,
} from "@/lib/file-naming";
import { calculateBatchTimestamps } from "@/lib/batch-timing";

export default function HomePage() {
  const [items, setItems] = useState<DropzoneItem[]>([]);
  const [options, setOptions] = useState<ProcessOptions>({
    metadataStrategy: "clean_and_apply",
    captureDateMode: "today",
    captureTimeMode: "current",
    captureProfileKey: "default",
    preserveIcc: true,
    preserveGps: false,
    preserveCreator: true,
    addSoftwareTag: true,
    batchNamingPattern: "canon_sequence",
    batchTimingMode: "natural",
  });

  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Batch progress state
  const [batchCurrent, setBatchCurrent] = useState<number>(1);
  const [batchCurrentFilename, setBatchCurrentFilename] = useState<string>("");

  // Result state
  const [singleResult, setSingleResult] = useState<{
    blobUrl: string;
    filename: string;
    summary: any;
    validation: ValidationResult;
    diff: MetadataDiffItem[];
    c2paAction: "removed" | "preserved" | "absent" | null;
  } | null>(null);

  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([]);

  // Initialize frame counter from localStorage or random
  useEffect(() => {
    try {
      const saved = localStorage.getItem("canon_last_frame_number");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setOptions((prev) => ({ ...prev, batchStartFrame: parsed }));
          return;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setOptions((prev) => ({ ...prev, batchStartFrame: getRandomCanonFrame() }));
  }, []);

  // Cleanup object URLs on unmount or reset
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      });
      if (singleResult?.blobUrl) URL.revokeObjectURL(singleResult.blobUrl);
      batchResults.forEach((br) => {
        if (br.downloadUrl) URL.revokeObjectURL(br.downloadUrl);
      });
    };
  }, [items, singleResult, batchResults]);

  // Inspect an image via /api/inspect
  const inspectFile = async (file: File): Promise<InspectResult | null> => {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/inspect", { method: "POST", body: formData });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // Add new files to the queue and inspect them
  const handleFilesSelect = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Clear previous results
    if (singleResult?.blobUrl) URL.revokeObjectURL(singleResult.blobUrl);
    batchResults.forEach((br) => {
      if (br.downloadUrl) URL.revokeObjectURL(br.downloadUrl);
    });
    setSingleResult(null);
    setBatchResults([]);
    setErrorMessage(null);

    const newItems: DropzoneItem[] = newFiles.map((f, i) => ({
      id: `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      inspection: null,
      status: "inspecting",
    }));

    setItems((prev) => [...prev, ...newItems]);
    setStatus("inspecting");

    // Inspect each new file
    for (const item of newItems) {
      const insp = await inspectFile(item.file);
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, inspection: insp, status: "ready" } : it
        )
      );
    }

    setStatus("ready");
  }, [singleResult, batchResults]);

  // Remove a single item from the batch queue
  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => {
      const found = prev.find((it) => it.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      const next = prev.filter((it) => it.id !== id);
      if (next.length === 0) {
        setStatus("idle");
      }
      return next;
    });
  }, []);

  // Clear all items and reset
  const handleClearAll = useCallback(() => {
    items.forEach((it) => {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    });
    if (singleResult?.blobUrl) URL.revokeObjectURL(singleResult.blobUrl);
    batchResults.forEach((br) => {
      if (br.downloadUrl) URL.revokeObjectURL(br.downloadUrl);
    });

    setItems([]);
    setSingleResult(null);
    setBatchResults([]);
    setStatus("idle");
    setErrorMessage(null);
  }, [items, singleResult, batchResults]);

  // Process single or batch items
  const handleProcess = async () => {
    if (items.length === 0) return;

    setStatus("processing");
    setErrorMessage(null);

    const isBatch = items.length > 1;
    const count = items.length;

    // 1. Calculate timestamps progression across the batch
    const activeDate = options.customDate || new Date().toISOString().split("T")[0];
    const activeTime = options.customTime || new Date().toTimeString().split(" ")[0];
    const timestamps = calculateBatchTimestamps(
      activeDate,
      activeTime,
      count,
      options.batchTimingMode || "natural",
      options.batchCustomSeconds
    );

    // 2. Calculate filenames
    const startFrame = options.batchStartFrame || 4819;
    const canonNames = generateCanonSequence(startFrame, count);

    const results: BatchResultItem[] = [];

    try {
      for (let i = 0; i < count; i++) {
        const item = items[i];
        setBatchCurrent(i + 1);
        setBatchCurrentFilename(item.file.name);

        // Determine this item's specific filename
        let targetFilename: string;
        if (isBatch) {
          if (options.batchNamingPattern === "canon_sequence") {
            targetFilename = canonNames[i];
          } else {
            targetFilename = getOutputFilename(item.file.name);
          }
        } else {
          targetFilename = options.customOutputFilename || getOutputFilename(item.file.name);
        }

        const itemTimestamp = timestamps[i] || timestamps[0];

        // Prepare request
        const formData = new FormData();
        formData.append("image", item.file);
        formData.append(
          "options",
          JSON.stringify({
            ...options,
            captureDateMode: "custom",
            customDate: itemTimestamp.date,
            captureTimeMode: "custom",
            customTime: itemTimestamp.time,
            customOutputFilename: targetFilename,
          })
        );

        const res = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(
            errData.error || `Failed to process ${item.file.name} (HTTP ${res.status})`
          );
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        const validationHeader = res.headers.get("x-metadata-validation");
        const diffHeader = res.headers.get("x-metadata-diff");
        const summaryHeader = res.headers.get("x-metadata-summary");
        const c2paHeader = res.headers.get("x-c2pa-action") as "removed" | "preserved" | "absent" | null;
        const filenameHeader = res.headers.get("x-output-filename") || targetFilename;

        const validation = validationHeader ? JSON.parse(atob(validationHeader)) : { passed: true, checks: [], warnings: [], errors: [] };
        const diff = diffHeader ? JSON.parse(atob(diffHeader)) : [];
        const summary = summaryHeader ? JSON.parse(atob(summaryHeader)) : {
          camera: "Canon EOS 70D",
          lens: "EF-S 55-250mm f/4-5.6 IS II",
          captureTime: `${itemTimestamp.date} ${itemTimestamp.time}`,
          settings: "1/640s • f/4.0 • ISO 100",
          dimensions: `${item.inspection?.width || 5472} × ${item.inspection?.height || 3648}`,
          colorSpace: "sRGB",
        };

        results.push({
          id: item.id,
          originalName: item.file.name,
          outputFilename: filenameHeader,
          previewUrl: item.previewUrl,
          downloadUrl: blobUrl,
          summary,
          c2paAction: c2paHeader,
          validation,
          diff,
        });
      }

      // Save next frame number to localStorage for continuous numbering
      try {
        const nextStartFrame = ((startFrame + count - 1) % 9999) + 1;
        localStorage.setItem("canon_last_frame_number", String(nextStartFrame));
        setOptions((prev) => ({ ...prev, batchStartFrame: nextStartFrame }));
      } catch {
        // Ignore localStorage error
      }

      if (isBatch) {
        setBatchResults(results);
      } else {
        const first = results[0];
        setSingleResult({
          blobUrl: first.downloadUrl,
          filename: first.outputFilename,
          summary: first.summary,
          validation: first.validation!,
          diff: first.diff!,
          c2paAction: first.c2paAction ?? null,
        });
      }

      setStatus("complete");
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred during processing.");
    }
  };

  const isCompleted = status === "complete" && (singleResult !== null || batchResults.length > 0);
  const singleInspection = items.length === 1 ? items[0].inspection : null;

  return (
    <main className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-red-600/10 blur-[130px] rounded-full" />
      </div>

      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 shadow-sm">
            <Camera className="w-3.5 h-3.5 text-red-500" />
            <span className="font-semibold tracking-wide text-slate-200">Canon EOS 70D</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">EF-S 55-250mm f/4-5.6 IS II</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            GhostShutter
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Apply authentic physical camera profile, realistic capture timing, and Photoshop Save As naming to AI-edited images.
          </p>
        </header>

        {/* Main Card */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-xl p-6 shadow-2xl shadow-black/60 space-y-6">
          {/* 1. Multi-File Dropzone */}
          {!isCompleted && (
            <ImageDropzone
              items={items}
              isLoading={status === "processing" || status === "validating"}
              onFilesSelect={handleFilesSelect}
              onRemoveItem={handleRemoveItem}
              onClearAll={handleClearAll}
            />
          )}

          {/* 2. Status Banner with Batch Progress Tracking */}
          <ProcessingStatus
            status={status}
            errorMessage={errorMessage}
            batchTotal={items.length}
            batchCurrent={batchCurrent}
            batchCurrentFilename={batchCurrentFilename}
            c2paAction={
              singleResult?.c2paAction ?? (batchResults.length > 0 ? "removed" : null)
            }
          />

          {/* 3. Pre-process Preview & Options */}
          {items.length > 0 && !isCompleted && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Single item preview if 1 item */}
              {items.length === 1 && singleInspection && (
                <MetadataPreview inspection={singleInspection} options={options} />
              )}

              {/* Options Card - Handles Single and Batch */}
              <ProcessingOptions
                options={options}
                inspection={singleInspection}
                fileName={items[0]?.file.name}
                itemCount={items.length}
                onChange={setOptions}
              />

              {/* Process Action Button */}
              <button
                type="button"
                onClick={handleProcess}
                disabled={status === "processing" || status === "validating"}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-950/50 flex items-center justify-center gap-2.5 transition-all duration-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transform active:scale-[0.99]"
              >
                <Zap className="w-4 h-4 fill-white" />
                {items.length > 1
                  ? `Apply Camera Profile to All (${items.length}) Images`
                  : "Process Image & Apply Metadata"}
              </button>
            </div>
          )}

          {/* 4. Post-processing Result (Single & Batch Modes) */}
          {isCompleted && (
            <DownloadResult
              downloadUrl={singleResult?.blobUrl}
              filename={singleResult?.filename}
              summary={singleResult?.summary}
              validation={singleResult?.validation}
              diff={singleResult?.diff}
              batchItems={batchResults}
              onReset={handleClearAll}
            />
          )}
        </div>

        {/* Footer Privacy & System Badges */}
        <footer className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Local & Ephemeral Processing</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span>ExifTool Subprocess Engine</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Multi-Image Batch Enabled</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
