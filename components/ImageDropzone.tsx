"use client";

import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, Image as ImageIcon, X, FileCheck, Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { InspectResult } from "@/lib/types";

export interface DropzoneItem {
  id: string;
  file: File;
  previewUrl: string;
  inspection: InspectResult | null;
  status?: string;
  error?: string;
}

interface ImageDropzoneProps {
  items: DropzoneItem[];
  isLoading: boolean;
  onFilesSelect: (files: File[]) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

export function ImageDropzone({
  items,
  isLoading,
  onFilesSelect,
  onRemoveItem,
  onClearAll,
}: ImageDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Support clipboard paste (Cmd+V / Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const pasteFiles: File[] = [];
        for (let i = 0; i < e.clipboardData.files.length; i++) {
          const item = e.clipboardData.files[i];
          if (item.type.startsWith("image/") || item.name.match(/\.(jpe?g|png|webp|tiff?|heic)$/i)) {
            pasteFiles.push(item);
          }
        }
        if (pasteFiles.length > 0) {
          onFilesSelect(pasteFiles);
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFilesSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles: File[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const droppedFile = e.dataTransfer.files[i];
        if (droppedFile.type.startsWith("image/") || droppedFile.name.match(/\.(jpe?g|png|webp|tiff?|heic)$/i)) {
          validFiles.push(droppedFile);
        }
      }
      if (validFiles.length > 0) {
        onFilesSelect(validFiles);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      onFilesSelect(selectedFiles);
      // Reset input value so re-selecting same files triggers change
      e.target.value = "";
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Hidden multi-file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif"
      className="hidden"
      onChange={handleInputChange}
    />
  );

  // 1. Multi-Item Batch Queue View
  if (items.length > 1) {
    const totalSize = items.reduce((acc, it) => acc + it.file.size, 0);
    const c2paCount = items.filter((it) => it.inspection?.hasC2pa).length;

    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border transition-all duration-200 p-4 space-y-3 ${
          isDragOver
            ? "border-red-500 bg-red-950/20"
            : "border-slate-800 bg-slate-900/60"
        }`}
      >
        {fileInput}

        {/* Batch Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                Batch Queue ({items.length} Images)
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/50 text-red-300 border border-red-800/40">
                Total: {formatBytes(totalSize)}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Canon EOS 70D metadata and settings will be applied to all {items.length} images.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-red-400" />
              Add More
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 text-xs font-medium border border-slate-800 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>

        {/* C2PA summary banner if any detected */}
        {c2paCount > 0 && (
          <div className="px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-800/40 text-purple-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>
              <strong>{c2paCount} of {items.length} images</strong> contain C2PA Content Credentials. Unwanted AI provenance manifests will be removed cleanly.
            </span>
          </div>
        )}

        {/* Batch Images List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-colors"
            >
              <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 shrink-0 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[9px] font-mono uppercase bg-black/80 text-slate-300">
                  #{idx + 1}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-medium text-slate-200 truncate" title={item.file.name}>
                    {item.file.name}
                  </h4>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    disabled={isLoading}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
                    title="Remove from batch"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <span>{formatBytes(item.file.size)}</span>
                  {item.inspection && (
                    <>
                      <span>•</span>
                      <span>{item.inspection.width} × {item.inspection.height}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1.5">
                  {item.inspection ? (
                    item.inspection.hasC2pa ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                        C2PA Detected
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/30">
                        Ready
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Inspecting
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Single Item Preview View
  if (items.length === 1) {
    const single = items[0];
    return (
      <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 transition-all duration-200">
        {fileInput}
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="relative w-full sm:w-44 h-36 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={single.previewUrl}
              alt="Uploaded Preview"
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-black/75 text-slate-300 border border-white/10">
              {single.inspection?.format || single.file.name.split(".").pop()}
            </div>
          </div>

          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start justify-between gap-2">
              <div className="truncate">
                <h3 className="text-sm font-semibold text-slate-100 truncate" title={single.file.name}>
                  {single.file.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatBytes(single.file.size)}
                  {single.inspection && ` • ${single.inspection.width} × ${single.inspection.height} px`}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                  title="Add more images to create a batch"
                >
                  <Plus className="w-3.5 h-3.5 text-red-400" />
                  Add More
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={isLoading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors disabled:opacity-50"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/50">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                Valid image format
              </span>
              {single.inspection?.hasIcc && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-950/50 text-blue-300 border border-blue-800/40">
                  ICC Profile
                </span>
              )}
              {single.inspection?.hasGps && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-950/50 text-amber-300 border border-amber-800/40">
                  Existing GPS detected
                </span>
              )}
              {single.inspection?.hasC2pa && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-purple-950/50 text-purple-300 border border-purple-800/40">
                  Content Credentials
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Empty Dropzone View
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`group relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
        isDragOver
          ? "border-red-500 bg-red-950/20 scale-[1.008]"
          : "border-slate-700 hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/70"
      }`}
    >
      {fileInput}

      <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 group-hover:scale-105 group-hover:text-white group-hover:border-red-500/50 group-hover:bg-red-950/30 transition-all duration-200">
        <UploadCloud className="w-7 h-7" />
      </div>

      <h3 className="mt-4 text-base font-medium text-slate-200">
        Drop edited images here
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Upload a single image or drop 6–7+ photos at once for batch processing
      </p>

      <div className="mt-4 flex items-center justify-center gap-3 text-[11px] font-mono text-slate-500 uppercase">
        <span>JPEG</span>
        <span>•</span>
        <span>PNG</span>
        <span>•</span>
        <span>WebP</span>
        <span>•</span>
        <span>TIFF</span>
      </div>
    </div>
  );
}
