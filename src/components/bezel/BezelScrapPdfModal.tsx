import React, { useState } from "react";
import {
  ParsedBezelScrapDocument,
  ParsedBezelScrapItem
} from "../../services/bezelScrapPdfParser";
import { BezelReference } from "../../types";
import {
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Warehouse,
  Factory
} from "lucide-react";
import Swal from "sweetalert2";

interface BezelScrapPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedDoc: ParsedBezelScrapDocument | null;
  references: BezelReference[];
  onApplyScrap: (
    items: {
      reference: string;
      quantity: number;
      sourceStock: "STOCK 1" | "STOCK 2";
      notes?: string;
    }[]
  ) => Promise<void>;
}

export default function BezelScrapPdfModal({
  isOpen,
  onClose,
  parsedDoc,
  references,
  onApplyScrap
}: BezelScrapPdfModalProps) {
  if (!isOpen || !parsedDoc) return null;

  const [invoiceNumber, setInvoiceNumber] = useState(parsedDoc.invoiceNumber);
  const [items, setItems] = useState<ParsedBezelScrapItem[]>(parsedDoc.items);
  const [isApplying, setIsApplying] = useState(false);

  // Update quantity
  const handleQuantityChange = (id: string, val: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(1, val) } : it))
    );
  };

  // Toggle Stock 1 vs Stock 2
  const handleStockSelect = (id: string, stock: "STOCK 1" | "STOCK 2") => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selectedStock: stock } : it))
    );
  };

  // Toggle inclusion checkbox
  const handleToggleInclude = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, included: !it.included } : it))
    );
  };

  // Remove a row
  const handleRemoveRow = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const includedItems = items.filter((it) => it.included);
  const totalQuantity = includedItems.reduce((acc, it) => acc + (it.quantity || 0), 0);

  // Check if any included item has insufficient stock
  const hasInsufficientStock = includedItems.some((it) => {
    const avail = it.selectedStock === "STOCK 1" ? it.stock1Available : it.stock2Available;
    return it.quantity > avail;
  });

  const handleConfirm = async () => {
    if (includedItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Items Selected",
        text: "Please include at least one Bezel reference to record scrap."
      });
      return;
    }

    if (hasInsufficientStock) {
      const confirmShortage = await Swal.fire({
        icon: "warning",
        title: "Stock Shortage Warning",
        text: "One or more selected Bezel references exceed available stock for the selected stock location. Do you wish to proceed?",
        showCancelButton: true,
        confirmButtonText: "Proceed Anyway",
        confirmButtonColor: "#e11d48",
        cancelButtonText: "Cancel"
      });
      if (!confirmShortage.isConfirmed) return;
    }

    setIsApplying(true);
    try {
      const payload = includedItems.map((it) => ({
        reference: it.reference,
        quantity: it.quantity,
        sourceStock: it.selectedStock,
        notes: `Scrap PDF [${invoiceNumber}]`
      }));

      await onApplyScrap(payload);

      await Swal.fire({
        icon: "success",
        title: "Bezel Scrap Recorded",
        text: `Successfully processed ${totalQuantity.toLocaleString()} NOK Bezel units across ${includedItems.length} reference(s).`,
        timer: 2000,
        showConfirmButton: false
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Scrap Failed",
        text: err?.message || "An error occurred while logging bezel scrap."
      });
    } finally {
      setIsApplying(false);
    }
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
                <span className="text-xs text-slate-500 font-mono font-bold">INVOICE / RETURN:</span>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                  className="px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono text-slate-900 w-44 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  placeholder="MPT..."
                />
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Bezel Scrap PDF Intake • Filtered strictly to BEZEL references ({items.length} detected)
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
              <span className="text-[10px] text-slate-400 block uppercase">Bezel Refs Extracted</span>
              <strong className="text-slate-900 font-bold">{items.length} items</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Total Bezel Quantity</span>
              <strong className="text-rose-600 font-bold">{totalQuantity.toLocaleString()} PCS</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Non-Bezel Filtered</span>
              <strong className="text-slate-500 font-bold">{parsedDoc.nonBezelCount} filtered out</strong>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">INCLUDE</th>
                    <th className="py-2.5 px-3">BEZEL REFERENCE</th>
                    <th className="py-2.5 px-3 text-right">QUANTITY</th>
                    <th className="py-2.5 px-3 text-center">SELECT STOCK (S1 vs S2)</th>
                    <th className="py-2.5 px-3 text-right">AVAILABLE</th>
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-mono text-xs">
                        No Bezel references found in document.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const avail = item.selectedStock === "STOCK 1" ? item.stock1Available : item.stock2Available;
                      const isShort = item.included && item.quantity > avail;

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            !item.included ? "opacity-50 bg-slate-50/40" : "hover:bg-slate-50/70"
                          }`}
                        >
                          {/* Checkbox Include */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.included}
                              onChange={() => handleToggleInclude(item.id)}
                              className="w-4 h-4 rounded text-rose-600 accent-rose-600 cursor-pointer"
                            />
                          </td>

                          {/* Reference & Description */}
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{item.reference}</span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                BEZEL
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans truncate max-w-[260px]" title={item.description}>
                              {item.description}
                            </div>
                          </td>

                          {/* Quantity */}
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value, 10) || 1)}
                              disabled={!item.included}
                              className="w-20 px-2 py-1 text-right font-bold text-slate-900 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none disabled:bg-slate-100 font-mono"
                            />
                          </td>

                          {/* Select Stock: Stock 1 vs Stock 2 Buttons */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStockSelect(item.id, "STOCK 1")}
                                disabled={!item.included}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                                  item.selectedStock === "STOCK 1"
                                    ? "bg-amber-100 text-amber-900 border-amber-300 shadow-2xs"
                                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                <Warehouse className="w-3 h-3" />
                                <span>STOCK 1 (Raw)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStockSelect(item.id, "STOCK 2")}
                                disabled={!item.included}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                                  item.selectedStock === "STOCK 2"
                                    ? "bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs"
                                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                <Factory className="w-3 h-3" />
                                <span>STOCK 2 (Assembled)</span>
                              </button>
                            </div>
                          </td>

                          {/* Available Stock & Warning */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="font-mono font-bold text-slate-800">
                              {avail.toLocaleString()} PCS
                            </div>
                            <div className="text-[10px] text-slate-400">
                              in {item.selectedStock}
                            </div>
                            {isShort && (
                              <div className="text-[10px] text-rose-600 font-bold flex items-center justify-end gap-1 mt-0.5">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Exceeds stock</span>
                              </div>
                            )}
                          </td>

                          {/* Remove button */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remove item"
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
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <div className="text-xs font-mono text-slate-500">
            <span>Selected for Scrap: </span>
            <strong className="text-rose-700">{totalQuantity.toLocaleString()} PCS</strong>
            <span className="text-slate-400"> ({includedItems.length} references)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isApplying || includedItems.length === 0}
              className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs inline-flex items-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isApplying ? "Recording Scrap..." : "Confirm & Deduct Stock"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
