import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Adjustment, User, Reference } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Scan, Package, AlertCircle, Check, ArrowRight, RefreshCw, X,
  ArrowLeft, HelpCircle, CornerDownLeft, Sparkles, CheckCircle2, Truck, FileText
} from "lucide-react";

interface OperatorWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  currentUser: User;
  onSubmitAdjustment: (adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">) => Promise<void>;
}

type ScanStep = "ref" | "qty" | "count";

const PRESET_COMMENTS = [
  "Standard count check",
  "Quantity discrepancy verified",
  "Incorrect original label",
  "Damaged carton box",
  "Recount after production audit"
];

export default function OperatorWorkspace({ 
  boxes, 
  adjustments, 
  references,
  currentUser, 
  onSubmitAdjustment 
}: OperatorWorkspaceProps) {
  
  // Guided steps: "ref" (Scan reference), "qty" (Scan expected qty), "count" (Enter real physical count)
  const [activeStep, setActiveStep] = useState<ScanStep>("ref");
  
  // Operational mode: "quick" (Scan ref + scan qty -> immediate save), "audit" (3-step manual discrepancy check)
  const [flowMode, setFlowMode] = useState<"quick" | "audit">("quick");
  
  // Active Shipment / Pallet traceability session states
  const [activePalletInvoice, setActivePalletInvoice] = useState("");
  const [isPalletSessionActive, setIsPalletSessionActive] = useState(false);

  // Form inputs for the shipment setup screen
  const [setupInvoice, setSetupInvoice] = useState("");
  
  const [selectedRef, setSelectedRef] = useState<Reference | null>(null);
  const [expectedQtyStr, setExpectedQtyStr] = useState("");
  const [actualQtyStr, setActualQtyStr] = useState("");
  const [comment, setComment] = useState("");
  
  // Single focusable text input state
  const [inputValue, setInputValue] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Search and filter state for Step 1 manual selection
  const [refSearchQuery, setRefSearchQuery] = useState("");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<"All" | "Mesh" | "Soft">("All");

  const setupInvoiceRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<any>(null);

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
      console.warn("Audio Context beep ignored or blocked.");
    }
  };

  const playSuccessBeep = () => playBeep(880, 0.12);
  const playErrorBeep = () => playBeep(330, 0.25);
  const playSubmitBeep = () => playBeep(1100, 0.2);

  // Auto focus the primary scan input on mount, step change, and reset
  useEffect(() => {
    if (!isPalletSessionActive) {
      if (setupInvoiceRef.current) {
        setupInvoiceRef.current.focus();
      }
    } else {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [isPalletSessionActive, activeStep, successMsg]);

  // Handle focusing if user clicks elsewhere on the active terminal card
  const handleCardClick = () => {
    if (isPalletSessionActive) {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } else {
      if (setupInvoiceRef.current) {
        setupInvoiceRef.current.focus();
      }
    }
  };

  // Pre-filtered references list for step 1 manual panel
  const filteredReferences = useMemo(() => {
    return references.filter((r) => {
      const matchesSearch = r.code.toLowerCase().includes(refSearchQuery.toLowerCase()) ||
                            r.description.toLowerCase().includes(refSearchQuery.toLowerCase());
      const matchesMaterial = materialTypeFilter === "All" || r.materialType === materialTypeFilter;
      return matchesSearch && matchesMaterial;
    });
  }, [references, refSearchQuery, materialTypeFilter]);

  // Process the input when Enter key is pressed (or USB wedge scanner sends Enter)
  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVal = inputValue.trim().toUpperCase();
    if (!cleanVal) return;

    setErrorMsg("");

    if (activeStep === "ref") {
      // Step 1: Scan Reference Barcode
      // Helper function to find a matching reference supporting industry prefixes like 'P', 'I', '1P' and partial wildcard scans
      const findMatchingReference = (scanned: string, refs: Reference[]): Reference | null => {
        const upperScanned = scanned.toUpperCase().trim();
        if (!upperScanned) return null;
        
        // 1. Direct exact match
        let match = refs.find(r => r.code.toUpperCase() === upperScanned);
        if (match) return match;
        
        // 2. Try matching as a substring (if the barcode contains the reference code, e.g. PR000J610A contains R000J610A, IA025M750B contains A025M750B)
        match = refs.find(r => upperScanned.includes(r.code.toUpperCase()));
        if (match) return match;

        // Try exact match with associatedLeather list
        match = refs.find(r => {
          const parts = r.associatedLeather.toUpperCase().split(",").map(s => s.trim());
          return parts.includes(upperScanned);
        });
        if (match) return match;
        
        // 3. Strip standard industry prefixes (Odette/Galia/AIAG)
        const commonPrefixes = ["1P", "2P", "P", "I", "S", "Q", "V", "K", "N"];
        for (const pref of commonPrefixes) {
          if (upperScanned.startsWith(pref)) {
            const stripped = upperScanned.substring(pref.length).trim();
            if (stripped.length >= 3) {
              // Try exact match with stripped code
              match = refs.find(r => r.code.toUpperCase() === stripped);
              if (match) return match;
              
              // Try matching references that start with the stripped prefix (for partial scans)
              match = refs.find(r => r.code.toUpperCase().startsWith(stripped));
              if (match) return match;

              // Try matching associated leather with stripped code
              match = refs.find(r => {
                const parts = r.associatedLeather.toUpperCase().split(",").map(s => s.trim());
                return parts.includes(stripped);
              });
              if (match) return match;
            }
          }
        }
        
        // 4. Fallback wildcard stripping (strips 1-3 leading characters to find a startsWith/exact match)
        // Helps with cases like scanning "IA025" -> stripped "A025" matches "A025M750B"
        for (let len = 1; len <= 3; len++) {
          if (upperScanned.length > len) {
            const stripped = upperScanned.substring(len).trim();
            match = refs.find(r => r.code.toUpperCase() === stripped);
            if (match) return match;
            
            if (stripped.length >= 3) {
              match = refs.find(r => r.code.toUpperCase().startsWith(stripped));
              if (match) return match;

              // Try matching associated leather with stripped code
              match = refs.find(r => {
                const parts = r.associatedLeather.toUpperCase().split(",").map(s => s.trim());
                return parts.includes(stripped);
              });
              if (match) return match;
            }
          }
        }
        
        return null;
      };

      const matched = findMatchingReference(cleanVal, references);
      if (matched) {
        setSelectedRef(matched);
        setActiveStep("qty");
        setInputValue("");
        playSuccessBeep();
      } else {
        setErrorMsg(`"${cleanVal}" is not a valid master Reference code. Please scan a valid reference.`);
        playErrorBeep();
      }
    } else if (activeStep === "qty") {
      // Step 2: Scan Quantity Input
      // Strip any leading non-digit characters (typical Odette/Galia quantity prefix, e.g., Q144 -> 144)
      const parsedQtyVal = cleanVal.replace(/^\D+/, "").trim();

      const isNumeric = /^\d+$/.test(parsedQtyVal);
      if (isNumeric) {
        setExpectedQtyStr(parsedQtyVal);
        if (flowMode === "quick") {
          // In quick scan mode, we auto-save immediately with actualQty = expectedQty!
          setInputValue("");
          playSuccessBeep();
          handleFinalSubmit(selectedRef!.code, parsedQtyVal, parsedQtyVal, "Direct Quick Scan Stock Intake");
        } else {
          setActiveStep("count");
          setInputValue("");
          playSuccessBeep();
        }
      } else {
        setErrorMsg(`"${cleanVal}" is not a valid quantity. Please scan or enter a number.`);
        playErrorBeep();
      }
    } else if (activeStep === "count") {
      // Step 3: Count Manually & Enter Real Quantity (only in audit mode)
      const isNumeric = /^\d+$/.test(cleanVal);
      if (isNumeric) {
        setActualQtyStr(cleanVal);
        setInputValue("");
        playSuccessBeep();
        // Trigger save with these values
        handleFinalSubmit(selectedRef!.code, expectedQtyStr, cleanVal);
      } else {
        setErrorMsg("Please enter a valid numeric physical count.");
        playErrorBeep();
      }
    }
  };

  // Step 1: Manual select Reference click
  const handleSelectReference = (ref: Reference) => {
    setErrorMsg("");
    setSelectedRef(ref);
    setActiveStep("qty");
    setInputValue("");
    playSuccessBeep();
  };

  // Step 2: Manual select expected quantity preset click
  const handleSelectQtyPreset = (qtyVal: number) => {
    setErrorMsg("");
    setExpectedQtyStr(qtyVal.toString());
    if (flowMode === "quick") {
      // In quick scan mode, selecting a preset immediately saves to stock
      setInputValue("");
      playSuccessBeep();
      handleFinalSubmit(selectedRef!.code, qtyVal.toString(), qtyVal.toString(), "Direct Quick Scan Stock Intake");
    } else {
      setActiveStep("count");
      setInputValue("");
      playSuccessBeep();
    }
  };

  // Virtual Keypad handlers for Step 3 manual count entry
  const handleKeypadPress = (digit: string) => {
    setErrorMsg("");
    if (activeStep === "count") {
      setInputValue((prev) => {
        if (prev === "0") return digit;
        return prev + digit;
      });
    } else {
      setInputValue((prev) => prev + digit);
    }
  };

  const handleKeypadClear = () => {
    setInputValue("");
  };

  const handleKeypadBackspace = () => {
    setInputValue((prev) => prev.slice(0, -1));
  };

  const handleIncrement = (amount: number) => {
    setErrorMsg("");
    const current = parseInt(inputValue) || 0;
    setInputValue(Math.max(0, current + amount).toString());
  };

  // Calculate dynamic variance delta
  const variance = useMemo(() => {
    const expected = parseInt(expectedQtyStr) || 0;
    const actual = parseInt(inputValue || actualQtyStr) || 0;
    return actual - expected;
  }, [expectedQtyStr, actualQtyStr, inputValue, activeStep]);

  // Final count record submission
  const handleFinalSubmit = async (refCode: string, expectedStr: string, actualStr: string, customComment?: string) => {
    const expected = parseInt(expectedStr, 10);
    const actual = parseInt(actualStr, 10);
    
    if (isNaN(expected) || isNaN(actual)) {
      setErrorMsg("Error parsing numeric quantities. Please check values.");
      playErrorBeep();
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const generatedBarcode = `BOX-${refCode}-${Date.now().toString().slice(-6)}`;
      const matchedMaterialType = selectedRef ? selectedRef.materialType : "Mesh";

      await onSubmitAdjustment({
        barcode: generatedBarcode,
        reference: refCode,
        expectedQty: expected,
        actualQty: actual,
        difference: actual - expected,
        operatorName: currentUser.fullName,
        comment: customComment || comment || "Standard count check",
        materialType: matchedMaterialType,
        invoiceNumber: activePalletInvoice,
        palletQuality: ""
      });

      playSubmitBeep();
      setSuccessMsg(`Carton registered successfully! Ref: ${refCode}, Expected: ${expected} pcs, Counted: ${actual} pcs.`);
      
      // Clear success screen and reset step after 2.5 seconds
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => {
        setSuccessMsg("");
        setSelectedRef(null);
        setExpectedQtyStr("");
        setActualQtyStr("");
        setInputValue("");
        setComment("");
        setActiveStep("ref");
      }, 2500);

    } catch (err) {
      console.error("Save error:", err);
      setErrorMsg("Could not submit stock count. Please retry.");
      playErrorBeep();
    } finally {
      setSubmitting(false);
    }
  };

  // Allow manual button submit in Step 3
  const handleManualSubmitBtnClick = () => {
    if (!selectedRef || !expectedQtyStr) return;
    const finalActual = inputValue || actualQtyStr;
    if (!finalActual) {
      setErrorMsg("Please enter physical counted quantity.");
      playErrorBeep();
      return;
    }
    handleFinalSubmit(selectedRef.code, expectedQtyStr, finalActual);
  };

  // Quick reset to start over
  const handleResetWizard = () => {
    setSelectedRef(null);
    setExpectedQtyStr("");
    setActualQtyStr("");
    setInputValue("");
    setComment("");
    setErrorMsg("");
    setActiveStep("ref");
  };

  if (!isPalletSessionActive) {
    return (
      <div className="max-w-md mx-auto py-4 animate-fadeIn" id="pallet-setup-wizard" onClick={handleCardClick}>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6"
        >
          {/* Title section */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-blue-100">
              <Truck className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 font-display uppercase tracking-tight">Pallet Intake Traceability</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              EPP NATUR requires entering the incoming pallet invoice number before scanning boxes for maximum traceability.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!setupInvoice.trim()) return;
              setActivePalletInvoice(setupInvoice.trim().toUpperCase());
              setIsPalletSessionActive(true);
              playSuccessBeep();
            }}
            className="space-y-5"
          >
            {/* Invoice Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Pallet Invoice / Delivery Note #
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  ref={setupInvoiceRef}
                  type="text"
                  placeholder="e.g. PI-98402A"
                  value={setupInvoice}
                  onChange={(e) => setSetupInvoice(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm font-bold uppercase tracking-wide text-slate-800 transition-all font-mono"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Giant tactile start scanning button */}
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-100 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
            >
              <Scan className="w-4 h-4" />
              <span>START SCANNING PALLET BOXES</span>
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" id="operator-guided-wizard">

      {/* Active Pallet Session Status Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 text-emerald-400 rounded-xl">
            <Truck className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-wide">
                ACTIVE SHIPMENT SESSION
              </span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold font-mono tracking-wide mt-1 text-slate-100">
              INVOICE #: <span className="text-blue-400 underline decoration-dotted">{activePalletInvoice}</span>
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsPalletSessionActive(false);
            setSetupInvoice("");
            handleResetWizard();
          }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
        >
          <X className="w-3.5 h-3.5" />
          <span>CLOSE PALLET SESSION</span>
        </button>
      </div>
      
      {/* Scan Flow Mode Selector - 2 Mode Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setFlowMode("quick");
            handleResetWizard();
          }}
          className={`flex items-center justify-start gap-3 py-2.5 px-4 rounded-xl font-display text-left transition-all cursor-pointer ${
            flowMode === "quick"
              ? "bg-blue-600 text-white shadow-md shadow-blue-100"
              : "bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-200/50"
          }`}
        >
          <div>
            <span className="block font-black uppercase text-[11px] tracking-wide">⚡ Quick Auto-Add Mode</span>
            <span className={`block text-[9px] font-sans font-medium ${flowMode === "quick" ? "text-blue-100" : "text-slate-500"}`}>
              Scan Ref + Scan Qty = Instantly saved to stock (no manual count)
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFlowMode("audit");
            handleResetWizard();
          }}
          className={`flex items-center justify-start gap-3 py-2.5 px-4 rounded-xl font-display text-left transition-all cursor-pointer ${
            flowMode === "audit"
              ? "bg-blue-600 text-white shadow-md shadow-blue-100"
              : "bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-200/50"
          }`}
        >
          <Scan className="w-5 h-5 shrink-0" />
          <div>
            <span className="block font-black uppercase text-[11px] tracking-wide">📋 Guided Audit Mode</span>
            <span className={`block text-[9px] font-sans font-medium ${flowMode === "audit" ? "text-blue-100" : "text-slate-500"}`}>
              Scan Ref + Scan Qty + Enter manual physical count to audit
            </span>
          </div>
        </button>
      </div>

      {/* Step Indicator Progress Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
            Active Operator: <strong className="text-slate-800">{currentUser.fullName}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs font-bold font-display">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
            activeStep === "ref" 
              ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" 
              : selectedRef 
                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                : "bg-slate-50 border-slate-200 text-slate-400"
          }`}>
            <span className="text-[10px] bg-white/20 w-4 h-4 rounded-full flex items-center justify-center font-mono">1</span>
            <span>REFERENCE</span>
          </div>

          <div className="h-0.5 w-4 bg-slate-200"></div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
            activeStep === "qty" 
              ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" 
              : expectedQtyStr 
                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                : "bg-slate-50 border-slate-200 text-slate-400"
          }`}>
            <span className="text-[10px] bg-white/20 w-4 h-4 rounded-full flex items-center justify-center font-mono">2</span>
            <span>{flowMode === "quick" ? "QUANTITY (AUTO-SAVE)" : "EXPECTED"}</span>
          </div>

          {flowMode === "audit" && (
            <>
              <div className="h-0.5 w-4 bg-slate-200"></div>

              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                activeStep === "count" 
                  ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" 
                  : "bg-slate-50 border-slate-200 text-slate-400"
              }`}>
                <span className="text-[10px] bg-white/20 w-4 h-4 rounded-full flex items-center justify-center font-mono">3</span>
                <span>MANUAL COUNT</span>
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {successMsg ? (
          // Success Feedback Splash Card
          <motion.div
            key="success-splash"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="bg-emerald-600 text-white rounded-3xl p-8 sm:p-12 text-center shadow-xl space-y-6 flex flex-col items-center justify-center min-h-[400px]"
          >
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-bounce shadow-inner">
              <Check className="w-10 h-10 text-white" strokeWidth={3} />
            </div>
            <div className="space-y-2">
              <h3 className="font-display font-extrabold text-2xl sm:text-3xl">STOCK SAVED</h3>
              <p className="text-emerald-100 text-sm max-w-lg leading-relaxed font-medium">
                {successMsg}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-200 bg-emerald-700/50 px-4 py-2 rounded-xl border border-emerald-500/30">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>SYSTEM READY FOR NEXT CARTON SCAN</span>
            </div>
          </motion.div>
        ) : (
          // Main Guided Form Terminal
          <motion.div
            key="terminal-body"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            onClick={handleCardClick}
            className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative cursor-text min-h-[460px] flex flex-col"
          >
            {/* Top high-visibility stripe */}
            <div className={`h-2 transition-all duration-300 ${
              activeStep === "ref" ? "bg-indigo-600" : activeStep === "qty" ? "bg-blue-500" : "bg-emerald-500"
            }`} />

            {/* Terminal Header Info Panel */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                  <Scan className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-display font-extrabold text-slate-800 text-sm">EPP Guided Audit Terminal</h4>
                  <p className="text-[10px] text-slate-500 font-medium">Auto-focus enabled. Scan using hardware or use tactile touch below.</p>
                </div>
              </div>

              {activeStep !== "ref" && (
                <button
                  type="button"
                  onClick={handleResetWizard}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Start Over</span>
                </button>
              )}
            </div>

            {/* Terminal Working Area */}
            <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between space-y-6">
              
              {/* Giant Guided Label, Input, and Feedback Area */}
              <div className="space-y-4">
                
                {/* 🔴 THE GIANT GUIDED INPUT LABEL - EXACTLY WHAT THE USER SPECIFIED */}
                <div className="text-center">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                    {flowMode === "quick" ? "⚡ Auto-Add Step" : "📋 Audit Step"}
                  </span>
                  
                  <h2 className="text-xl sm:text-2xl font-display font-black text-slate-900 uppercase tracking-tight mt-2">
                    {activeStep === "ref" && "FIRST SCAN THE REFERENCE BARCODE"}
                    {activeStep === "qty" && (
                      flowMode === "quick" 
                        ? "SCAN THE QUANTITY TO INSTANTLY SAVE TO STOCK"
                        : "SCAN THE EXPECTED QUANTITY INPUT"
                    )}
                    {activeStep === "count" && "COUNT THE BOX MANUALLY AND ENTER THE REAL QUANTITY"}
                  </h2>
                </div>

                {/* Main Action Barcode / Quantity Input */}
                <form onSubmit={handleInputSubmit} className="max-w-xl mx-auto relative">
                  <input
                    ref={inputRef}
                    id="guided-terminal-input"
                    type="text"
                    placeholder={
                      activeStep === "ref"
                        ? "Scan reference barcode (e.g. A025M750B)..."
                        : activeStep === "qty"
                          ? (flowMode === "quick" ? "Scan quantity barcode (e.g. 300) to auto-save..." : "Scan expected quantity barcode (e.g. 150)...")
                          : "Type physical items counted, then press Enter..."
                    }
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className={`w-full text-center py-4 px-6 bg-slate-50 border-2 rounded-2xl font-mono text-lg sm:text-xl font-black transition-all uppercase shadow-inner focus:outline-none ${
                      errorMsg 
                        ? "border-red-500 bg-red-50/25 text-red-900 focus:border-red-600" 
                        : activeStep === "ref"
                          ? "border-indigo-200 focus:border-indigo-600 focus:bg-white text-indigo-900"
                          : activeStep === "qty"
                            ? "border-blue-200 focus:border-blue-600 focus:bg-white text-blue-900"
                            : "border-emerald-200 focus:border-emerald-600 focus:bg-white text-emerald-900"
                    }`}
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className={`absolute right-2.5 top-2.5 h-11 px-5 rounded-xl font-bold text-xs text-white flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                      activeStep === "ref" ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100" :
                      activeStep === "qty" 
                        ? (flowMode === "quick" ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : "bg-blue-600 hover:bg-blue-700 shadow-blue-100") :
                      "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100"
                    }`}
                  >
                    <span>{activeStep === "qty" && flowMode === "quick" ? "SAVE" : "NEXT"}</span>
                    <CornerDownLeft className="w-3.5 h-3.5" />
                  </button>
                </form>

                {/* Error feedback banner */}
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center gap-2 max-w-xl mx-auto"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}

                {/* Interactive Status Summary Widget when in mid-workflow */}
                {selectedRef && (
                  <div className="max-w-xl mx-auto p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 grid grid-cols-2 gap-4 shadow-md font-mono text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Selected Ref</span>
                      <span className="text-sm font-bold text-indigo-300 block mt-0.5">{selectedRef.code}</span>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">{selectedRef.description}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Expected Qty</span>
                      <span className="text-sm font-bold text-blue-300 block mt-0.5">
                        {expectedQtyStr ? `${expectedQtyStr} pcs` : "⏳ WAITING"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Action Helpers customized to each step */}
              <div className="pt-4 border-t border-slate-100">
                
                {/* STEP 1: SELECT FROM REFERENCE LIST OR SEARCH */}
                {activeStep === "ref" && (
                  <div className="space-y-3.5 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                        Or select reference from master list:
                      </span>
                      
                      <div className="flex items-center gap-2">
                        {/* Material filter tags */}
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          {(["All", "Mesh", "Soft"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setMaterialTypeFilter(type)}
                              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                                materialTypeFilter === type
                                  ? "bg-white text-slate-800 shadow-xs border border-slate-200/50"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>

                        {/* Search input */}
                        <input
                          type="text"
                          placeholder="Search parts..."
                          value={refSearchQuery}
                          onChange={(e) => setRefSearchQuery(e.target.value)}
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 font-medium placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {filteredReferences.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 font-semibold border border-dashed border-slate-200 rounded-xl">
                        No references matching search criteria found.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[220px] overflow-y-auto pr-1">
                        {filteredReferences.map((ref) => (
                          <button
                            key={ref.code}
                            type="button"
                            onClick={() => handleSelectReference(ref)}
                            className="p-2.5 text-xs font-mono font-bold rounded-xl border bg-slate-50 hover:bg-indigo-50 border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-900 transition-all text-left flex flex-col justify-between cursor-pointer group shadow-2xs hover:shadow-xs"
                          >
                            <span className="block text-indigo-600 font-black group-hover:scale-102 transition-transform">{ref.code}</span>
                            <span className="block text-[9px] text-slate-400 font-sans truncate font-medium mt-0.5">{ref.description}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: COMMON QUANTITY PRESETS OR BACK */}
                {activeStep === "qty" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                        Or select expected quantity preset:
                      </span>
                      <button
                        type="button"
                        onClick={() => { setActiveStep("ref"); setSelectedRef(null); }}
                        className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Step 1</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
                      {[10, 20, 50, 100, 120, 150, 200, 250].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSelectQtyPreset(preset)}
                          className="py-3 px-2 text-sm font-extrabold font-mono rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-400 text-slate-700 hover:text-blue-800 transition-all shadow-2xs cursor-pointer text-center"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 3: PHYSICAL MANUAL COUNTING TACTILE STATION */}
                {activeStep === "count" && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-fadeIn pt-2">
                    
                    {/* Variance visualizer & audit comment (5 columns) */}
                    <div className="md:col-span-5 space-y-4">
                      
                      {/* Live Variance Calculation */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Difference Calculated</span>
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">Real - Expected</span>
                        </div>
                        
                        <div className="flex items-baseline justify-between pt-1">
                          <span className="text-xs text-slate-500 font-semibold">Variance:</span>
                          <span className={`text-2xl font-mono font-black ${
                            variance === 0 
                              ? "text-emerald-600" 
                              : variance > 0 
                                ? "text-blue-600" 
                                : "text-red-500"
                          }`}>
                            {variance === 0 ? "0" : variance > 0 ? `+${variance}` : variance} <span className="text-xs font-bold">pcs</span>
                          </span>
                        </div>

                        <div className="text-center py-1 bg-white border border-slate-100 rounded-lg text-[9px] font-bold tracking-wide mt-1">
                          {variance === 0 ? (
                            <span className="text-emerald-600">✓ Quantities Match Perfectly</span>
                          ) : variance > 0 ? (
                            <span className="text-blue-600">▲ Overage: Count exceeds expected</span>
                          ) : (
                            <span className="text-red-500">▼ Shortage: Count is below expected</span>
                          )}
                        </div>
                      </div>

                      {/* Comment section */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Comment / Remark (Optional)
                        </label>
                        <textarea
                          placeholder="Type or select a comment below..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors h-14 resize-none shadow-inner"
                        />
                        
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COMMENTS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setComment(preset)}
                              className={`text-[9px] px-2 py-1 rounded-lg border font-semibold transition-all cursor-pointer ${
                                comment === preset
                                  ? "bg-slate-800 text-white border-slate-800"
                                  : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Numeric keypad & submit button (7 columns) */}
                    <div className="md:col-span-7 flex flex-col justify-between gap-4">
                      
                      {/* Quick keypad incremental adjustments */}
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                            ➕ Quick Count Adjustments
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-5 gap-1.5">
                          {[-10, -5, -1, +5, +10].map((inc) => (
                            <button
                              key={inc}
                              type="button"
                              onClick={() => handleIncrement(inc)}
                              className={`py-1.5 text-xs font-bold rounded-lg border text-center transition-all cursor-pointer ${
                                inc > 0 
                                  ? "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" 
                                  : "border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
                              }`}
                            >
                              {inc > 0 ? `+${inc}` : inc}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tactile 10-key layout */}
                      <div className="grid grid-cols-3 gap-2">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleKeypadPress(n)}
                            className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-800 font-display text-sm font-black transition-all active:scale-95 cursor-pointer"
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleKeypadClear}
                          className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-500 font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer"
                        >
                          CLEAR
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress("0")}
                          className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-800 font-display text-sm font-black transition-all active:scale-95 cursor-pointer"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={handleKeypadBackspace}
                          className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-500 font-mono text-sm font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                        >
                          ⌫
                        </button>
                      </div>

                      {/* Big Submit Button */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setActiveStep("qty"); setInputValue(""); }}
                          className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 flex items-center justify-center cursor-pointer transition-all active:scale-95"
                          title="Back"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleManualSubmitBtnClick}
                          disabled={submitting}
                          className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-display font-black text-xs rounded-xl shadow-md shadow-emerald-100 hover:shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer uppercase"
                        >
                          {submitting ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Submitting stock...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" strokeWidth={3} />
                              <span>Submit Count to Stock System</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>

                  </div>
                )}

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>



    </div>
  );
}
