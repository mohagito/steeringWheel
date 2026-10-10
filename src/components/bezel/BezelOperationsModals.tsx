import React, { useState, useRef } from "react";
import {
  X,
  Truck,
  Cpu,
  Send,
  RotateCcw,
  Trash2,
  Plus,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Warehouse,
  Factory,
  UploadCloud,
  FileText,
  Loader2,
  Info
} from "lucide-react";
import { BezelReference, BezelTruckItem, User } from "../../types";
import {
  executeBezelNewTruck,
  executeBezelAssemblage,
  executeBezelDelivery,
  executeBezelBatchDelivery,
  executeBezelReturn,
  executeBezelScrap,
  createBezelReference
} from "../../services/bezelService";
import {
  parseBezelDeliveryPDF,
  ParsedBezelDeliveryDocument,
  ParsedBezelDeliveryItem
} from "../../services/bezelDeliveryPdfParser";
import {
  parseBezelScrapPDF,
  ParsedBezelScrapDocument
} from "../../services/bezelScrapPdfParser";
import BezelScrapPdfModal from "./BezelScrapPdfModal";
import { BezelActiveModal } from "./BezelActionButtons";
import Swal from "sweetalert2";

interface BezelOperationsModalsProps {
  activeModal: BezelActiveModal;
  onClose: () => void;
  references: BezelReference[];
  currentUser: User;
  onSuccess: (message: string) => void;
  onError: (errorMessage: string) => void;
  selectedReferenceCode?: string;
}

