import React, { useState, useMemo } from "react";
import {
  BezelReference,
  User,
  BezelOperation
} from "../../types";
import {
  executeBezelPhysicalInventory,
  BezelInventoryReconciliationEntry
} from "../../services/bezelService";
import {
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Layers,
  Info,
  Calendar,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Hash
} from "lucide-react";

interface BezelInventoryWorkspaceProps {
  references: BezelReference[];
  currentUser: User;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface PhysicalCountState {
  stock1: string; // empty string means untouched
  stock2: string;
}

export default function BezelInventoryWorkspace({
  references,
  currentUser,
  onSuccess,
  onError
}: BezelInventoryWorkspaceProps) {
  const isManager = currentUser.role === "admin" || currentUser.role === "supervisor";

  // Per-reference physical count input states
  const [counts, setCounts] = useState<Record<string, PhysicalCountState>>({});
  const [inventoryNotes, setInventoryNotes] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Update a single count input
  const handleCountChange = (
    refCode: string,
    stockType: "stock1" | "stock2",
    value: string
  ) => {
    // Only allow non-negative integers or empty string
    if (value !== "" && (!/^\d+$/.test(value) || parseInt(value, 10) < 0)) {
      return;
    }
    setCounts((prev) => ({
      ...prev,
      [refCode]: {
        stock1: stockType === "stock1" ? value : prev[refCode]?.stock1 ?? "",
        stock2: stockType === "stock2" ? value : prev[refCode]?.stock2 ?? ""
      }
    }));
  };

  // Helper: Reset all physical counts
  const handleResetCounts = () => {
    setCounts({});
  };

  // Filtered references
  const filteredReferences = useMemo(() => {
    if (!searchQuery.trim()) return references;
    const q = searchQuery.toLowerCase().trim();
    return references.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.client && r.client.toLowerCase().includes(q))
    );
  }, [references, searchQuery]);

  // Compute planned reconciliation entries across all references
  const plannedAdjustments = useMemo(() => {
    const list: BezelInventoryReconciliationEntry[] = [];

    references.forEach((ref) => {
      const state = counts[ref.code];
      if (!state) return;

      // Check Stock 1
      if (state.stock1 !== "") {
        const physical = parseInt(state.stock1, 10);
        const system = ref.stock1 || 0;
        if (!isNaN(physical) && physical !== system) {
          list.push({
            reference: ref.code,
            stockType: "STOCK 1",
            previousSystemQuantity: system,
            physicalQuantity: physical,
            difference: physical - system
          });
        }
      }

      // Check Stock 2
      if (state.stock2 !== "") {
        const physical = parseInt(state.stock2, 10);
        const system = ref.stock2 || 0;
        if (!isNaN(physical) && physical !== system) {
          list.push({
            reference: ref.code,
            stockType: "STOCK 2",
            previousSystemQuantity: system,
            physicalQuantity: physical,
            difference: physical - system
          });
        }
      }
    });

    return list;
  }, [references, counts]);

  // Summary Metrics
  const totalSystemStock = references.reduce(
    (sum, r) => sum + (r.stock1 || 0) + (r.stock2 || 0),
    0
  );

  const totalCountedStock = useMemo(() => {
    return references.reduce((sum, r) => {
      const s = counts[r.code];
      const s1 = s && s.stock1 !== "" ? parseInt(s.stock1, 10) : r.stock1 || 0;
      const s2 = s && s.stock2 !== "" ? parseInt(s.stock2, 10) : r.stock2 || 0;
      return sum + (isNaN(s1) ? 0 : s1) + (isNaN(s2) ? 0 : s2);
    }, 0);
  }, [references, counts]);

  const netAdjustment = totalCountedStock - totalSystemStock;

  // Open confirmation modal or display warning if no changes
  const handleOpenUpdateModal = () => {
    if (!isManager) {
      onError("Manager authorization required. Only managers can update stock inventory.");
      return;
    }

    if (plannedAdjustments.length === 0) {
      onError("No stock variances detected. Please enter physical counts that differ from system stock.");
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Submit Inventory Adjustment atomically to Firestore
  const handleConfirmInventory = async () => {
    if (!isManager) {
      onError("Unauthorized: Only Managers can confirm physical inventory reconciliation.");
      return;
    }

    if (plannedAdjustments.length === 0) {
      setIsConfirmModalOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await executeBezelPhysicalInventory({
        adjustments: plannedAdjustments,
        managerName: currentUser.fullName,
        managerId: currentUser.id,
        notes: inventoryNotes.trim() || undefined
      });

      onSuccess(
        `Physical inventory reconciliation applied successfully! ${result.operations.length} authoritative stock adjustments recorded.`
      );

      // Clear count state after successful commit
      setCounts({});
      setInventoryNotes("");
      setIsConfirmModalOpen(false);
    } catch (err: any) {
      console.error("[BezelInventory] Execution error:", err);
      onError(err.message || "Failed to commit physical inventory to Firestore.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="bezel-stock-inventory-workspace">
      {/* 1. Header Banner & Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ClipboardCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Stock Inventory & Physical Reconciliation
              </h2>
            </div>
          </div>

          {/* Action Button: UPDATE INVENTORY */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {Object.keys(counts).length > 0 && (
              <button
                type="button"
                onClick={handleResetCounts}
                className="px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-300 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer flex items-center gap-1.5"
                title="Clear all physical counts"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Counts</span>
              </button>
            )}

            <button
              type="button"
              id="bezel-update-inventory-btn"
              onClick={handleOpenUpdateModal}
              disabled={!isManager || plannedAdjustments.length === 0 || isSubmitting}
              className={`px-4 sm:px-5 py-2.5 rounded-xl font-bold font-mono text-xs sm:text-sm tracking-wide transition-all flex items-center gap-2 shadow-sm cursor-pointer ${
                isManager && plannedAdjustments.length > 0
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95"
                  : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed"
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>UPDATE INVENTORY</span>
              {plannedAdjustments.length > 0 && (
                <span className="px-1.5 py-0.5 bg-emerald-800 text-emerald-100 rounded-full text-[10px] font-mono">
                  {plannedAdjustments.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Manager Permission Notice if user is an Operator */}
        {!isManager && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 font-medium">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Manager Access Required:</strong> Physical inventory count updates and stock overrides can only be committed by a Manager or Supervisor.
            </span>
          </div>
        )}
      </div>

      {/* 2. Summary KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono uppercase tracking-wider mb-1">
            <span>References</span>
            <Hash className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
            {references.length}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">Catalog items</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono uppercase tracking-wider mb-1">
            <span>System Stock</span>
            <Layers className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-600 font-mono">
            {totalSystemStock.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">Authoritative base</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono uppercase tracking-wider mb-1">
            <span>Physical Counted</span>
            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
            {totalCountedStock.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">Current inventory entry</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono uppercase tracking-wider mb-1">
            <span>Net Adjustment</span>
            {netAdjustment > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            ) : netAdjustment < 0 ? (
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            ) : (
              <span className="text-slate-400 text-xs">0</span>
            )}
          </div>
          <div
            className={`text-xl sm:text-2xl font-black font-mono ${
              netAdjustment > 0
                ? "text-emerald-600"
                : netAdjustment < 0
                ? "text-rose-600"
                : "text-slate-700"
            }`}
          >
            {netAdjustment > 0 ? `+${netAdjustment.toLocaleString()}` : netAdjustment.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            {plannedAdjustments.length} adjustment{plannedAdjustments.length === 1 ? "" : "s"} pending
          </div>
        </div>
      </div>

      {/* 3. Main Physical Inventory Table: REFERENCE | STOCK 1 | STOCK 2 */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Filter Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
              Bezel Physical Inventory Table
            </h3>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search reference or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="bezel-inventory-main-table">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-mono uppercase font-bold text-slate-600 tracking-wider">
                <th className="py-3.5 px-4 sm:px-6 w-1/3">REFERENCE</th>
                <th className="py-3.5 px-4 sm:px-6 w-1/3">STOCK 1</th>
                <th className="py-3.5 px-4 sm:px-6 w-1/3">STOCK 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono">
              {filteredReferences.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-sans">No Bezel references found.</p>
                  </td>
                </tr>
              ) : (
                filteredReferences.map((ref) => {
                  const state = counts[ref.code] || { stock1: "", stock2: "" };

                  const s1Val = ref.stock1 || 0;
                  const s2Val = ref.stock2 || 0;

                  const s1Counted = state.stock1 !== "" ? parseInt(state.stock1, 10) : null;
                  const s2Counted = state.stock2 !== "" ? parseInt(state.stock2, 10) : null;

                  const s1Diff = s1Counted !== null && !isNaN(s1Counted) ? s1Counted - s1Val : null;
                  const s2Diff = s2Counted !== null && !isNaN(s2Counted) ? s2Counted - s2Val : null;

                  return (
                    <tr
                      key={ref.code}
                      className="hover:bg-slate-50/70 transition-colors"
                      id={`bezel-inventory-row-${ref.code}`}
                    >
                      {/* Column 1: REFERENCE */}
                      <td className="py-4 px-4 sm:px-6 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 font-mono tracking-tight">
                              {ref.code}
                            </span>
                            {ref.client && (
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                                {ref.client}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-sans leading-tight">
                            {ref.description}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            System Total:{" "}
                            <strong className="text-slate-700">
                              {((ref.stock1 || 0) + (ref.stock2 || 0)).toLocaleString()} PCS
                            </strong>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: STOCK 1 */}
                      <td className="py-4 px-4 sm:px-6 align-top">
                        <div className="space-y-2 p-3 bg-slate-50/70 rounded-xl border border-slate-200/60">
                          {/* Current System Stock */}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">System Stock 1:</span>
                            <span className="font-bold text-slate-800 text-xs font-mono">
                              {s1Val.toLocaleString()} PCS
                            </span>
                          </div>

                          {/* Physical Count Input */}
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase">
                              Physical Count:
                            </label>
                            <input
                              type="number"
                              min="0"
                              disabled={!isManager}
                              placeholder={s1Val.toString()}
                              value={state.stock1}
                              onChange={(e) => handleCountChange(ref.code, "stock1", e.target.value)}
                              className={`w-full px-3 py-1.5 bg-white border text-xs font-mono font-bold rounded-lg focus:outline-none focus:ring-2 transition-all ${
                                s1Diff !== null && s1Diff !== 0
                                  ? s1Diff > 0
                                    ? "border-emerald-400 ring-emerald-400/20 text-emerald-700"
                                    : "border-rose-400 ring-rose-400/20 text-rose-700"
                                  : "border-slate-300 focus:border-slate-500 text-slate-900"
                              }`}
                            />
                          </div>

                          {/* Live Adjustment / Difference */}
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60">
                            <span className="text-slate-400 font-mono">ADJUSTMENT:</span>
                            {s1Diff === null ? (
                              <span className="text-slate-400 font-mono font-medium">Untouched</span>
                            ) : s1Diff === 0 ? (
                              <span className="font-mono font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                0 PCS (No change)
                              </span>
                            ) : s1Diff > 0 ? (
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-emerald-600" />
                                +{s1Diff.toLocaleString()} PCS
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <TrendingDown className="w-3 h-3 text-rose-600" />
                                {s1Diff.toLocaleString()} PCS
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 3: STOCK 2 */}
                      <td className="py-4 px-4 sm:px-6 align-top">
                        <div className="space-y-2 p-3 bg-slate-50/70 rounded-xl border border-slate-200/60">
                          {/* Current System Stock */}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">System Stock 2:</span>
                            <span className="font-bold text-slate-800 text-xs font-mono">
                              {s2Val.toLocaleString()} PCS
                            </span>
                          </div>

                          {/* Physical Count Input */}
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase">
                              Physical Count:
                            </label>
                            <input
                              type="number"
                              min="0"
                              disabled={!isManager}
                              placeholder={s2Val.toString()}
                              value={state.stock2}
                              onChange={(e) => handleCountChange(ref.code, "stock2", e.target.value)}
                              className={`w-full px-3 py-1.5 bg-white border text-xs font-mono font-bold rounded-lg focus:outline-none focus:ring-2 transition-all ${
                                s2Diff !== null && s2Diff !== 0
                                  ? s2Diff > 0
                                    ? "border-emerald-400 ring-emerald-400/20 text-emerald-700"
                                    : "border-rose-400 ring-rose-400/20 text-rose-700"
                                  : "border-slate-300 focus:border-slate-500 text-slate-900"
                              }`}
                            />
                          </div>

                          {/* Live Adjustment / Difference */}
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60">
                            <span className="text-slate-400 font-mono">ADJUSTMENT:</span>
                            {s2Diff === null ? (
                              <span className="text-slate-400 font-mono font-medium">Untouched</span>
                            ) : s2Diff === 0 ? (
                              <span className="font-mono font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                0 PCS (No change)
                              </span>
                            ) : s2Diff > 0 ? (
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-emerald-600" />
                                +{s2Diff.toLocaleString()} PCS
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <TrendingDown className="w-3 h-3 text-rose-600" />
                                {s2Diff.toLocaleString()} PCS
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Bottom Sticky Action Confirmation Bar (Visible when there are pending adjustments) */}
      {plannedAdjustments.length > 0 && isManager && (
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/30">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-emerald-400">
                {plannedAdjustments.length} Physical Reconciliation Adjustment{plannedAdjustments.length === 1 ? "" : "s"} Ready
              </div>
              <div className="text-[11px] text-slate-300">
                Net change:{" "}
                <strong className={netAdjustment >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {netAdjustment >= 0 ? `+${netAdjustment.toLocaleString()}` : netAdjustment.toLocaleString()} PCS
                </strong>{" "}
                across {new Set(plannedAdjustments.map((a) => a.reference)).size} references
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenUpdateModal}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs sm:text-sm tracking-wide shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
          >
            <span>REVIEW & CONFIRM RECONCILIATION</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5. Atomic Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b border-slate-100 pb-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans">
                    Confirm Bezel Stock Reconciliation
                  </h3>
                  <div className="text-xs text-slate-500 font-mono">
                    Operation: PHYSICAL INVENTORY • Atomic Firestore Transaction
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Planned Adjustments Breakdown */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Audit Metadata Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">AUTHORIZED MANAGER:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {currentUser.fullName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">OPERATION REASON:</span>
                  <span className="font-bold text-slate-800">PHYSICAL INVENTORY</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">TOTAL ADJUSTMENTS:</span>
                  <span className="font-bold text-emerald-700">{plannedAdjustments.length} locations</span>
                </div>
              </div>

              {/* Adjustments Table List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Stock</th>
                      <th className="py-2.5 px-3 text-right">System</th>
                      <th className="py-2.5 px-3 text-right">Counted</th>
                      <th className="py-2.5 px-3 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plannedAdjustments.map((adj, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-900">{adj.reference}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              adj.stockType === "STOCK 1"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-purple-50 text-purple-700 border border-purple-200"
                            }`}
                          >
                            {adj.stockType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">
                          {adj.previousSystemQuantity.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {adj.physicalQuantity.toLocaleString()}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            adj.difference > 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {adj.difference > 0
                            ? `+${adj.difference.toLocaleString()}`
                            : adj.difference.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Optional Manager Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 font-mono mb-1">
                  Manager Reconciliation Notes (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g., Weekly physical stock audit - verified on shelf"
                  value={inventoryNotes}
                  onChange={(e) => setInventoryNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400"
                />
              </div>

              {/* Integrity Warning */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 font-sans space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Atomic Firestore Transaction & Audit</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-mono">
                  On confirmation, authoritative stock levels in <code>bezel_references</code> will be updated to physical counts. Immutable audit records will be generated in <code>bezel_operations</code> with reason <code>PHYSICAL INVENTORY</code>.
                </p>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="bezel-confirm-reconciliation-submit"
                onClick={handleConfirmInventory}
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Applying Transaction...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRM & APPLY INVENTORY</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
