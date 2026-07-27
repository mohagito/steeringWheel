import React, { useState, useRef, useMemo } from "react";
import { ScrapEntry, Reference, User } from "../types";
import { 
  Trash2, Calendar, Hash, AlertTriangle, CheckCircle2, 
  Search, ShieldAlert, ArrowDownRight, Layers, Flame, FileText, RefreshCw, Filter
} from "lucide-react";

interface ScrapWorkspaceProps {
  scraps: ScrapEntry[];
  references: Reference[];
  currentUser: User;
  onSubmitScrap: (scrapData: Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter" | "stockDeductedFrom">) => Promise<void>;
  onDeleteScrap?: (scrapId: string) => Promise<void>;
}

export default function ScrapWorkspace({
  scraps = [],
  references = [],
  currentUser,
  onSubmitScrap,
  onDeleteScrap
}: ScrapWorkspaceProps) {
  // Get today's date in YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  // Form State
  const [date, setDate] = useState(todayStr);
  const [reference, setReference] = useState("");
  const [quantity, setQuantity] = useState("");
  const [condition, setCondition] = useState<"CON COLA" | "SIN COLA">("CON COLA");

  // UX Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search & Filter State for Scrap Table
  const [searchTerm, setSearchTerm] = useState("");
  const [conditionFilter, setConditionFilter] = useState<"ALL" | "CON COLA" | "SIN COLA">("ALL");

  // Selected Reference Lookup
  const selectedRefData = useMemo(() => {
    if (!reference.trim()) return null;
    const clean = reference.trim().toUpperCase();
    return references.find(r => r.code.toUpperCase() === clean) || null;
  }, [reference, references]);

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const cleanRef = reference.trim().toUpperCase();
    const qtyVal = parseInt(quantity);

    if (!date) {
      setErrorMsg("Please select a date.");
      return;
    }
    if (!cleanRef) {
      setErrorMsg("Please select or scan a Reference Code.");
      return;
    }
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("Please enter a valid positive quantity for NOK pieces.");
      return;
    }

    // Optional warning check on stock
    if (selectedRefData) {
      const availStock = condition === "CON COLA" ? selectedRefData.stock3 : selectedRefData.stock2;
      if (qtyVal > availStock) {
        // Warning but proceed as supervisor
        console.warn(`Scrap quantity (${qtyVal}) exceeds current available ${condition === "CON COLA" ? "Stock 3" : "Stock 2"} (${availStock}).`);
      }
    }

