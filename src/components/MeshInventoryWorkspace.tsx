import React, { useState, useMemo } from "react";
import { Reference, User, MeshInventoryAdjustment } from "../types";
import {
  executeMeshPhysicalInventory
} from "../services/protectionLayer";
import {
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  X,
  TrendingUp,
  TrendingDown
} from "lucide-react";

interface MeshInventoryWorkspaceProps {
  references: Reference[];
  currentUser: User;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  initialFilterRefCode?: string;
}

interface PhysicalCountState {
  stock1: string; // empty string means untouched
  stock2: string;
  stock3: string;
}

export default function MeshInventoryWorkspace({
  references,
  currentUser,
  onSuccess,
  onError,
  initialFilterRefCode = ""
}: MeshInventoryWorkspaceProps) {
  const isManager = currentUser.role === "admin" || currentUser.role === "supervisor";

  // Per-reference physical count input states: key = refCode
  const [counts, setCounts] = useState<Record<string, PhysicalCountState>>({});
  const [inventoryNotes, setInventoryNotes] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialFilterRefCode);
  const [materialFilter, setMaterialFilter] = useState<string>("All");

  // Update a single count input
  const handleCountChange = (
    refCode: string,
    stockType: "stock1" | "stock2" | "stock3",
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
        stock2: stockType === "stock2" ? value : prev[refCode]?.stock2 ?? "",
        stock3: stockType === "stock3" ? value : prev[refCode]?.stock3 ?? ""
      }
    }));
  };

  // Helper: Reset all physical counts
  const handleResetCounts = () => {
    setCounts({});
  };

  // Filtered references
  const filteredReferences = useMemo(() => {
    return references.filter((r) => {
      const q = (searchQuery || "").toLowerCase().trim();
      const matchesSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.customer && r.customer.toLowerCase().includes(q));

      const matchesMaterial =
        materialFilter === "All" || r.materialType === materialFilter;

      return matchesSearch && matchesMaterial;
    });
  }, [references, searchQuery, materialFilter]);

  // Compute planned reconciliation entries across all references
  const plannedAdjustments = useMemo(() => {
    const list: MeshInventoryAdjustment[] = [];

    references.forEach((ref) => {
      const state = counts[ref.code];
      if (!state) return;

      // Stock 1
      if (state.stock1 !== "") {
        const physical = parseInt(state.stock1, 10);
        const system = ref.stock1 || 0;
        const diff = physical - system;
        if (diff !== 0) {
          list.push({
            reference: ref.code,
            stockType: "STOCK 1",
            previousSystemQuantity: system,
            physicalQuantity: physical,
            difference: diff
          });
        }
      }

      // Stock 2
      if (state.stock2 !== "") {
        const physical = parseInt(state.stock2, 10);
        const system = ref.stock2 || 0;
        const diff = physical - system;
        if (diff !== 0) {
          list.push({
            reference: ref.code,
            stockType: "STOCK 2",
            previousSystemQuantity: system,
            physicalQuantity: physical,
            difference: diff
          });
        }
      }

      // Stock 3
      if (state.stock3 !== "") {
        const physical = parseInt(state.stock3, 10);
        const system = ref.stock3 || 0;
        const diff = physical - system;
        if (diff !== 0) {
          list.push({
            reference: ref.code,
            stockType: "STOCK 3",
            previousSystemQuantity: system,
            physicalQuantity: physical,
            difference: diff
          });
        }
      }
    });

    return list;
  }, [references, counts]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let positiveDiff = 0;
    let negativeDiff = 0;
    const modifiedRefs = new Set<string>();

    plannedAdjustments.forEach((item) => {
      modifiedRefs.add(item.reference);
      const diff = item.difference ?? 0;
      if (diff > 0) positiveDiff += diff;
      else negativeDiff += Math.abs(diff);
    });

    return {
      totalAdjustments: plannedAdjustments.length,
      modifiedRefCount: modifiedRefs.size,
      positiveDiff,
      negativeDiff
    };
  }, [plannedAdjustments]);

  // Commit Reconciliation
  const handleConfirmReconciliation = async () => {
    if (plannedAdjustments.length === 0) return;
    if (!isManager) {
      onError("Manager authorization required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await executeMeshPhysicalInventory({
        adjustments: plannedAdjustments,
        managerName: currentUser.fullName,
        managerRole: currentUser.role,
        managerId: currentUser.id,
        notes: inventoryNotes.trim() || undefined
      });

      onSuccess(
        `Reconciliation committed: ${result.operations.length} stock adjustment records synchronized.`
      );
      setCounts({});
      setInventoryNotes("");
      setIsConfirmModalOpen(false);
    } catch (err: any) {
      onError(err?.message || "Reconciliation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" id="mesh-stock-inventory-workspace">
      {/* Top Header Card */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-600 shrink-0" />
              Stock Inventory
            </h2>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg uppercase tracking-wider border border-indigo-200">
              Mesh Reconciliation
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {Object.keys(counts).length > 0 && (
            <button
              onClick={handleResetCounts}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          <button
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={plannedAdjustments.length === 0 || !isManager}
            className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xs ${
              plannedAdjustments.length > 0 && isManager
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25 active:scale-98"
                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm Inventory</span>
            {plannedAdjustments.length > 0 && (
              <span className="px-1.5 py-0.2 bg-white text-indigo-700 text-[10px] font-mono font-black rounded-full">
                {plannedAdjustments.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Catalog Refs</p>
          <p className="text-lg font-black text-slate-900 mt-0.5 font-mono">{references.length}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Adjustments</p>
          <p className="text-lg font-black text-indigo-600 mt-0.5 font-mono">
            {metrics.totalAdjustments} <span className="text-[11px] text-slate-400 font-normal">items</span>
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Additions</p>
          <p className="text-lg font-black text-emerald-600 mt-0.5 font-mono flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            +{metrics.positiveDiff.toLocaleString()} <span className="text-[10px] text-slate-400 font-sans font-normal">PCS</span>
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deductions</p>
          <p className="text-lg font-black text-rose-600 mt-0.5 font-mono flex items-center gap-1">
            <TrendingDown className="w-4 h-4" />
            −{metrics.negativeDiff.toLocaleString()} <span className="text-[10px] text-slate-400 font-sans font-normal">PCS</span>
          </p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search code, customer, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium cursor-pointer focus:outline-none"
          >
            <option value="All">All Materials</option>
            <option value="Mesh">Mesh</option>
            <option value="Soft">Soft</option>
          </select>
          <span className="text-xs text-slate-400 font-mono ml-auto">
            {filteredReferences.length} of {references.length}
          </span>
        </div>
      </div>

      {/* Main Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 min-w-[220px]">Reference</th>
                <th className="py-3 px-3 text-center min-w-[170px] bg-blue-50/40 border-l border-r border-blue-100">
                  <span className="text-blue-700 font-black">Stock 1 (Warehouse)</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[170px] bg-amber-50/40 border-r border-amber-100">
                  <span className="text-amber-700 font-black">Stock 2 (PEGADAS)</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[170px] bg-emerald-50/40 border-r border-emerald-100">
                  <span className="text-emerald-700 font-black">Stock 3 (Finished)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReferences.map((ref) => {
                const s1 = ref.stock1 || 0;
                const s2 = ref.stock2 || 0;
                const s3 = ref.stock3 || 0;

                const cState = counts[ref.code] || { stock1: "", stock2: "", stock3: "" };

                // Diffs
                const diff1 = cState.stock1 !== "" ? parseInt(cState.stock1, 10) - s1 : null;
                const diff2 = cState.stock2 !== "" ? parseInt(cState.stock2, 10) - s2 : null;
                const diff3 = cState.stock3 !== "" ? parseInt(cState.stock3, 10) - s3 : null;

                const hasChanges = (diff1 !== null && diff1 !== 0) ||
                                   (diff2 !== null && diff2 !== 0) ||
                                   (diff3 !== null && diff3 !== 0);

                return (
                  <tr
                    key={ref.id}
                    className={`transition-colors hover:bg-slate-50/70 ${hasChanges ? "bg-indigo-50/20" : ""}`}
                  >
                    {/* Reference Details */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-900 text-sm">{ref.code}</span>
                        {ref.materialType && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            ref.materialType === "Mesh"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}>
                            {ref.materialType}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5" title={ref.description}>
                        {ref.description || "No description"}
                      </p>
                      {ref.customer && (
                        <p className="text-[10px] text-slate-400 font-medium">
                          Customer: {ref.customer}
                        </p>
                      )}
                    </td>

                    {/* Stock 1 (Warehouse Raw) */}
                    <td className="py-2.5 px-3 bg-blue-50/20 border-l border-r border-blue-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">System</p>
                          <p className="font-mono font-bold text-slate-800 text-xs">{s1.toLocaleString()}</p>
                        </div>
                        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                        <div className="w-20 shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Count..."
                            disabled={!isManager}
                            value={cState.stock1}
                            onChange={(e) => handleCountChange(ref.code, "stock1", e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono font-bold text-center bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="w-14 text-right shrink-0">
                          {diff1 === null ? (
                            <span className="text-[10px] text-slate-300 font-mono">-</span>
                          ) : diff1 === 0 ? (
                            <span className="text-[10px] font-mono text-slate-400">0</span>
                          ) : (
                            <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded ${
                              diff1 > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {diff1 > 0 ? `+${diff1}` : diff1}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Stock 2 (WIP Mallas Pegadas) */}
                    <td className="py-2.5 px-3 bg-amber-50/20 border-r border-amber-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">System</p>
                          <p className="font-mono font-bold text-slate-800 text-xs">{s2.toLocaleString()}</p>
                        </div>
                        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                        <div className="w-20 shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Count..."
                            disabled={!isManager}
                            value={cState.stock2}
                            onChange={(e) => handleCountChange(ref.code, "stock2", e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono font-bold text-center bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div className="w-14 text-right shrink-0">
                          {diff2 === null ? (
                            <span className="text-[10px] text-slate-300 font-mono">-</span>
                          ) : diff2 === 0 ? (
                            <span className="text-[10px] font-mono text-slate-400">0</span>
                          ) : (
                            <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded ${
                              diff2 > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {diff2 > 0 ? `+${diff2}` : diff2}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Stock 3 (Finished Goods) */}
                    <td className="py-2.5 px-3 bg-emerald-50/20 border-r border-emerald-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">System</p>
                          <p className="font-mono font-bold text-slate-800 text-xs">{s3.toLocaleString()}</p>
                        </div>
                        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                        <div className="w-20 shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Count..."
                            disabled={!isManager}
                            value={cState.stock3}
                            onChange={(e) => handleCountChange(ref.code, "stock3", e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono font-bold text-center bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="w-14 text-right shrink-0">
                          {diff3 === null ? (
                            <span className="text-[10px] text-slate-300 font-mono">-</span>
                          ) : diff3 === 0 ? (
                            <span className="text-[10px] font-mono text-slate-400">0</span>
                          ) : (
                            <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded ${
                              diff3 > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {diff3 > 0 ? `+${diff3}` : diff3}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Confirm Stock Reconciliation
                </h3>
              </div>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body - Items List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-xs text-indigo-950 font-medium">
                Reviewing <span className="font-bold">{plannedAdjustments.length}</span> adjustments. An atomic transaction will synchronize stock levels and append traceable audit logs.
              </div>

              {/* Adjustments Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Stock</th>
                      <th className="py-2.5 px-3 text-right">System</th>
                      <th className="py-2.5 px-3 text-right">Physical</th>
                      <th className="py-2.5 px-3 text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {plannedAdjustments.map((adj, i) => {
                      const diff = adj.difference ?? (adj.physicalQuantity - adj.previousSystemQuantity);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900">{adj.reference}</td>
                          <td className="py-2 px-3">
                            <span className="text-[10px] font-sans font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {adj.stockType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">{adj.previousSystemQuantity}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{adj.physicalQuantity}</td>
                          <td className="py-2 px-3 text-right font-black">
                            <span className={diff > 0 ? "text-emerald-600" : "text-rose-600"}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Manager Notes (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Physical Wall-to-Wall Inventory Count"
                  value={inventoryNotes}
                  onChange={(e) => setInventoryNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReconciliation}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Committing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Commit Reconciliation</span>
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
