import React from "react";
import { Truck, Cpu, Send, RotateCcw, Trash2, Plus, Sparkles } from "lucide-react";
import { UserRole } from "../../types";

export type BezelActiveModal =
  | null
  | "new_truck"
  | "assemblage"
  | "delivery"
  | "return"
  | "scrap"
  | "add_reference";

interface BezelActionButtonsProps {
  onOpenModal: (modal: BezelActiveModal) => void;
  userRole: UserRole;
  isSeeding?: boolean;
  onSeed?: () => void;
  hasReferences: boolean;
}

export default function BezelActionButtons({
  onOpenModal,
  userRole,
  isSeeding,
  onSeed,
  hasReferences,
}: BezelActionButtonsProps) {
  const isManager = userRole === "admin" || userRole === "supervisor";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Bezel Operations
          </h2>
        </div>

        {isManager && (
          <div className="flex items-center gap-2">
            {!hasReferences && onSeed && (
              <button
                onClick={onSeed}
                disabled={isSeeding}
                id="bezel-seed-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold tracking-wide transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{isSeeding ? "Seeding..." : "Load Initial References"}</span>
              </button>
            )}
            <button
              onClick={() => onOpenModal("add_reference")}
              id="bezel-open-add-ref-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold tracking-wide transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Reference</span>
            </button>
          </div>
        )}
      </div>

      {/* 5 Main Industrial Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* 1. NEW TRUCK */}
        <button
          onClick={() => onOpenModal("new_truck")}
          id="bezel-btn-new-truck"
          className="flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-blue-900 transition-all cursor-pointer group shadow-2xs active:scale-[0.98] hover:border-blue-300 text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
            <Truck className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold tracking-wide uppercase">
            NEW TRUCK
          </span>
          <span className="text-[10px] text-blue-700/80 font-medium mt-0.5">
            + Stock 1 / Stock 2
          </span>
        </button>

        {/* 2. ASSEMBLAGE */}
        <button
          onClick={() => onOpenModal("assemblage")}
          id="bezel-btn-assemblage"
          className="flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 transition-all cursor-pointer group shadow-2xs active:scale-[0.98] hover:border-emerald-300 text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold tracking-wide uppercase">
            ASSEMBLAGE
          </span>
          <span className="text-[10px] text-emerald-700/80 font-medium mt-0.5">
            Stock 1 → Stock 2
          </span>
        </button>

        {/* 3. DELIVERY */}
        <button
          onClick={() => onOpenModal("delivery")}
          id="bezel-btn-delivery"
          className="flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-purple-200 bg-purple-50/50 hover:bg-purple-50 text-purple-900 transition-all cursor-pointer group shadow-2xs active:scale-[0.98] hover:border-purple-300 text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
            <Send className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold tracking-wide uppercase">
            DELIVERY
          </span>
          <span className="text-[10px] text-purple-700/80 font-medium mt-0.5">
            Stock 2 → OUT
          </span>
        </button>

        {/* 4. RETURN */}
        <button
          onClick={() => onOpenModal("return")}
          id="bezel-btn-return"
          className="flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-amber-900 transition-all cursor-pointer group shadow-2xs active:scale-[0.98] hover:border-amber-300 text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
            <RotateCcw className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold tracking-wide uppercase">
            RETURN
          </span>
          <span className="text-[10px] text-amber-700/80 font-medium mt-0.5">
            Stock 2 → Stock 1
          </span>
        </button>

        {/* 5. SCRAP / NOK */}
        <button
          onClick={() => onOpenModal("scrap")}
          id="bezel-btn-scrap"
          className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-rose-900 transition-all cursor-pointer group shadow-2xs active:scale-[0.98] hover:border-rose-300 text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
            <Trash2 className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold tracking-wide uppercase">
            SCRAP / NOK
          </span>
          <span className="text-[10px] text-rose-700/80 font-medium mt-0.5">
            S1 or S2 → SCRAP
          </span>
        </button>
      </div>
    </div>
  );
}
