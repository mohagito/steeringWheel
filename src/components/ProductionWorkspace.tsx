import React, { useState, useMemo } from "react";
import { Production, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Factory, Search, Package, AlertCircle, Plus, Calendar, FileText, 
  BarChart2, User as UserIcon, CheckCircle, TrendingDown, ArrowUpRight, HelpCircle, Trash2
} from "lucide-react";

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
    updatedRows[index] = {
      ...updatedRows[index],
      [field]: value
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

      // Check stock warning
      const refObj = references.find((r) => r.code === row.referenceCode);
      const currentStock = refObj ? refObj.currentStock : 0;
      if (consumeQty > currentStock) {
        warnings.push(`Part ${row.referenceCode}: Quantity (${consumeQty} pcs) exceeds warehouse stock (${currentStock} pcs)`);
      }

      submissions.push({
        date: productionDate,
        reference: row.referenceCode,
        quantity: consumeQty,
        notes: notes.trim() || undefined
      });
    }

    if (warnings.length > 0) {
      const confirmProceed = window.confirm(
        `Warning:\n${warnings.join("\n")}\n\nDo you still want to proceed with logging this production consumption? This will deduct the parts from warehouse stock.`
      );
      if (!confirmProceed) return;
    }

    setSubmitting(true);
    try {
      await onSubmitProduction(submissions);

      setSuccessMsg(`Successfully registered production consumption for ${productionDate} with ${submissions.length} reference records! Stock levels updated.`);
      
      // Clear inputs
      setNotes("");
      setRows([{ referenceCode: "", quantity: "" }]);

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
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-blue-50 text-blue-600">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Pieces Consumed</span>
            <span className="text-2xl font-black text-slate-900 font-display mt-0.5 block">
              {stats.totalQtyConsumed.toLocaleString()} pcs
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              Used in steering wheel assembly
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-indigo-50 text-indigo-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Logged Production Days</span>
            <span className="text-2xl font-black text-slate-900 font-display mt-0.5 block">
              {stats.uniqueDays} active days
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              Traceable daily logs
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Top Consumed References</span>
          <div className="flex flex-wrap gap-2">
            {stats.topConsumedReferences.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No production logs entered yet</span>
            ) : (
              stats.topConsumedReferences.map((ref) => (
                <span key={ref.code} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 font-mono" title={`Total of ${ref.val} pcs consumed`}>
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
              <Factory className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Log Daily Consumption</h3>
                <p className="text-[11px] text-slate-400 font-medium">Record quantities of reference parts used in production</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" id="production-consumption-form">
              <div className="space-y-3">
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
                      className="w-full pl-8.5 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 font-semibold"
                      required
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={setDateToYesterday}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={setDateToToday}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Today
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 italic">Select the date on which these parts were physically consumed in production.</p>
              </div>

              {/* Multiple Reference Rows */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Parts Consumed
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {rows.length} reference{rows.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {rows.map((row, index) => {
                    const selectedRefObj = references.find((r) => r.code === row.referenceCode);
                    return (
                      <div key={index} className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl relative space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-sm">
                            #{index + 1}
                          </span>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove Reference"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                          {/* Reference Selector */}
                          <div className="col-span-8">
                            <select
                              value={row.referenceCode}
                              onChange={(e) => handleRowChange(index, "referenceCode", e.target.value)}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 font-mono"
                              required
                            >
                              <option value="">-- Select Reference --</option>
                              {references.map((ref) => (
                                <option key={ref.code} value={ref.code}>
                                  {ref.code} ({ref.currentStock} pcs in stock)
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div className="col-span-4">
                            <input
                              type="number"
                              min="1"
                              placeholder="Quantity"
                              value={row.quantity}
                              onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 font-mono font-bold"
                              required
                            />
                          </div>
                        </div>

                        {selectedRefObj && (
                          <div className="flex items-center justify-between text-[10px] font-mono px-0.5">
                            <span className="text-slate-400 truncate max-w-[150px]">{selectedRefObj.description}</span>
                            <div className="flex gap-2">
                              <span className="text-slate-400">Stock:</span>
                              <span className={`font-bold ${selectedRefObj.currentStock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                {selectedRefObj.currentStock} pcs
                              </span>
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
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Reference</span>
                </button>
              </div>

              {/* Comments */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Production Line Notes / Shift Comments
                </label>
                <textarea
                  placeholder="e.g. Morning shift assembly, reference 34340689D consumed fully..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                />
              </div>

              {/* Notifications */}
              <AnimatePresence mode="wait">
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2"
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
                    className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-start gap-2"
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
                className={`w-full py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-100 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  submitting
                    ? "bg-slate-400 shadow-none cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 active:scale-98"
                }`}
              >
                <Factory className="w-4 h-4" />
                <span>{submitting ? "Saving Production Log..." : "Save Daily Production"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Daily Production Logs History */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Production Consumption Ledger</h3>
                <p className="text-[11px] text-slate-400 font-medium">Daily traceability log of parts used on assembly line</p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search references, operators..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all w-full sm:w-48 text-slate-800"
                  />
                </div>

                {/* Date Filter */}
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none text-slate-600"
                >
                  <option value="">All Dates</option>
                  {uniqueDates.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4 font-black">Production Date</th>
                    <th className="py-3 px-4 font-black">Reference Code</th>
                    <th className="py-3 px-4 font-black">Quantity Consumed</th>
                    <th className="py-3 px-4 font-black">Logged By</th>
                    <th className="py-3 px-4 font-black">Notes</th>
                    <th className="py-3 px-4 font-black text-right">Registered At</th>
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
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          <span className="flex items-center gap-1 text-slate-800">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {p.date}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                          {p.reference}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-slate-900 text-[13px]">
                          {p.quantity.toLocaleString()} pcs
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 flex items-center gap-1.5 font-sans font-semibold">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          {p.operatorName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 max-w-[180px] truncate" title={p.notes || ""}>
                          {p.notes || <span className="text-slate-300 italic">-</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredProductions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 bg-slate-50/20">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                        <p className="text-sm font-semibold">No production records found</p>
                        <p className="text-xs text-slate-400 mt-1">Register a new production log in the left panel</p>
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
