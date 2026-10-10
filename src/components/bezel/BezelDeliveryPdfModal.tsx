import React, { useState } from "react";
import {
  X,
  Send,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  FileText,
  Loader2,
  Trash2
} from "lucide-react";
import Swal from "sweetalert2";
import {
  ParsedBezelDeliveryDocument,
  ParsedBezelDeliveryItem
} from "../../services/bezelDeliveryPdfParser";
import { BezelReference, User } from "../../types";
import { executeBezelBatchDelivery } from "../../services/bezelService";

interface BezelDeliveryPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedDoc: ParsedBezelDeliveryDocument | null;
  bezelReferences: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export default function BezelDeliveryPdfModal({
  isOpen,
  onClose,
  parsedDoc,
  bezelReferences,
  currentUser,
  onSuccess,
  onError
}: BezelDeliveryPdfModalProps) {
  const [items, setItems] = useState<ParsedBezelDeliveryItem[]>(() => parsedDoc?.items || []);
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => parsedDoc?.invoiceNumber || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state if parsedDoc changes
  React.useEffect(() => {
    if (parsedDoc) {
      setItems(parsedDoc.items);
      setInvoiceNumber(parsedDoc.invoiceNumber);
    }
  }, [parsedDoc]);

  if (!isOpen || !parsedDoc) return null;

  // Active bezel deduction items (only those that resolve to a bezel and are checked)
  const bezelItems = items.filter((it) => it.isBezelDeduction && it.associatedBezelRef && it.included);
  const totalBezelQty = bezelItems.reduce((acc, it) => acc + it.quantity, 0);

  // Check for insufficient Stock 2
  const hasInsufficient = bezelItems.some((it) => {
    const ref = bezelReferences.find((r) => r.code === it.associatedBezelRef);
    const available = ref?.stock2 || 0;
    return available < it.quantity;
  });

  const handleToggleInclude = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, included: !it.included } : it))
    );
  };

  const handleUpdateQty = (id: string, qty: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(1, qty) } : it))
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleConfirmDelivery = async () => {
    if (bezelItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Bezel Items",
        text: "No valid Bezel items selected for Stock 2 deduction."
      });
      return;
    }

    if (hasInsufficient) {
      const confirmOverride = await Swal.fire({
        icon: "warning",
        title: "Insufficient Stock 2",
        text: "One or more bezel references exceed currently recorded Stock 2. Do you want to proceed?",
        showCancelButton: true,
        confirmButtonText: "Proceed",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#9333ea"
      });
      if (!confirmOverride.isConfirmed) return;
    }

    const confirmRes = await Swal.fire({
      title: "Confirm Bezel Delivery?",
      text: `Deduct ${totalBezelQty.toLocaleString()} PCS across ${bezelItems.length} Bezel reference(s) from Stock 2 OUT under Invoice ${invoiceNumber}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Confirm Delivery",
      cancelButtonText: "Review",
      confirmButtonColor: "#9333ea"
    });

    if (!confirmRes.isConfirmed) return;

    setIsSubmitting(true);
    try {
      const res = await executeBezelBatchDelivery({
        invoiceNumber: invoiceNumber.trim(),
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
        items: bezelItems.map((it) => ({
          reference: it.associatedBezelRef!,
          quantity: it.quantity,
          sourceSWRef: it.invoiceRef,
          description: it.description,
          orderNumber: it.orderNumber
        }))
      });

      onSuccess(
        `Delivery processed: -${res.totalQuantity.toLocaleString()} PCS deducted from Bezel Stock 2 (Invoice #${invoiceNumber}).`
      );
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to execute bezel delivery.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-purple-500/20 shadow-md">
              <Send className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight truncate">
                  BEZEL DELIVERY DISPATCH
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border bg-purple-50 text-purple-700 border-purple-200">
                  SW → S2 OUT
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Verify SW references and decomposed Bezels to deduct from Stock 2
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Top Meta Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                Invoice / BL #
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="e.g. MPT2332"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                Deduction Source
              </label>
              <div className="px-2.5 py-1.5 text-xs font-mono font-extrabold rounded-xl border bg-purple-50 border-purple-200 text-purple-900 flex items-center justify-between">
                <span>STOCK 2 (Ready)</span>
                <span className="font-mono text-[11px] font-black">→ OUT</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                Total Bezel Deduction
              </label>
              <div className="px-2.5 py-1.5 text-xs font-mono font-black text-slate-900 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                <span>{bezelItems.length} lines</span>
                <span className="text-purple-600 font-black text-sm">
                  -{totalBezelQty.toLocaleString()} PCS
                </span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 z-10 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">Inc</th>
                    <th className="py-2.5 px-3">SW Reference (Doc)</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Resolved Bezel</th>
                    <th className="py-2.5 px-3 text-right w-24">Quantity</th>
                    <th className="py-2.5 px-3 text-center w-28">S2 Stock Status</th>
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => {
                    const bRef = bezelReferences.find((r) => r.code === it.associatedBezelRef);
                    const availableS2 = bRef?.stock2 || 0;
                    const isInsufficient = it.isBezelDeduction && availableS2 < it.quantity;

                    return (
                      <tr
                        key={it.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          !it.included || !it.isBezelDeduction ? "opacity-50 bg-slate-50/30" : ""
                        }`}
                      >
                        {/* Include Checkbox */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={it.included && it.isBezelDeduction}
                            disabled={!it.isBezelDeduction}
                            onChange={() => handleToggleInclude(it.id)}
                            className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer disabled:opacity-30"
                          />
                        </td>

                        {/* SW Reference */}
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {it.invoiceRef}
                        </td>

                        {/* Description */}
                        <td
                          className="py-2 px-3 text-slate-600 text-[11px] max-w-[220px] truncate"
                          title={it.description}
                        >
                          {it.description}
                        </td>

                        {/* Resolved Bezel Reference */}
                        <td className="py-2 px-3">
                          {it.associatedBezelRef ? (
                            <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-purple-100 text-purple-900 border border-purple-200">
                              {it.associatedBezelRef}
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400">
                              No Bezel
                            </span>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => handleUpdateQty(it.id, parseInt(e.target.value) || 1)}
                            className="w-20 px-2 py-1 text-right text-xs font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-900"
                          />
                        </td>

                        {/* Stock 2 Available & Status */}
                        <td className="py-2 px-3 text-center">
                          {!it.isBezelDeduction ? (
                            <span className="text-[10px] text-slate-400 font-mono">Excluded</span>
                          ) : isInsufficient ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              S2: {availableS2} (Short)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              S2: {availableS2} (OK)
                            </span>
                          )}
                        </td>

                        {/* Delete */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(it.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="p-3 bg-slate-50/90 border-t border-slate-200 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">
                Selected: {bezelItems.length} Bezel reference(s)
              </span>
              <span className="font-bold text-slate-900">
                Total to remove from S2: -{totalBezelQty.toLocaleString()} PCS
              </span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmDelivery}
            disabled={isSubmitting || bezelItems.length === 0}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-purple-500/20 shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deducting from S2...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Delivery (-{totalBezelQty.toLocaleString()} PCS S2)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
