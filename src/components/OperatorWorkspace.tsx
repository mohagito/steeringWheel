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
    const keepFocus = () => {
      if (!isPalletSessionActive) {
        if (setupInvoiceRef.current && document.activeElement !== setupInvoiceRef.current) {
          setupInvoiceRef.current.focus();
        }
      } else {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select") {
          if (inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.focus();
          }
        }
      }
    };

    keepFocus();

    const handleGlobalInteraction = () => {
      setTimeout(() => {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select") {
          if (isPalletSessionActive) {
            inputRef.current?.focus();
          } else {
            setupInvoiceRef.current?.focus();
          }
        }
      }, 50);
    };

    document.addEventListener("click", handleGlobalInteraction);
    return () => {
      document.removeEventListener("click", handleGlobalInteraction);
    };
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

        // 1.5 Robust First-Character Cleanup (Perfect solution for scanners prepending I, 1, P, etc. to 9-char reference codes)
        if (upperScanned.length > 4) {
          const firstCharRemoved = upperScanned.substring(1);
          match = refs.find(r => r.code.toUpperCase() === firstCharRemoved);
          if (match) return match;
        }
        
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
      <div className="max-w-md mx-auto py-6" id="pallet-setup-wizard" onClick={handleCardClick}>
        <div className="bg-white border border-[#1e293b] rounded-none p-6 shadow-sm space-y-6">
          {/* Header Banner - Industrial Slate */}
          <div className="bg-[#0f1e36] -mx-6 -mt-6 p-4 border-b border-[#1e293b] flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-300 uppercase">HMI Intake Terminal</span>
            <span className="text-[9px] font-mono text-emerald-400 font-bold">ONLINE</span>
          </div>

          {/* Title section */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">STEP 01 // Pallet Initiation</div>
            <h2 className="text-lg font-black text-[#0f1e36] font-display uppercase tracking-tight">Active Pallet Intake</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Scan or type the incoming supplier invoice.
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
            className="space-y-4"
          >
            {/* Invoice Input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Invoice Number (E.g. Odette Barcode)
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  ref={setupInvoiceRef}
                  type="text"
                  placeholder="E.G. PI-98402A"
                  value={setupInvoice}
                  onChange={(e) => setSetupInvoice(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-[#1e293b] rounded-none focus:outline-none focus:border-blue-600 focus:bg-white text-sm font-bold uppercase tracking-wide text-slate-800 transition-colors font-mono"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Giant tactile start scanning button */}
            <button
              type="submit"
              className="w-full py-3 bg-[#0a1322] hover:bg-blue-600 border border-[#1e293b] text-white rounded-none text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer uppercase"
            >
              <Scan className="w-4 h-4" />
              <span>Initialize Intake Session</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4" id="operator-guided-wizard">

      {/* Active Pallet Session Status Header */}
      <div className="bg-[#0f1e36] text-white rounded-none p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-[#1e293b] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0a1322] text-blue-400 border border-slate-700">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 border border-blue-500/30 uppercase tracking-wide">
                ACTIVE TRACEABILITY SESSION
              </span>
            </div>
            <h3 className="text-xs font-bold font-mono tracking-wide mt-1 text-slate-200">
              INCOMING INVOICE: <span className="text-blue-400 font-mono font-black">{activePalletInvoice}</span>
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
          className="px-3 py-1.5 bg-[#0a1322] hover:bg-red-900 hover:text-white border border-slate-700 rounded-none text-[10px] font-mono font-bold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
        >
          <X className="w-3.5 h-3.5" />
          <span>CLOSE PALLET</span>
        </button>
      </div>
      
      {/* Scan Flow Mode Selector - 2 Mode Options */}
      <div className="grid grid-cols-2 gap-2 bg-[#0a1322]/5 p-1 rounded-none border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setFlowMode("quick");
            handleResetWizard();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-none font-mono text-xs font-bold transition-colors cursor-pointer ${
            flowMode === "quick"
              ? "bg-[#0f1e36] text-white border border-[#1e293b]"
              : "bg-transparent text-slate-600 hover:bg-slate-200/50"
          }`}
        >
          <span>⚡ QUICK INTAKE</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFlowMode("audit");
            handleResetWizard();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-none font-mono text-xs font-bold transition-colors cursor-pointer ${
            flowMode === "audit"
              ? "bg-[#0f1e36] text-white border border-[#1e293b]"
              : "bg-transparent text-slate-600 hover:bg-slate-200/50"
          }`}
        >
          <Scan className="w-4 h-4" />
          <span>📋 GUIDED DISCREPANCY AUDIT</span>
        </button>
      </div>

      {/* Step Indicator Progress Bar */}
      <div className="bg-white p-3.5 rounded-none border border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-blue-600"></div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
            OPERATOR: <strong className="text-slate-800 font-bold">{currentUser.fullName}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs font-bold font-mono">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-none transition-colors ${
            activeStep === "ref" 
              ? "bg-[#0f1e36] border-[#1e293b] text-white" 
              : selectedRef 
                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                : "bg-slate-50 border-slate-200 text-slate-400"
          }`}>
            <span className="text-[9px] w-3.5 h-3.5 border border-current flex items-center justify-center font-mono">1</span>
            <span className="text-[10px]">REF</span>
          </div>

          <div className="h-px w-3 bg-slate-300"></div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-none transition-colors ${
            activeStep === "qty" 
              ? "bg-[#0f1e36] border-[#1e293b] text-white" 
              : expectedQtyStr 
                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                : "bg-slate-50 border-slate-200 text-slate-400"
          }`}>
            <span className="text-[9px] w-3.5 h-3.5 border border-current flex items-center justify-center font-mono">2</span>
            <span className="text-[10px]">{flowMode === "quick" ? "QTY" : "EXPECTED"}</span>
          </div>

          {flowMode === "audit" && (
            <>
              <div className="h-px w-3 bg-slate-300"></div>

              <div className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-none transition-colors ${
                activeStep === "count" 
                  ? "bg-[#0f1e36] border-[#1e293b] text-white" 
                  : "bg-slate-50 border-slate-200 text-slate-400"
              }`}>
                <span className="text-[9px] w-3.5 h-3.5 border border-current flex items-center justify-center font-mono">3</span>
                <span className="text-[10px]">PHYSICAL</span>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-emerald-600 text-white rounded-none p-8 text-center shadow-sm space-y-4 flex flex-col items-center justify-center min-h-[350px] border border-emerald-700"
          >
            <div className="w-12 h-12 bg-white/10 border border-white/20 rounded-none flex items-center justify-center">
              <Check className="w-6 h-6 text-white" strokeWidth={3} />
            </div>
            <div className="space-y-1">
              <h3 className="font-mono font-black text-lg tracking-wider">INTAKE RECORDED</h3>
              <p className="text-emerald-100 text-xs font-mono max-w-lg leading-relaxed">
                {successMsg}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-200 bg-emerald-800/40 px-3 py-1.5 border border-emerald-500/30 rounded-none">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>TERMINAL READY FOR NEXT SCAN</span>
            </div>
          </motion.div>
        ) : (
          // Main Guided Form Terminal
          <div
            key="terminal-body"
            onClick={handleCardClick}
            className="bg-white rounded-none border border-slate-200 shadow-xs overflow-hidden relative cursor-text min-h-[420px] flex flex-col"
          >
            {/* Top high-visibility status bar */}
            <div className={`h-1.5 transition-all duration-300 ${
              activeStep === "ref" ? "bg-blue-600" : activeStep === "qty" ? "bg-amber-500" : "bg-emerald-600"
            }`} />

            {/* Terminal Header Info Panel */}
            <div className="bg-[#0f1e36] text-white border-b border-[#1e293b] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-[#0a1322] border border-slate-700 text-blue-400">
                  <Scan className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="font-mono font-bold text-[11px] uppercase tracking-wider">HMI STATION // SW-INTAKE-01</h4>
                </div>
              </div>

              {activeStep !== "ref" && (
                <button
                  type="button"
                  onClick={handleResetWizard}
                  className="px-2.5 py-1 bg-[#0a1322] hover:bg-slate-800 text-slate-300 rounded-none text-[10px] font-mono font-bold transition-colors border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>RESET TERMINAL</span>
                </button>
              )}
            </div>

            {/* Terminal Working Area */}
            <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-6">
              
              {/* Giant Guided Label, Input, and Feedback Area */}
              <div className="space-y-4">
                
                {/* 🔴 THE GUIDED INPUT LABEL */}
                <div className="text-center">
                  <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 px-2.5 py-1 border border-slate-300 uppercase tracking-widest">
                    {flowMode === "quick" ? "⚡ SPEED INTAKE ACTIVE" : "📋 AUDIT INTAKE ACTIVE"}
                  </span>
                  
                  <h2 className="text-lg font-mono font-black text-slate-900 uppercase tracking-tight mt-3">
                    {activeStep === "ref" && "SCAN MASTER REFERENCE BARCODE"}
                    {activeStep === "qty" && (
                      flowMode === "quick" 
                        ? "SCAN CARTON QUANTITY (AUTO-SAVE)"
                        : "SCAN EXPECTED QUANTITY FROM LABEL"
                    )}
                    {activeStep === "count" && "ENTER PHYSICAL COUNT"}
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
                        ? "Scan reference label code (e.g. A025M750B)..."
                        : activeStep === "qty"
                          ? (flowMode === "quick" ? "Scan/enter quantity (e.g. 100) to complete intake..." : "Scan/enter expected count...")
                          : "Type physical items counted, then press Enter..."
                    }
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className={`w-full text-center py-3.5 px-4 bg-slate-50 border rounded-none font-mono text-base font-bold transition-colors uppercase focus:outline-none focus:bg-white ${
                      errorMsg 
                        ? "border-red-500 text-red-900 focus:border-red-600" 
                        : activeStep === "ref"
                          ? "border-[#1e293b] text-slate-900 focus:border-blue-600"
                          : activeStep === "qty"
                            ? "border-[#1e293b] text-slate-900 focus:border-blue-600"
                            : "border-[#1e293b] text-slate-900 focus:border-emerald-600"
                    }`}
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className={`absolute right-1.5 top-1.5 h-9 px-4 rounded-none font-mono font-bold text-[10px] text-white flex items-center gap-1.5 transition-colors cursor-pointer ${
                      activeStep === "ref" ? "bg-blue-600 hover:bg-blue-700" :
                      activeStep === "qty" 
                        ? (flowMode === "quick" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700") :
                      "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    <span>{activeStep === "qty" && flowMode === "quick" ? "COMMIT" : "CONFIRM"}</span>
                    <CornerDownLeft className="w-3 h-3" />
                  </button>
                </form>

                {/* Error feedback banner */}
                {errorMsg && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 rounded-none text-xs font-semibold flex items-center gap-2 max-w-xl mx-auto font-mono">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Interactive Status Summary Widget when in mid-workflow */}
                {selectedRef && (
                  <div className="max-w-xl mx-auto p-3 bg-slate-50 border border-slate-200 grid grid-cols-2 gap-4 font-mono text-xs">
                    <div>
                      <span className="text-slate-500 text-[9px] block uppercase font-bold">Traceability Reference</span>
                      <span className="text-sm font-bold text-slate-900 block mt-0.5">{selectedRef.code}</span>
                      <span className="text-[10px] text-slate-500 truncate block mt-0.5">{selectedRef.description}</span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[9px] block uppercase font-bold">Declared Expected Qty</span>
                      <span className="text-sm font-bold text-slate-900 block mt-0.5">
                        {expectedQtyStr ? `${expectedQtyStr} PCS` : "⏳ WAITING SCAN"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Action Helpers customized to each step */}
              <div className="pt-4 border-t border-slate-200">
                
                {/* STEP 1: SELECT FROM REFERENCE LIST OR SEARCH */}
                {activeStep === "ref" && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                        MANUAL REFERENCE SELECTOR:
                      </span>
                      
                      <div className="flex items-center gap-2">
                        {/* Material filter tags */}
                        <div className="flex bg-slate-100 p-0.5 border border-slate-200">
                          {(["All", "Mesh", "Soft"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setMaterialTypeFilter(type)}
                              className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-none transition-colors cursor-pointer ${
                                materialTypeFilter === type
                                  ? "bg-white text-slate-900 border border-slate-200 shadow-2xs"
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
                          placeholder="Type filter..."
                          value={refSearchQuery}
                          onChange={(e) => setRefSearchQuery(e.target.value)}
                          className="px-2 py-0.5 text-xs border border-slate-200 rounded-none bg-slate-50 font-mono placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    {filteredReferences.length === 0 ? (
                      <div className="py-4 text-center text-xs font-mono text-slate-400 border border-dashed border-slate-200">
                        No matches.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {filteredReferences.map((ref) => (
                          <button
                            key={ref.code}
                            type="button"
                            onClick={() => handleSelectReference(ref)}
                            className="p-2 text-xs font-mono font-bold border bg-slate-50 hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-900 transition-colors text-left flex flex-col justify-between cursor-pointer rounded-none"
                          >
                            <span className="block text-blue-600 font-black">{ref.code}</span>
                            <span className="block text-[8px] text-slate-400 font-sans truncate font-medium mt-0.5">{ref.description}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: COMMON QUANTITY PRESETS OR BACK */}
                {activeStep === "qty" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                        QUANTITY SELECTION PRESETS:
                      </span>
                      <button
                        type="button"
                        onClick={() => { setActiveStep("ref"); setSelectedRef(null); }}
                        className="text-[10px] font-mono text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>BACK TO REF</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {[10, 20, 50, 100, 120, 150, 200, 250].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSelectQtyPreset(preset)}
                          className="py-2 px-1 text-xs font-bold font-mono border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-400 text-slate-700 hover:text-blue-800 transition-colors cursor-pointer text-center rounded-none"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 3: PHYSICAL MANUAL COUNTING TACTILE STATION */}
                {activeStep === "count" && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
                    
                    {/* Variance visualizer & audit comment (5 columns) */}
                    <div className="md:col-span-5 space-y-3">
                      
                      {/* Live Variance Calculation */}
                      <div className="p-3 bg-slate-50 border border-slate-200 space-y-1">
                        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Audit Variance</span>
                        <div className="flex items-baseline justify-between pt-1">
                          <span className="text-xs font-mono text-slate-500">Delta:</span>
                          <span className={`text-xl font-mono font-black ${
                            variance === 0 
                              ? "text-emerald-600" 
                              : variance > 0 
                                ? "text-blue-600" 
                                : "text-red-600"
                          }`}>
                            {variance === 0 ? "0" : variance > 0 ? `+${variance}` : variance} <span className="text-xs font-bold">PCS</span>
                          </span>
                        </div>
                      </div>

                      {/* Comment section */}
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                          Auditor Comment (Traceability log)
                        </label>
                        <textarea
                          placeholder="Add comment..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-none text-xs font-mono focus:outline-none focus:border-blue-600 h-12 resize-none"
                        />
                        
                        <div className="flex flex-wrap gap-1">
                          {PRESET_COMMENTS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setComment(preset)}
                              className={`text-[8px] px-1.5 py-0.5 rounded-none border font-mono font-semibold transition-colors cursor-pointer ${
                                comment === preset
                                  ? "bg-[#0f1e36] text-white border-[#1e293b]"
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
                    <div className="md:col-span-7 flex flex-col justify-between gap-3">
                      
                      {/* Quick keypad incremental adjustments */}
                      <div className="p-2.5 bg-slate-50 border border-slate-200 space-y-2">
                        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                          INCREMENTAL ADJUSTMENT
                        </span>
                        
                        <div className="grid grid-cols-5 gap-1">
                          {[-10, -5, -1, +5, +10].map((inc) => (
                            <button
                              key={inc}
                              type="button"
                              onClick={() => handleIncrement(inc)}
                              className={`py-1 text-[10px] font-mono font-bold border text-center transition-colors cursor-pointer rounded-none ${
                                inc > 0 
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" 
                                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              }`}
                            >
                              {inc > 0 ? `+${inc}` : inc}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tactile 10-key layout */}
                      <div className="grid grid-cols-3 gap-1">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleKeypadPress(n)}
                            className="h-10 rounded-none bg-slate-50 border border-slate-200 hover:border-slate-400 hover:bg-slate-100 text-slate-800 font-mono text-sm font-bold transition-colors cursor-pointer"
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleKeypadClear}
                          className="h-10 rounded-none bg-slate-50 border border-slate-200 hover:border-slate-400 hover:bg-slate-100 text-slate-500 font-mono text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          CLR
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress("0")}
                          className="h-10 rounded-none bg-slate-50 border border-slate-200 hover:border-slate-400 hover:bg-slate-100 text-slate-800 font-mono text-sm font-bold transition-colors cursor-pointer"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={handleKeypadBackspace}
                          className="h-10 rounded-none bg-slate-50 border border-slate-200 hover:border-slate-400 hover:bg-slate-100 text-slate-500 font-mono text-sm transition-colors flex items-center justify-center cursor-pointer"
                        >
                          ⌫
                        </button>
                      </div>

                      {/* Big Submit Button */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setActiveStep("qty"); setInputValue(""); }}
                          className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-none border border-slate-200 flex items-center justify-center cursor-pointer transition-colors"
                          title="Back"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleManualSubmitBtnClick}
                          disabled={submitting}
                          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-mono font-bold text-xs rounded-none transition-colors flex items-center justify-center gap-2 cursor-pointer uppercase border border-emerald-700"
                        >
                          {submitting ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>RECORDING...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" strokeWidth={3} />
                              <span>COMMIT PHYSICAL STOCK</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>

                  </div>
                )}

              </div>

            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
