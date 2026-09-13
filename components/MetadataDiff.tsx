"use client";

import React from "react";
import { MetadataDiffItem } from "@/lib/types";
import { Plus, RefreshCw, Check, Minus } from "lucide-react";

interface MetadataDiffProps {
  diff: MetadataDiffItem[];
}

export function MetadataDiff({ diff }: MetadataDiffProps) {
  const renderStatusBadge = (item: MetadataDiffItem) => {
    switch (item.status) {
      case "added":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">
            <Plus className="w-3 h-3" /> Added
          </span>
        );
      case "modified":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/40 text-amber-400 border border-amber-900/40">
            <RefreshCw className="w-3 h-3" /> Updated
          </span>
        );
      case "preserved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/40 text-blue-400 border border-blue-900/40">
            <Check className="w-3 h-3" /> Preserved
          </span>
        );
      case "removed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/40 text-rose-400 border border-rose-900/40">
            <Minus className="w-3 h-3" /> Stripped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
            Unchanged
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden text-xs">
      <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 font-semibold text-slate-300 flex items-center justify-between">
        <span>Metadata Changes Diff</span>
        <span className="text-[11px] text-slate-400 font-normal">Before vs After</span>
      </div>

      <div className="divide-y divide-slate-800/60">
        {diff.map((item, idx) => (
          <div
            key={idx}
            className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/30 transition-colors"
          >
            <div className="flex items-center gap-2 sm:w-1/3">
              <span className="font-medium text-slate-200">{item.field}</span>
              {renderStatusBadge(item)}
            </div>

            <div className="flex-1 flex items-center gap-3 font-mono text-[11px] truncate">
              {item.before && item.before !== "None" && (
                <>
                  <span className="text-slate-500 line-through truncate max-w-[180px]">
                    {item.before}
                  </span>
                  <span className="text-slate-600">→</span>
                </>
              )}
              <span className="text-slate-200 font-semibold truncate">{item.after}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
