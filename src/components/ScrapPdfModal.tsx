import React, { useState } from "react";
import { ParsedScrapDocument, ParsedScrapRowItem } from "../services/scrapPdfParser";
import { Reference, ScrapEntry } from "../types";
import { 
  CheckCircle2, AlertCircle, X, Trash2, 
  ChevronDown, ChevronUp, FileText, Layers, Check 
} from "lucide-react";
import Swal from "sweetalert2";
import { getMoroccoTodayDateString } from "../utils/timeUtils";

interface ScrapPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedDoc: ParsedScrapDocument | null;
  references: Reference[];
  onApplyScrap: (
    scrapData: Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter">[]
  ) => Promise<void>;
  onLoadIntoForm: (
    items: ParsedScrapRowItem[],
    invoiceNumber: string,
    week: string
  ) => void;
}

export default function ScrapPdfModal({
  isOpen,
  onClose,
  parsedDoc,
  references,
  onApplyScrap,
  onLoadIntoForm
}: ScrapPdfModalProps) {
  if (!isOpen || !parsedDoc) return null;

  // Local state for editable items, invoiceNumber, week
  const [invoiceNumber, setInvoiceNumber] = useState(parsedDoc.invoiceNumber);
  const [week, setWeek] = useState(parsedDoc.week);
  const [items, setItems] = useState<ParsedScrapRowItem[]>(parsedDoc.items);
  const [showNonMesh, setShowNonMesh] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Totals
  const totalMeshPcs = items.reduce((acc, it) => acc + (it.quantity || 0), 0);

  // Update item quantity
  const handleQuantityChange = (id: string, val: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(0, val) } : it))
    );
  };

  // Select stock (S1, S2, S3) via checkbox
  const handleStockSelect = (id: string, stock: "Stock 1" | "Stock 2" | "Stock 3") => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, stock } : it))
    );
  };

  // Set S2 subtype (normal vs disassembly)
  const handleSetS2Subtype = (id: string, subtype: "normal" | "disassembly") => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, stock2Subtype: subtype } : it))
    );
  };

  // Toggle S2 subtype (normal vs disassembly)
  const handleToggleS2Subtype = (id: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const nextSubtype = it.stock2Subtype === "disassembly" ? "normal" : "disassembly";
        return { ...it, stock2Subtype: nextSubtype };
      })
    );
  };

  // Remove a row
  const handleRemoveRow = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Get available stock for an item based on its selected stock
  const getSelectedStockBalance = (item: ParsedScrapRowItem) => {
    const catRef = references.find((r) => (r.code || "").toUpperCase() === item.reference.toUpperCase());
    if (!catRef) return 0;
    if (item.stock === "Stock 1") return catRef.stock1 ?? 0;
    if (item.stock === "Stock 2") {
      if (item.stock2Subtype === "disassembly") return catRef.stock2Disassembly ?? 0;
      return catRef.stock2 ?? 0;
    }
    return catRef.stock3 ?? 0;
  };

  // Submit and apply all items
  const handleConfirmApply = async () => {
    if (items.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Meshes Selected",
        text: "Please include at least one mesh row to apply scrap."
      });
      return;
    }

    if (!invoiceNumber.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Invoice Number Required",
        text: "Please provide a valid invoice number."
      });
      return;
    }

    const invalidQty = items.some((it) => it.quantity <= 0);
    if (invalidQty) {
      Swal.fire({
        icon: "warning",
        title: "Invalid Quantity",
        text: "All included mesh rows must have a quantity greater than zero."
      });
      return;
    }

    setIsApplying(true);
    try {
      const todayStr = getMoroccoTodayDateString();
      const payload: Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter">[] =
        items.map((it) => ({
          reference: it.reference.trim().toUpperCase(),
          quantity: it.quantity,
          stockDeductedFrom: it.stock,
          stock2Subtype: it.stock === "Stock 2" ? it.stock2Subtype || "normal" : undefined,
          condition: it.cola === "CON_COLA" ? "CON COLA" : "SIN COLA",
          cola: it.cola,
          colaStatus: it.cola,
          invoiceNumber: invoiceNumber.trim().toUpperCase(),
          date: todayStr,
          week: week.trim().toUpperCase(),
          notes: `PDF Scrap Return [${invoiceNumber}] - ${it.statusDisplay}`
        }));

      await onApplyScrap(payload);

      await Swal.fire({
        icon: "success",
        title: "Scrap Registered",
        text: `Invoice #${invoiceNumber}: Deducted ${totalMeshPcs.toLocaleString()} PCS across ${items.length} mesh row(s).`,
        timer: 1800,
        showConfirmButton: false
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Failed to Apply Scrap",
        text: err?.message || "An error occurred while logging scrap entries."
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleTransferToForm = () => {
    onLoadIntoForm(items, invoiceNumber.trim().toUpperCase(), week);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs font-mono">
              PDF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono font-bold">INVOICE:</span>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                  className="px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono text-slate-900 w-36 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  placeholder="MPT..."
                />
                <span className="text-xs text-slate-500 font-mono font-bold ml-2">WEEK:</span>
                <input
                  type="text"
                  value={week}
                  onChange={(e) => setWeek(e.target.value.toUpperCase())}
                  className="px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono text-slate-900 w-20 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  placeholder="W40"
                />
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Scrap / Return Invoice • {items.length} mesh row(s) detected
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Meshes Extracted</span>
              <strong className="text-slate-900 font-bold">{items.length} rows</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Total Mesh Quantity</span>
              <strong className="text-rose-600 font-bold">{totalMeshPcs.toLocaleString()} PCS</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Other Materials</span>
              <strong className="text-slate-500 font-bold">{parsedDoc.nonMeshRowsCount} filtered</strong>
            </div>
          </div>

          {/* Mesh Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">MESH REFERENCE</th>
                    <th className="py-2.5 px-3">STATUS</th>
                    <th className="py-2.5 px-3 text-right">QUANTITY</th>
                    <th className="py-2.5 px-3 text-center">STOCK (S1 / S2 / S3)</th>
                    <th className="py-2.5 px-3 text-right">AVAILABLE</th>
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-mono text-xs">
                        No mesh items in document.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const avail = getSelectedStockBalance(item);
                      const isShort = item.quantity > avail;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* 1. Mesh Reference & Description */}
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 text-xs">{item.reference}</div>
                            <div className="text-[10px] text-slate-500 font-sans truncate max-w-[240px]" title={item.description}>
                              {item.description || "Mesh Heating Element"}
                            </div>
                          </td>

                          {/* 2. Status: CON COLA vs SIN COLA */}
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase border ${
                                item.cola === "CON_COLA"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-blue-50 text-blue-800 border-blue-200"
                              }`}
                            >
                              {item.statusDisplay}
                            </span>
                          </td>

                          {/* 3. Quantity (Editable Input) */}
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value, 10) || 0)}
                              className="w-20 px-2 py-1 text-right font-bold text-slate-900 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                            />
                          </td>

                          {/* 4. Stock Selection Checkboxes: S1, S2, S3 & Disassembly Option */}
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="flex items-center justify-center gap-3">
                                {/* Stock 1 */}
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={item.stock === "Stock 1"}
                                    onChange={() => handleStockSelect(item.id, "Stock 1")}
                                    className="w-3.5 h-3.5 rounded text-slate-900 accent-slate-900 cursor-pointer"
                                  />
                                  <span className={`text-[11px] font-bold ${item.stock === "Stock 1" ? "text-slate-900" : "text-slate-400"}`}>
                                    S1
                                  </span>
                                </label>

                                {/* Stock 2 */}
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={item.stock === "Stock 2"}
                                    onChange={() => handleStockSelect(item.id, "Stock 2")}
                                    className="w-3.5 h-3.5 rounded text-amber-600 accent-amber-600 cursor-pointer"
                                  />
                                  <span className={`text-[11px] font-bold ${item.stock === "Stock 2" ? "text-amber-800" : "text-slate-400"}`}>
                                    S2
                                  </span>
                                </label>

                                {/* Stock 3 */}
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={item.stock === "Stock 3"}
                                    onChange={() => handleStockSelect(item.id, "Stock 3")}
                                    className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                                  />
                                  <span className={`text-[11px] font-bold ${item.stock === "Stock 3" ? "text-blue-800" : "text-slate-400"}`}>
                                    S3
                                  </span>
                                </label>
                              </div>

                              {/* Explicit Normal vs Disassembly selector when S2 is chosen */}
                              {item.stock === "Stock 2" && (
                                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleSetS2Subtype(item.id, "normal")}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                                      item.stock2Subtype !== "disassembly"
                                        ? "bg-amber-500 text-white shadow-2xs"
                                        : "text-slate-600 hover:text-slate-900"
                                    }`}
                                    title="Deduct from Regular WIP Stock 2"
                                  >
                                    Normal
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetS2Subtype(item.id, "disassembly")}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                                      item.stock2Subtype === "disassembly"
                                        ? "bg-purple-600 text-white shadow-2xs"
                                        : "text-purple-700 hover:text-purple-900"
                                    }`}
                                    title="Deduct from Disassembly Stock 2"
                                  >
                                    Disassembly
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 5. Available Balance in Selected Stock */}
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`font-mono text-xs font-bold block ${
                                isShort ? "text-rose-600" : "text-slate-700"
                              }`}
                              title={isShort ? "Insufficient stock available" : "Current balance"}
                            >
                              {avail.toLocaleString()} PCS
                              {isShort && <span className="text-[10px] text-rose-500 ml-1">(! short)</span>}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
                              {item.stock === "Stock 1"
                                ? "Stock 1"
                                : item.stock === "Stock 3"
                                ? "Stock 3"
                                : item.stock2Subtype === "disassembly"
                                ? "Disassembly S2"
                                : "Normal S2"}
                            </span>
                          </td>

                          {/* 6. Delete Row */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(item.id)}
                              className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Exclude this mesh row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Filtered Non-Mesh Materials Collapsible */}
          {parsedDoc.nonMeshItems && parsedDoc.nonMeshItems.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowNonMesh(!showNonMesh)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-mono text-slate-600 hover:bg-slate-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                    {parsedDoc.nonMeshItems.length}
                  </span>
                  <span>Non-mesh items ignored (Leather / Other materials)</span>
                </div>
                {showNonMesh ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showNonMesh && (
                <div className="p-3 border-t border-slate-200 bg-white max-h-48 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead className="text-[10px] text-slate-400 uppercase border-b border-slate-100">
                      <tr>
                        <th className="py-1 px-2">REFERENCE</th>
                        <th className="py-1 px-2">DESCRIPTION</th>
                        <th className="py-1 px-2 text-right">QTY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {parsedDoc.nonMeshItems.map((nm, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-bold">{nm.reference}</td>
                          <td className="py-1.5 px-2 text-[11px] text-slate-500 font-sans truncate max-w-[280px]">
                            {nm.description}
                          </td>
                          <td className="py-1.5 px-2 text-right">{nm.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTransferToForm}
            className="px-3.5 py-2 text-xs font-mono font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            title="Populate the manual scrap form with these items"
          >
            Load into Form
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-mono text-slate-500 hover:text-slate-800 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmApply}
              disabled={isApplying || items.length === 0}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs tracking-wide shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Deducting...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apply & Deduct ({totalMeshPcs.toLocaleString()} PCS)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
