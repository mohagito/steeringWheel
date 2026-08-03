import React, { useState, useMemo } from "react";
import { ScrapEntry, Reference, User } from "../types";
import { 
  Trash2, Calendar, Hash, AlertTriangle, CheckCircle2, 
  Search, ShieldAlert, Layers, Flame, FileText, RefreshCw, Plus
} from "lucide-react";
import Swal from "sweetalert2";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";

interface ScrapRow {
  referenceCode: string;
  quantity: string;
  condition: "CON COLA" | "SIN COLA";
}

interface ScrapWorkspaceProps {
  scraps: ScrapEntry[];
  references: Reference[];
  currentUser: User;
  onSubmitScrap: (scrapData: Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter" | "stockDeductedFrom"> | Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter" | "stockDeductedFrom">[]) => Promise<void>;
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
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [defaultCondition, setDefaultCondition] = useState<"CON COLA" | "SIN COLA">("CON COLA");
  
  // Multi-reference rows
  const [rows, setRows] = useState<ScrapRow[]>([
    { referenceCode: "", quantity: "", condition: "CON COLA" }
  ]);

  // UX Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search & Filter State for Scrap Table
  const [searchTerm, setSearchTerm] = useState("");
  const [conditionFilter, setConditionFilter] = useState<"ALL" | "CON COLA" | "SIN COLA">("ALL");

