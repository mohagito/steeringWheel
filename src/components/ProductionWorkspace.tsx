import React, { useState, useMemo } from "react";
import { Production, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Factory, Search, Package, AlertCircle, Plus, Calendar, FileText, 
  BarChart2, User as UserIcon, CheckCircle, TrendingDown, ArrowUpRight, HelpCircle, Trash2
} from "lucide-react";
import Swal from "sweetalert2";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";

interface ProductionWorkspaceProps {
  productions: Production[];
  references: Reference[];
  currentUser: User;
  onSubmitProduction: (productionEntries: { date: string; reference: string; quantity: number; notes?: string }[]) => Promise<void>;
}

interface ProductionRow {
  referenceCode: string;
  quantity: string;
}

export default function ProductionWorkspace({
  productions,
  references,
  currentUser,
  onSubmitProduction
}: ProductionWorkspaceProps) {
  // Default to today's date in YYYY-MM-DD
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Default to yesterday's date in YYYY-MM-DD
  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [productionDate, setProductionDate] = useState(getTodayString());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ProductionRow[]>([{ referenceCode: "", quantity: "" }]);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search and filter for history logs
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // empty means no filter

  const handleAddRow = () => {
    setRows([...rows, { referenceCode: "", quantity: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    const updatedRows = [...rows];
    updatedRows.splice(index, 1);
    setRows(updatedRows);
  };

  const handleRowChange = (index: number, field: keyof ProductionRow, value: string) => {
    const updatedRows = [...rows];
    let finalVal = value;
    if (field === "referenceCode" && value) {
      const upper = value.trim().toUpperCase();
      const directRef = references.find((r) => r.code.toUpperCase() === upper);
      if (directRef) {
        finalVal = directRef.code;
      } else if (upper.length > 1) {
        const stripped = upper.slice(1);
        const strippedRef = references.find((r) => r.code.toUpperCase() === stripped);
        if (strippedRef) {
          finalVal = strippedRef.code;
        }
      }
    }
    updatedRows[index] = {
      ...updatedRows[index],
      [field]: finalVal
    };
    setRows(updatedRows);
  };

  // Pre-fill presets for easy data entry
  const setDateToToday = () => setProductionDate(getTodayString());
  const setDateToYesterday = () => setProductionDate(getYesterdayString());

  // Handle Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!productionDate) {
      setErrorMsg("A production date is required.");
      return;
    }

    // Validate rows
    if (rows.length === 0) {
      setErrorMsg("Please add at least one reference log.");
      return;
    }

    const submissions: { date: string; reference: string; quantity: number; notes?: string }[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.referenceCode) {
        setErrorMsg(`Row ${i + 1}: Please select a Reference.`);
        return;
      }

      const consumeQty = parseInt(row.quantity, 10);
      if (isNaN(consumeQty) || consumeQty <= 0) {
        setErrorMsg(`Row ${i + 1} (${row.referenceCode}): Please enter a valid quantity greater than 0.`);
        return;
      }

      // Check stock warning against Stock 2 (WIP)
      const refObj = references.find((r) => r.code === row.referenceCode);
      const stock2Val = refObj ? (refObj.stock2 || 0) : 0;
      if (consumeQty > stock2Val) {
        warnings.push(`Part ${row.referenceCode}: Production output quantity (${consumeQty} pcs) exceeds current Stock 2 WIP (${stock2Val} pcs)`);
      }

      submissions.push({
        date: productionDate,
        reference: row.referenceCode,
        quantity: consumeQty,
        notes: notes.trim() || undefined
      });
    }

    if (warnings.length > 0) {
      const result = await Swal.fire({
        title: "Production Warning",
        html: `
          <div class="text-left text-xs font-mono space-y-1 bg-amber-50 p-3 border border-amber-200 text-amber-900 rounded-none mb-3">
            ${warnings.map(w => `<p>⚠️ ${w}</p>`).join("")}
          </div>
          <p class="text-sm font-sans font-bold text-slate-800">Do you still want to proceed with logging this production output? It will move parts from Stock 2 WIP to Stock 3 Finished Goods.</p>
        `,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Yes, Log Production",
        cancelButtonText: "Cancel"
      });
      if (!result.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      await onSubmitProduction(submissions);

      const msg = `Successfully registered production output for ${productionDate} with ${submissions.length} reference record(s)! Stock levels updated.`;
      setSuccessMsg(msg);
      
      // Clear inputs
      setNotes("");
      setRows([{ referenceCode: "", quantity: "" }]);

      Swal.fire({
        title: "Good job!",
        text: msg,
        icon: "success",
        confirmButtonText: "OK",
        confirmButtonColor: "#2563eb"
      });

      // Fade success message
      setTimeout(() => {
        setSuccessMsg("");
      }, 6000);
    } catch (err: any) {
      console.error("Production log error:", err);
      setErrorMsg(err?.message || "Failed to log production. Please check connection.");
    } finally {
      setSubmitting(false);
    }
  };

  // Production statistics
  const stats = useMemo(() => {
    const totalQtyConsumed = productions.reduce((sum, p) => sum + p.quantity, 0);
    const uniqueDays = new Set(productions.map((p) => p.date)).size;
    
    // Group by reference code for ranking
    const refMap: Record<string, number> = {};
    productions.forEach((p) => {
      refMap[p.reference] = (refMap[p.reference] || 0) + p.quantity;
    });

    const topConsumedReferences = Object.entries(refMap)
      .map(([code, val]) => ({ code, val }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);

    return {
      totalQtyConsumed,
      uniqueDays,
      topConsumedReferences
    };
  }, [productions]);

  // Pre-filtered productions list
  const filteredProductions = useMemo(() => {
    return productions.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ? true : (
        p.reference.toLowerCase().includes(q) ||
        p.operatorName.toLowerCase().includes(q) ||
        p.date.toLowerCase().includes(q) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
      const matchesDate = !dateFilter ? true : p.date === dateFilter;
      return matchesSearch && matchesDate;
    });
  }, [productions, searchQuery, dateFilter]);

  // Unique list of dates in production logs for filter dropdown
  const uniqueDates = useMemo(() => {
    const dates = new Set(productions.map((p) => p.date));
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [productions]);

  return (
    <div className="space-y-6" id="production-workspace">
      
      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Total Consumed</span>
            <span className="text-xl font-bold text-slate-900 font-mono mt-0.5 block">
              {stats.totalQtyConsumed.toLocaleString()} pcs
            </span>
          </div>
        </div>

        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Production Days</span>
            <span className="text-xl font-bold text-slate-900 font-mono mt-0.5 block">
              {stats.uniqueDays} days
            </span>
          </div>
        </div>

        <div className="glass-panel p-5 flex flex-col justify-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 font-mono">Top Consumed</span>
          <div className="flex flex-wrap gap-2">
            {stats.topConsumedReferences.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No production logs entered yet</span>
            ) : (
              stats.topConsumedReferences.map((ref) => (
                <span key={ref.code} className="px-2.5 py-1 bg-slate-100/80 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 font-mono" title={`Total of ${ref.val} pcs consumed`}>
                  <span className="font-bold text-blue-600">{ref.val}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">{ref.code}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Register Daily Production */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
              <Factory className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Log Daily Consumption</h3>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" id="production-consumption-form">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Production / Work Date
                </label>
                
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="date"
                      value={productionDate}
                      onChange={(e) => setProductionDate(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all text-slate-900 font-semibold"
                      required
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={setDateToYesterday}
                    className="px-3 py-2 bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 rounded-xl text-[11px] font-bold transition-all cursor-pointer border border-slate-200/80"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={setDateToToday}
                    className="px-3 py-2 bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 rounded-xl text-[11px] font-bold transition-all cursor-pointer border border-slate-200/80"
                  >
                    Today
                  </button>
                </div>
              </div>

              {/* Multiple Reference Rows */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Parts Consumed
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {rows.length} reference{rows.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-3 overflow-visible">
                  {rows.map((row, index) => {
                    const selectedRefObj = references.find((r) => r.code === row.referenceCode);
                    return (
                      <div key={index} className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl relative space-y-2.5 overflow-visible">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md">
                            Ref #{index + 1}
                          </span>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove Reference"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-12 gap-2.5 items-start overflow-visible">
                          {/* Reference Selector */}
                          <div className="col-span-12 sm:col-span-8 overflow-visible">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Reference Code
                            </label>
                            <CustomReferenceSelect
                              references={references}
                              value={row.referenceCode}
                              onChange={(val) => handleRowChange(index, "referenceCode", val)}
                              placeholder="Select Reference..."
                              required
                              size="sm"
                            />
                          </div>

                          {/* Quantity */}
                          <div className="col-span-12 sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Consumed Qty
                            </label>
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty Out"
                              value={row.quantity}
                              onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900 font-mono font-bold"
                              required
                            />
                          </div>
                        </div>

                        {selectedRefObj && (
                          <div className="flex flex-wrap items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-200/50 gap-2">
                            <span className="text-slate-500 font-sans truncate max-w-[200px]">{selectedRefObj.description}</span>
                            <div className="flex gap-2">
                              <span className="text-slate-500">S2 WIP: <strong className="text-amber-600 font-bold">{selectedRefObj.stock2 || 0}</strong></span>
                              <span className="text-slate-500">S3 Fin: <strong className="text-emerald-600 font-bold">{selectedRefObj.stock3 || 0}</strong></span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100/80 border border-dashed border-slate-200/80 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Reference</span>
                </button>
              </div>

              {/* Comments */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Line Notes / Shift Comments
                </label>
                <textarea
                  placeholder="Shift notes..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all text-slate-800"
                />
              </div>

              {/* Notifications */}
              <AnimatePresence mode="wait">
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="font-medium">{errorMsg}</p>
                  </motion.div>
                )}

                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-start gap-2"
                  >
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <p className="font-medium">{successMsg}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer uppercase tracking-wider ${
                  submitting
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:scale-98"
                }`}
              >
                <Factory className="w-4 h-4" />
                <span>{submitting ? "Saving Log..." : "Save Production Log"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Daily Production Logs History */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Consumption Ledger</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Production output logs</p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search refs, operators..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition-all w-full sm:w-48 text-slate-800"
                  />
                </div>

                {/* Date Filter */}
                <CustomSelect
                  value={dateFilter}
                  onChange={(val) => setDateFilter(val)}
                  options={[
                    { value: "", label: "All Dates" },
                    ...uniqueDates.map((d) => ({ value: d, label: d }))
                  ]}
                  className="w-36"
                  size="sm"
                />
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference Code</th>
                    <th>Consumed Qty</th>
                    <th>Logged By</th>
                    <th>Notes</th>
                    <th className="text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredProductions.map((p) => {
                    const formattedDate = new Date(p.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="font-mono font-semibold text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {p.date}
                          </span>
                        </td>
                        <td className="font-mono font-bold text-blue-700">
                          {p.reference}
                        </td>
                        <td className="font-mono font-bold text-slate-900 text-xs">
                          {p.quantity.toLocaleString()} pcs
                        </td>
                        <td className="text-slate-600 font-sans font-medium text-xs">
                          {p.operatorName}
                        </td>
                        <td className="text-slate-500 max-w-[160px] truncate" title={p.notes || ""}>
                          {p.notes || <span className="text-slate-300 italic">-</span>}
                        </td>
                        <td className="text-right text-slate-400 font-mono text-[10px]">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredProductions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 bg-slate-50/20">
                        <AlertCircle className="w-7 h-7 mx-auto mb-2 opacity-40 text-slate-500" />
                        <p className="text-xs font-semibold">No production records found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
