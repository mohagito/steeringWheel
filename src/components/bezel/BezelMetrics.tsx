import React from "react";
import { Layers, Warehouse, Factory, ArrowUpRight } from "lucide-react";
import { BezelReference, UserRole } from "../../types";
import { getBezelPrice } from "../../services/bezelService";

interface BezelMetricsProps {
  references: BezelReference[];
  totalStock1: number;
  totalStock2: number;
  totalStock: number;
  onViewEvaluation?: () => void;
  userRole?: UserRole;
}

export default function BezelMetrics({
  references,
  totalStock1,
  totalStock2,
  totalStock,
  onViewEvaluation,
  userRole
}: BezelMetricsProps) {
  const isOperator = userRole === "operator";

  const stock1Valuation = references.reduce(
    (sum, r) => sum + (r.stock1 || 0) * getBezelPrice(r),
    0
  );
  const stock2Valuation = references.reduce(
    (sum, r) => sum + (r.stock2 || 0) * getBezelPrice(r),
    0
  );
  const totalValuation = stock1Valuation + stock2Valuation;

  const s1Share = totalValuation > 0 ? (stock1Valuation / totalValuation) * 100 : 0;
  const s2Share = totalValuation > 0 ? (stock2Valuation / totalValuation) * 100 : 0;

  const formatEuro = (amount: number) => {
    return `€ ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              STOCK 1 (RAW)
            </span>
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
            {totalStock1.toLocaleString()}
          </div>
          <span className="text-xs text-slate-500 font-medium font-mono">units</span>
        </div>
        {!isOperator ? (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-baseline justify-between font-mono">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Valuation
            </span>
            <div className="text-right">
              <span className="text-xs font-bold text-amber-800">
                {formatEuro(stock1Valuation)}
              </span>
              <span className="text-[10px] text-slate-400 ml-1.5 font-medium">
                ({s1Share.toFixed(0)}%)
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between font-mono text-[11px] text-slate-500">
            <span className="font-semibold uppercase text-slate-400">Type</span>
            <span className="font-bold text-amber-800">Raw Materials</span>
          </div>
        )}
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              STOCK 2 (READY)
            </span>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            Ready
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
            {totalStock2.toLocaleString()}
          </div>
          <span className="text-xs text-slate-500 font-medium font-mono">units</span>
        </div>
        {!isOperator ? (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-baseline justify-between font-mono">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Valuation
            </span>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-800">
                {formatEuro(stock2Valuation)}
              </span>
              <span className="text-[10px] text-slate-400 ml-1.5 font-medium">
                ({s2Share.toFixed(0)}%)
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between font-mono text-[11px] text-slate-500">
            <span className="font-semibold uppercase text-slate-400">Type</span>
            <span className="font-bold text-emerald-800">Ready to Dispatch</span>
          </div>
        )}
      </div>

      {/* Total Bezel Inventory */}
      <div
        id="bezel-metric-total"
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs transition-all hover:border-slate-300 relative group"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              TOTAL BEZEL STOCK
            </span>
          </div>
          {!isOperator && onViewEvaluation && (
            <button
              onClick={onViewEvaluation}
              className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors"
              title="Open Stock Evaluation details"
            >
              <span>Evaluation</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
            {totalStock.toLocaleString()}
          </div>
          <span className="text-xs text-slate-500 font-medium font-mono">{references.length} refs</span>
        </div>
        {!isOperator ? (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-baseline justify-between font-mono">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Total Valuation
            </span>
            <span className="text-xs font-black text-indigo-900">
              {formatEuro(totalValuation)}
            </span>
          </div>
        ) : (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between font-mono text-[11px] text-slate-500">
            <span className="font-semibold uppercase text-slate-400">Status</span>
            <span className="font-bold text-indigo-900">Live Inventory Active</span>
          </div>
        )}
      </div>
    </div>
  );
}
