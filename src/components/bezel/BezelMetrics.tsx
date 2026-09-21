import React from "react";
import { Layers, Warehouse, Factory, ArrowRightLeft, ShieldAlert } from "lucide-react";
import { BezelReference } from "../../types";

interface BezelMetricsProps {
  references: BezelReference[];
  totalStock1: number;
  totalStock2: number;
  totalStock: number;
}

export default function BezelMetrics({
  references,
  totalStock1,
  totalStock2,
  totalStock,
}: BezelMetricsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {/* Stock 1 Card */}
      <div
        id="bezel-metric-stock-1"
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs transition-all hover:border-slate-300"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Warehouse className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              STOCK 1 (INCOMING / AVAILABLE)
            </span>
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
            {totalStock1.toLocaleString()}
          </div>
          <span className="text-xs text-slate-500 font-medium">units</span>
        </div>
      </div>

      {/* Stock 2 Card */}
      <div
        id="bezel-metric-stock-2"
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs transition-all hover:border-slate-300"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Factory className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              STOCK 2 (ASSEMBLED / READY)
            </span>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            Ready for Delivery
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
            {totalStock2.toLocaleString()}
          </div>
          <span className="text-xs text-slate-500 font-medium">units</span>
        </div>
      </div>

      {/* Total Bezel Inventory */}
      <div
        id="bezel-metric-total"
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs transition-all hover:border-slate-300"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              TOTAL BEZEL INVENTORY
            </span>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
            {references.length} References
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
            {totalStock.toLocaleString()}
          </div>
          <span className="text-xs text-slate-500 font-medium">units</span>
        </div>
      </div>
    </div>
  );
}