export default function BezelOperationsModals({
  activeModal,
  onClose,
  references,
  currentUser,
  onSuccess,
  onError,
  selectedReferenceCode
}: BezelOperationsModalsProps) {
  if (!activeModal) return null;

  return (
    <div
      id="bezel-modal-overlay"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {activeModal === "new_truck" && (
        <NewTruckModal
          onClose={onClose}
          references={references}
          currentUser={currentUser}
          onSuccess={onSuccess}
          onError={onError}
          initialRefCode={selectedReferenceCode}
        />
      )}

      {activeModal === "assemblage" && (
        <AssemblageModal
          onClose={onClose}
          references={references}
          currentUser={currentUser}
          onSuccess={onSuccess}
          onError={onError}
          initialRefCode={selectedReferenceCode}
        />
      )}

      {activeModal === "delivery" && (
        <DeliveryModal
          onClose={onClose}
          references={references}
          currentUser={currentUser}
          onSuccess={onSuccess}
          onError={onError}
          initialRefCode={selectedReferenceCode}
        />
      )}

      {activeModal === "return" && (
        <ReturnModal
          onClose={onClose}
          references={references}
          currentUser={currentUser}
          onSuccess={onSuccess}
          onError={onError}
          initialRefCode={selectedReferenceCode}
        />
      )}

      {activeModal === "scrap" && (
        <ScrapModal
          onClose={onClose}
          references={references}
          currentUser={currentUser}
          onSuccess={onSuccess}
          onError={onError}
          initialRefCode={selectedReferenceCode}
        />
      )}

      {activeModal === "add_reference" && (
        <AddReferenceModal
          onClose={onClose}
          currentUser={currentUser}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. NEW TRUCK MODAL
// ----------------------------------------------------------------------
function NewTruckModal({
  onClose,
  references,
  currentUser,
  onSuccess,
  onError,
  initialRefCode
}: {
  onClose: () => void;
  references: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
  initialRefCode?: string;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [items, setItems] = useState<BezelTruckItem[]>([
    {
      id: "item-1",
      reference: initialRefCode || (references.length > 0 ? references[0].code : ""),
      quantity: 100,
      destinationStock: "STOCK 1"
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        reference: references.length > 0 ? references[0].code : "",
        quantity: 50,
        destinationStock: "STOCK 1"
      }
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, patch: Partial<BezelTruckItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      onError("Add at least one item to the truck.");
      return;
    }

    for (const item of items) {
      if (!item.reference.trim()) {
        onError("Please select or enter a reference for all items.");
        return;
      }
      if (item.quantity <= 0) {
        onError("Quantities must be greater than zero.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await executeBezelNewTruck({
        invoiceNumber: invoiceNumber.trim(),
        items,
        operatorName: currentUser.fullName,
        operatorId: currentUser.id
      });
      onSuccess(`New Truck intake complete: ${res.operations.length} item(s), ${totalQuantity} units added.`);
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to process truck intake.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">NEW TRUCK INTAKE</h3>
            <p className="text-xs text-slate-500">Receive Bezel materials into Stock 1 or Stock 2</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Truck / Invoice / Delivery Note # (Optional)
          </label>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. TRUCK-2026-884"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Truck Items ({items.length})
            </label>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                      Reference #{idx + 1}
                    </label>
                    {references.length > 0 ? (
                      <select
                        value={item.reference}
                        onChange={(e) => updateItem(idx, { reference: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono font-semibold"
                      >
                        {references.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.code} — {r.description} {r.client ? `[${r.client}]` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={item.reference}
                        onChange={(e) => updateItem(idx, { reference: e.target.value })}
                        placeholder="e.g. BZ-F150-L"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono"
                      />
                    )}
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-md mt-4"
                      title="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                      Quantity (Pieces)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 0) })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                      Destination Stock
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => updateItem(idx, { destinationStock: "STOCK 1" })}
                        className={`py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                          item.destinationStock === "STOCK 1"
                            ? "bg-amber-600 text-white shadow-xs"
                            : "text-slate-700 hover:text-slate-900"
                        }`}
                      >
                        STOCK 1
                      </button>
                      <button
                        type="button"
                        onClick={() => updateItem(idx, { destinationStock: "STOCK 2" })}
                        className={`py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                          item.destinationStock === "STOCK 2"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "text-slate-700 hover:text-slate-900"
                        }`}
                      >
                        STOCK 2
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 flex items-center justify-between text-xs text-blue-950 font-medium">
          <span>Total Intake Quantity:</span>
          <span className="font-mono font-bold text-sm text-blue-900">{totalQuantity} units</span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            id="bezel-confirm-new-truck-btn"
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? "Processing Transaction..." : "Confirm Truck Intake"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. ASSEMBLAGE MODAL (STOCK 1 -> STOCK 2)
// ----------------------------------------------------------------------
function AssemblageModal({
  onClose,
  references,
  currentUser,
  onSuccess,
  onError,
  initialRefCode
}: {
  onClose: () => void;
  references: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
  initialRefCode?: string;
}) {
  const [refCode, setRefCode] = useState(
    initialRefCode || (references.length > 0 ? references[0].code : "")
  );
  const [quantity, setQuantity] = useState(25);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRef = references.find((r) => r.code === refCode);
  const availableS1 = selectedRef?.stock1 || 0;
  const currentS2 = selectedRef?.stock2 || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode) {
      onError("Select a reference.");
      return;
    }
    if (quantity <= 0) {
      onError("Quantity must be greater than zero.");
      return;
    }
    if (quantity > availableS1) {
      onError(`Insufficient Stock 1 (Available: ${availableS1}, Requested: ${quantity}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await executeBezelAssemblage({
        reference: refCode,
        quantity,
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
      });
      onSuccess(`Assemblage executed: ${quantity} units of ${refCode} transferred from Stock 1 to Stock 2.`);
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to execute assemblage.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">ASSEMBLAGE OPERATION</h3>
            <p className="text-xs text-slate-500">Move material from Stock 1 into Stock 2</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Bezel Reference
          </label>
          <select
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {references.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} (S1: {r.stock1} | S2: {r.stock2}) — {r.description} {r.client ? `[${r.client}]` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Visual Flow Indicator */}
        <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center justify-between">
          <div className="text-center">
            <div className="text-[10px] uppercase font-bold text-amber-800">STOCK 1 (Raw)</div>
            <div className="font-mono font-bold text-base text-slate-900">{availableS1}</div>
            <div className="text-[10px] text-rose-600 font-semibold">
              - {quantity} → {Math.max(0, availableS1 - quantity)}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center px-4">
            <ArrowRight className="w-5 h-5 text-emerald-600" />
            <span className="text-[10px] font-bold text-emerald-800 uppercase mt-0.5">
              TRANSFER
            </span>
          </div>

          <div className="text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-800">STOCK 2 (Ready)</div>
            <div className="font-mono font-bold text-base text-slate-900">{currentS2}</div>
            <div className="text-[10px] text-emerald-600 font-semibold">
              + {quantity} → {currentS2 + quantity}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quantity to Assemble
            </label>
            <button
              type="button"
              onClick={() => setQuantity(availableS1)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              MAX ({availableS1})
            </button>
          </div>
          <input
            type="number"
            min="1"
            max={availableS1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {quantity > availableS1 && (
            <p className="text-xs text-rose-600 font-medium mt-1">
              Quantity exceeds available Stock 1 ({availableS1})
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || quantity <= 0 || quantity > availableS1}
            id="bezel-confirm-assemblage-btn"
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? "Executing Assemblage..." : "Execute Assemblage"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. DELIVERY MODAL (STOCK 2 -> OUT) - Supports PDF SW Decomposition & Manual
// ----------------------------------------------------------------------
function DeliveryModal({
  onClose,
  references,
  currentUser,
  onSuccess,
  onError,
  initialRefCode
}: {
  onClose: () => void;
  references: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
  initialRefCode?: string;
}) {
  const [mode, setMode] = useState<"pdf" | "manual">("pdf");

  // PDF Delivery states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedDoc, setParsedDoc] = useState<ParsedBezelDeliveryDocument | null>(null);
  const [pdfItems, setPdfItems] = useState<ParsedBezelDeliveryItem[]>([]);
  const [pdfInvoiceNumber, setPdfInvoiceNumber] = useState("");

  // Manual delivery states
  const [refCode, setRefCode] = useState(
    initialRefCode || (references.length > 0 ? references[0].code : "")
  );
  const [quantity, setQuantity] = useState(20);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRef = references.find((r) => r.code === refCode);
  const availableS2 = selectedRef?.stock2 || 0;

  // Active bezel deduction items
  const activeBezelItems = pdfItems.filter(
    (it) => it.isBezelDeduction && it.associatedBezelRef && it.included
  );
  const totalPdfBezelQty = activeBezelItems.reduce((acc, it) => acc + it.quantity, 0);

  // Check insufficient Stock 2 for PDF items
  const hasInsufficientS2 = activeBezelItems.some((it) => {
    const bRef = references.find((r) => r.code === it.associatedBezelRef);
    const avail = bRef?.stock2 || 0;
    return avail < it.quantity;
  });

  const handleProcessPdf = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      Swal.fire({
        icon: "warning",
        title: "PDF Required",
        text: "Please select a valid PDF delivery note or invoice."
      });
      return;
    }

    setIsParsing(true);
    try {
      const doc = await parseBezelDeliveryPDF(file, references);
      if (doc.items.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Line Items Detected",
          text: "No valid steering wheel or bezel lines found in this PDF document."
        });
        setIsParsing(false);
        return;
      }

      setParsedDoc(doc);
      setPdfItems(doc.items);
      setPdfInvoiceNumber(doc.invoiceNumber);
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "PDF Error",
        text: err?.message || "Failed to read delivery invoice."
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleProcessPdf(f);
  };

  const handleToggleInclude = (id: string) => {
    setPdfItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, included: !it.included } : it))
    );
  };

  const handleUpdateQty = (id: string, q: number) => {
    setPdfItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(1, q) } : it))
    );
  };

  const handleDeleteItem = (id: string) => {
    setPdfItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleConfirmPdfDelivery = async () => {
    if (activeBezelItems.length === 0) {
      onError("No valid Bezel items selected for Stock 2 deduction.");
      return;
    }

    if (hasInsufficientS2) {
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

    setIsSubmitting(true);
    try {
      const res = await executeBezelBatchDelivery({
        invoiceNumber: pdfInvoiceNumber.trim(),
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
        items: activeBezelItems.map((it) => ({
          reference: it.associatedBezelRef!,
          quantity: it.quantity,
          sourceSWRef: it.invoiceRef,
          description: it.description,
          orderNumber: it.orderNumber
        }))
      });
      onSuccess(
        `Delivery dispatched: -${res.totalQuantity.toLocaleString()} PCS deducted from Stock 2 (${pdfInvoiceNumber}).`
      );
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to execute delivery.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode) {
      onError("Select a reference.");
      return;
    }
    if (quantity <= 0) {
      onError("Quantity must be greater than zero.");
      return;
    }
    if (quantity > availableS2) {
      onError(`Insufficient Stock 2 (Available: ${availableS2}, Requested: ${quantity}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await executeBezelDelivery({
        reference: refCode,
        quantity,
        invoiceNumber: invoiceNumber.trim(),
        operatorName: currentUser.fullName,
        operatorId: currentUser.id
      });
      onSuccess(`Delivery dispatched: ${quantity} units of ${refCode} shipped from Stock 2.`);
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to execute delivery.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col overflow-hidden">
      {/* Modal Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-purple-500/20 shadow-md">
            <Send className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
              BEZEL DELIVERY DISPATCH
            </h3>
            <p className="text-xs text-slate-500 truncate">
              Ship finished Bezel material from Stock 2 OUT
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-2 mt-3 p-1 bg-slate-100 rounded-xl shrink-0">
        <button
          type="button"
          onClick={() => setMode("pdf")}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            mode === "pdf"
              ? "bg-white text-purple-700 shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload Delivery PDF (SW → S2)</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            mode === "manual"
              ? "bg-white text-purple-700 shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Manual Single Dispatch</span>
        </button>
      </div>

      {/* Tab 1: PDF DELIVERY */}
      {mode === "pdf" && (
        <div className="mt-4 flex-1 overflow-y-auto space-y-4">
          {!parsedDoc ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? "border-purple-500 bg-purple-50/70 scale-[0.99]"
                  : "border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/30"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleProcessPdf(f);
                }}
              />

              {isParsing ? (
                <div className="py-4 flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                  <div className="text-xs font-bold text-slate-800">Reading PDF & Resolving Bezels...</div>
                  <div className="text-[11px] text-slate-400 font-mono">Decomposing SW references into Stock 2 bezels</div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-2xs">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-extrabold text-slate-800">
                      Upload Steering Wheel Delivery PDF
                    </div>
                    <div className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Drop the invoice or delivery note here. The system automatically reads SW references and deduces which Bezels to remove from Stock 2.
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-purple-700 shadow-2xs">
                    Auto-Deduction from S2
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono mb-1">
                    Invoice #
                  </label>
                  <input
                    type="text"
                    value={pdfInvoiceNumber}
                    onChange={(e) => setPdfInvoiceNumber(e.target.value.toUpperCase())}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono mb-1">
                    Target Stock
                  </label>
                  <div className="px-2 py-1 text-xs font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200 rounded-lg">
                    STOCK 2 → OUT
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono mb-1">
                    Total Deduction
                  </label>
                  <div className="px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg text-purple-700">
                    -{totalPdfBezelQty.toLocaleString()} PCS ({activeBezelItems.length} lines)
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 text-[10px] font-bold text-slate-500 uppercase font-mono border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 text-center w-8">Inc</th>
                      <th className="py-2 px-2.5">SW Ref</th>
                      <th className="py-2 px-2.5">Resolved Bezel</th>
                      <th className="py-2 px-2.5 text-right w-20">Quantity</th>
                      <th className="py-2 px-2.5 text-center w-24">S2 Status</th>
                      <th className="py-2 px-1 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {pdfItems.map((it) => {
                      const bRef = references.find((r) => r.code === it.associatedBezelRef);
                      const avail = bRef?.stock2 || 0;
                      const isShort = it.isBezelDeduction && avail < it.quantity;

                      return (
                        <tr
                          key={it.id}
                          className={`hover:bg-slate-50/80 ${
                            !it.included || !it.isBezelDeduction ? "opacity-40" : ""
                          }`}
                        >
                          <td className="py-1.5 px-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={it.included && it.isBezelDeduction}
                              disabled={!it.isBezelDeduction}
                              onChange={() => handleToggleInclude(it.id)}
                              className="rounded text-purple-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 font-bold text-slate-900">
                            {it.invoiceRef}
                          </td>
                          <td className="py-1.5 px-2.5">
                            {it.associatedBezelRef ? (
                              <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-purple-100 text-purple-800">
                                {it.associatedBezelRef}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">No Bezel</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right">
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => handleUpdateQty(it.id, parseInt(e.target.value) || 1)}
                              className="w-16 px-1.5 py-0.5 text-right text-xs border border-slate-300 rounded font-bold"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {isShort ? (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1 py-0.5 rounded">
                                S2: {avail} (Low)
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
                                S2: {avail} (OK)
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(it.id)}
                              className="text-slate-400 hover:text-rose-600 p-0.5"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setParsedDoc(null);
                    setPdfItems([]);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  ← Upload Different PDF
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPdfDelivery}
                    disabled={isSubmitting || activeBezelItems.length === 0}
                    className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Deducting...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm Delivery (-{totalPdfBezelQty.toLocaleString()} PCS S2)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: MANUAL DISPATCH */}
      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Bezel Reference
            </label>
            <select
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {references.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} (Ready in Stock 2: {r.stock2}) — {r.description} {r.client ? `[${r.client}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Visual Flow Indicator */}
          <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 flex items-center justify-between">
            <div className="text-center">
              <div className="text-[10px] uppercase font-bold text-purple-800">STOCK 2 (Ready)</div>
              <div className="font-mono font-bold text-base text-slate-900">{availableS2}</div>
              <div className="text-[10px] text-rose-600 font-semibold">
                - {quantity} → {Math.max(0, availableS2 - quantity)}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center px-4">
              <ArrowRight className="w-5 h-5 text-purple-600" />
              <span className="text-[10px] font-bold text-purple-800 uppercase mt-0.5">
                OUT TO CUSTOMER
              </span>
            </div>

            <div className="text-center">
              <div className="text-[10px] uppercase font-bold text-slate-600">DELIVERED</div>
              <div className="font-mono font-bold text-base text-purple-700">{quantity} units</div>
              <div className="text-[10px] text-emerald-600 font-semibold">Dispatched</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Quantity
                </label>
                <button
                  type="button"
                  onClick={() => setQuantity(availableS2)}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 cursor-pointer"
                >
                  MAX ({availableS2})
                </button>
              </div>
              <input
                type="number"
                min="1"
                max={availableS2}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Invoice / BL #
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. BL-2026-0042"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || quantity <= 0 || quantity > availableS2}
              id="bezel-confirm-delivery-btn"
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? "Dispatching Delivery..." : "Confirm Delivery"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. RETURN MODAL (STOCK 2 -> STOCK 1)
// ----------------------------------------------------------------------
function ReturnModal({
  onClose,
  references,
  currentUser,
  onSuccess,
  onError,
  initialRefCode
}: {
  onClose: () => void;
  references: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
  initialRefCode?: string;
}) {
  const [refCode, setRefCode] = useState(
    initialRefCode || (references.length > 0 ? references[0].code : "")
  );
  const [quantity, setQuantity] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRef = references.find((r) => r.code === refCode);
  const availableS2 = selectedRef?.stock2 || 0;
  const currentS1 = selectedRef?.stock1 || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode) {
      onError("Select a reference.");
      return;
    }
    if (quantity <= 0) {
      onError("Quantity must be greater than zero.");
      return;
    }
    if (quantity > availableS2) {
      onError(`Insufficient Stock 2 (Available: ${availableS2}, Requested: ${quantity}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await executeBezelReturn({
        reference: refCode,
        quantity,
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
      });
      onSuccess(`Return executed: ${quantity} units of ${refCode} returned from Stock 2 back to Stock 1.`);
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to execute return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">RETURN TO RAW STOCK</h3>
            <p className="text-xs text-slate-500">Return Bezel material from Stock 2 back to Stock 1</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Bezel Reference
          </label>
          <select
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {references.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} (S2: {r.stock2} | S1: {r.stock1}) — {r.description} {r.client ? `[${r.client}]` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Visual Flow Indicator */}
        <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center justify-between">
          <div className="text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-800">STOCK 2 (Ready)</div>
            <div className="font-mono font-bold text-base text-slate-900">{availableS2}</div>
            <div className="text-[10px] text-rose-600 font-semibold">
              - {quantity} → {Math.max(0, availableS2 - quantity)}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center px-4">
            <ArrowRight className="w-5 h-5 text-amber-600" />
            <span className="text-[10px] font-bold text-amber-800 uppercase mt-0.5">
              RETURN S2 → S1
            </span>
          </div>

          <div className="text-center">
            <div className="text-[10px] uppercase font-bold text-amber-800">STOCK 1 (Raw)</div>
            <div className="font-mono font-bold text-base text-slate-900">{currentS1}</div>
            <div className="text-[10px] text-emerald-600 font-semibold">
              + {quantity} → {currentS1 + quantity}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quantity to Return
            </label>
            <button
              type="button"
              onClick={() => setQuantity(availableS2)}
              className="text-xs font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
            >
              MAX ({availableS2})
            </button>
          </div>
          <input
            type="number"
            min="1"
            max={availableS2}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || quantity <= 0 || quantity > availableS2}
            id="bezel-confirm-return-btn"
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? "Processing Return..." : "Execute Return"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// 5. SCRAP / NOK MODAL (STOCK 1 or STOCK 2 -> SCRAP)
// ----------------------------------------------------------------------
function ScrapModal({
  onClose,
  references,
  currentUser,
  onSuccess,
  onError,
  initialRefCode
}: {
  onClose: () => void;
  references: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
  initialRefCode?: string;
}) {
  const [refCode, setRefCode] = useState(
    initialRefCode || (references.length > 0 ? references[0].code : "")
  );
  const [sourceStock, setSourceStock] = useState<"STOCK 1" | "STOCK 2">("STOCK 1");
  const [quantity, setQuantity] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PDF Upload & Parsing States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parsedPdfDoc, setParsedPdfDoc] = useState<ParsedBezelScrapDocument | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  const selectedRef = references.find((r) => r.code === refCode);
  const availableStock = sourceStock === "STOCK 1" ? selectedRef?.stock1 || 0 : selectedRef?.stock2 || 0;

  const handleProcessPdfFile = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      Swal.fire({
        icon: "warning",
        title: "Invalid File Format",
        text: "Please select a valid PDF file."
      });
      return;
    }

    setIsParsingPdf(true);
    try {
      const doc = await parseBezelScrapPDF(file, references);
      if (doc.items.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Bezel References Found",
          text: "No Bezel references were detected in this PDF document. All other references were safely ignored."
        });
        return;
      }
      setParsedPdfDoc(doc);
      setIsPdfModalOpen(true);
    } catch (err: any) {
      console.error("Bezel Scrap PDF parsing failed:", err);
      Swal.fire({
        icon: "error",
        title: "PDF Read Error",
        text: err?.message || "Failed to parse PDF document."
      });
    } finally {
      setIsParsingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProcessPdfFile(file);
  };

  const handleApplyBatchPdfScrap = async (
    itemsToScrap: {
      reference: string;
      quantity: number;
      sourceStock: "STOCK 1" | "STOCK 2";
      notes?: string;
    }[]
  ) => {
    for (const it of itemsToScrap) {
      await executeBezelScrap({
        reference: it.reference,
        quantity: it.quantity,
        sourceStock: it.sourceStock,
        reason: "PDF SCRAP / NOK",
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
        notes: it.notes
      });
    }
    const totalPcs = itemsToScrap.reduce((sum, it) => sum + it.quantity, 0);
    onSuccess(`Scrap recorded for ${itemsToScrap.length} Bezel reference(s) (total ${totalPcs} PCS).`);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode) {
      onError("Select a reference.");
      return;
    }
    if (quantity <= 0) {
      onError("Quantity must be greater than zero.");
      return;
    }
    if (quantity > availableStock) {
      onError(`Insufficient ${sourceStock} (Available: ${availableStock}, Requested: ${quantity}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await executeBezelScrap({
        reference: refCode,
        quantity,
        sourceStock,
        reason: "SCRAP / NOK",
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
      });
      onSuccess(`Scrap recorded: ${quantity} NOK units of ${refCode} removed from ${sourceStock}.`);
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to record scrap.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">SCRAP / NOK DEFECT ENTRY</h3>
              <p className="text-xs text-slate-500">Remove defective Bezel material from Stock 1 or Stock 2</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload PDF Section */}
        <div className="mt-4 p-3 bg-rose-50/50 rounded-xl border border-rose-200/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-rose-950 truncate">Upload Scrap Return PDF</div>
              <div className="text-[10px] text-rose-700 truncate">Extracts only Bezel references from document</div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsingPdf}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95 disabled:opacity-50"
          >
            {isParsingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Reading...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload PDF</span>
              </>
            )}
          </button>
        </div>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
            or manual entry
          </span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Bezel Reference
            </label>
            <select
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {references.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} (S1: {r.stock1} | S2: {r.stock2}) — {r.description} {r.client ? `[${r.client}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Source Stock Choice (MANDATORY EXPLICIT TOGGLE) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Deduct NOK From Stock (Explicit Choice)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSourceStock("STOCK 1")}
                className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  sourceStock === "STOCK 1"
                    ? "border-amber-600 bg-amber-50 text-amber-950"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold uppercase">STOCK 1 (Raw)</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Available: <span className="font-mono font-bold">{selectedRef?.stock1 || 0}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSourceStock("STOCK 2")}
                className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  sourceStock === "STOCK 2"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold uppercase">STOCK 2 (Assembled)</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Available: <span className="font-mono font-bold">{selectedRef?.stock2 || 0}</span>
                </div>
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Scrap Quantity ({sourceStock})
              </label>
              <button
                type="button"
                onClick={() => setQuantity(availableStock)}
                className="text-xs font-bold text-rose-700 hover:text-rose-900 cursor-pointer"
              >
                MAX ({availableStock})
              </button>
            </div>
            <input
              type="number"
              min="1"
              max={availableStock}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {quantity > availableStock && (
              <p className="text-xs text-rose-600 font-medium mt-1">
                Quantity exceeds available {sourceStock} ({availableStock})
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || quantity <= 0 || quantity > availableStock}
              id="bezel-confirm-scrap-btn"
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? "Recording Scrap..." : "Confirm Scrap"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Bezel Scrap PDF Modal */}
      {isPdfModalOpen && parsedPdfDoc && (
        <BezelScrapPdfModal
          isOpen={isPdfModalOpen}
          onClose={() => {
            setIsPdfModalOpen(false);
            setParsedPdfDoc(null);
          }}
          parsedDoc={parsedPdfDoc}
          references={references}
          onApplyScrap={handleApplyBatchPdfScrap}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------
// 6. ADD REFERENCE MODAL
// ----------------------------------------------------------------------
function AddReferenceModal({
  onClose,
  currentUser,
  onSuccess,
  onError
}: {
  onClose: () => void;
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [client, setClient] = useState("");
  const [initialStock1, setInitialStock1] = useState(0);
  const [initialStock2, setInitialStock2] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      onError("Please enter a reference code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ref = await createBezelReference({
        code: code.trim(),
        description: description.trim(),
        client: client.trim(),
        initialStock1,
        initialStock2,
        operatorName: currentUser.fullName
      });
      onSuccess(`Bezel Reference ${ref.code} created successfully.`);
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to create reference.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">NEW BEZEL REFERENCE</h3>
            <p className="text-xs text-slate-500">Register a new Bezel part reference in catalog</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Reference Code *
          </label>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A015E335A"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. BEZEL R8 STW"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Client
          </label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value.toUpperCase())}
            placeholder="e.g. PSA, OPEL"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Initial Stock 1
            </label>
            <input
              type="number"
              min="0"
              value={initialStock1}
              onChange={(e) => setInitialStock1(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Initial Stock 2
            </label>
            <input
              type="number"
              min="0"
              value={initialStock2}
              onChange={(e) => setInitialStock2(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !code.trim()}
            id="bezel-confirm-add-ref-btn"
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? "Creating..." : "Save Reference"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
