import React, { useState, useEffect } from "react";
import { Plus, Trash2, X, Truck, Check, AlertCircle, RefreshCw } from "lucide-react";
import { doc } from "firebase/firestore";
import { db } from "../firebase";
import { Reference, User } from "../types";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { executeProtectedStockOperation } from "../services/protectionLayer";

interface IncomingItem {
  id: string;
  reference: string;
  quantity: string;
}

interface IncomingReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  references: Reference[];
  currentUser: User;
  onSuccess?: (message: string) => void;
}

export default function IncomingReceiptModal({
  isOpen,
  onClose,
  references,
  currentUser,
  onSuccess
}: IncomingReceiptModalProps) {
  const [incomingDestStock, setIncomingDestStock] = useState<"Stock 1" | "Stock 2" | "Stock 3">("Stock 1");
  const [stock2Subtype, setStock2Subtype] = useState<"normal" | "disassembly">("normal");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [items, setItems] = useState<IncomingItem[]>([
    { id: "inc-1", reference: references[0]?.code || "", quantity: "" }
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sync first reference when references load
  useEffect(() => {
    if (references.length > 0 && items.length === 1 && !items[0].reference) {
      setItems([{ id: "inc-1", reference: references[0].code, quantity: "" }]);
    }
  }, [references]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, reference: references[0]?.code || "", quantity: "" }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleUpdateItem = (id: string, field: "reference" | "quantity", value: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  const totalQty = items.reduce((sum, it) => {
    const q = parseInt(it.quantity, 10);
    return sum + (isNaN(q) || q < 0 ? 0 : q);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invNum = invoiceNumber.trim().toUpperCase();
    if (!invNum) {
      setFeedback({ type: "error", message: "Please enter an invoice or delivery note number." });
      return;
    }

    const validItems = items
      .map((it) => ({
        reference: it.reference.trim().toUpperCase(),
        quantity: parseInt(it.quantity, 10)
      }))
      .filter((it) => it.reference && !isNaN(it.quantity) && it.quantity > 0);

    if (validItems.length === 0) {
      setFeedback({ type: "error", message: "Please enter at least one valid reference and quantity." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const operatorName = currentUser.fullName || currentUser.username || "Operator";
      const now = new Date().toISOString();
      const calculatedTotal = validItems.reduce((sum, it) => sum + it.quantity, 0);

      // Group quantities by reference
      const groupedMap: Record<string, number> = {};
      for (const item of validItems) {
        groupedMap[item.reference] = (groupedMap[item.reference] || 0) + item.quantity;
      }

      const deltas = Object.entries(groupedMap).map(([ref, q]) => ({
        reference: ref,
        delta1: incomingDestStock === "Stock 1" ? q : 0,
        delta2: incomingDestStock === "Stock 2" ? q : 0,
        delta2Subtype: incomingDestStock === "Stock 2" ? stock2Subtype : undefined,
        delta3: incomingDestStock === "Stock 3" ? q : 0
      }));

      const moveType =
        incomingDestStock === "Stock 1"
          ? "STOCK 1 IN"
          : incomingDestStock === "Stock 2"
          ? "STOCK 2 IN"
          : "STOCK 3 IN";

      const transactions = validItems.map((item, idx) => ({
        id: `trans-inc-${Date.now()}-${idx}`,
        reference: item.reference,
        movementType: moveType,
        stock: incomingDestStock,
        destinationStock: incomingDestStock,
        invoiceNumber: invNum,
        quantity: item.quantity,
        expectedQty: item.quantity,
        actualQty: item.quantity,
        operatorName,
        timestamp: now,
        notes: `Received via Invoice ${invNum} -> ${incomingDestStock}${notes ? ` (${notes})` : ""}`
      }));

      const invoiceId = `inv-${invNum.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-${Date.now()}`;

      await executeProtectedStockOperation({
        operationType: "INCOMING_RECEIPT",
        deltas,
        operatorName,
        reason: `Incoming Truck: ${invNum} -> ${incomingDestStock} (${validItems.length} references, ${calculatedTotal} pcs)${notes ? ` (${notes})` : ""}`,
        transactions,
        additionalWrites: (transaction, timestamp) => {
          const invoiceDoc = doc(db, "invoices", invoiceId);
          transaction.set(invoiceDoc, {
            id: invoiceId,
            invoiceNumber: invNum,
            operator: operatorName,
            createdAt: timestamp,
            status: "approved",
            approvedAt: timestamp,
            approvedBy: operatorName,
            notes: notes || "",
            totalBoxes: validItems.length,
            totalQuantity: calculatedTotal,
            items: validItems.map((it, i) => ({
              id: `box-${invoiceId}-${i + 1}`,
              boxBarcode: `${invNum}-${it.reference}-${i + 1}`,
              reference: it.reference,
              expectedQty: it.quantity,
              quantity: it.quantity,
              scannedAt: timestamp,
              destinationStock: incomingDestStock
            }))
          });
        }
      });

      const successMsg = `Successfully added ${calculatedTotal} pcs across ${validItems.length} reference${validItems.length > 1 ? "s" : ""} via Invoice ${invNum} to ${incomingDestStock}.`;
      setFeedback({ type: "success", message: successMsg });
      if (onSuccess) onSuccess(successMsg);

      setTimeout(() => {
        onClose();
        setSubmitting(false);
        setInvoiceNumber("");
        setNotes("");
        setItems([{ id: "inc-1", reference: references[0]?.code || "", quantity: "" }]);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: "error", message: err.message || "Operation failed." });
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-150">
      <div 
        id="incoming-receipt-stock-in-modal"
        className="bg-white border border-slate-100 rounded-3xl shadow-2xl w-full max-w-xl sm:max-w-2xl p-5 sm:p-7 max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                Incoming Receipt (Stock IN)
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div
            className={`p-3 text-xs font-semibold rounded-2xl mb-4 flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-rose-50 text-rose-900 border border-rose-200"
            }`}
          >
            {feedback.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <form 
          onSubmit={handleSubmit} 
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
            }
          }}
          className="space-y-4 text-xs font-sans"
        >
          {/* Destination Stock Selection */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5 text-xs font-mono uppercase tracking-wider">
              Destination Stock <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {(["Stock 1", "Stock 2", "Stock 3"] as const).map((stk) => (
                <button
                  key={stk}
                  type="button"
                  onClick={() => setIncomingDestStock(stk)}
                  className={`py-2.5 px-2 rounded-2xl border text-[11px] sm:text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                    incomingDestStock === stk
                      ? "bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="tracking-wide font-extrabold">{stk.toUpperCase()}</span>
                  <span className="text-[9px] font-normal text-slate-500 mt-0.5 truncate max-w-full">
                    {stk === "Stock 1" ? "Warehouse Raw" : stk === "Stock 2" ? "Gluing WIP" : "Finished Wheels"}
                  </span>
                </button>
              ))}
            </div>

            {incomingDestStock === "Stock 2" && (
              <div className="mt-2.5 p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl">
                <label className="block text-slate-700 font-bold text-xs mb-1.5 font-mono uppercase">
                  Target Stock 2 Subtype <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStock2Subtype("normal")}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                      stock2Subtype === "normal"
                        ? "bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 font-black shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>NORMAL STOCK</span>
                    <span className="text-[9px] font-normal text-slate-500 mt-0.5">Regular WIP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStock2Subtype("disassembly")}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                      stock2Subtype === "disassembly"
                        ? "bg-purple-100 border-purple-500 text-purple-900 ring-2 ring-purple-500/20 font-black shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>DISASSEMBLY STOCK</span>
                    <span className="text-[9px] font-normal text-slate-500 mt-0.5">Recovered WIP</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Invoice / Delivery Note Number */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5 text-xs font-mono uppercase tracking-wider">
              Invoice / Delivery Note Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. A905220309"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-hidden focus:border-blue-500 font-mono font-bold text-slate-900 uppercase tracking-wider text-xs"
              required
            />
          </div>

          {/* References in this Invoice */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-bold text-xs font-mono uppercase tracking-wider">
                References in this Invoice <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-mono text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Reference</span>
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <div className="flex-1 min-w-0 w-full">
                      <CustomReferenceSelect
                        references={references}
                        value={item.reference}
                        onChange={(code) => handleUpdateItem(item.id, "reference", code)}
                        placeholder={`Select reference #${idx + 1}...`}
                        required
                      />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty (PCS)"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(item.id, "quantity", e.target.value)}
                        className="w-full sm:w-32 p-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-hidden focus:border-blue-500 font-mono font-bold text-slate-900 text-xs shadow-2xs"
                        required
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer shrink-0 border border-transparent hover:border-rose-100"
                          title="Remove reference"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalQty > 0 && (
              <div className="text-[11px] text-slate-600 font-mono text-right font-bold pt-0.5">
                Total: {totalQty.toLocaleString()} PCS across {items.length} reference{items.length > 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block text-slate-700 font-bold mb-1 text-xs font-mono uppercase tracking-wider">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-hidden focus:border-blue-500 text-xs font-sans"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2.5 w-full">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer font-mono text-center text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-5 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-2xl font-bold cursor-pointer transition-all disabled:opacity-50 shadow-md shadow-blue-500/20 font-mono text-center text-xs flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm Invoice ({totalQty.toLocaleString()} PCS)</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
