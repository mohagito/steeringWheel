import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Adjustment, User, Reference } from "../types";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Scan, Check, AlertCircle, RefreshCw, FileText, User as UserIcon, Sparkles, ArrowRight, Layers, Box as BoxIcon, RotateCcw, Eraser
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
  
  // Operation Mode: INTAKE (Stock 1 In) vs TRANSFER (Stock 1 -> Stock 2 Mallas Pegadas)
  const [opMode, setOpMode] = useState<"INTAKE" | "TRANSFER">("INTAKE");

  // Scan Inputs (Cleared after every successful box)
  const [referenceCode, setReferenceCode] = useState("");
  const [quantity, setQuantity] = useState(""); // Label / Barcode Quantity (Expected)
  const [actualQuantity, setActualQuantity] = useState(""); // Real Manually Counted Quantity (Physical)

  // UX Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [autoCorrectNotice, setAutoCorrectNotice] = useState("");

  // Input Refs for hands-free barcode wedge flow
  const invoiceRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const actualQtyRef = useRef<HTMLInputElement>(null);

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

  // Default focus on mount
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

  // SMART REFERENCE MATCHING LOGIC
  // Solves the scanner hardware issue where scanners prepend an extra character (e.g. "+123456", "%REF", etc.)
  const resolveReference = (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;

    const upper = trimmed.toUpperCase();

    // 1. Direct exact match
    const direct = references.find(r => r.code.toUpperCase() === upper);
    if (direct) {
      return { match: direct, corrected: false, original: rawInput };
    }

    // 2. Extra 1st character removal (e.g. "+123456" -> "123456" or "%REF123" -> "REF123")
    if (trimmed.length > 1) {
      const strippedFirst = trimmed.slice(1).trim().toUpperCase();
      const matchFirst = references.find(r => r.code.toUpperCase() === strippedFirst);
      if (matchFirst) {
        return { match: matchFirst, corrected: true, original: rawInput, cleanCode: matchFirst.code };
      }
    }

    // 3. Remove non-alphanumeric leading symbols (e.g. "+", "%", "#", "]", ";", ":")
    const strippedSymbols = trimmed.replace(/^[^a-zA-Z0-9]+/, '').toUpperCase();
    if (strippedSymbols && strippedSymbols !== upper) {
      const matchSym = references.find(r => r.code.toUpperCase() === strippedSymbols);
      if (matchSym) {
        return { match: matchSym, corrected: true, original: rawInput, cleanCode: matchSym.code };
      }
    }

    // 4. Substring / contains check: if scanner sends prefix/suffix like "]C1REF001"
    for (const ref of references) {
      const codeUp = ref.code.toUpperCase();
      if (upper.includes(codeUp) && codeUp.length >= 3) {
        return { match: ref, corrected: upper !== codeUp, original: rawInput, cleanCode: ref.code };
      }
    }

    return null;
  };

  // Live lookup of Master Reference data for instant visual feedback
  const matchedResult = useMemo(() => {
    return resolveReference(referenceCode);
  }, [referenceCode, references]);

  const matchedReference = matchedResult?.match || null;

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

  // Handle Enter key on Reference Input -> smart auto-correction & jump to Quantity
  const handleReferenceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = referenceCode.trim();
      if (!raw) {
        setErrorMsg("Reference code cannot be empty.");
        playErrorBeep();
        return;
      }

      const res = resolveReference(raw);
      if (res) {
        setReferenceCode(res.match.code);
        if (res.corrected) {
          setAutoCorrectNotice(`Scanner prefix corrected: "${raw}" ➔ "${res.match.code}"`);
        } else {
          setAutoCorrectNotice("");
        }
        setErrorMsg("");
        playScanBeep();
        // Jump to quantity field automatically
        quantityRef.current?.focus();
      } else if (raw.length > 1) {
        // Fallback: If not found in master data, try removing 1st character if scanned with extra prefix
        const stripped = raw.slice(1).toUpperCase();
        const resStripped = resolveReference(stripped);
        if (resStripped) {
          setReferenceCode(resStripped.match.code);
          setAutoCorrectNotice(`Scanner prefix '${raw[0]}' auto-removed ➔ "${resStripped.match.code}"`);
          setErrorMsg("");
          playScanBeep();
          quantityRef.current?.focus();
        } else {
          // Keep stripped version for user ease
          setReferenceCode(stripped);
          setErrorMsg(`Reference "${stripped}" (or "${raw}") not found in master list.`);
          playErrorBeep();
        }
      } else {
        setErrorMsg(`Reference "${raw}" not found in master list.`);
        playErrorBeep();
      }
    }
  };

  // Handle Reference Input Change with Smart Instant Auto-Resolve
  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setErrorMsg("");

    if (!val) {
      setReferenceCode("");
      setAutoCorrectNotice("");
      return;
    }

    const upper = val.trim().toUpperCase();

    // 1. Direct exact match
    const directMatch = references.find(r => r.code.toUpperCase() === upper);
    if (directMatch) {
      setReferenceCode(directMatch.code);
      setAutoCorrectNotice("");
      return;
    }

    // 2. Extra 1st character removal auto-correction (e.g. "IR003A429A" -> "R003A429A")
    if (upper.length > 1) {
      const strippedFirst = upper.slice(1);
      const matchFirst = references.find(r => r.code.toUpperCase() === strippedFirst);
      if (matchFirst) {
        setReferenceCode(matchFirst.code);
        setAutoCorrectNotice(`Scanner prefix '${upper[0]}' auto-removed ➔ "${matchFirst.code}"`);
        playScanBeep();
        return;
      }
    }

    setReferenceCode(val);

    // 3. Smart resolve check feedback
    const res = resolveReference(val);
    if (res && res.corrected) {
      setAutoCorrectNotice(`Smart match detected: "${val}" ➔ "${res.match.code}"`);
    } else {
      setAutoCorrectNotice("");
    }
  };

  // Handle Quantity (Label Scan) input change with auto-fill
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!actualQuantity || actualQuantity === quantity) {
      setActualQuantity(val);
    }
    setQuantity(val);
  };

  // Handle Enter key on Quantity (Label / Transfer) Input
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const qtyVal = parseInt(quantity);
      if (isNaN(qtyVal) || qtyVal <= 0) {
        setErrorMsg("Please scan or enter a valid Quantity.");
        playErrorBeep();
        return;
      }
      if (opMode === "TRANSFER") {
        submitTransaction();
      } else {
        if (!actualQuantity.trim()) {
          setActualQuantity(quantity);
        }
        playScanBeep();
        actualQtyRef.current?.focus();
      }
    }
  };

  // Handle Enter key on Real Counted Quantity Input -> Submit automatically
  const handleActualQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const actualQtyVal = parseInt(actualQuantity);
      if (isNaN(actualQtyVal) || actualQtyVal <= 0) {
        setErrorMsg("Please enter a valid Real Counted Quantity.");
        playErrorBeep();
        return;
      }
      submitTransaction();
    }
  };

  // Form Submit Execution
  const submitTransaction = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setAutoCorrectNotice("");

    const cleanInvoice = invoiceNumber.trim().toUpperCase() || (opMode === "TRANSFER" ? "PEGADAS" : "");
    const rawRef = referenceCode.trim();
    const expectedQtyVal = parseInt(quantity);
    const actualQtyVal = opMode === "TRANSFER"
      ? expectedQtyVal
      : (actualQuantity.trim() !== "" ? parseInt(actualQuantity) : expectedQtyVal);

    if (opMode === "INTAKE" && !cleanInvoice) {
      setErrorMsg("Please fill in the Invoice Number first.");
      invoiceRef.current?.focus();
      playErrorBeep();
      return;
    }
    if (!rawRef) {
      setErrorMsg("Please scan or enter the Reference Number.");
      referenceRef.current?.focus();
      playErrorBeep();
      return;
    }

    // Smart resolve reference
    const res = resolveReference(rawRef);
    if (!res) {
      setErrorMsg(`Reference "${rawRef}" does not exist in master data.`);
      referenceRef.current?.focus();
      playErrorBeep();
      return;
    }

    const refData = res.match;
    // Set official code if it had a scanner prefix
    const finalCode = refData.code;

    if (isNaN(expectedQtyVal) || expectedQtyVal <= 0) {
      setErrorMsg(opMode === "TRANSFER" ? "Please enter a valid Quantity." : "Please enter a valid Barcode Label Quantity.");
      quantityRef.current?.focus();
      playErrorBeep();
      return;
    }

    if (opMode === "INTAKE" && (isNaN(actualQtyVal) || actualQtyVal <= 0)) {
      setErrorMsg("Please enter a valid Real Counted Quantity.");
      actualQtyRef.current?.focus();
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
      let currentStock3 = 0;
      if (refSnap.exists()) {
        const data = refSnap.data();
        currentStock1 = data.stock1 || 0;
        currentStock2 = data.stock2 || 0;
        currentStock3 = data.stock3 || 0;
      }

      const diff = actualQtyVal - expectedQtyVal;

      if (opMode === "TRANSFER") {
        const transferQty = actualQtyVal;
        if (transferQty > currentStock1) {
          setErrorMsg(`Insufficient stock in Stock 1. Available: ${currentStock1} pcs, requested: ${transferQty} pcs.`);
          playErrorBeep();
          setSubmitting(false);
          return;
        }

        const newStock1 = Math.max(0, currentStock1 - transferQty);
        const newStock2 = currentStock2 + transferQty;
        const newTotal = newStock1 + newStock2 + currentStock3;

        batch.update(refDocRef, {
          stock1: newStock1,
          stock2: newStock2,
          currentStock: newTotal,
          lastUpdate: timestamp
        });

        const transId = `trans-trf-${Date.now()}`;
        const transDocRef = doc(db, "transactions", transId);
        batch.set(transDocRef, {
          id: transId,
          reference: refData.code,
          movementType: "TRANSFER S1->S2",
          stock: "Stock 1 -> Stock 2",
          quantity: transferQty,
          expectedQty: transferQty,
          actualQty: transferQty,
          difference: 0,
          operatorName: currentUser.fullName,
          timestamp,
          notes: `Mallas Pegadas (Sent to Gluing/Processing). Note: ${cleanInvoice}`
        });

        await batch.commit();

        playSuccessBeep();
        setSuccessMsg(`SUCCESS: Transferred ${transferQty} pcs of ${refData.code} from Stock 1 to Stock 2.`);
      } else {
        // INTAKE MODE - Real physical counted quantity added to Stock 1
        const newStock1 = currentStock1 + actualQtyVal;
        const newTotal = newStock1 + currentStock2 + currentStock3;

        // 2. Update Reference Stock
        batch.update(refDocRef, {
          stock1: newStock1,
          currentStock: newTotal,
          lastUpdate: timestamp
        });

        // 3. Create unique Box Barcode and save Box Document
        const boxBarcode = `BOX-${finalCode}-${cleanInvoice}-${Date.now().toString().slice(-4)}`;
        const boxDocRef = doc(db, "boxes", boxBarcode);
        const discNote = diff !== 0 ? `Discrepancy: Label=${expectedQtyVal}, Real=${actualQtyVal} (${diff > 0 ? '+' : ''}${diff} PCS)` : "";

        batch.set(boxDocRef, {
          id: boxBarcode,
          barcode: boxBarcode,
          reference: refData.code,
          expectedQty: expectedQtyVal,
          actualQty: actualQtyVal,
          location: "Warehouse Storeroom",
          createdAt: timestamp,
          updatedAt: timestamp,
          materialType: refData.materialType || "Mesh",
          invoiceNumber: cleanInvoice,
          palletQuality: discNote
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
          quantity: actualQtyVal, // Physical stock added
          expectedQty: expectedQtyVal,
          actualQty: actualQtyVal,
          difference: diff,
          operatorName: currentUser.fullName,
          timestamp,
          notes: diff !== 0 
            ? `Received via Operator Terminal. Invoice: ${cleanInvoice} (Label: ${expectedQtyVal} PCS | Real Manual Count: ${actualQtyVal} PCS | Diff: ${diff > 0 ? '+' : ''}${diff} PCS)`
            : `Received via Operator Terminal. Invoice: ${cleanInvoice}`,
          invoiceNumber: cleanInvoice,
          palletQuality: discNote
        });

        // 5. Create Adjustment Log for supervisor traceability
        const adjId = `adj-${Date.now()}`;
        const adjDocRef = doc(db, "adjustments", adjId);
        batch.set(adjDocRef, {
          id: adjId,
          barcode: boxBarcode,
          reference: refData.code,
          expectedQty: expectedQtyVal,
          actualQty: actualQtyVal,
          difference: diff,
          operatorName: currentUser.fullName,
          timestamp,
          status: "approved",
          materialType: refData.materialType || "Mesh",
          stockBefore: currentStock1,
          stockAdded: actualQtyVal,
          stockAfter: newStock1,
          invoiceNumber: cleanInvoice,
          palletQuality: discNote
        });

        await batch.commit();

        playSuccessBeep();
        if (diff !== 0) {
          setSuccessMsg(`SUCCESS: Saved ${actualQtyVal} real counted pcs of ${refData.code} to Stock 1 (Label showed ${expectedQtyVal} pcs, Discrepancy: ${diff > 0 ? '+' : ''}${diff} pcs).`);
        } else {
          setSuccessMsg(`SUCCESS: Saved ${actualQtyVal} pcs of ${refData.code} to Stock 1.`);
        }
      }
      
      // Clear scanned items
      setReferenceCode("");
      setQuantity("");
      setActualQuantity("");
      setAutoCorrectNotice("");
      
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

  // Quick Action to Clear scan inputs (Start scan from zero) including Invoice
  const handleClearInputs = () => {
    setReferenceCode("");
    setQuantity("");
    setActualQuantity("");
    setInvoiceNumber("");
    localStorage.removeItem("op_invoice");
    setErrorMsg("");
    setSuccessMsg("");
    setAutoCorrectNotice("");
    playScanBeep();
    invoiceRef.current?.focus();
  };

  // Reset Everything including Invoice Number
  const handleResetAll = handleClearInputs;

  // ESC key shortcut to quickly reset scan fields to zero
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClearInputs();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

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
    <div className="max-w-xl mx-auto space-y-6" id="operator-workspace-handsfree-station">
      
      {/* Modern High-End Operator Terminal Banner (Zeeve Style) */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-5 rounded-3xl shadow-xl shadow-blue-500/10 flex items-center justify-between border border-blue-400/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white/10 rounded-lg backdrop-blur-xs">
              <Scan className="w-4 h-4 text-blue-100" />
            </span>
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-blue-200">
              SMART SCANNER TERMINAL
            </span>
          </div>
          <h2 className="text-base font-extrabold text-white tracking-tight mt-1">
            Operator: {currentUser.fullName}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-[10px] text-blue-100 font-medium">
              Auto-Correct Scanner Prefix Active
            </span>
          </div>
        </div>
        
        <div className="text-right">
          <span className="px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-mono font-bold text-white border border-white/20 shadow-xs">
            {currentUser.username.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Interactive Scan Card */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/50 p-6 md:p-8" id="operator-scanning-panel">
        
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                {opMode === "INTAKE" ? "1. Incoming Truck Intake (Stock 1)" : "2. Send Mesh to Pegadas (Stock 1 → Stock 2)"}
              </h3>
              <p className="text-[11px] text-slate-400">
                {opMode === "INTAKE" 
                  ? "Continuous hands-free barcode scanning station"
                  : "Remove meshes from Stock 1 room warehouse to Pegadas"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearInputs}
            title="Clear fields to start scanning from zero (Shortcut: ESC)"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Scan</span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-200/70 px-1 py-0.2 rounded">ESC</span>
          </button>
        </div>

        {/* Operation Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-6 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => {
              setOpMode("INTAKE");
              setErrorMsg("");
              setSuccessMsg("");
              setAutoCorrectNotice("");
              setTimeout(() => invoiceRef.current?.focus(), 50);
            }}
            className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              opMode === "INTAKE"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <span>🚛</span>
            <span>1. New Truck (S1 IN)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpMode("TRANSFER");
              setErrorMsg("");
              setSuccessMsg("");
              setAutoCorrectNotice("");
              setTimeout(() => referenceRef.current?.focus(), 50);
            }}
            className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              opMode === "TRANSFER"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <span>🔵</span>
            <span>2. Mallas Pegadas (S1→S2)</span>
          </button>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="mb-5 p-4 bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-xs rounded-2xl flex items-start gap-3 animate-fadeIn shadow-xs">
            <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <div className="font-medium">{successMsg}</div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-5 p-4 bg-rose-50/80 border border-rose-200 text-rose-900 text-xs rounded-2xl flex items-start gap-3 animate-fadeIn shadow-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />
            <div className="font-medium">{errorMsg}</div>
          </div>
        )}

        {autoCorrectNotice && (
          <div className="mb-5 p-3.5 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-2xl flex items-center gap-2.5 animate-fadeIn font-mono">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 animate-spin" />
            <span className="font-semibold">{autoCorrectNotice}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-5">
          
          {/* INVOICE NUMBER (Only for Intake from New Truck) */}
          {opMode === "INTAKE" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                1. Invoice / Delivery Note Number
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={invoiceRef}
                  type="text"
                  required
                  placeholder="Type or scan invoice number..."
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  onKeyDown={handleInvoiceKeyDown}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl text-xs font-mono uppercase focus:outline-none transition-all"
                  id="op-invoice-field"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {/* REFERENCE CODE */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
              <span>{opMode === "INTAKE" ? "2. Reference Code (Scan Barcode)" : "1. Reference Code (Scan Barcode)"}</span>
              <span className="text-[10px] text-blue-600 font-normal font-mono">Smart Prefix Match Enabled</span>
            </label>
            <div>
              <input
                ref={referenceRef}
                type="text"
                required
                placeholder="Scan reference barcode..."
                value={referenceCode}
                onChange={handleReferenceChange}
                onKeyDown={handleReferenceKeyDown}
                className="w-full px-4 py-3 bg-slate-50 focus:bg-white border-2 border-blue-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/15 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider focus:outline-none transition-all shadow-inner"
                id="op-reference-field"
                autoComplete="off"
              />
            </div>
            
            {/* Live Master Data visual confirmation feedback */}
            {matchedReference ? (
              <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-xs font-mono text-emerald-900 flex justify-between items-center animate-fadeIn shadow-xs">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-bold">{matchedReference.code}</span>
                  <span className="text-slate-500 font-sans truncate max-w-[180px]">({matchedReference.description})</span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-200/60 rounded-full text-[9px] font-bold uppercase tracking-wider text-emerald-900 shrink-0">
                  {matchedReference.materialType}
                </span>
              </div>
            ) : referenceCode ? (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-mono text-amber-900 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">Scanned: <strong className="font-bold">{referenceCode}</strong></span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {referenceCode.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const stripped = referenceCode.slice(1).toUpperCase();
                        setReferenceCode(stripped);
                        setErrorMsg("");
                        playScanBeep();
                      }}
                      className="px-2.5 py-1 bg-amber-200/90 hover:bg-amber-300 border border-amber-300 text-amber-950 rounded-lg text-[10px] font-bold uppercase transition-colors flex items-center gap-1 cursor-pointer select-none"
                      title="Remove 1st scanner prefix character"
                    >
                      <Eraser className="w-3 h-3" />
                      <span>Remove 1st Char ({referenceCode.slice(0, 1)})</span>
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* QUANTITY FIELDS (Single Qty for Pegadas TRANSFER, Dual Qty for Truck INTAKE) */}
          {opMode === "TRANSFER" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
                <span>2. Quantity (Transfer to Pegadas PCS)</span>
                <span className="text-[10px] text-amber-600 font-semibold font-mono">Stock 1 ➔ Stock 2 (Pegadas)</span>
              </label>
              <input
                ref={quantityRef}
                type="number"
                required
                min="1"
                placeholder="Enter PCS quantity to send to Pegadas..."
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={handleQuantityKeyDown}
                className="w-full px-4 py-3 bg-amber-50/40 focus:bg-white border-2 border-amber-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 rounded-2xl text-xs font-mono font-extrabold text-slate-900 focus:outline-none transition-all"
                id="op-quantity-field"
                autoComplete="off"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 3. Barcode Label Quantity */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
                    <span>3. Label Qty (Scan Barcode)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Expected PCS</span>
                  </label>
                  <input
                    ref={quantityRef}
                    type="number"
                    required
                    min="1"
                    placeholder="Label PCS (e.g. 100)..."
                    value={quantity}
                    onChange={handleQuantityChange}
                    onKeyDown={handleQuantityKeyDown}
                    className="w-full px-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all"
                    id="op-quantity-field"
                    autoComplete="off"
                  />
                </div>

                {/* 4. Real Manual Counted Quantity */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center justify-between">
                    <span className="text-blue-700">4. Real Counted Qty (Manual Check)</span>
                    <span className="text-[10px] text-blue-600 font-semibold">Physical PCS</span>
                  </label>
                  <input
                    ref={actualQtyRef}
                    type="number"
                    required
                    min="1"
                    placeholder="Physical PCS counted..."
                    value={actualQuantity}
                    onChange={(e) => setActualQuantity(e.target.value)}
                    onKeyDown={handleActualQuantityKeyDown}
                    className="w-full px-4 py-3 bg-blue-50/50 focus:bg-white border-2 border-blue-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/15 rounded-2xl text-xs font-mono font-extrabold text-blue-900 focus:outline-none transition-all shadow-inner"
                    id="op-actual-quantity-field"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Live Discrepancy Comparison Indicator */}
              {quantity && actualQuantity ? (
                (() => {
                  const exp = parseInt(quantity) || 0;
                  const act = parseInt(actualQuantity) || 0;
                  const diff = act - exp;
                  if (exp > 0 && act > 0) {
                    if (diff === 0) {
                      return (
                        <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-xs font-mono text-emerald-900 flex items-center gap-2 animate-fadeIn">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-bold">Count Matches Barcode Label:</span> {act} PCS physical counted.
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs font-mono flex items-start gap-2.5 animate-fadeIn shadow-xs">
                          <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-extrabold text-amber-900 flex items-center gap-2">
                              <span>⚠️ DISCREPANCY DETECTED:</span>
                              <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-[10px] font-bold">
                                Diff: {diff > 0 ? `+${diff}` : diff} PCS
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-800 mt-0.5 font-sans">
                              Label shows <strong className="font-mono">{exp} PCS</strong>, but operator manually counted <strong className="font-mono">{act} PCS</strong>. Stock 1 will record <strong className="font-mono">{act} PCS</strong> physical stock.
                            </p>
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()
              ) : null}
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-4 flex flex-wrap sm:flex-nowrap gap-3">
            <button
              type="button"
              onClick={handleClearInputs}
              title="Reset scan fields to zero (Shortcut: ESC)"
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>Reset Scan</span>
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              title="Clear all inputs including Invoice Number"
              className="px-3.5 py-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200/80"
            >
              <Eraser className="w-4 h-4 text-slate-400 group-hover:text-rose-600" />
              <span>Clear All</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              id="op-submit-trigger"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  CONFIRM &amp; SAVE RECORD
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Invoice Specific Scanned Registry */}
      {recentScansList.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/40 p-5 space-y-3" id="operator-invoice-batch">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <BoxIcon className="w-4 h-4 text-blue-600" />
              Scanned on Invoice ({recentScansList.length})
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Recent Activity
            </span>
          </div>
          <div className="divide-y divide-slate-100 text-xs font-mono">
            {recentScansList.map((box, idx) => (
              <div key={box.id} className="py-2 flex items-center justify-between text-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-[10px] flex items-center justify-center text-blue-600 font-bold">
                    {recentScansList.length - idx}
                  </span>
                  <span className="font-bold text-slate-900">{box.reference}</span>
                </div>
                <div className="flex items-center gap-2">
                  {box.actualQty !== undefined && box.actualQty !== box.expectedQty ? (
                    <div className="text-right">
                      <span className="font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 text-xs inline-block">
                        Real: {box.actualQty} PCS
                      </span>
                      <span className="text-[10px] text-slate-500 block font-mono mt-0.5">
                        Label: {box.expectedQty} (Diff: {box.actualQty - box.expectedQty > 0 ? '+' : ''}{box.actualQty - box.expectedQty})
                      </span>
                    </div>
                  ) : (
                    <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100/80">
                      {box.actualQty ?? box.expectedQty} PCS
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
