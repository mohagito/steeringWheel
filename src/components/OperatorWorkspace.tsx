import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Adjustment, User, Reference } from "../types";
import { doc, getDoc, setDoc, collection, addDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Scan, ArrowLeftRight, Truck, Check, AlertCircle, ArrowRight, Play, RefreshCw, Layers
} from "lucide-react";

interface OperatorWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  currentUser: User;
  onSubmitAdjustment: (adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">) => Promise<void>;
}

export default function OperatorWorkspace({ 
  boxes, 
  adjustments, 
  references = [], 
  currentUser, 
  onSubmitAdjustment 
}: OperatorWorkspaceProps) {
  
  // Tabs: "stock1_in" (Receiving), "transfer" (Warehouse -> Production), "stock2_out" (Deliveries)
  const [activeSubTab, setActiveSubTab] = useState<"stock1_in" | "transfer" | "stock2_out">("stock1_in");

  // Form States
  const [barcode, setBarcode] = useState("");
  const [selectedRefCode, setSelectedRefCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  
  // Specific to Stock 2 OUT
  const [deliveryType, setDeliveryType] = useState<"Mini Project" | "Normal Delivery">("Mini Project");

  // UX Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Refs for auto-focusing
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const transferQtyRef = useRef<HTMLInputElement>(null);
  const deliveryQtyRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Play auditory beeps for shopfloor scan confirmations
  const playBeep = (frequency: number, duration: number) => {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0.06, context.currentTime);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch (e) {
      console.warn("Audio Context beep blocked by browser permission.");
    }
  };

  const playSuccessBeep = () => playBeep(880, 0.12);
  const playErrorBeep = () => playBeep(330, 0.25);
  const playScanBeep = () => playBeep(600, 0.08);

  // Auto-focus barcode input on mount, tab changes, and after saves
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      if (activeSubTab === "stock1_in") {
        barcodeInputRef.current?.focus();
      } else if (activeSubTab === "transfer") {
        transferQtyRef.current?.focus();
      } else if (activeSubTab === "stock2_out") {
        deliveryQtyRef.current?.focus();
      }
    }, 150);

    return () => clearTimeout(focusTimer);
  }, [activeSubTab, successMsg]);

  // Keep barcode input focused on click elsewhere in the card to facilitate continuous scanning
  const handleCardClick = () => {
    if (activeSubTab === "stock1_in") {
      barcodeInputRef.current?.focus();
    }
  };

  // Handle barcode scanning Enter key
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (barcode.trim()) {
        playScanBeep();
        // Automatically focus on quantity field to speed up input
        qtyInputRef.current?.focus();
      }
    }
  };

  // Form Reset Helper
  const resetForm = () => {
    setBarcode("");
    setSelectedRefCode("");
    setQuantity("");
    setNotes("");
  };

  // 1. Submit STOCK 1 IN Transaction
  const handleStock1InSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!barcode.trim()) {
      setErrorMsg("Please scan or enter carton barcode.");
      playErrorBeep();
      return;
    }
    if (!selectedRefCode) {
      setErrorMsg("Please select a mesh reference.");
      playErrorBeep();
      return;
    }
    const qtyVal = parseInt(quantity);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("Please enter a valid received quantity.");
      playErrorBeep();
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();

      // Read current reference stock
      const refDocRef = doc(db, "references", selectedRefCode);
      const refSnap = await getDoc(refDocRef);
      
      let currentStock1 = 0;
      let currentStock2 = 0;
      if (refSnap.exists()) {
        const refData = refSnap.data();
        currentStock1 = refData.stock1 || 0;
        currentStock2 = refData.stock2 || 0;
      }

      const newStock1 = currentStock1 + qtyVal;
      const newTotal = newStock1 + currentStock2;

      // Update reference stock in Firestore
      batch.update(refDocRef, {
        stock1: newStock1,
        currentStock: newTotal,
        lastUpdate: timestamp
      });

      // Save/overwrite Carton Box record
      const boxDocRef = doc(db, "boxes", barcode.trim().toUpperCase());
      batch.set(boxDocRef, {
        id: barcode.trim().toUpperCase(),
        barcode: barcode.trim().toUpperCase(),
        reference: selectedRefCode,
        expectedQty: qtyVal,
        location: "Warehouse Storeroom",
        createdAt: timestamp,
        updatedAt: timestamp,
        materialType: references.find(r => r.code === selectedRefCode)?.materialType || "Mesh"
      });

      // Add unified transaction log
      const transId = `trans-s1in-${Date.now()}`;
      const transDocRef = doc(db, "transactions", transId);
      batch.set(transDocRef, {
        id: transId,
        barcode: barcode.trim().toUpperCase(),
        reference: selectedRefCode,
        movementType: "STOCK 1 IN",
        stock: "Stock 1",
        quantity: qtyVal,
        operatorName: currentUser.fullName,
        timestamp,
        notes: notes.trim() || `Received carton: ${barcode.trim().toUpperCase()}`
      });

      await batch.commit();

      playSuccessBeep();
      setSuccessMsg(`Carton ${barcode.trim().toUpperCase()} received successfully. +${qtyVal} added to Stock 1.`);
      resetForm();
      barcodeInputRef.current?.focus();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Transaction failed: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Submit TRANSFER (Warehouse -> Production)
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedRefCode) {
      setErrorMsg("Please select a reference to transfer.");
      playErrorBeep();
      return;
    }
    const qtyVal = parseInt(quantity);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("Please enter a valid transfer quantity.");
      playErrorBeep();
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();

      // Read current reference stock
      const refDocRef = doc(db, "references", selectedRefCode);
      const refSnap = await getDoc(refDocRef);
      
      let currentStock1 = 0;
      let currentStock2 = 0;
      if (refSnap.exists()) {
        const refData = refSnap.data();
        currentStock1 = refData.stock1 || 0;
        currentStock2 = refData.stock2 || 0;
      }

      const newStock1 = currentStock1;
      const newStock2 = currentStock2 + qtyVal;
      const newTotal = newStock1 + newStock2;

      // Update reference stock in Firestore
      batch.update(refDocRef, {
        stock2: newStock2,
        currentStock: newTotal,
        lastUpdate: timestamp
      });

      // Add unified transaction log
      const transId = `trans-trsf-${Date.now()}`;
      const transDocRef = doc(db, "transactions", transId);
      batch.set(transDocRef, {
        id: transId,
        reference: selectedRefCode,
        movementType: "TRANSFER",
        stock: "Stock 1 -> Stock 2",
        quantity: qtyVal,
        operatorName: currentUser.fullName,
        timestamp,
        notes: notes.trim() || `Transferred from Warehouse to Production Lines`
      });

      await batch.commit();

      playSuccessBeep();
      setSuccessMsg(`Transferred ${qtyVal} pcs of ${selectedRefCode} from Warehouse to Production Stock.`);
      resetForm();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Transfer failed: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Submit STOCK 2 OUT (Deliveries)
  const handleStock2OutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedRefCode) {
      setErrorMsg("Please select a reference for delivery.");
      playErrorBeep();
      return;
    }
    const qtyVal = parseInt(quantity);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("Please enter a valid delivery quantity.");
      playErrorBeep();
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();

      // Read current reference stock
      const refDocRef = doc(db, "references", selectedRefCode);
      const refSnap = await getDoc(refDocRef);
      
      let currentStock1 = 0;
      let currentStock2 = 0;
      if (refSnap.exists()) {
        const refData = refSnap.data();
        currentStock1 = refData.stock1 || 0;
        currentStock2 = refData.stock2 || 0;
      }

      if (currentStock2 < qtyVal) {
        setErrorMsg(`Insufficient Production stock (Stock 2: ${currentStock2}). Cannot dispatch ${qtyVal}.`);
        playErrorBeep();
        setSubmitting(false);
        return;
      }

      const newStock1 = Math.max(0, currentStock1 - qtyVal);
      const newStock2 = currentStock2 - qtyVal;
      const newTotal = newStock1 + newStock2;

      // Update reference stock in Firestore
      batch.update(refDocRef, {
        stock1: newStock1,
        stock2: newStock2,
        currentStock: newTotal,
        lastUpdate: timestamp
      });

      // Add unified transaction log
      const transId = `trans-s2out-${Date.now()}`;
      const transDocRef = doc(db, "transactions", transId);
      batch.set(transDocRef, {
        id: transId,
        reference: selectedRefCode,
        movementType: "STOCK 2 OUT",
        stock: "Stock 2",
        quantity: qtyVal,
        operatorName: currentUser.fullName,
        timestamp,
        notes: notes.trim() || `Delivery type: ${deliveryType}`,
        deliveryType
      });

      await batch.commit();

      playSuccessBeep();
      setSuccessMsg(`Dispatched ${qtyVal} pcs of ${selectedRefCode} via ${deliveryType}. Stock 2 updated.`);
      resetForm();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Delivery failed: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" id="operator-workspace-container">
      
      {/* Operator Terminal Header */}
      <div className="bg-[#0f172a] text-slate-100 p-5 rounded-sm border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">
            STATION TERMINAL
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight font-display mt-0.5">
            Active Session: {currentUser.fullName}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">
            Location: Shopfloor / Factory Line • Role: Operator
          </p>
        </div>
        <div className="flex gap-1.5" id="operator-terminal-action-tabs">
          <button
            onClick={() => { setActiveSubTab("stock1_in"); resetForm(); }}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all rounded-sm border cursor-pointer ${
              activeSubTab === "stock1_in"
                ? "bg-sky-600 border-sky-500 text-white shadow-md"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            1. STOCK 1 IN (Receiving)
          </button>
          <button
            onClick={() => { setActiveSubTab("transfer"); resetForm(); }}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all rounded-sm border cursor-pointer ${
              activeSubTab === "transfer"
                ? "bg-amber-600 border-amber-500 text-white shadow-md"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            2. TRANSFER (1 → 2)
          </button>
          <button
            onClick={() => { setActiveSubTab("stock2_out"); resetForm(); }}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all rounded-sm border cursor-pointer ${
              activeSubTab === "stock2_out"
                ? "bg-emerald-600 border-emerald-500 text-white shadow-md"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            3. STOCK 2 OUT (Deliveries)
          </button>
        </div>
      </div>

      {/* Main Form Terminal Card */}
      <div 
        onClick={handleCardClick}
        className="bg-white border border-slate-300/80 rounded-sm shadow-md p-6 sm:p-8 cursor-default"
        id="operator-form-card"
      >
        
        {/* Status Messages */}
        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono rounded-sm flex items-start gap-2.5 animate-fadeIn">
            <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold">SYSTEM OK:</span> {successMsg}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-sm flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">SYSTEM ERROR:</span> {errorMsg}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: STOCK 1 IN                                         */}
        {/* ========================================================= */}
        {activeSubTab === "stock1_in" && (
          <form onSubmit={handleStock1InSubmit} className="space-y-6">
            <div className="border-l-4 border-sky-500 pl-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 font-mono">
                Stock 1 IN — Carton Box Receiving Flow
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Scan carton barcode with USB reader, select the predefined reference, and enter quantity.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Carton Barcode Field */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  1. Scan Carton Barcode <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Scan className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    required
                    placeholder="Wedge scan carton code here..."
                    value={barcode}
                    onKeyDown={handleBarcodeKeyDown}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="pl-10 pr-3 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 rounded-sm w-full text-sm font-mono tracking-wider focus:outline-none transition-colors uppercase"
                    id="scanner-barcode-input"
                    autoComplete="off"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  USB Keyboard Emulator (HID) will automatically trigger. Press Enter/scan to skip to quantity.
                </p>
              </div>

              {/* Reference Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  2. Select Mesh Reference <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={selectedRefCode}
                  onChange={(e) => setSelectedRefCode(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none text-sm font-mono rounded-sm cursor-pointer"
                  id="operator-select-reference-s1in"
                >
                  <option value="">-- CHOOSE A PREDEFINED REF ({references.length}) --</option>
                  {references.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} - {r.description.slice(0, 45)} ({r.materialType})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 font-mono">
                  Master data references are fixed and non-editable.
                </p>
              </div>

              {/* Received Quantity Field */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  3. Received Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  ref={qtyInputRef}
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 100"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="py-2 px-3 bg-slate-50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 focus:outline-none w-full text-sm font-mono rounded-sm"
                  id="operator-quantity-s1in"
                />
              </div>

              {/* Optional Notes */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  Notes / Comments <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Box slightly damaged, verified OK"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="py-2 px-3 bg-slate-50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 focus:outline-none w-full text-sm font-mono rounded-sm"
                  id="operator-notes-s1in"
                />
              </div>

            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                id="btn-save-s1in"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    RECORDING TRANS...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    SAVE TRANSACTION
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* TAB 2: TRANSFER (WAREHOUSE -> PRODUCTION)                 */}
        {/* ========================================================= */}
        {activeSubTab === "transfer" && (
          <form onSubmit={handleTransferSubmit} className="space-y-6">
            <div className="border-l-4 border-amber-500 pl-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 font-mono">
                Warehouse → Production Line Transfer (1 → 2)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Record the transfer of physical material from warehouse storage (Stock 1) directly onto the production floor (Stock 2).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Reference Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  1. Select Reference <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={selectedRefCode}
                  onChange={(e) => setSelectedRefCode(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none text-sm font-mono rounded-sm cursor-pointer"
                  id="operator-select-reference-trsf"
                >
                  <option value="">-- CHOOSE REFERENCE ({references.length}) --</option>
                  {references.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} [Stock 1: {r.stock1 || 0} pcs] - {r.description.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Transfer Quantity */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  2. Quantity to Transfer <span className="text-red-500">*</span>
                </label>
                <input
                  ref={transferQtyRef}
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="py-2 px-3 bg-slate-50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 focus:outline-none w-full text-sm font-mono rounded-sm"
                  id="operator-quantity-trsf"
                />
              </div>

              {/* Optional Notes */}
              <div className="space-y-2 md:col-span-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  Notes / Destination Line <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sent to Line 4 - Shift B production run"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="py-2 px-3 bg-slate-50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 focus:outline-none w-full text-sm font-mono rounded-sm"
                  id="operator-notes-trsf"
                />
              </div>

            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                id="btn-save-trsf"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    EXECUTING TRANSFER...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4" />
                    CONFIRM TRANSFER (1 → 2)
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* TAB 3: STOCK 2 OUT (DELIVERIES)                            */}
        {/* ========================================================= */}
        {activeSubTab === "stock2_out" && (
          <form onSubmit={handleStock2OutSubmit} className="space-y-6">
            <div className="border-l-4 border-emerald-500 pl-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 font-mono">
                Stock 2 OUT — Customer Deliveries / Dispatches
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dispatch completed mesh parts from the production lines (Stock 2). Only two valid delivery types are supported.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Reference Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  1. Select Reference <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={selectedRefCode}
                  onChange={(e) => setSelectedRefCode(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none text-sm font-mono rounded-sm cursor-pointer"
                  id="operator-select-reference-s2out"
                >
                  <option value="">-- CHOOSE REFERENCE ({references.length}) --</option>
                  {references.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} [Stock 2: {r.stock2 || 0} pcs] - {r.description.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Delivery Type */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  2. Delivery Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value as any)}
                  className="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none text-sm font-mono rounded-sm cursor-pointer"
                  id="operator-deliverytype-s2out"
                >
                  <option value="Mini Project">Mini Project (PRECOSIDO)</option>
                  <option value="Normal Delivery">Normal Delivery (Villanova - Portugal)</option>
                </select>
              </div>

              {/* Delivery Quantity */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  3. Quantity to Deliver <span className="text-red-500">*</span>
                </label>
                <input
                  ref={deliveryQtyRef}
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 80"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="py-2 px-3 bg-slate-50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 focus:outline-none w-full text-sm font-mono rounded-sm"
                  id="operator-quantity-s2out"
                />
              </div>

              {/* Optional Notes */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-slate-700">
                  Notes / Invoice Number <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Invoice #2847A"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="py-2 px-3 bg-slate-50 focus:bg-white border-2 border-slate-300 focus:border-slate-900 focus:outline-none w-full text-sm font-mono rounded-sm"
                  id="operator-notes-s2out"
                />
              </div>

            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                id="btn-save-s2out"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    PROCESSING DISPATCH...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" />
                    RECORD DELIVERY OUT
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Helpful Operator Tips Footer */}
      <div className="bg-slate-200/80 p-4 rounded-sm border border-slate-300 text-[11px] text-slate-600 font-mono">
        <span className="font-bold">OPERATIONAL TRACEABILITY PROTOCOL:</span> Continuous autofocus is enabled. You can scan barcodes directly at any time. Auditory check signals correspond to system feedback status (High success frequency vs. Low error frequency).
      </div>

    </div>
  );
}
