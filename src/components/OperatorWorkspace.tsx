import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Adjustment, User, Reference } from "../types";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Scan, Check, AlertCircle, RefreshCw, FileText, User as UserIcon
} from "lucide-react";

interface OperatorWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  currentUser: User;
  onSubmitAdjustment: (adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">) => Promise<void>;
}

export default function OperatorWorkspace({ 
  boxes = [], 
  adjustments = [], 
  references = [], 
  currentUser, 
  onSubmitAdjustment 
}: OperatorWorkspaceProps) {
  
  // Persisted Invoice Input
  const [invoiceNumber, setInvoiceNumber] = useState(() => localStorage.getItem("op_invoice") || "");
  
  // Scan Inputs (Cleared after every successful box)
  const [referenceCode, setReferenceCode] = useState("");
  const [quantity, setQuantity] = useState("");

  // UX Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Input Refs for hands-free barcode wedge flow
  const invoiceRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  // Sync Invoice to localStorage
  useEffect(() => {
    localStorage.setItem("op_invoice", invoiceNumber);
  }, [invoiceNumber]);

  // Audio Feedbacks for blind shopfloor scanning
  const playBeep = (frequency: number, duration: number, type: OscillatorType = "sine") => {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0.05, context.currentTime);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch (e) {
      console.warn("Audio feedback blocked by browser policies.");
    }
  };

  const playScanBeep = () => playBeep(650, 0.08);
  const playSuccessBeep = () => {
    playBeep(880, 0.1, "sine");
    setTimeout(() => playBeep(1100, 0.12, "sine"), 100);
  };
  const playErrorBeep = () => playBeep(220, 0.3, "sawtooth");

  // Default focus on mount: if invoice is blank, focus invoice; otherwise go straight to scanning reference!
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      if (!invoiceNumber.trim()) {
        invoiceRef.current?.focus();
      } else {
        referenceRef.current?.focus();
      }
    }, 150);
    return () => clearTimeout(focusTimer);
  }, []);

  // Live lookup of Master Reference data for instant visual feedback
  const matchedReference = useMemo(() => {
    const code = referenceCode.trim().toUpperCase();
    if (!code) return null;
    return references.find(r => r.code.toUpperCase() === code) || null;
  }, [referenceCode, references]);

  // Handle Enter key on Invoice Input -> jump to Reference
  const handleInvoiceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (invoiceNumber.trim()) {
        playScanBeep();
        referenceRef.current?.focus();
      }
    }
  };

  // Handle Enter key on Reference Input -> automatic validation & jump to Quantity
  const handleReferenceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = referenceCode.trim().toUpperCase();
      if (!trimmed) {
        setErrorMsg("Reference code cannot be empty.");
        playErrorBeep();
        return;
      }
      
      const exists = references.some(r => r.code.toUpperCase() === trimmed);
      if (!exists) {
        setErrorMsg(`Reference "${trimmed}" not found in master list!`);
        playErrorBeep();
        return;
      }

      setErrorMsg("");
      playScanBeep();
      // Jumps automatically to quantity scan field
      quantityRef.current?.focus();
    }
  };

  // Handle Enter key on Quantity Input -> Submit automatically
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const qtyVal = parseInt(quantity);
      if (isNaN(qtyVal) || qtyVal <= 0) {
        setErrorMsg("Please scan or enter a valid Quantity.");
        playErrorBeep();
        return;
      }
      // Submit form programmatically
      submitTransaction();
    }
  };

  // Form Submit Execution
  const submitTransaction = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    const cleanInvoice = invoiceNumber.trim().toUpperCase();
    const cleanRef = referenceCode.trim().toUpperCase();
    const qtyVal = parseInt(quantity);

    if (!cleanInvoice) {
      setErrorMsg("Please fill in the Invoice Number first.");
      invoiceRef.current?.focus();
      playErrorBeep();
      return;
    }
    if (!cleanRef) {
      setErrorMsg("Please scan or enter the Reference Number.");
      referenceRef.current?.focus();
      playErrorBeep();
      return;
    }

    const refData = references.find(r => r.code.toUpperCase() === cleanRef);
    if (!refData) {
      setErrorMsg(`Reference "${cleanRef}" does not exist in master data.`);
      referenceRef.current?.focus();
      playErrorBeep();
      return;
    }

    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("Please enter a valid Quantity.");
      quantityRef.current?.focus();
      playErrorBeep();
      return;
    }

    setSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const batch = writeBatch(db);

      // 1. Retrieve latest stock values
      const refDocRef = doc(db, "references", refData.code);
      const refSnap = await getDoc(refDocRef);
      let currentStock1 = 0;
      let currentStock2 = 0;
      if (refSnap.exists()) {
        const data = refSnap.data();
        currentStock1 = data.stock1 || 0;
        currentStock2 = data.stock2 || 0;
      }

      const newStock1 = currentStock1 + qtyVal;
      const newTotal = newStock1 + currentStock2;

      // 2. Update Reference Stock
      batch.update(refDocRef, {
        stock1: newStock1,
        currentStock: newTotal,
        lastUpdate: timestamp
      });

      // 3. Create unique Box Barcode and save Box Document
      const boxBarcode = `BOX-${cleanRef}-${cleanInvoice}-${Date.now().toString().slice(-4)}`;
      const boxDocRef = doc(db, "boxes", boxBarcode);
      batch.set(boxDocRef, {
        id: boxBarcode,
        barcode: boxBarcode,
        reference: refData.code,
        expectedQty: qtyVal,
        location: "Warehouse Storeroom",
        createdAt: timestamp,
        updatedAt: timestamp,
        materialType: refData.materialType || "Mesh",
        invoiceNumber: cleanInvoice,
        palletQuality: ""
      });

      // 4. Create Transaction Log for Stock 1 IN
      const transId = `trans-s1in-${Date.now()}`;
      const transDocRef = doc(db, "transactions", transId);
      batch.set(transDocRef, {
        id: transId,
        barcode: boxBarcode,
        reference: refData.code,
        movementType: "STOCK 1 IN",
        stock: "Stock 1",
        quantity: qtyVal,
        operatorName: currentUser.fullName,
        timestamp,
        notes: `Received via Operator Terminal. Invoice: ${cleanInvoice}`,
        invoiceNumber: cleanInvoice,
        palletQuality: ""
      });

      // 5. Create Adjustment Log for supervisor traceability
      const adjId = `adj-${Date.now()}`;
      const adjDocRef = doc(db, "adjustments", adjId);
      batch.set(adjDocRef, {
        id: adjId,
        barcode: boxBarcode,
        reference: refData.code,
        expectedQty: qtyVal,
        actualQty: qtyVal,
        difference: 0,
        operatorName: currentUser.fullName,
        timestamp,
        status: "approved",
        materialType: refData.materialType || "Mesh",
        stockBefore: currentStock1,
        stockAdded: qtyVal,
        stockAfter: newStock1,
        invoiceNumber: cleanInvoice,
        palletQuality: ""
      });

      await batch.commit();

      // UI Success Feedbacks
      playSuccessBeep();
      setSuccessMsg(`SUCCESS: Saved ${qtyVal} pcs of ${refData.code} to Stock 1.`);
      
      // Clear scanned items
      setReferenceCode("");
      setQuantity("");
      
      // Automatic Focus back to the Reference input field for hands-free workflow!
      setTimeout(() => {
        referenceRef.current?.focus();
      }, 50);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Database error: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setSubmitting(false);
    }
  };

  // Form Submit Wrapper
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitTransaction();
  };

  // Quick Action to Clear scan inputs
  const handleClearInputs = () => {
    setReferenceCode("");
    setQuantity("");
    setErrorMsg("");
    setSuccessMsg("");
    playScanBeep();
    referenceRef.current?.focus();
  };

  // Get active lists of scanned boxes on this invoice
  const recentScansList = useMemo(() => {
    const cleanInvoice = invoiceNumber.trim().toUpperCase();
    if (!cleanInvoice) return [];

    return boxes
      .filter(b => b.invoiceNumber?.toUpperCase() === cleanInvoice)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [boxes, invoiceNumber]);

  return (
    <div className="max-w-md mx-auto space-y-6" id="operator-workspace-handsfree-station">
      
      {/* Industrial Session Header */}
      <div className="bg-[#1e293b] text-slate-100 p-4 rounded-md border border-slate-700 shadow-md flex items-center justify-between">
        <div>
          <div className="text-[9px] text-sky-400 font-mono uppercase tracking-widest font-bold">
            FAST TERMINAL STATION
          </div>
          <h2 className="text-sm font-bold text-white tracking-tight mt-0.5">
            Operator: {currentUser.fullName}
          </h2>
          <div className="flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[9px] text-slate-400 font-mono">
              Keyboard Wedge Active (HID Mode)
            </span>
          </div>
        </div>
        
        <span className={`px-2 py-0.5 text-[10px] font-mono font-black uppercase rounded border ${
          currentUser.fullName.includes("SHIFT A") || currentUser.username.toLowerCase().includes("a")
            ? "bg-sky-500/10 border-sky-400/30 text-sky-400"
            : "bg-purple-500/10 border-purple-400/30 text-purple-400"
        }`}>
          {currentUser.fullName}
        </span>
      </div>

      {/* Simplified Scan Card */}
      <div className="bg-white border-2 border-slate-300 rounded-md shadow-lg p-6" id="operator-scanning-panel">
        
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 font-mono">
              Continuous Receiving Flow
            </h3>
          </div>
          <span className="text-[9px] font-mono text-slate-400">
            AUTO-FOCUS ENABLED
          </span>
        </div>

        {/* Dynamic Status Notifications */}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-850 text-xs font-mono rounded flex items-start gap-2 animate-fadeIn">
            <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold">OK:</span> {successMsg}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-300 text-rose-850 text-xs font-mono rounded flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">ERROR:</span> {errorMsg}
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-5">
          
          {/* INVOICE NUMBER */}
          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase">
              1. Enter Invoice Number (Press Enter)
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={invoiceRef}
                type="text"
                required
                placeholder="Invoice / delivery note number..."
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                onKeyDown={handleInvoiceKeyDown}
                className="w-full pl-9 pr-3 py-2 border-2 border-slate-250 focus:border-slate-900 rounded text-xs font-mono uppercase focus:outline-none focus:ring-0 transition-colors"
                id="op-invoice-field"
                autoComplete="off"
              />
            </div>
          </div>

          {/* REFERENCE CODE */}
          <div className="space-y-1 border-t border-slate-100 pt-4">
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase">
              2. Scan Reference Number (Barcode)
            </label>
            <div className="relative">
              <Scan className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={referenceRef}
                type="text"
                required
                placeholder="Wedge scan reference..."
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                onKeyDown={handleReferenceKeyDown}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-slate-100/30 focus:bg-white border-2 border-slate-300 focus:border-slate-900 rounded text-xs font-mono font-bold uppercase tracking-wider focus:outline-none transition-colors animate-pulse-border"
                id="op-reference-field"
                autoComplete="off"
              />
            </div>
            
            {/* Live Master Data visual confirmation feedback */}
            {matchedReference ? (
              <div className="p-2 bg-emerald-50 border border-emerald-100 rounded text-[10px] font-mono text-emerald-800 flex justify-between items-center animate-fadeIn">
                <span className="truncate mr-2">Verified: <strong>{matchedReference.description}</strong></span>
                <span className="px-1 py-0.2 bg-emerald-100 rounded text-[8px] font-black uppercase tracking-wider shrink-0">
                  {matchedReference.materialType}
                </span>
              </div>
            ) : referenceCode ? (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] font-mono text-amber-800">
                ⚠️ Searching reference registry... Press Enter to confirm.
              </div>
            ) : null}
          </div>

          {/* QUANTITY FIELD */}
          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase">
              3. Scan Quantity (Barcode)
            </label>
            <input
              ref={quantityRef}
              type="number"
              required
              min="1"
              placeholder="Wedge scan quantity..."
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={handleQuantityKeyDown}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/30 focus:bg-white border-2 border-slate-300 focus:border-slate-900 rounded text-xs font-mono font-black focus:outline-none transition-colors"
              id="op-quantity-field"
              autoComplete="off"
            />
          </div>

          {/* Manual Submit or Clear Controls */}
          <div className="pt-3 border-t border-slate-200 flex gap-2">
            <button
              type="button"
              onClick={handleClearInputs}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-750 font-mono font-bold text-[10px] uppercase tracking-wider rounded border border-slate-300 transition-colors cursor-pointer"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-[#1e293b] hover:bg-[#0f172a] text-white font-mono font-bold text-[11px] uppercase tracking-wider rounded shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
              id="op-submit-trigger"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  RECORD &amp; CONTINUE
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Invoice Specific Scanned Registry */}
      {recentScansList.length > 0 && (
        <div className="bg-white border border-slate-300 rounded shadow-md p-4 space-y-2.5" id="operator-invoice-batch">
          <div className="flex items-center justify-between border-b border-slate-150 pb-1.5">
            <span className="text-[10px] font-bold font-mono text-slate-700 uppercase">
              Invoice scans list ({recentScansList.length})
            </span>
            <span className="text-[9px] font-mono text-slate-400 uppercase">
              Last Scans
            </span>
          </div>
          <div className="divide-y divide-slate-100 text-xs font-mono">
            {recentScansList.map((box, idx) => (
              <div key={box.id} className="py-1.5 flex items-center justify-between text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-slate-100 text-[9px] flex items-center justify-center text-slate-500 font-bold">
                    {recentScansList.length - idx}
                  </span>
                  <span className="font-bold text-slate-900">{box.reference}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-800 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                    {box.expectedQty} PCS
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Industrial MES Disclaimer */}
      <div className="bg-slate-100 p-3 rounded border border-slate-350 text-[10px] text-slate-500 font-mono">
        <span className="font-bold uppercase text-slate-700">Hands-Free Mode:</span> Input fields are chain-linked. Scanning a barcode automatically jumps to the next input or saves the box immediately without manual mouse or keyboard interaction.
      </div>

    </div>
  );
}