    try {
      setSubmitting(true);
      await onSubmitScrap({
        date,
        reference: cleanRef,
        quantity: qtyVal,
        condition,
        notes: ""
      });

      setSuccessMsg(`Logged ${qtyVal} NOK PCS for ${cleanRef} (${condition}) on ${date}`);
      
      // Reset entry inputs (keep date)
      setReference("");
      setQuantity("");
      
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record scrap entry.");
    } finally {
      setSubmitting(false);
    }
  };

  // KPI Calculations
  const totalScrappedPcs = useMemo(() => scraps.reduce((acc, s) => acc + s.quantity, 0), [scraps]);
  const totalConColaPcs = useMemo(() => scraps.filter(s => s.condition === "CON COLA").reduce((acc, s) => acc + s.quantity, 0), [scraps]);
  const totalSinColaPcs = useMemo(() => scraps.filter(s => s.condition === "SIN COLA").reduce((acc, s) => acc + s.quantity, 0), [scraps]);

  // Filtered Scraps List
  const filteredScraps = useMemo(() => {
    return scraps.filter(s => {
      const matchesSearch = 
        s.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.supervisorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCondition = conditionFilter === "ALL" || s.condition === conditionFilter;
      return matchesSearch && matchesCondition;
    });
  }, [scraps, searchTerm, conditionFilter]);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-full text-xs font-mono font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>DEFECTIVE & NOK MESH LOGGING</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
              SCRAP Management
            </h2>

          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-3 shrink-0">
            <Trash2 className="w-8 h-8 text-rose-400" />
            <div>
              <div className="text-xl font-mono font-black text-rose-300">{totalScrappedPcs} PCS</div>
              <div className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">Total NOK Scrapped</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">With Glue (CON COLA)</div>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1">{totalConColaPcs} PCS</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Deducted from Stock 3 (Final)</div>
          </div>
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
            <Flame className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Without Glue (SIN COLA)</div>
            <div className="text-2xl font-black font-mono text-amber-600 mt-1">{totalSinColaPcs} PCS</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Deducted from Stock 2 (Pegadas)</div>
          </div>
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unique References</div>
            <div className="text-2xl font-black font-mono text-slate-800 mt-1">
              {new Set(scraps.map(s => s.reference)).size} REFS
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Affected part codes</div>
          </div>
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
            <Hash className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Form on Left/Top, History Table on Right/Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* NEW SCRAP ENTRY FORM */}
        <div className="lg:col-span-5 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" />
              <span>Record NOK Mesh (Scrap)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Enter defect details to deduct NOK pieces from appropriate warehouse stock.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-medium flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-semibold flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* 1. DATE */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>1. Date</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 rounded-2xl text-xs font-mono font-bold text-slate-800 focus:outline-none transition-all"
              />
            </div>

            {/* 2. REFERENCE CODE */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
                <span>2. Reference Code</span>
                <span className="text-[10px] text-slate-400 font-normal">Scan or select reference</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  list="reference-scrap-list"
                  placeholder="Type or scan reference code..."
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 rounded-2xl text-xs font-mono font-bold uppercase text-slate-900 focus:outline-none transition-all"
                />
                <datalist id="reference-scrap-list">
                  {references.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} - {r.description} (S2: {r.stock2} | S3: {r.stock3})
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Reference Live Stock Preview Badge */}
              {selectedRefData ? (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-1.5 mt-2">
                  <div className="font-bold text-slate-800 font-mono text-xs flex items-center justify-between">
                    <span>{selectedRefData.code}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-sans">{selectedRefData.materialType}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{selectedRefData.description}</div>
                  <div className="pt-1.5 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-center font-mono text-[11px]">
                    <div className={`p-1.5 rounded-xl border ${condition === "SIN COLA" ? "bg-amber-100/70 border-amber-300 font-bold text-amber-900" : "bg-white text-slate-600 border-slate-200"}`}>
                      <div className="text-[9px] uppercase font-sans text-slate-500">Stock 2 (SIN COLA)</div>
                      <div className="text-xs font-extrabold">{selectedRefData.stock2} PCS</div>
                    </div>
                    <div className={`p-1.5 rounded-xl border ${condition === "CON COLA" ? "bg-rose-100/70 border-rose-300 font-bold text-rose-900" : "bg-white text-slate-600 border-slate-200"}`}>
                      <div className="text-[9px] uppercase font-sans text-slate-500">Stock 3 (CON COLA)</div>
                      <div className="text-xs font-extrabold">{selectedRefData.stock3} PCS</div>
                    </div>
                  </div>
                </div>
              ) : reference.trim() ? (
                <div className="text-[11px] text-rose-600 font-medium px-1">
                  Reference code not found in catalog, but can still be registered.
                </div>
              ) : null}
            </div>

            {/* 3. CONDITION (CON COLA vs SIN COLA) */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                3. Condition (Glue State)
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCondition("CON COLA")}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    condition === "CON COLA"
                      ? "bg-rose-50 border-2 border-rose-600 text-rose-950 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs">CON COLA</span>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${condition === "CON COLA" ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300"}`}>
                      {condition === "CON COLA" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-700 font-medium mt-1">Deducts from Stock 3</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCondition("SIN COLA")}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    condition === "SIN COLA"
                      ? "bg-amber-50 border-2 border-amber-600 text-amber-950 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs">SIN COLA</span>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${condition === "SIN COLA" ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300"}`}>
                      {condition === "SIN COLA" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium mt-1">Deducts from Stock 2</span>
                </button>
              </div>
            </div>

            {/* 4. QUANTITY (NOK PCS) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                4. Quantity (NOK PCS)
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="Enter number of defective pieces..."
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 rounded-2xl text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all"
              />
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Scrap...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>RECORD SCRAP ENTRY</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

        {/* SCRAP HISTORY TABLE */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm flex flex-col space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-700" />
                <span>Scrap History & Logs</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Recent non-conforming mesh scrap records and warehouse deductions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs font-mono font-bold px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl">
                {filteredScraps.length} Records
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reference, supervisor, notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 rounded-xl text-xs focus:outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
              <button
                onClick={() => setConditionFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  conditionFilter === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => setConditionFilter("CON COLA")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  conditionFilter === "CON COLA" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                CON COLA
              </button>
              <button
                onClick={() => setConditionFilter("SIN COLA")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  conditionFilter === "SIN COLA" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                SIN COLA
              </button>
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 overflow-x-auto min-h-[350px]">
            {filteredScraps.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                <Trash2 className="w-10 h-10 text-slate-300" />
                <div className="text-sm font-semibold text-slate-600">No scrap records found</div>
                <div className="text-xs max-w-xs">
                  {searchTerm ? "No matching records for your search." : "Recorded NOK mesh scraps will appear here."}
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Reference</th>
                    <th className="py-3 px-3">Condition</th>
                    <th className="py-3 px-3 text-right">Qty (NOK)</th>
                    <th className="py-3 px-3">Stock Deducted</th>
                    <th className="py-3 px-3">Supervisor</th>
                    {onDeleteScrap && <th className="py-3 px-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredScraps.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-600 font-semibold whitespace-nowrap">
                        {s.date}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {s.reference}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          s.condition === "CON COLA"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}>
                          {s.condition === "CON COLA" ? "CON COLA" : "SIN COLA"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-rose-600 text-right text-sm whitespace-nowrap">
                        -{s.quantity} PCS
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap text-slate-600">
                        <span className="font-bold text-slate-800">{s.stockDeductedFrom}</span>
                        <span className="text-slate-400 ml-1">({s.stockBefore}➔{s.stockAfter})</span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">
                        {s.supervisorName}
                      </td>
                      {onDeleteScrap && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={async () => {
                              if (confirm(`Revert scrap entry for ${s.reference} (-${s.quantity} PCS)? This will restore ${s.quantity} PCS back to ${s.stockDeductedFrom}.`)) {
                                await onDeleteScrap(s.id);
                              }
                            }}
                            title="Delete and restore stock"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
