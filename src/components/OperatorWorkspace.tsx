import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Adjustment, User, Reference, ReceivingInvoice, ScannedInvoiceBox, ScannedTransferItem } from "../types";
import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Scan, Check, AlertCircle, RefreshCw, FileText, User as UserIcon, Sparkles, ArrowRight, Layers, Box as BoxIcon, RotateCcw, Eraser, Trash2, CheckCircle2, XCircle, Edit3, Save, X, PlusCircle, Search, Barcode, AlertTriangle
} from "lucide-react";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import Swal from "sweetalert2";
import { formatSystemTime } from "../utils/timeUtils";
import { executeProtectedStockOperation, executeProtectedTransfer } from "../services/protectionLayer";

interface OperatorWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  invoices?: ReceivingInvoice[];
  currentUser: User;
  onSubmitAdjustment: (adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">) => Promise<void>;
  onSavePendingInvoice?: (invoice: ReceivingInvoice) => Promise<void>;
  onApproveInvoice?: (invoiceId: string) => Promise<void>;
  onCancelInvoice?: (invoiceId: string) => Promise<void>;
  onOpenLowStockModal?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export default function OperatorWorkspace({ 
  boxes = [], 
  adjustments = [], 
  references = [], 
  invoices = [],
  currentUser, 
  onSubmitAdjustment,
  onSavePendingInvoice,
  onApproveInvoice,
  onCancelInvoice,
  onOpenLowStockModal,
  onNavigateToTab
}: OperatorWorkspaceProps) {
  
  // Persisted Invoice Input (Used only for INTAKE mode) - initialized strictly empty
  const [invoiceNumber, setInvoiceNumber] = useState("");

  // Clean any old auto-generated invoice strings from previous sessions on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("op_invoice");
      if (saved && (saved.startsWith("INV-20") || saved.startsWith("INV-"))) {
        localStorage.removeItem("op_invoice");
      }
    } catch (e) {}
  }, []);
  
  // Operation Mode: INTAKE vs TRANSFER (Pegadas) vs RETURN vs INCOMPLETA
  const [opMode, setOpMode] = useState<"INTAKE" | "TRANSFER" | "RETURN" | "INCOMPLETA">("INTAKE");

  // Local optimistic pending invoice for instant (0ms) UI updates during rapid scanning (INTAKE mode)
  const [localPendingInvoice, setLocalPendingInvoice] = useState<ReceivingInvoice | null>(null);

  // Pegadas Batch State (Staged items for Pegadas Transfer S1 -> S2 without invoice)
  const [pegadasBatch, setPegadasBatch] = useState<ScannedTransferItem[]>(() => {
    try {
      const saved = localStorage.getItem("op_pegadas_batch");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Sync Pegadas Batch to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("op_pegadas_batch", JSON.stringify(pegadasBatch));
    } catch (e) {
      console.error(e);
    }
  }, [pegadasBatch]);

  // Scan Inputs (Cleared after every successful box)
  const [referenceCode, setReferenceCode] = useState("");
  const [quantity, setQuantity] = useState(""); // Label / Barcode Quantity (Expected)
  const [actualQuantity, setActualQuantity] = useState(""); // Real Manually Counted Quantity (Physical)

  // UX Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [approvingInvoice, setApprovingInvoice] = useState(false);
  const [cancellingInvoice, setCancellingInvoice] = useState(false);
  const [approvingPegadas, setApprovingPegadas] = useState(false);
  const [cancellingPegadas, setCancellingPegadas] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [autoCorrectNotice, setAutoCorrectNotice] = useState("");

  // Edit Scanned Record States (INTAKE mode)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editDestinationStock, setEditDestinationStock] = useState<"Stock 1" | "Stock 2" | "Stock 3">("Stock 1");

  // Destination Stock Selection for New Truck Intake: "Stock 1" (Raw / Mallas Not Touched), "Stock 2" (Production / WIP), or "Stock 3" (Steering Wheels)
  const [destinationStock, setDestinationStock] = useState<"Stock 1" | "Stock 2" | "Stock 3">("Stock 1");

  // Edit Scanned Record States (PEGADAS mode)
  const [isPegadasEditMode, setIsPegadasEditMode] = useState(false);
  const [editingPegadasItemId, setEditingPegadasItemId] = useState<string | null>(null);
  const [editPegadasQty, setEditPegadasQty] = useState("");
  const [editPegadasRef, setEditPegadasRef] = useState("");

  // Input Refs for hands-free barcode wedge flow
  const invoiceRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  // Authoritative Low Stock references calculation (< 100 PCS across Stock 1 + Stock 2)
  const lowStockReferences = useMemo(() => {
    return references.filter((r) => {
      const s1PlusS2 = (r.stock1 || 0) + (r.stock2 || 0);
      return s1PlusS2 < 100;
    });
  }, [references]);
  const lowStockCount = lowStockReferences.length;

  // Sync Invoice to localStorage (or clear if empty)
  useEffect(() => {
    if (invoiceNumber.trim()) {
      localStorage.setItem("op_invoice", invoiceNumber.trim().toUpperCase());
    } else {
      localStorage.removeItem("op_invoice");
    }
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
      if (opMode === "INTAKE" && !invoiceNumber.trim()) {
        invoiceRef.current?.focus();
      } else {
        referenceRef.current?.focus();
      }
    }, 150);
    return () => clearTimeout(focusTimer);
  }, [opMode]);

  // SMART REFERENCE MATCHING LOGIC
  // Solves scanner hardware issues where scanners prepend extra characters (e.g. "+123456", "%REF", etc.)
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

  // Active Pending Invoice Session from props (for INTAKE mode)
  const remotePendingInvoice = useMemo(() => {
    const cleanInv = invoiceNumber.trim().toUpperCase();
    if (!cleanInv || !invoices) return null;
    return invoices.find(inv => inv.invoiceNumber.toUpperCase() === cleanInv && inv.status === "pending") || null;
  }, [invoices, invoiceNumber]);

  // Merge remote and optimistic local state
  const activePendingInvoice = useMemo(() => {
    if (localPendingInvoice && localPendingInvoice.invoiceNumber.toUpperCase() === invoiceNumber.trim().toUpperCase() && localPendingInvoice.status === "pending") {
      if (remotePendingInvoice && remotePendingInvoice.items.length >= localPendingInvoice.items.length) {
        return remotePendingInvoice;
      }
      return localPendingInvoice;
    }
    return remotePendingInvoice;
  }, [localPendingInvoice, remotePendingInvoice, invoiceNumber]);

  // Active Invoice Totals grouped by reference
  const activeInvoiceRefBreakdown = useMemo(() => {
    if (!activePendingInvoice || !activePendingInvoice.items) return [];
    const map = new Map<string, { reference: string; quantity: number; boxes: number; s1Qty: number; s2Qty: number; s3Qty: number }>();
    activePendingInvoice.items.forEach(item => {
      const ref = item.reference.toUpperCase();
      const cur = map.get(ref) || { reference: item.reference, quantity: 0, boxes: 0, s1Qty: 0, s2Qty: 0, s3Qty: 0 };
      cur.quantity += item.quantity;
      cur.boxes += 1;
      if (item.destinationStock === "Stock 3") {
        cur.s3Qty += item.quantity;
      } else if (item.destinationStock === "Stock 2") {
        cur.s2Qty += item.quantity;
      } else {
        cur.s1Qty += item.quantity;
      }
      map.set(ref, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [activePendingInvoice]);

  // Sync localPendingInvoice when remote invoice arrives or changes
  useEffect(() => {
    if (remotePendingInvoice) {
      setLocalPendingInvoice(remotePendingInvoice);
    }
  }, [remotePendingInvoice]);

  // Total Pegadas PCS
  const totalPegadasQty = useMemo(() => {
    return pegadasBatch.reduce((sum, item) => sum + item.quantity, 0);
  }, [pegadasBatch]);

  // Handle Enter key on Invoice Input -> jump to Reference
  const handleInvoiceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (invoiceNumber.trim() || opMode === "INCOMPLETA") {
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
        quantityRef.current?.focus();
      } else if (raw.length > 1) {
        const stripped = raw.slice(1).toUpperCase();
        const resStripped = resolveReference(stripped);
        if (resStripped) {
          setReferenceCode(resStripped.match.code);
          setAutoCorrectNotice(`Scanner prefix '${raw[0]}' auto-removed ➔ "${resStripped.match.code}"`);
          setErrorMsg("");
          playScanBeep();
          quantityRef.current?.focus();
        } else {
          setReferenceCode(stripped);
          setErrorMsg(`Reference "${stripped}" (or "${raw}") not found in master catalog.`);
          playErrorBeep();
        }
      } else {
        setErrorMsg(`Reference "${raw}" not found in master catalog.`);
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

    // 2. Extra 1st character removal auto-correction
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

    const res = resolveReference(val);
    if (res && res.corrected) {
      setAutoCorrectNotice(`Smart match detected: "${val}" ➔ "${res.match.code}"`);
    } else {
      setAutoCorrectNotice("");
    }
  };

  // Handle Selection directly from CustomReferenceSelect dropdown
  const handleSelectReference = (selectedCode: string) => {
    setErrorMsg("");
    setAutoCorrectNotice("");
    setReferenceCode(selectedCode);

    if (selectedCode) {
      playScanBeep();
      setTimeout(() => {
        quantityRef.current?.focus();
      }, 60);
    }
  };

  // Handle Quantity Input
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuantity(e.target.value);
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
      submitTransaction();
    }
  };

  // Form Submit Execution
  const submitTransaction = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setAutoCorrectNotice("");

    let cleanInvoice = invoiceNumber.trim().toUpperCase();
    if (opMode === "INTAKE" && !cleanInvoice) {
      setErrorMsg("Please type or scan the Invoice / Delivery Note Number first.");
      invoiceRef.current?.focus();
      playErrorBeep();
      return;
    }

    if (opMode === "INTAKE" && !destinationStock) {
      setErrorMsg("Please select the destination stock (Stock 1 or Stock 3).");
      playErrorBeep();
      return;
    }

    const rawRef = referenceCode.trim();
    const expectedQtyVal = parseInt(quantity);
    const actualQtyVal = (opMode === "TRANSFER" || opMode === "RETURN" || opMode === "INCOMPLETA")
      ? expectedQtyVal
      : (actualQuantity.trim() !== "" ? parseInt(actualQuantity) : expectedQtyVal);

    if (!rawRef) {
      setErrorMsg("Please scan or enter the Reference Number.");
      referenceRef.current?.focus();
      playErrorBeep();
      return;
    }

    // Smart resolve reference
    const res = resolveReference(rawRef);
    if (!res) {
      setErrorMsg(`Reference "${rawRef}" does not exist in master catalog.`);
      referenceRef.current?.focus();
      playErrorBeep();
      return;
    }

    const refData = res.match;
    const finalCode = refData.code;

    if (isNaN(expectedQtyVal) || expectedQtyVal <= 0) {
      setErrorMsg("Please enter a valid PCS Quantity.");
      quantityRef.current?.focus();
      playErrorBeep();
      return;
    }

    setSubmitting(true);
    try {
      const timestamp = new Date().toISOString();

      if (opMode === "TRANSFER") {
        // PEGADAS MODE: Add scanned item to local Pegadas transfer batch queue (No invoice required!)
        const newPegadasItem: ScannedTransferItem = {
          id: `peg-${finalCode}-${Date.now().toString().slice(-6)}`,
          reference: finalCode,
          quantity: expectedQtyVal,
          scannedAt: timestamp,
          materialType: refData.materialType || "Mesh",
          description: refData.description || ""
        };

        const updatedBatch = [newPegadasItem, ...pegadasBatch];
        setPegadasBatch(updatedBatch);
        playScanBeep();
        setSuccessMsg(`SCANNED: Added ${finalCode} (${expectedQtyVal} PCS) to Pegadas transfer batch. Total: ${updatedBatch.length} item(s) (${updatedBatch.reduce((sum, item) => sum + item.quantity, 0)} PCS).`);
      
      } else if (opMode === "RETURN") {
        // RETURN MODE: Return from Stock 2 to Stock 1 via Protection Layer
        const returnQty = actualQtyVal;
        await executeProtectedStockOperation({
          operationType: "RETURN_S2_S1",
          referenceCode: refData.code,
          operatorName: currentUser.fullName,
          reason: `Return from Stock 2 to Stock 1 (Not Touched). Qty: ${returnQty}`,
          execute: async (currentData, transaction) => {
            const currentStock1 = currentData.stock1 || 0;
            const currentStock2 = currentData.stock2 || 0;
            const currentStock3 = currentData.stock3 || 0;

            if (returnQty > currentStock2) {
              throw new Error(`Insufficient stock in Stock 2. Available: ${currentStock2} pcs, requested return: ${returnQty} pcs.`);
            }

            const newStock1 = currentStock1 + returnQty;
            const newStock2 = currentStock2 - returnQty;
            const newTotal = newStock1 + newStock2 + currentStock3;

            const transId = `trans-ret-${Date.now()}`;
            const now = new Date().toISOString();
            const transDocRef = doc(db, "transactions", transId);
            transaction.set(transDocRef, {
              id: transId,
              reference: refData.code,
              movementType: "RETURN S2->S1",
              stock: "Stock 2 -> Stock 1",
              quantity: returnQty,
              expectedQty: returnQty,
              actualQty: returnQty,
              difference: 0,
              operatorName: currentUser.fullName,
              timestamp: now,
              notes: `Return from Stock 2 to Stock 1 (Not Touched). Qty: ${returnQty}`
            });

            return {
              stockChanges: [{
                referenceCode: refData.code,
                newStock1,
                newStock2,
                newStock3: currentStock3,
                newTotal
              }]
            };
          }
        });

        playSuccessBeep();
        setSuccessMsg(`SUCCESS: Returned ${returnQty} pcs of ${refData.code} from Stock 2 back to Stock 1 (Not Touched).`);
      } else if (opMode === "INCOMPLETA") {
        // INCOMPLETA MODE: Remove directly from Stock 1 via Protection Layer
        const incompletQty = expectedQtyVal;
        const optInvoice = cleanInvoice || "";

        await executeProtectedStockOperation({
          operationType: "INCOMPLETA_STOCK1_OUT",
          referenceCode: refData.code,
          operatorName: currentUser.fullName,
          reason: `Incompleta: removed from Stock 1. Qty: ${incompletQty}${optInvoice ? ` (Invoice: ${optInvoice})` : ""}`,
          execute: async (currentData, transaction) => {
            const currentStock1 = currentData.stock1 || 0;
            const currentStock2 = currentData.stock2 || 0;
            const currentStock3 = currentData.stock3 || 0;

            if (incompletQty > currentStock1) {
              throw new Error(`Insufficient stock in Stock 1. Available: ${currentStock1} pcs, requested to remove: ${incompletQty} pcs.`);
            }

            const newStock1 = currentStock1 - incompletQty;
            const newTotal = newStock1 + currentStock2 + currentStock3;

            const transId = `trans-inc-${Date.now()}`;
            const now = new Date().toISOString();
            const transDocRef = doc(db, "transactions", transId);
            
            const transData: any = {
              id: transId,
              reference: refData.code,
              movementType: "INCOMPLETA",
              stock: "Stock 1",
              quantity: incompletQty,
              expectedQty: incompletQty,
              actualQty: incompletQty,
              difference: -incompletQty,
              operatorName: currentUser.fullName,
              timestamp: now,
              notes: `Incompleta: removed ${incompletQty} pcs from Stock 1${optInvoice ? ` (Invoice: ${optInvoice})` : ""}`
            };

            if (optInvoice) {
              transData.invoiceNumber = optInvoice;
            }

            transaction.set(transDocRef, transData);

            return {
              stockChanges: [{
                referenceCode: refData.code,
                newStock1,
                newStock2: currentStock2,
                newStock3: currentStock3,
                newTotal
              }]
            };
          }
        });

        playSuccessBeep();
        setSuccessMsg(`SUCCESS [INCOMPLETA]: Removed ${incompletQty} pcs of ${refData.code} from Stock 1${optInvoice ? ` (Invoice: ${optInvoice})` : ""}.`);
      } else {
        // INTAKE MODE: INVOICE-BASED RECEIVING
        const diff = actualQtyVal - expectedQtyVal;
        const safeInvoiceSlug = cleanInvoice.replace(/[\/\\]/g, "-").replace(/\s+/g, "_");
        const boxBarcode = `BOX-${finalCode}-${safeInvoiceSlug}-${Date.now().toString().slice(-4)}`;
        const chosenDest: "Stock 1" | "Stock 2" | "Stock 3" = destinationStock;

        const newBoxItem: ScannedInvoiceBox = {
          id: `box-${finalCode}-${safeInvoiceSlug}-${Date.now().toString().slice(-6)}`,
          boxBarcode,
          reference: finalCode,
          expectedQty: expectedQtyVal,
          quantity: actualQtyVal,
          scannedAt: timestamp,
          materialType: refData.materialType || (chosenDest === "Stock 3" ? "Steering Wheel" : chosenDest === "Stock 2" ? "Precosido / WIP" : "Mesh"),
          difference: diff,
          destinationStock: chosenDest
        };

        const existingItems = activePendingInvoice ? activePendingInvoice.items : [];
        const updatedItems = [newBoxItem, ...existingItems];
        const totalBoxes = updatedItems.length;
        const totalQuantity = updatedItems.reduce((sum, item) => sum + item.quantity, 0);

        const updatedInvoice: ReceivingInvoice = {
          id: activePendingInvoice ? activePendingInvoice.id : `inv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          invoiceNumber: cleanInvoice,
          operator: currentUser.fullName,
          operatorId: currentUser.id,
          createdAt: activePendingInvoice ? activePendingInvoice.createdAt : timestamp,
          status: "pending",
          items: updatedItems,
          totalBoxes,
          totalQuantity
        };

        setLocalPendingInvoice(updatedInvoice);

        if (onSavePendingInvoice) {
          await onSavePendingInvoice(updatedInvoice);
        }

        playScanBeep();
        const diffText = diff !== 0 ? ` (Diff: ${diff > 0 ? '+' : ''}${diff} PCS)` : "";
        const destLabel = chosenDest === "Stock 3" 
          ? "STOCK 3 [Steering Wheels]" 
          : chosenDest === "Stock 2"
          ? "STOCK 2 [Production WIP / Precosido]"
          : "STOCK 1 [Mallas Not Touched]";
        setSuccessMsg(`SCANNED: Added ${finalCode} (${actualQtyVal} PCS ➔ ${destLabel}${diffText}) to Invoice ${cleanInvoice}. Total: ${totalBoxes} boxes.`);
      }
      
      // Clear scanned item fields
      setReferenceCode("");
      setQuantity("");
      setActualQuantity("");
      setAutoCorrectNotice("");
      
      // Automatic Focus back to Reference input for continuous hands-free scanning
      setTimeout(() => {
        referenceRef.current?.focus();
      }, 50);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Error recording scan: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // INVOICE ACTIONS (INTAKE MODE)
  // ----------------------------------------------------
  const handleRemoveScannedItem = async (itemId: string) => {
    if (!activePendingInvoice) return;
    try {
      const updatedItems = activePendingInvoice.items.filter(item => item.id !== itemId);
      const totalBoxes = updatedItems.length;
      const totalQuantity = updatedItems.reduce((sum, item) => sum + item.quantity, 0);

      const updatedInvoice: ReceivingInvoice = {
        ...activePendingInvoice,
        items: updatedItems,
        totalBoxes,
        totalQuantity
      };

      setLocalPendingInvoice(updatedInvoice);

      if (onSavePendingInvoice) {
        await onSavePendingInvoice(updatedInvoice);
      }
      playScanBeep();
      setSuccessMsg("Scanned box removed from current invoice.");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to remove item: ${err.message || err}`);
      playErrorBeep();
    }
  };

  const handleStartEditItem = (item: ScannedInvoiceBox) => {
    setEditingItemId(item.id);
    setEditQty(item.quantity.toString());
    setEditRef(item.reference);
    setEditDestinationStock(item.destinationStock === "Stock 3" ? "Stock 3" : item.destinationStock === "Stock 2" ? "Stock 2" : "Stock 1");
  };

  const handleSaveItemEdit = async (itemId: string) => {
    if (!activePendingInvoice) return;
    const newQty = parseInt(editQty);
    if (isNaN(newQty) || newQty <= 0) {
      setErrorMsg("Please enter a valid positive quantity.");
      playErrorBeep();
      return;
    }

    const cleanRef = editRef.trim().toUpperCase();
    const res = resolveReference(cleanRef);
    if (!res) {
      setErrorMsg(`Reference "${cleanRef}" not found in master catalog.`);
      playErrorBeep();
      return;
    }

    try {
      const updatedItems = activePendingInvoice.items.map(item => {
        if (item.id === itemId) {
          const diff = newQty - item.expectedQty;
          return {
            ...item,
            reference: res.match.code,
            quantity: newQty,
            difference: diff,
            materialType: res.match.materialType || item.materialType,
            destinationStock: editDestinationStock
          };
        }
        return item;
      });

      const totalBoxes = updatedItems.length;
      const totalQuantity = updatedItems.reduce((sum, item) => sum + item.quantity, 0);

      const updatedInvoice: ReceivingInvoice = {
        ...activePendingInvoice,
        items: updatedItems,
        totalBoxes,
        totalQuantity
      };

      setLocalPendingInvoice(updatedInvoice);

      if (onSavePendingInvoice) {
        await onSavePendingInvoice(updatedInvoice);
      }
      setEditingItemId(null);
      playScanBeep();
      const destLabel = editDestinationStock === "Stock 3" 
        ? "Stock 3 (Steering Wheels)" 
        : editDestinationStock === "Stock 2"
        ? "Stock 2 (Production WIP)"
        : "Stock 1 (Mallas Not Touched)";
      setSuccessMsg(`Updated scanned box: ${res.match.code} (${newQty} PCS ➔ ${destLabel}).`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to update item: ${err.message || err}`);
      playErrorBeep();
    }
  };

  const handleApproveCurrentInvoice = async () => {
    if (!activePendingInvoice || activePendingInvoice.items.length === 0) {
      setErrorMsg("Invoice contains no scanned records to validate.");
      playErrorBeep();
      return;
    }

    setApprovingInvoice(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (onApproveInvoice) {
        await onApproveInvoice(activePendingInvoice.id);
      }
      playSuccessBeep();

      const s1Items = activePendingInvoice.items.filter(it => it.destinationStock === "Stock 1" || !it.destinationStock);
      const s2Items = activePendingInvoice.items.filter(it => it.destinationStock === "Stock 2");
      const s3Items = activePendingInvoice.items.filter(it => it.destinationStock === "Stock 3");
      const s1Qty = s1Items.reduce((acc, it) => acc + it.quantity, 0);
      const s2Qty = s2Items.reduce((acc, it) => acc + it.quantity, 0);
      const s3Qty = s3Items.reduce((acc, it) => acc + it.quantity, 0);

      await Swal.fire({
        icon: "success",
        title: "INVOICE VALIDATED & COMMITTED",
        html: `
          <div style="font-family: monospace; font-size: 13px; text-align: left; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.6;">
            <p><strong>Invoice Number:</strong> <span style="color: #2563eb;">${activePendingInvoice.invoiceNumber}</span></p>
            <p><strong>Total Boxes:</strong> ${activePendingInvoice.totalBoxes} boxes</p>
            ${s1Qty > 0 ? `<p><strong>Stock 1 (Mallas Not Touched):</strong> <strong style="color: #059669;">+${s1Qty.toLocaleString()} PCS</strong></p>` : ''}
            ${s2Qty > 0 ? `<p><strong>Stock 2 (Production WIP):</strong> <strong style="color: #4f46e5;">+${s2Qty.toLocaleString()} PCS</strong></p>` : ''}
            ${s3Qty > 0 ? `<p><strong>Stock 3 (Steering Wheels):</strong> <strong style="color: #d97706;">+${s3Qty.toLocaleString()} PCS</strong></p>` : ''}
            <p><strong>Total Added:</strong> <strong style="color: #0f172a;">${activePendingInvoice.totalQuantity.toLocaleString()} PCS</strong></p>
            <p><strong>Status:</strong> <span style="color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;">APPROVED &bull; COMMITTED</span></p>
          </div>
          <p style="margin-top: 12px; font-size: 12px; color: #64748b;">All scanned records have been committed to their respective stocks in real-time.</p>
        `,
        confirmButtonColor: "#059669",
        confirmButtonText: "Done &bull; Next Invoice"
      });

      setInvoiceNumber("");
      localStorage.removeItem("op_invoice");
      setLocalPendingInvoice(null);
      setReferenceCode("");
      setQuantity("");
      setActualQuantity("");
      setIsEditMode(false);
      setEditingItemId(null);
      const breakdownParts: string[] = [];
      if (s1Qty > 0) breakdownParts.push(`${s1Qty} PCS ➔ Stock 1`);
      if (s2Qty > 0) breakdownParts.push(`${s2Qty} PCS ➔ Stock 2`);
      if (s3Qty > 0) breakdownParts.push(`${s3Qty} PCS ➔ Stock 3`);
      const breakdownStr = breakdownParts.length > 0 ? breakdownParts.join(", ") : `${activePendingInvoice.totalQuantity} PCS`;
      setSuccessMsg(`Invoice ${activePendingInvoice.invoiceNumber} validated (${breakdownStr}). Ready for next invoice.`);
      setTimeout(() => invoiceRef.current?.focus(), 50);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Validation failed: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setApprovingInvoice(false);
    }
  };

  const handleCancelCurrentInvoice = async () => {
    if (!activePendingInvoice) return;

    const result = await Swal.fire({
      title: "CANCEL INVOICE?",
      html: `
        <p style="font-size: 13px; color: #475569;">Are you sure you want to cancel Invoice <strong>${activePendingInvoice.invoiceNumber}</strong>?</p>
        <p style="font-size: 12px; color: #dc2626; margin-top: 8px; font-weight: 600;">ZERO stock impact: No quantities will be added to Stock 1.</p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Cancel Invoice",
      cancelButtonText: "Keep Scanning"
    });

    if (!result.isConfirmed) return;

    setCancellingInvoice(true);
    try {
      if (onCancelInvoice) {
        await onCancelInvoice(activePendingInvoice.id);
      }
      playScanBeep();
      setLocalPendingInvoice(null);
      setInvoiceNumber("");
      localStorage.removeItem("op_invoice");
      setReferenceCode("");
      setQuantity("");
      setActualQuantity("");
      setIsEditMode(false);
      setEditingItemId(null);
      setSuccessMsg(`Invoice ${activePendingInvoice.invoiceNumber} cancelled. Zero stock was modified.`);
      setTimeout(() => invoiceRef.current?.focus(), 50);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Cancellation failed: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setCancellingInvoice(false);
    }
  };

  // ----------------------------------------------------
  // PEGADAS BATCH ACTIONS (TRANSFER S1 -> S2 WITHOUT INVOICE)
  // ----------------------------------------------------
  const handleRemovePegadasItem = (itemId: string) => {
    const updated = pegadasBatch.filter(item => item.id !== itemId);
    setPegadasBatch(updated);
    playScanBeep();
    setSuccessMsg("Scanned record removed from Pegadas batch.");
  };

  const handleStartEditPegadasItem = (item: ScannedTransferItem) => {
    setEditingPegadasItemId(item.id);
    setEditPegadasRef(item.reference);
    setEditPegadasQty(item.quantity.toString());
  };

  const handleSavePegadasItemEdit = (itemId: string) => {
    const newQty = parseInt(editPegadasQty);
    if (isNaN(newQty) || newQty <= 0) {
      setErrorMsg("Please enter a valid positive quantity.");
      playErrorBeep();
      return;
    }

    const cleanRef = editPegadasRef.trim().toUpperCase();
    const res = resolveReference(cleanRef);
    if (!res) {
      setErrorMsg(`Reference "${cleanRef}" not found in master catalog.`);
      playErrorBeep();
      return;
    }

    const updated = pegadasBatch.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          reference: res.match.code,
          quantity: newQty,
          materialType: res.match.materialType || item.materialType,
          description: res.match.description || item.description
        };
      }
      return item;
    });

    setPegadasBatch(updated);
    setEditingPegadasItemId(null);
    playScanBeep();
    setSuccessMsg(`Updated Pegadas record: ${res.match.code} (${newQty} PCS).`);
  };

  // Action: Cancel Pegadas Batch
  const handleCancelPegadasBatch = async () => {
    if (pegadasBatch.length === 0) return;

    const result = await Swal.fire({
      title: "CANCEL PEGADAS BATCH?",
      html: `
        <p style="font-size: 13px; color: #475569;">Are you sure you want to cancel the current Pegadas batch (${pegadasBatch.length} items)?</p>
        <p style="font-size: 12px; color: #dc2626; margin-top: 8px; font-weight: 600;">ZERO stock impact: No quantities will be moved.</p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Cancel Batch",
      cancelButtonText: "Keep Scanning"
    });

    if (!result.isConfirmed) return;

    setCancellingPegadas(true);
    try {
      setPegadasBatch([]);
      localStorage.removeItem("op_pegadas_batch");
      setReferenceCode("");
      setQuantity("");
      setIsPegadasEditMode(false);
      setEditingPegadasItemId(null);
      playScanBeep();
      setSuccessMsg("Pegadas batch cancelled. Zero stock was modified.");
      setTimeout(() => referenceRef.current?.focus(), 50);
    } finally {
      setCancellingPegadas(false);
    }
  };

  // Action: Atomically Commit & Validate Pegadas Batch (Stock 1 -> Stock 2)
  const handleApprovePegadasBatch = async () => {
    if (pegadasBatch.length === 0) {
      setErrorMsg("Pegadas batch contains no scanned records to validate.");
      playErrorBeep();
      return;
    }

    setApprovingPegadas(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // Execute transfers through backend protection layer
      const transferEntries = pegadasBatch.map(item => ({
        reference: item.reference,
        quantity: item.quantity,
        notes: `Mallas Pegadas (Sent to Gluing/Processing - Stock 1 -> Stock 2)`
      }));

      await executeProtectedTransfer(transferEntries, currentUser.fullName);
      playSuccessBeep();

      const totalPcs = pegadasBatch.reduce((sum, item) => sum + item.quantity, 0);
      const totalRecords = pegadasBatch.length;

      await Swal.fire({
        icon: "success",
        title: "PEGADAS TRANSFER VALIDATED & COMMITTED",
        html: `
          <div style="font-family: monospace; font-size: 13px; text-align: left; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.6;">
            <p><strong>Operation:</strong> <span style="color: #2563eb; font-weight: bold;">Send Mesh to Pegadas (Stock 1 ➔ Stock 2)</span></p>
            <p><strong>Total Scanned Records:</strong> ${totalRecords} items</p>
            <p><strong>Total Quantity Moved:</strong> <strong style="color: #059669;">${totalPcs} PCS</strong></p>
            <p><strong>Status:</strong> <span style="color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;">COMMITTED &bull; TRANSFERRED TO STOCK 2</span></p>
          </div>
          <p style="margin-top: 12px; font-size: 12px; color: #64748b;">Inventory stocks have been updated in real-time across the system.</p>
        `,
        confirmButtonColor: "#059669",
        confirmButtonText: "Done &bull; Continue Scanning"
      });

      setPegadasBatch([]);
      localStorage.removeItem("op_pegadas_batch");
      setReferenceCode("");
      setQuantity("");
      setActualQuantity("");
      setIsPegadasEditMode(false);
      setEditingPegadasItemId(null);
      setSuccessMsg(`Pegadas Transfer Validated: ${totalPcs} PCS successfully moved from Stock 1 to Stock 2.`);
      setTimeout(() => referenceRef.current?.focus(), 50);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Transfer validation failed: ${err.message || err}`);
      playErrorBeep();
    } finally {
      setApprovingPegadas(false);
    }
  };

  // Form Submit Wrapper
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitTransaction();
  };

  // Quick Action to Clear scan inputs (Start scan from zero)
  const handleClearInputs = () => {
    setReferenceCode("");
    setQuantity("");
    setActualQuantity("");
    setErrorMsg("");
    setSuccessMsg("");
    setAutoCorrectNotice("");
    setIsEditMode(false);
    setEditingItemId(null);
    setIsPegadasEditMode(false);
    setEditingPegadasItemId(null);
    playScanBeep();
    referenceRef.current?.focus();
  };

  // Reset Everything
  const handleResetAll = () => {
    setReferenceCode("");
    setQuantity("");
    setActualQuantity("");
    if (opMode === "INTAKE" || opMode === "INCOMPLETA") {
      setInvoiceNumber("");
      localStorage.removeItem("op_invoice");
      setLocalPendingInvoice(null);
    }
    setErrorMsg("");
    setSuccessMsg("");
    setAutoCorrectNotice("");
    setIsEditMode(false);
    setEditingItemId(null);
    setIsPegadasEditMode(false);
    setEditingPegadasItemId(null);
    playScanBeep();
    referenceRef.current?.focus();
  };

  // ESC key shortcut to quickly reset scan fields
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClearInputs();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6" id="operator-workspace-handsfree-station">
      
      {/* Modern Operator Station Banner */}
      <div className="glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-xs">
            OP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">
                OPERATOR TERMINAL
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ACTIVE
              </span>
            </div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight mt-0.5">
              {currentUser.fullName}
            </h2>
          </div>
        </div>
        
        <div className="flex items-center gap-2 self-start sm:self-auto font-mono text-xs">
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={onOpenLowStockModal}
              id="operator-banner-low-stock-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer shadow-2xs animate-pulse active:scale-95"
              title="View low stock references"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>LOW STOCK: {lowStockCount}</span>
            </button>
          )}
          <span className="px-3 py-1 bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200/80">
            @{currentUser.username}
          </span>
        </div>
      </div>

      {/* Main Interactive Scan Panel */}
      <div className="glass-panel p-6 sm:p-8 space-y-6" id="operator-scanning-panel">
        
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                {opMode === "INTAKE" 
                  ? "New Truck Intake (Stock 1)" 
                  : opMode === "TRANSFER" 
                  ? "Transfer to Pegadas (Stock 1 → Stock 2)" 
                  : opMode === "RETURN"
                  ? "Return to Stock 1"
                  : "Incompleta (Remove from Stock 1)"}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearInputs}
            title="Reset fields (ESC)"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200/80"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset</span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-200/80 px-1.5 py-0.2 rounded">ESC</span>
          </button>
        </div>

        {/* Operation Mode Selector Tabs */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 font-mono">
          <button
            type="button"
            onClick={() => {
              setOpMode("INTAKE");
              setErrorMsg("");
              setSuccessMsg("");
              setAutoCorrectNotice("");
              setTimeout(() => referenceRef.current?.focus(), 50);
            }}
            className={`py-2 px-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
              opMode === "INTAKE"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
            id="op-tab-new-truck"
          >
            <span>🚛</span>
            <span className="truncate">New Truck</span>
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
            className={`py-2 px-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
              opMode === "TRANSFER"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
            id="op-tab-pegadas"
          >
            <span>🔵</span>
            <span className="truncate">Pegadas</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpMode("RETURN");
              setErrorMsg("");
              setSuccessMsg("");
              setAutoCorrectNotice("");
              setTimeout(() => referenceRef.current?.focus(), 50);
            }}
            className={`py-2 px-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
              opMode === "RETURN"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
            id="op-tab-return"
          >
            <span>↩️</span>
            <span className="truncate">Return</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpMode("INCOMPLETA");
              setErrorMsg("");
              setSuccessMsg("");
              setAutoCorrectNotice("");
              setTimeout(() => referenceRef.current?.focus(), 50);
            }}
            className={`py-2 px-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
              opMode === "INCOMPLETA"
                ? "bg-rose-900 text-white shadow-xs"
                : "text-rose-700 hover:text-rose-900 hover:bg-white/60"
            }`}
            id="op-tab-incompleta"
          >
            <span>⚠️</span>
            <span className="truncate">INCOMPLETA</span>
          </button>
        </div>

        {/* Quick shortcut to PEGADAS section */}
        {opMode === "TRANSFER" && onNavigateToTab && (
          <div className="flex items-center justify-between p-2.5 bg-teal-50 border border-teal-200/80 rounded-xl text-xs">
            <span className="text-teal-900 font-medium">Looking for your validated Stock 1 → Stock 2 history?</span>
            <button
              type="button"
              onClick={() => onNavigateToTab("pegadas")}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 underline flex items-center gap-1 cursor-pointer"
            >
              <span>View PEGADAS Records</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Notifications */}
        {successMsg && (
          <div className="p-4 bg-emerald-50/90 border border-emerald-200/80 text-emerald-900 text-xs rounded-xl flex items-start gap-3 shadow-2xs">
            <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <div className="font-medium">{successMsg}</div>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50/90 border border-rose-200/80 text-rose-900 text-xs rounded-xl flex items-start gap-3 shadow-2xs">
            <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />
            <div className="font-medium">{errorMsg}</div>
          </div>
        )}

        {autoCorrectNotice && (
          <div className="p-3 bg-blue-50 border border-blue-200/80 text-blue-900 text-xs rounded-xl flex items-center gap-2.5 font-mono">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-semibold">{autoCorrectNotice}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-5">
          
          {/* INVOICE NUMBER: Required for INTAKE, Optional for INCOMPLETA */}
          {(opMode === "INTAKE" || opMode === "INCOMPLETA") && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Invoice Number</span>
                  {opMode === "INCOMPLETA" ? (
                    <span className="text-[10px] font-normal text-slate-500 lowercase font-sans">(optional)</span>
                  ) : (
                    <span className="text-[10px] font-bold text-rose-500">*</span>
                  )}
                </label>
                {opMode === "INTAKE" && activePendingInvoice && (
                  <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    ACTIVE ({activePendingInvoice.totalBoxes} boxes / {activePendingInvoice.totalQuantity} PCS)
                  </span>
                )}
              </div>
              <div className="relative">
                <FileText className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={invoiceRef}
                  type="text"
                  required={opMode === "INTAKE"}
                  placeholder={opMode === "INCOMPLETA" ? "Invoice number (optional)..." : "Invoice number..."}
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  onKeyDown={handleInvoiceKeyDown}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-xs font-mono uppercase focus:outline-none transition-all text-slate-900 font-bold"
                  id="op-invoice-field"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {/* 2. CHOOSE DESTINATION STOCK (INTAKE MODE ONLY) */}
          {opMode === "INTAKE" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                Destination Stock
              </label>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDestinationStock("Stock 1");
                    setErrorMsg("");
                  }}
                  className={`py-2.5 px-3 rounded-xl border text-center font-mono font-bold text-xs tracking-wider transition-all cursor-pointer ${
                    destinationStock === "Stock 1"
                      ? "bg-blue-50 text-blue-600 border-blue-300 ring-2 ring-blue-500/20 shadow-xs"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                  id="op-destination-stock-1"
                >
                  STOCK 1
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDestinationStock("Stock 2");
                    setErrorMsg("");
                  }}
                  className={`py-2.5 px-3 rounded-xl border text-center font-mono font-bold text-xs tracking-wider transition-all cursor-pointer ${
                    destinationStock === "Stock 2"
                      ? "bg-indigo-50 text-indigo-600 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                  id="op-destination-stock-2"
                >
                  STOCK 2
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDestinationStock("Stock 3");
                    setErrorMsg("");
                  }}
                  className={`py-2.5 px-3 rounded-xl border text-center font-mono font-bold text-xs tracking-wider transition-all cursor-pointer ${
                    destinationStock === "Stock 3"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                  id="op-destination-stock-3"
                >
                  STOCK 3
                </button>
              </div>
            </div>
          )}

          {/* REFERENCE SELECTION & BARCODE SCANNING */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Barcode className="w-3.5 h-3.5 text-blue-600" />
                <span>Reference</span>
              </label>
            </div>

            {/* Searchable Reference Select Dropdown */}
            <div className="space-y-1">
              <CustomReferenceSelect
                references={references}
                value={referenceCode}
                onChange={handleSelectReference}
                placeholder="Search reference..."
                showStockBadges={true}
                size="md"
              />
            </div>

            {/* Direct Barcode Scanner Input */}
            <div className="relative pt-1">
              <Barcode className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 mt-0.5" />
              <input
                ref={referenceRef}
                type="text"
                placeholder="Scan barcode or enter code..."
                value={referenceCode}
                onChange={handleReferenceChange}
                onKeyDown={handleReferenceKeyDown}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-xs font-mono font-bold uppercase tracking-wider focus:outline-none transition-all text-slate-900 shadow-2xs"
                id="op-reference-field"
                autoComplete="off"
              />
            </div>
            
            {/* Live Master Data visual confirmation feedback */}
            {matchedReference ? (
              <div className="p-3 bg-emerald-50/90 border border-emerald-200/80 rounded-xl text-xs font-mono text-emerald-900 flex justify-between items-center shadow-2xs">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-bold">{matchedReference.code}</span>
                  <span className="text-slate-500 font-sans truncate max-w-[180px]">({matchedReference.description})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {((matchedReference.stock1 || 0) + (matchedReference.stock2 || 0)) < 100 && (
                    <span className="px-2 py-0.5 bg-rose-100 border border-rose-300 text-rose-700 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      LOW ({(matchedReference.stock1 || 0) + (matchedReference.stock2 || 0)} PCS)
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-slate-200/80 rounded-md text-[9px] font-bold uppercase tracking-wider text-slate-800">
                    S1: {matchedReference.stock1 || 0} pcs
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-200/60 rounded-md text-[9px] font-bold uppercase tracking-wider text-emerald-900">
                    {matchedReference.materialType}
                  </span>
                </div>
              </div>
            ) : referenceCode ? (
              <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs font-mono text-amber-900 flex items-center justify-between gap-2">
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
                      title="Remove prefix"
                    >
                      <Eraser className="w-3 h-3" />
                      <span>Remove ({referenceCode.slice(0, 1)})</span>
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* QUANTITY FIELDS */}
          {opMode === "TRANSFER" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Quantity (PCS)</span>
                <span className="text-[10px] text-amber-600 font-semibold font-mono">Stock 1 ➔ Stock 2</span>
              </label>
              <input
                ref={quantityRef}
                type="number"
                required
                min="1"
                placeholder="Quantity..."
                value={quantity}
                onChange={handleQuantityChange}
                onKeyDown={handleQuantityKeyDown}
                className="w-full px-4 py-2.5 bg-amber-50/40 focus:bg-white border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all"
                id="op-quantity-field"
                autoComplete="off"
              />
            </div>
          ) : opMode === "RETURN" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Quantity (PCS)</span>
                <span className="text-[10px] text-amber-600 font-semibold font-mono">Stock 2 ➔ Stock 1</span>
              </label>
              <input
                ref={quantityRef}
                type="number"
                required
                min="1"
                placeholder="Quantity..."
                value={quantity}
                onChange={handleQuantityChange}
                onKeyDown={handleQuantityKeyDown}
                className="w-full px-4 py-2.5 bg-amber-50/40 focus:bg-white border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all"
                id="op-quantity-field"
                autoComplete="off"
              />
            </div>
          ) : opMode === "INCOMPLETA" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Quantity (PCS)</span>
                <span className="text-[10px] text-rose-600 font-bold font-mono">Deduct from Stock 1</span>
              </label>
              <input
                ref={quantityRef}
                type="number"
                required
                min="1"
                placeholder="Quantity to remove..."
                value={quantity}
                onChange={handleQuantityChange}
                onKeyDown={handleQuantityKeyDown}
                className="w-full px-4 py-2.5 bg-rose-50/40 focus:bg-white border border-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all"
                id="op-quantity-field"
                autoComplete="off"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Quantity (PCS)
              </label>
              <input
                ref={quantityRef}
                type="number"
                required
                min="1"
                placeholder="Quantity..."
                value={quantity}
                onChange={handleQuantityChange}
                onKeyDown={handleQuantityKeyDown}
                className="w-full px-4 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all"
                id="op-quantity-field"
                autoComplete="off"
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-2 flex flex-wrap sm:flex-nowrap gap-3">
            <button
              type="button"
              onClick={handleClearInputs}
              title="Reset fields (ESC)"
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200/80"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              title="Clear all"
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200/80"
            >
              <Eraser className="w-4 h-4 text-slate-400 group-hover:text-rose-600" />
              <span>Clear</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 py-2.5 px-6 font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 text-white ${
                opMode === "TRANSFER"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : opMode === "RETURN"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : opMode === "INCOMPLETA"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
              id="op-submit-trigger"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  PROCESSING...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {opMode === "INTAKE" 
                    ? "ADD BOX" 
                    : opMode === "TRANSFER" 
                    ? "ADD TO BATCH" 
                    : opMode === "RETURN" 
                    ? "CONFIRM RETURN" 
                    : "CONFIRM"}
                </>
              )}
            </button>
          </div>
        </form>

        {/* ---------------------------------------------------- */}
        {/* SCANNED RECORDS SECTION FOR PEGADAS (TRANSFER S1 -> S2, NO INVOICE) */}
        {/* ---------------------------------------------------- */}
        {opMode === "TRANSFER" && (
          <div className="pt-6 border-t border-slate-200/80 space-y-4" id="operator-pegadas-records-section">
            
            {/* Header with Summary & Edit Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                  <BoxIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      SCANNED RECORDS:
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {pegadasBatch.length > 0 
                      ? `${pegadasBatch.length} Items • ${totalPegadasQty} PCS` 
                      : "0 Records"}
                  </p>
                </div>
              </div>

              {pegadasBatch.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsPegadasEditMode(!isPegadasEditMode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer border ${
                      isPegadasEditMode
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isPegadasEditMode ? "DONE" : "EDIT"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Scanned Records List / Table */}
            {pegadasBatch.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs font-mono max-h-72 overflow-y-auto bg-white rounded-xl border border-slate-200/80 p-2 shadow-2xs">
                {pegadasBatch.map((item, idx) => {
                  const isEditingThis = editingPegadasItemId === item.id;
                  const currentRefData = references.find(r => r.code === item.reference);

                  return (
                    <div key={item.id} className="py-2.5 px-3 hover:bg-slate-50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Record Reference & Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-md bg-slate-100 text-[10px] flex items-center justify-center text-slate-700 font-bold shrink-0">
                          #{idx + 1}
                        </span>

                        {isEditingThis ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editPegadasRef}
                              onChange={(e) => setEditPegadasRef(e.target.value.toUpperCase())}
                              placeholder="REF CODE"
                              className="px-2.5 py-1 bg-white border border-blue-400 rounded-md text-xs font-bold text-slate-900 uppercase w-32 focus:outline-none"
                            />
                            <input
                              type="number"
                              value={editPegadasQty}
                              onChange={(e) => setEditPegadasQty(e.target.value)}
                              placeholder="QTY"
                              min="1"
                              className="px-2.5 py-1 bg-white border border-blue-400 rounded-md text-xs font-bold text-slate-900 w-24 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSavePegadasItemEdit(item.id)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer"
                              title="Save record changes"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPegadasItemId(null)}
                              className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer"
                              title="Cancel editing"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs truncate">{item.reference}</span>
                              <span className="text-[10px] text-slate-500 font-sans truncate">
                                ({currentRefData?.description || item.description || item.materialType || "Mesh"})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>Scanned: {item.scannedAt ? formatSystemTime(item.scannedAt) : "Just now"}</span>
                              <span>&bull;</span>
                              <span className="text-slate-600 font-semibold">Available S1: {currentRefData?.stock1 ?? "—"} pcs</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Record Quantity & Action Controls */}
                      {!isEditingThis && (
                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                          <div className="text-right">
                            <span className="font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-200 text-xs inline-block">
                              {item.quantity} PCS
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditPegadasItem(item)}
                              title="Edit this scanned quantity or reference"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-slate-200/60"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePegadasItem(item.id)}
                              title="Remove this item from Pegadas batch"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200/60"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-center space-y-1">
                <BoxIcon className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">
                  No scanned records yet for Pegadas transfer
                </p>
               
              </div>
            )}

            {/* ACTION BUTTONS DIRECTLY UNDER THE RECORDS: VALID / EDIT / CANCEL */}
            {pegadasBatch.length > 0 && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3" id="operator-pegadas-action-buttons">
                
                {/* EDIT BUTTON / CANCEL BUTTON */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPegadasEditMode(!isPegadasEditMode)}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                      isPegadasEditMode
                        ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800 shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                    }`}
                    id="op-toggle-pegadas-edit-mode-btn"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>{isPegadasEditMode ? "DONE EDITING" : "EDIT RECORDS"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelPegadasBatch}
                    disabled={cancellingPegadas || approvingPegadas}
                    className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-50"
                    title="Cancel Pegadas batch (zero stock impact)"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* VALID (VALIDATE PEGADAS TRANSFER) BUTTON */}
                <button
                  type="button"
                  onClick={handleApprovePegadasBatch}
                  disabled={approvingPegadas || cancellingPegadas}
                  className="py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  id="op-validate-pegadas-btn"
                >
                  {approvingPegadas ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      MOVING TO STOCK 2...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      VALID ({totalPegadasQty} PCS)
                    </>
                  )}
                </button>

              </div>
            )}

          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* SCANNED RECORDS SECTION FOR INTAKE (INVOICE-AFFILIATED) */}
        {/* ---------------------------------------------------- */}
        {opMode === "INTAKE" && (
          <div className="pt-6 border-t border-slate-200/80 space-y-4" id="operator-scanned-records-section">
            
            {/* Header with Invoice Number Affiliation & Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                  <BoxIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      SCANNED RECORDS:
                    </h4>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                      {invoiceNumber.trim() ? invoiceNumber.trim().toUpperCase() : "NO INVOICE"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {activePendingInvoice && activePendingInvoice.items.length > 0 
                      ? `${activePendingInvoice.totalBoxes} Boxes • ${activePendingInvoice.totalQuantity} PCS` 
                      : "0 Boxes"}
                  </p>
                </div>
              </div>

              {activePendingInvoice && activePendingInvoice.items.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer border ${
                      isEditMode
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditMode ? "DONE" : "EDIT"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Scanned Records List / Table */}
            {activePendingInvoice && activePendingInvoice.items.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs font-mono max-h-72 overflow-y-auto bg-white rounded-xl border border-slate-200/80 p-2 shadow-2xs">
                {activePendingInvoice.items.map((item, idx) => {
                  const isEditingThis = editingItemId === item.id;

                  return (
                    <div key={item.id} className="py-2.5 px-3 hover:bg-slate-50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Record Reference & Barcode */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-md bg-slate-100 text-[10px] flex items-center justify-center text-slate-700 font-bold shrink-0">
                          #{idx + 1}
                        </span>

                        {isEditingThis ? (
                          <div className="flex items-center gap-2 flex-1 flex-wrap">
                            <input
                              type="text"
                              value={editRef}
                              onChange={(e) => setEditRef(e.target.value.toUpperCase())}
                              placeholder="REF CODE"
                              className="px-2.5 py-1 bg-white border border-blue-400 rounded-md text-xs font-bold text-slate-900 uppercase w-28 focus:outline-none"
                            />
                            <input
                              type="number"
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              placeholder="QTY"
                              min="1"
                              className="px-2.5 py-1 bg-white border border-blue-400 rounded-md text-xs font-bold text-slate-900 w-20 focus:outline-none"
                            />
                            <select
                              value={editDestinationStock}
                              onChange={(e) => setEditDestinationStock(e.target.value as "Stock 1" | "Stock 2" | "Stock 3")}
                              className="px-2 py-1 bg-white border border-blue-400 rounded-md text-[11px] font-bold text-slate-900 font-mono focus:outline-none"
                            >
                              <option value="Stock 1">STOCK 1</option>
                              <option value="Stock 2">STOCK 2</option>
                              <option value="Stock 3">STOCK 3</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleSaveItemEdit(item.id)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer"
                              title="Save record changes"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItemId(null)}
                              className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer"
                              title="Cancel editing"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs truncate">{item.reference}</span>
                              <span className="text-[10px] text-slate-500 font-sans truncate">
                                ({references.find(r => r.code === item.reference)?.description || item.materialType || "Mesh"})
                              </span>
                              {item.destinationStock === "Stock 3" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200 font-mono">
                                  STOCK 3
                                </span>
                              ) : item.destinationStock === "Stock 2" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-50 text-indigo-600 border border-indigo-200 font-mono">
                                  STOCK 2
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-200 font-mono">
                                  STOCK 1
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block truncate font-mono mt-0.5">
                              Barcode: {item.boxBarcode} &bull; Scanned: {item.scannedAt ? formatSystemTime(item.scannedAt) : "Just now"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Record Quantity & Action Controls */}
                      {!isEditingThis && (
                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                          <div className="text-right">
                            <span className="font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-200 text-xs inline-block">
                              {item.quantity} PCS
                            </span>
                            {item.difference !== undefined && item.difference !== 0 && (
                              <span className="text-[10px] text-amber-700 block mt-0.5 font-bold">
                                Diff: {item.difference > 0 ? '+' : ''}${item.difference}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditItem(item)}
                              title="Edit this scanned box quantity or reference"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-slate-200/60"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveScannedItem(item.id)}
                              title="Remove this box from invoice"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200/60"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-center space-y-1">
                <BoxIcon className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">
                  {invoiceNumber.trim() 
                    ? `No scanned boxes yet for Invoice ${invoiceNumber.trim().toUpperCase()}` 
                    : "No invoice entered yet"}
                </p>
               
              </div>
            )}

            {/* TOTAL BY REFERENCE UNDER SCANNED RECORDS */}
            {activePendingInvoice && activePendingInvoice.items.length > 0 && activeInvoiceRefBreakdown.length > 0 && (
              <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs border border-slate-800 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                    TOTAL BY REFERENCE ({activeInvoiceRefBreakdown.length} {activeInvoiceRefBreakdown.length === 1 ? 'REF' : 'REFS'})
                  </span>
                  <span className="text-emerald-400 font-bold">
                    TOTAL: {activePendingInvoice.totalQuantity} PCS ({activePendingInvoice.totalBoxes} BOXES)
                  </span>
                </div>

                <div className="space-y-1.5">
                  {activeInvoiceRefBreakdown.map((item) => (
                    <div 
                      key={`op-ref-${item.reference}`} 
                      className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-800/90 border border-slate-700/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs tracking-wider">
                          {item.reference}
                        </span>
                        {item.s1Qty > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                            S1: {item.s1Qty} pcs
                          </span>
                        )}
                        {item.s2Qty > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
                            S2: {item.s2Qty} pcs
                          </span>
                        )}
                        {item.s3Qty > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                            S3: {item.s3Qty} pcs
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-amber-300">
                        {item.quantity.toLocaleString()} pcs
                        <span className="text-slate-400 text-[10px] ml-2 font-normal">({item.boxes} {item.boxes === 1 ? 'box' : 'boxes'})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ACTION BUTTONS DIRECTLY UNDER THE RECORDS: VALID / EDIT / CANCEL */}
            {activePendingInvoice && activePendingInvoice.items.length > 0 && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3" id="operator-invoice-action-buttons">
                
                {/* EDIT BUTTON / CANCEL BUTTON */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                      isEditMode
                        ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800 shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                    }`}
                    id="op-toggle-edit-mode-btn"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>{isEditMode ? "DONE" : "EDIT"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelCurrentInvoice}
                    disabled={cancellingInvoice || approvingInvoice}
                    className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-50"
                    title="Cancel invoice"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* VALID (VALIDATE INVOICE) BUTTON */}
                <button
                  type="button"
                  onClick={handleApproveCurrentInvoice}
                  disabled={approvingInvoice || cancellingInvoice}
                  className="py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  id="op-validate-invoice-btn"
                >
                  {approvingInvoice ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      VALIDATING...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      VALID ({activePendingInvoice.totalQuantity} PCS)
                    </>
                  )}
                </button>

              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
}
