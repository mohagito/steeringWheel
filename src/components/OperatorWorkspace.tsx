import React, { useState, useMemo, useEffect, useRef } from "react";
import { Box, Adjustment, User, Reference } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Scan, Package, MapPin, Calculator, FileText, AlertCircle, 
  Check, ArrowRight, RefreshCw, Layers, HelpCircle, Laptop, Settings,
  Camera, CameraOff, X, Search, CheckCircle2
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
  references,
  currentUser, 
  onSubmitAdjustment 
}: OperatorWorkspaceProps) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scannedBox, setScannedBox] = useState<Box | null>(null);
  const [isNewCarton, setIsNewCarton] = useState(false);
  const [selectedReferenceCode, setSelectedReferenceCode] = useState("");
  const [referenceSearchQuery, setReferenceSearchQuery] = useState("");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<"All" | "Mesh" | "Soft">("All");
  const [materialType, setMaterialType] = useState<"Mesh" | "Leather">("Mesh");
  
  // Input quantities as strings for easy keypad manipulation
  const [expectedQtyStr, setExpectedQtyStr] = useState("");
  const [actualQtyStr, setActualQtyStr] = useState("");
  const [focusedField, setFocusedField] = useState<"expected" | "actual">("actual");
  
  const [comment, setComment] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<any>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const qrScannerRef = useRef<any>(null);

  // Clean up success timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Process the scanned barcode
  const handleIdentifyBox = (barcode: string) => {
    const cleanBarcode = barcode.trim().toUpperCase();
    if (!cleanBarcode) return;

    setIsScanning(true);
    setErrorMsg("");

    // Clear any active success auto-reset timeout to prevent losing the new scan
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setSuccessMsg(false);

    // Standard high-pitched operational feedback audio beep
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, context.currentTime); // 880Hz high-beep
      gain.gain.setValueAtTime(0.06, context.currentTime);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio Context beep ignored by browser policies.");
    }

    // Lookup barcode in existing system boxes
    const found = boxes.find((b) => b.barcode.toUpperCase() === cleanBarcode);
    
    if (found) {
      // Existing carton workflow
      setScannedBox(found);
      setIsNewCarton(false);
      setMaterialType(found.materialType || "Mesh");
      setExpectedQtyStr(found.expectedQty.toString());
      setActualQtyStr("");
      setFocusedField("actual"); // Operator goes straight to counting
      setSelectedReferenceCode(found.reference || "");
    } else {
      // New carton dynamic registration workflow (Supports empty database workflow)
      setIsNewCarton(true);
      setScannedBox({
        id: cleanBarcode,
        barcode: cleanBarcode,
        reference: "",
        expectedQty: 0,
        location: "Zone A",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setMaterialType("Mesh"); // Default to Mesh
      setExpectedQtyStr("");
      setActualQtyStr("");
      setFocusedField("expected"); // Focus Expected Qty first so they enter baseline
      setSelectedReferenceCode("");
    }
    setIsScanning(false);
  };

  // Audit history of the currently scanned carton barcode
  const boxHistory = useMemo(() => {
    if (!scannedBox) return [];
    return adjustments
      .filter((a) => a.barcode.toUpperCase() === scannedBox.barcode.toUpperCase())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [scannedBox, adjustments]);

  const handleIdentifyBoxRef = useRef(handleIdentifyBox);
  useEffect(() => {
    handleIdentifyBoxRef.current = handleIdentifyBox;
  });

  // Focus barcode input on mount and when scannedBox is cleared (ready for next scan)
  useEffect(() => {
    if (!scannedBox && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [scannedBox]);

  useEffect(() => {
    let isMounted = true;
    
    async function startCamera() {
      if (!isCameraActive) return;
      
      setCameraError("");
      // Wait for DOM to render the container element
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      const elementId = "camera-reader";
      const element = document.getElementById(elementId);
      if (!element) {
        setCameraError("Camera target container not found in DOM.");
        return;
      }
      
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(elementId);
        qrScannerRef.current = scanner;
        
        await scanner.start(
          { facingMode: "environment" }, // prefer back/rear camera for barcodes
          {
            fps: 15,
            qrbox: (width, height) => {
              // Barcode optimal box: wide and short
              const boxWidth = Math.min(width * 0.85, 320);
              const boxHeight = Math.min(height * 0.45, 160);
              return { width: boxWidth, height: boxHeight };
            },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (isMounted) {
              setBarcodeInput(decodedText);
              handleIdentifyBox(decodedText);
              stopCamera();
            }
          },
          (errorMessage) => {
            // Non-blocking verbose scanning updates
          }
        );
      } catch (err: any) {
        console.error("Camera scanner startup failed:", err);
        if (isMounted) {
          setCameraError(err?.message || "Failed to access camera. Please ensure permissions are granted.");
        }
      }
    }
    
    async function stopCamera() {
      if (qrScannerRef.current) {
        try {
          if (qrScannerRef.current.isScanning) {
            await qrScannerRef.current.stop();
          }
        } catch (err) {
          console.error("Error stopping camera scanner:", err);
        } finally {
          qrScannerRef.current = null;
        }
      }
      if (isMounted) {
        setIsCameraActive(false);
      }
    }
    
    if (isCameraActive) {
      startCamera();
    }
    
    return () => {
      isMounted = false;
      if (qrScannerRef.current) {
        try {
          if (qrScannerRef.current.isScanning) {
            qrScannerRef.current.stop();
          }
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      }
    };
  }, [isCameraActive]);

  const handleStopCameraScanner = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
      } catch (e) {
        console.warn(e);
      }
      qrScannerRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Global HID Scanner Keyboard Listener
  // Intercepts rapid typing from keyboard wedges (USB scanners) anywhere on the page
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore intercepting if the operator is currently typing in any text input or textarea
      // (except the barcode scanner search input itself)
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        const isInputOrTextArea = tagName === "input" || tagName === "textarea";
        if (isInputOrTextArea && activeEl.id !== "barcode-scanner-input") {
          return;
        }
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // HID scanners type printable characters extremely fast (usually < 20-30ms per key)
      // A safety threshold of 50ms ensures we capture fast hardware scanners while ignoring humans
      if (e.key.length === 1) {
        if (timeDiff < 50) {
          buffer += e.key;
        } else {
          // Slow typing detected - reset buffer to start a new wedge sequence
          buffer = e.key;
        }
      } else if (e.key === "Enter") {
        // Scanners typically terminate their transmission with an 'Enter' key immediately
        if (buffer.length >= 3 && timeDiff < 150) {
          e.preventDefault();
          const scanned = buffer.trim();
          setBarcodeInput(scanned);
          handleIdentifyBoxRef.current(scanned);
          buffer = "";
        } else {
          // Slow Enter key - reset buffer
          buffer = "";
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    handleIdentifyBox(barcodeInput);
  };

  // Touchpad numeric keyboard triggers
  const handleNumKey = (num: string) => {
    setErrorMsg("");
    const targetSetter = focusedField === "expected" ? setExpectedQtyStr : setActualQtyStr;
    
    targetSetter((prev) => {
      if (prev === "" && num === "0") return "0";
      if (prev === "0") return num;
      return prev + num;
    });
  };

  const handleBackspace = () => {
    const targetSetter = focusedField === "expected" ? setExpectedQtyStr : setActualQtyStr;
    targetSetter((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    const targetSetter = focusedField === "expected" ? setExpectedQtyStr : setActualQtyStr;
    targetSetter("");
  };

  // Preset quick-comments for shop floor speed
  const PRESET_COMMENTS = [
    "Over-shipped by supplier",
    "Missing components/screws",
    "Standard cycle count",
    "Damaged steering wheel rim",
    "Incorrect label on carton",
    "Scrap/Damaged leather wrapping"
  ];

  // Dynamic Real-time Calculations
  const calculation = useMemo(() => {
    if (expectedQtyStr === "" || actualQtyStr === "") return null;
    const expected = parseInt(expectedQtyStr, 10);
    const actual = parseInt(actualQtyStr, 10);
    if (isNaN(expected) || isNaN(actual)) return null;
    const diff = actual - expected;
    return {
      expected,
      actual,
      diff
    };
  }, [expectedQtyStr, actualQtyStr]);

  // Submit trace and create/update carton record
  const handleSubmitCount = async () => {
    if (!scannedBox || !calculation || !selectedReferenceCode) return;
    
    setSubmitting(true);
    try {
      const refObj = references.find(r => r.code === selectedReferenceCode);
      const matchedMaterialType = refObj ? refObj.materialType : "Mesh";

      await onSubmitAdjustment({
        barcode: scannedBox.barcode,
        reference: selectedReferenceCode,
        expectedQty: calculation.expected,
        actualQty: calculation.actual,
        difference: calculation.diff,
        operatorName: currentUser.fullName,
        comment: comment || "Standard count check",
        materialType: matchedMaterialType
      });
      
      setSuccessMsg(true);
      
      // Auto reset and focus barcode input after 1.5 seconds
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => {
        setSuccessMsg(false);
        setScannedBox(null);
        setBarcodeInput("");
        setExpectedQtyStr("");
        setActualQtyStr("");
        setSelectedReferenceCode("");
        setComment("");
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
        successTimeoutRef.current = null;
      }, 1500);
    } catch (err) {
      console.error("Failed to submit count:", err);
      setErrorMsg("Error saving adjustment. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="operator-workspace-tab">
      
      {/* Left Column: Scanner Identification & Simulation Panel (5 columns) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        
        {/* Scanner Panel */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
          
          <div className="flex items-center justify-between mb-4 mt-1">
            <div className="flex items-center gap-2">
              <Scan className="w-5 h-5 text-blue-600 animate-pulse" />
              <h3 className="font-display font-bold text-slate-900 text-base">Carton Scanner</h3>
            </div>
            <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              USB Scanner Active
            </span>
          </div>

          <form onSubmit={handleBarcodeSubmit} className="space-y-3">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Scan Barcode / Type ID
            </label>
            <div className="relative">
              <input
                ref={barcodeInputRef}
                type="text"
                id="barcode-scanner-input"
                placeholder="Scan or type barcode (e.g. A025P562A)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm uppercase font-bold text-slate-950 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                disabled={isScanning}
                autoComplete="off"
              />
              <button
                type="submit"
                id="search-barcode-btn"
                className="absolute right-2 top-2 h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
                disabled={isScanning}
              >
                {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
            
            {errorMsg && (
              <p className="text-red-500 text-xs font-semibold flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </p>
            )}

            {isCameraActive ? (
              <div className="mt-3.5 p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                    Phone Camera Scanner Active
                  </span>
                  <button
                    type="button"
                    onClick={handleStopCameraScanner}
                    className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Stop Camera"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="overflow-hidden rounded-lg bg-black relative border border-slate-800 shadow-inner">
                  {/* Container that html5-qrcode will bind to */}
                  <div id="camera-reader" className="w-full min-h-[220px] object-cover"></div>
                  
                  {/* Barcode Guide Overlay */}
                  <div className="absolute inset-0 border-2 border-dashed border-indigo-500/50 pointer-events-none rounded-lg flex items-center justify-center">
                    <div className="w-[85%] h-[40%] border-2 border-indigo-400 rounded-md bg-indigo-500/10 flex items-center justify-center">
                      <span className="text-[10px] text-indigo-200 font-mono font-bold tracking-widest bg-indigo-900/85 px-2.5 py-0.5 rounded">ALIGN BARCODE HERE</span>
                    </div>
                  </div>
                </div>

                {cameraError ? (
                  <p className="text-red-400 text-[11px] font-semibold flex items-start gap-1.5 leading-tight">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </p>
                ) : (
                  <p className="text-slate-400 text-[10px] leading-tight italic text-center">
                    Point your phone camera at a carton's barcode to scan automatically.
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                id="open-camera-scanner-btn"
                onClick={() => setIsCameraActive(true)}
                className="w-full flex items-center justify-center gap-2 py-3 mt-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-xl transition-all active:scale-98 cursor-pointer shadow-xs"
              >
                <Camera className="w-4 h-4 text-indigo-600 animate-pulse" />
                <span>Scan with Phone Camera</span>
              </button>
            )}
          </form>

          {/* USB Scanner Connection Help Card */}
          <div className="mt-5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Automatic USB Scanner Mode</p>
              <p className="leading-relaxed">
                Connect your USB barcode scanner (HID mode). Simply scan any barcode at any time; the system will detect it, fill the ID automatically, and focus the quantities. No clicks required.
              </p>
            </div>
          </div>

          {/* Quick Demo Simulator if Database is empty */}
          <div className="mt-5 pt-5 border-t border-slate-100">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              💡 Simulators (Tap to emulate hardware scan)
            </span>
            <div className="grid grid-cols-2 gap-2" id="scanner-simulator-grid">
              {["A025P562A", "A020M334B", "A026K122D", "A018P100A"].map((code) => (
                <button
                  key={code}
                  type="button"
                  id={`simulate-scan-${code}`}
                  onClick={() => {
                    setBarcodeInput(code);
                    handleIdentifyBox(code);
                  }}
                  className={`py-2 px-3 text-xs font-mono font-bold rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    scannedBox?.barcode === code
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span>{code}</span>
                  <span className="text-[9px] opacity-65 font-sans">Simulate</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Box Information panel */}
        {scannedBox && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg space-y-4 border border-slate-800"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono tracking-wider uppercase px-2.5 py-1 rounded-md border ${
                isNewCarton 
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              }`}>
                {isNewCarton ? "🆕 NEW CARTON CREATING" : "✅ REGISTERED CARTON"}
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Ready
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 pb-2 border-b border-slate-800/60">
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Carton Barcode</span>
                <span className="text-xl font-mono font-bold text-white block mt-0.5">{scannedBox.barcode}</span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Storage Location</span>
                <span className="text-sm font-semibold text-slate-200 block mt-0.5">{scannedBox.location}</span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Current Expected</span>
                <span className="text-xl font-mono font-bold text-blue-400 block mt-0.5">
                  {isNewCarton ? "0 (TBD)" : `${scannedBox.expectedQty} pcs`}
                </span>
              </div>
            </div>
          </motion.div>
        )}

      </div>

      {/* Right Column: Touch Quantities Entry & Visualizer (7 columns) */}
      <div className="lg:col-span-7">
        
        <AnimatePresence mode="wait">
          {!scannedBox ? (
            // State A: Awaiting identification
            <motion.div
              key="prompt-scan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center h-full min-h-[440px]"
            >
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4 animate-pulse">
                <Scan className="w-8 h-8" />
              </div>
              <h3 className="font-display font-bold text-slate-800 text-lg">Awaiting Barcode Scan</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1 leading-relaxed">
                Please scan a steering wheel carton's barcode with your reader, or use one of the quick simulation buttons to load the counts panel.
              </p>
            </motion.div>
          ) : successMsg ? (
            // State B: Count record submitted successfully
            <motion.div
              key="success-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-emerald-600 text-white rounded-2xl p-12 flex flex-col items-center justify-center text-center h-full min-h-[440px] shadow-lg"
            >
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white mb-4 animate-bounce">
                <Check className="w-8 h-8" strokeWidth={3} />
              </div>
              <h3 className="font-display font-bold text-xl">Stock Record Logged</h3>
              <p className="text-sm text-emerald-100 max-w-sm mt-2 leading-relaxed">
                The count has been successfully recorded in the audit logs. Ready for the next carton scan.
              </p>
            </motion.div>
          ) : (
            // State C: Interactive Quantities Input & Physical count panel
            <motion.div
              key="count-workspace"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6"
            >
              {/* Header */}
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-lg">Reconciliation Panel</h3>
                  <p className="text-xs text-slate-500">Carton: <span className="font-mono font-bold text-slate-800">{scannedBox.barcode}</span></p>
                </div>
                <button
                  onClick={() => { setScannedBox(null); setBarcodeInput(""); }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer"
                  id="cancel-reconciliation-btn"
                >
                  Cancel Check
                </button>
              </div>

              {/* Step 1: Predefined Reference Selector */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    1. Select Master Reference (17 Predefined)
                  </span>
                  {/* Material Type filter inside Reference picker */}
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                    {(["All", "Mesh", "Soft"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setMaterialTypeFilter(filter)}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                          materialTypeFilter === filter
                            ? "bg-white text-blue-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search input for References */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search references by code or description..."
                    value={referenceSearchQuery}
                    onChange={(e) => setReferenceSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                  />
                </div>

                {/* References Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[170px] overflow-y-auto pr-1 pb-1 scrollbar-thin">
                  {references
                    .filter((ref) => {
                      // Filter by Material Type
                      if (materialTypeFilter !== "All" && ref.materialType !== materialTypeFilter) {
                        return false;
                      }
                      // Filter by Search Query
                      const q = referenceSearchQuery.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        ref.code.toLowerCase().includes(q) ||
                        ref.description.toLowerCase().includes(q)
                      );
                    })
                    .map((ref) => {
                      const isSelected = selectedReferenceCode === ref.code;
                      return (
                        <button
                          key={ref.code}
                          type="button"
                          onClick={() => {
                            setSelectedReferenceCode(ref.code);
                            // Also pre-fill material type for box registration if needed
                            setMaterialType(ref.materialType === "Mesh" ? "Mesh" : "Leather");
                          }}
                          className={`p-3 rounded-xl border-2 text-left transition-all flex items-start gap-2.5 cursor-pointer hover:border-slate-300 ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/50 shadow-xs"
                              : "border-slate-100 bg-slate-50/40"
                          }`}
                        >
                          <div className={`mt-0.5 shrink-0 ${isSelected ? "text-blue-600" : "text-slate-300"}`}>
                            {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs text-slate-900 block truncate">{ref.code}</span>
                              <span className={`text-[8px] font-bold px-1 rounded uppercase shrink-0 ${
                                ref.materialType === "Mesh" ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"
                              }`}>
                                {ref.materialType}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium block truncate" title={ref.description}>
                              {ref.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>

                {/* Display Selected Reference Info card */}
                {selectedReferenceCode && (() => {
                  const selectedRefObj = references.find(r => r.code === selectedReferenceCode);
                  if (!selectedRefObj) return null;
                  return (
                    <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-xl grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Selected Description</span>
                        <span className="font-bold text-slate-800 block truncate">{selectedRefObj.description}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Leather Companion</span>
                        <span className="font-mono font-bold text-slate-700 block truncate">{selectedRefObj.associatedLeather}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Step 2: Quantities Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Expected Qty (Editable only for new, locked for existing) */}
                <div 
                  onClick={() => isNewCarton && setFocusedField("expected")}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    focusedField === "expected" && isNewCarton
                      ? "border-blue-600 bg-blue-50/20"
                      : isNewCarton
                        ? "border-slate-200 hover:border-slate-300 bg-white"
                        : "border-slate-100 bg-slate-50/50 cursor-not-allowed opacity-80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Expected Quantity</span>
                    {!isNewCarton && (
                      <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Locked System Base</span>
                    )}
                  </div>
                  <div className="text-2xl font-mono font-extrabold text-slate-800">
                    {expectedQtyStr === "" ? "0" : expectedQtyStr} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2">
                    {isNewCarton ? "Tap to enter expected carton count" : "Preloaded from database profile"}
                  </div>
                </div>

                {/* Real Counted Qty */}
                <div 
                  onClick={() => setFocusedField("actual")}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    focusedField === "actual"
                      ? "border-blue-600 bg-blue-50/20 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real Counted Qty</span>
                    <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Reconciliation Input</span>
                  </div>
                  <div className="text-2xl font-mono font-extrabold text-slate-900">
                    {actualQtyStr === "" ? "0" : actualQtyStr} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Tap to enter physical items counted
                  </div>
                </div>

              </div>

              {/* Dynamic Delta visualizer */}
              {calculation && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Difference Calculated</span>
                    <span className="text-xs text-slate-500 font-medium">Difference = Real - Expected</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-mono font-black block ${
                      calculation.diff === 0 
                        ? "text-emerald-600" 
                        : calculation.diff > 0 
                          ? "text-blue-600" 
                          : "text-red-500"
                    }`}>
                      {calculation.diff === 0 ? "0" : calculation.diff > 0 ? `+${calculation.diff}` : calculation.diff} <span className="text-xs font-bold">pcs</span>
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                      calculation.diff === 0 ? "text-emerald-600" : "text-slate-500"
                    }`}>
                      {calculation.diff === 0 
                        ? "✓ Fully Balanced" 
                        : calculation.diff > 0 
                          ? "▲ Overage Stock" 
                          : "▼ Shortage Deficit"
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Step 3: Tactile Keypad & Presets */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
                
                {/* Presets and Comment Box (5 columns) */}
                <div className="md:col-span-5 space-y-4">
                  {/* Preset Quick Remarks */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Audit Remarks
                    </label>
                    <textarea
                      placeholder="Type comments or choose a preset below..."
                      id="operator-comment-input"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 transition-colors h-14 resize-none shadow-inner"
                    />
                    
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                      Quick remarks preset
                    </span>
                    <div className="flex flex-wrap gap-1.5" id="presets-container">
                      {PRESET_COMMENTS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          id={`preset-reason-${preset.slice(0, 10).replace(/[^a-z0-9]/gi, "-")}`}
                          onClick={() => setComment(preset)}
                          className={`text-[9px] px-2 py-1 rounded-md border transition-all cursor-pointer ${
                            comment === preset
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tactile Keypad (7 columns) */}
                <div className="md:col-span-7 flex flex-col justify-between gap-4">
                  
                  {/* Highlight bar showing which field is active */}
                  <div className="text-center py-1 bg-blue-50/50 border border-blue-100 rounded-lg text-[10px] font-bold text-blue-700 uppercase tracking-widest animate-pulse">
                    Keypad updating: {focusedField === "expected" ? "Expected Quantity" : "Real Counted Quantity"}
                  </div>

                  {/* Quick-Quantity Presets for fast shopfloor tapping */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        ⚡ Quick Value Presets
                      </span>
                      <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">Sets total</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[10, 20, 50, 100, 150].map((val) => (
                        <button
                          key={val}
                          type="button"
                          id={`preset-qty-${val}`}
                          onClick={() => {
                            if (focusedField === "expected") {
                              setExpectedQtyStr(val.toString());
                            } else {
                              setActualQtyStr(val.toString());
                            }
                          }}
                          className="py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer"
                        >
                          {val}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        ➕ Quick Increments
                      </span>
                      <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">Adds to total</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[+1, +5, +10, +25].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          id={`increment-qty-${inc}`}
                          onClick={() => {
                            if (focusedField === "expected") {
                              const curr = parseInt(expectedQtyStr) || 0;
                              setExpectedQtyStr((curr + inc).toString());
                            } else {
                              const curr = parseInt(actualQtyStr) || 0;
                              setActualQtyStr((curr + inc).toString());
                            }
                          }}
                          className="py-1 text-xs font-extrabold rounded-lg border border-blue-100 bg-blue-50/55 text-blue-700 hover:bg-blue-100 hover:border-blue-200 transition-colors cursor-pointer"
                        >
                          +{inc}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2" id="keypad-operator">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                      <button
                        key={n}
                        type="button"
                        id={`keypad-${n}`}
                        onClick={() => handleNumKey(n)}
                        className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-800 font-display text-base font-black transition-all active:scale-95 cursor-pointer"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      id="keypad-clear"
                      onClick={handleClear}
                      className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-500 font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer"
                    >
                      CLEAR
                    </button>
                    <button
                      type="button"
                      id="keypad-0"
                      onClick={() => handleNumKey("0")}
                      className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-800 font-display text-base font-black transition-all active:scale-95 cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      id="keypad-back"
                      onClick={handleBackspace}
                      className="h-11 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-400 hover:bg-slate-200 text-slate-500 font-mono text-sm font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                    >
                      ⌫
                    </button>
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmitCount}
                    disabled={expectedQtyStr === "" || actualQtyStr === "" || !selectedReferenceCode || submitting}
                    id="submit-count-btn"
                    className={`w-full py-4 rounded-xl font-display font-black text-white text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer ${
                      expectedQtyStr === "" || actualQtyStr === "" || !selectedReferenceCode
                        ? "bg-slate-300 shadow-none cursor-not-allowed text-slate-500"
                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10"
                    }`}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Saving Reconciliation...
                      </>
                    ) : !selectedReferenceCode ? (
                      <>
                        <AlertCircle className="w-5 h-5" />
                        Select Reference First
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" strokeWidth={3} />
                        Submit Count Reconciled
                      </>
                    )}
                  </button>

                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

    </div>
  );
}
