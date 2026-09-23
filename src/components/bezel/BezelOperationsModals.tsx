import React, { useState } from "react";
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
  Factory
} from "lucide-react";
import { BezelReference, BezelTruckItem, User } from "../../types";
import {
  executeBezelNewTruck,
  executeBezelAssemblage,
  executeBezelDelivery,
  executeBezelReturn,
  executeBezelScrap,
  createBezelReference
} from "../../services/bezelService";
import { BezelActiveModal } from "./BezelActionButtons";

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
// 3. DELIVERY MODAL (STOCK 2 -> OUT)
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
  const [refCode, setRefCode] = useState(
    initialRefCode || (references.length > 0 ? references[0].code : "")
  );
  const [quantity, setQuantity] = useState(20);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRef = references.find((r) => r.code === refCode);
  const availableS2 = selectedRef?.stock2 || 0;

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
      const res = await executeBezelDelivery({
        reference: refCode,
        quantity,
        invoiceNumber: invoiceNumber.trim(),
        operatorName: currentUser.fullName,
        operatorId: currentUser.id,
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
    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">DELIVERY DISPATCH</h3>
            <p className="text-xs text-slate-500">Ship finished Bezel material from Stock 2 OUT</p>
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

  const selectedRef = references.find((r) => r.code === refCode);
  const availableStock = sourceStock === "STOCK 1" ? selectedRef?.stock1 || 0 : selectedRef?.stock2 || 0;

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
      const res = await executeBezelScrap({
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

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