  const handleAddRow = () => {
    setRows([
      ...rows,
      { referenceCode: "", quantity: "", condition: defaultCondition }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof ScrapRow, value: string) => {
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

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!date) {
      setErrorMsg("Please select a date.");
      return;
    }

    if (rows.length === 0) {
      setErrorMsg("Please add at least one reference to scrap.");
      return;
    }

    const cleanedInvoice = invoiceNumber.trim().toUpperCase();
    const submissions: Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter" | "stockDeductedFrom">[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cleanRef = row.referenceCode.trim().toUpperCase();

      if (!cleanRef) {
        setErrorMsg(`Row ${i + 1}: Please select a reference code.`);
        return;
      }

      const qtyVal = parseInt(row.quantity, 10);
      if (isNaN(qtyVal) || qtyVal <= 0) {
        setErrorMsg(`Row ${i + 1} (${cleanRef}): Please enter a valid positive quantity for NOK pieces.`);
        return;
      }

      submissions.push({
        date,
        reference: cleanRef,
        quantity: qtyVal,
        condition: row.condition || defaultCondition,
        invoiceNumber: cleanedInvoice,
        notes: ""
      });
    }

    try {
      setSubmitting(true);
      await onSubmitScrap(submissions);

      const msg = `Logged ${submissions.length} scrap reference item(s)${cleanedInvoice ? ` for Invoice ${cleanedInvoice}` : ""} on ${date}.`;
      setSuccessMsg(msg);
      
      // Reset entry inputs (keep date)
      setInvoiceNumber("");
      setRows([{ referenceCode: "", quantity: "", condition: defaultCondition }]);

      Swal.fire({
        title: "Good job!",
        text: msg,
        icon: "success",
        confirmButtonText: "OK",
        confirmButtonColor: "#2563eb"
      });
      
      setTimeout(() => setSuccessMsg(""), 4500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to record scrap entries.");
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
        (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
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
            
            {/* Header controls: Date & Scrap Invoice */}
            <div className="grid grid-cols-2 gap-3">
              {/* DATE */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>1. Date</span>
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-mono font-bold"
                />
              </div>

              {/* SCRAP INVOICE NUMBER */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Invoice / Note #</span>
                  <span className="text-[9px] text-slate-400 font-normal">Traceability</span>
                </label>
                <div className="relative">
                  <FileText className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. INV-SCRAP-001"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-mono font-bold uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Default Condition selector for fast adding */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Default Condition for New Items
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDefaultCondition("CON COLA")}
                  className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    defaultCondition === "CON COLA"
                      ? "bg-rose-50 border-rose-600 text-rose-800"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  CON COLA (Deducts Stock 3)
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultCondition("SIN COLA")}
                  className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    defaultCondition === "SIN COLA"
                      ? "bg-amber-50 border-amber-600 text-amber-800"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  SIN COLA (Deducts Stock 2)
                </button>
              </div>
            </div>

            {/* DYNAMIC SCRAP REFERENCES LIST */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Scrap Items in Shipment / Batch
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {rows.length} reference{rows.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-3.5 overflow-visible">
                {rows.map((row, index) => {
                  const selectedRefObj = references.find((r) => r.code.toUpperCase() === row.referenceCode.trim().toUpperCase());
                  const isConCola = row.condition === "CON COLA";
                  const relevantStock = selectedRefObj 
                    ? (isConCola ? (selectedRefObj.stock3 || 0) : (selectedRefObj.stock2 || 0))
                    : 0;

                  return (
                    <div key={index} className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl relative space-y-3 overflow-visible shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-md">
                          Scrap Item #{index + 1}
                        </span>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(index)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove reference"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-3 items-start overflow-visible">
                        {/* Reference Selector */}
                        <div className="col-span-12 sm:col-span-6 overflow-visible">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reference Code</label>
                          <CustomReferenceSelect
                            references={references}
                            value={row.referenceCode}
                            onChange={(val) => handleRowChange(index, "referenceCode", val)}
                            placeholder="Select/Scan code..."
                            required
                            size="sm"
                          />
                        </div>

                        {/* Condition per Row */}
                        <div className="col-span-12 sm:col-span-6 overflow-visible">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Glue State</label>
                          <CustomSelect
                            value={row.condition}
                            onChange={(val) => handleRowChange(index, "condition", val as any)}
                            options={[
                              { value: "CON COLA", label: "CON COLA (Deducts Stock 3)" },
                              { value: "SIN COLA", label: "SIN COLA (Deducts Stock 2)" }
                            ]}
                            size="sm"
                          />
                        </div>

                        {/* Quantity per Row */}
                        <div className="col-span-12">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Defective Quantity (NOK PCS)</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Enter NOK quantity..."
                            value={row.quantity}
                            onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                            className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-slate-900 font-bold"
                            required
                          />
                        </div>
                      </div>

                      {selectedRefObj && (
                        <div className="flex items-center justify-between text-[10px] font-mono px-0.5 pt-1 border-t border-slate-200/50">
                          <span className="text-slate-400 truncate max-w-[170px]">{selectedRefObj.description}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[9px]">
                              Available {isConCola ? "Stock 3 (CON COLA)" : "Stock 2 (SIN COLA)"}:
                            </span>
                            <span className={`font-bold ${relevantStock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                              {relevantStock} pcs
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Reference to Scrap</span>
                </button>
              </div>
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
                    <span>Processing Scrap Batch...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>RECORD SCRAP ENTRY ({rows.length} ITEM{rows.length > 1 ? "S" : ""})</span>
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
                    <th className="py-3 px-3">Scrap Invoice #</th>
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
                      <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                        {s.invoiceNumber ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-bold text-[11px] border border-slate-200/80">
                            <FileText className="w-3 h-3 text-rose-600 shrink-0" />
                            {s.invoiceNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">—</span>
                        )}
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
                              const result = await Swal.fire({
                                title: "Revert Scrap Entry?",
                                text: `Revert scrap entry for ${s.reference} (-${s.quantity} PCS)? This will restore ${s.quantity} PCS back to ${s.stockDeductedFrom}.`,
                                icon: "warning",
                                showCancelButton: true,
                                confirmButtonColor: "#dc2626",
                                cancelButtonColor: "#64748b",
                                confirmButtonText: "Yes, Revert & Restore Stock",
                                cancelButtonText: "Cancel"
                              });

                              if (result.isConfirmed) {
                                try {
                                  await onDeleteScrap(s.id);
                                  await Swal.fire({
                                    title: "Scrap Entry Reverted",
                                    text: `Successfully restored ${s.quantity} PCS to ${s.stockDeductedFrom} for ${s.reference}.`,
                                    icon: "success",
                                    timer: 1800,
                                    showConfirmButton: false
                                  });
                                } catch (err: any) {
                                  console.error(err);
                                  await Swal.fire("Error", err?.message || "Failed to revert scrap entry.", "error");
                                }
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
