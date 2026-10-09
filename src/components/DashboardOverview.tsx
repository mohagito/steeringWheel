import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, InventoryTransaction, User, ScrapEntry } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area 
} from "recharts";
import { 
  Package, ArrowRight, Truck, AlertTriangle, Search, 
  Warehouse, Factory, X, Layers, Send, ArrowLeftRight, ShieldAlert, Eye,
  Trash2, FileText, CheckCircle2, ChevronRight, Calendar, Filter,
  FileSpreadsheet, Download, Plus, RotateCcw
} from "lucide-react";
import { formatSystemTime, getMoroccoTodayDateString, getMoroccoDateString } from "../utils/timeUtils";
import { exportStockAuditExcel } from "../utils/stockReportExport";

// Lucide-styled 3-spoke automotive Steering Wheel Icon
export function SteeringWheelIcon({ className = "w-6 h-6", size }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size || 24}
      height={size || 24}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
      <line x1="12" y1="15" x2="12" y2="21" />
    </svg>
  );
}
import { doc, writeBatch, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";
import { LowStockAlertModal } from "./LowStockAlertModal";
import ReturnZdfModal from "./ReturnZdfModal";
import Swal from "sweetalert2";
import { executeProtectedStockOperation } from "../services/protectionLayer";
import { 
  calculateStockValuation, 
  calculateScrapValuation, 
  MESHES_PRICE_LIST, 
  isConColaScrap 
} from "../utils/stockValuation";

interface DashboardOverviewProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  transactions: InventoryTransaction[];
  scraps?: ScrapEntry[];
  currentUser?: User | null;
  onNavigateTab?: (tab: string) => void;
  onTriggerScan?: () => void;
}

export default function DashboardOverview({ 
  boxes, 
  adjustments, 
  references = [], 
  transactions = [],
  scraps = [],
  currentUser,
  onNavigateTab,
  onTriggerScan 
}: DashboardOverviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState<"All" | "Mesh" | "Soft">("All");
  const [stockStatusFilter, setStockStatusFilter] = useState<"All" | "Low Stock" | "Normal">("All");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  // Scrap Evaluation Controls
  const [scrapPeriod, setScrapPeriod] = useState<"all" | "today" | "week" | "month">("all");
  const [scrapInvoiceFilter, setScrapInvoiceFilter] = useState<string>("all");
  const [scrapViewMode, setScrapViewMode] = useState<"reference" | "invoice">("reference");

  // Quick Action Modal State
  const [activeModal, setActiveModal] = useState<"incoming" | "mallas" | "production" | "precosido" | "villanova" | "remove" | null>(null);
  const [isIncomingChoiceOpen, setIsIncomingChoiceOpen] = useState(false);
  const [isReturnZdfOpen, setIsReturnZdfOpen] = useState(false);
  const [returnZdfCategory, setReturnZdfCategory] = useState<"RED_CAGE" | "PRECOSIDO" | null>(null);
  const [removeStockStage, setRemoveStockStage] = useState<"stock1" | "stock2" | "stock3">("stock1");
  const [modalRef, setModalRef] = useState("");
  const [modalQty, setModalQty] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [modalInvoiceNumber, setModalInvoiceNumber] = useState("");
  const [incomingDestStock, setIncomingDestStock] = useState<"Stock 1" | "Stock 2" | "Stock 3">("Stock 1");
  const [incomingItems, setIncomingItems] = useState<{ id: string; reference: string; quantity: string }[]>([
    { id: "inc-1", reference: "", quantity: "" }
  ]);
  const [modalShiftOrLine, setModalShiftOrLine] = useState("Shift A");
  const [modalDestination, setModalDestination] = useState("Villanova");
  const [modalReasonType, setModalReasonType] = useState("Correction of input error");
  const [modalStock2Subtype, setModalStock2Subtype] = useState<"normal" | "disassembly">("normal");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const incomingTotalQty = useMemo(() => {
    return incomingItems.reduce((sum, it) => {
      const q = parseInt(it.quantity, 10);
      return sum + (!isNaN(q) && q > 0 ? q : 0);
    }, 0);
  }, [incomingItems]);

  const handleAddIncomingItem = () => {
    setIncomingItems(prev => [
      ...prev,
      { id: `inc-${Date.now()}-${prev.length + 1}`, reference: references[0]?.code || "", quantity: "" }
    ]);
  };

  const handleRemoveIncomingItem = (id: string) => {
    setIncomingItems(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(item => item.id !== id);
    });
  };

  const handleUpdateIncomingItem = (id: string, field: "reference" | "quantity", value: string) => {
    setIncomingItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const selectedModalRef = useMemo(() => {
    return references.find(r => r.code.toUpperCase() === (modalRef || "").trim().toUpperCase());
  }, [references, modalRef]);

  // Format today's date prefix in Morocco (Africa/Casablanca)
  const todayStr = useMemo(() => {
    return getMoroccoTodayDateString();
  }, []);

  // 1. Calculate General Metrics & Low Stock Count (Stock 1 + Stock 2 < 100 PCS)
  const metrics = useMemo(() => {
    const totalWarehouseStock = references.reduce((sum, r) => sum + (r.stock1 || 0), 0);
    const totalProductionStock = references.reduce((sum, r) => sum + (r.stock2 || 0), 0);
    const totalFinishedStock = references.reduce((sum, r) => sum + (r.stock3 || 0), 0);

    const lowStockRefs = references.filter(r => {
      const s1PlusS2 = (r.stock1 || 0) + (r.stock2 || 0);
      return s1PlusS2 < 100;
    });

    const todaysTransfers = transactions
      .filter(t => {
        const tDay = getMoroccoDateString(t.timestamp);
        return tDay === todayStr && (t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2");
      })
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    const todaysDeliveries = transactions
      .filter(t => {
        const tDay = getMoroccoDateString(t.timestamp);
        return tDay === todayStr && (t.movementType === "STOCK 3 OUT" || t.movementType === "STOCK 2 OUT / STOCK 3 IN" || t.movementType === "DELIVERY" || t.movementType === "STOCK 2 OUT");
      })
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    return {
      totalWarehouseStock,
      totalProductionStock,
      totalFinishedStock,
      lowStockCount: lowStockRefs.length,
      todaysTransfers,
      todaysDeliveries
    };
  }, [references, transactions, todayStr]);

  // Derived Monetary Stock Valuations from authoritative Firestore quantities
  const stock1Valuation = useMemo(() => calculateStockValuation(references, "stock1"), [references]);
  const stock2Valuation = useMemo(() => calculateStockValuation(references, "stock2"), [references]);
  const stock3Valuation = useMemo(() => calculateStockValuation(references, "stock3"), [references]);

  // Unique available invoices from scrap records
  const availableScrapInvoices = useMemo(() => {
    const set = new Set<string>();
    scraps.forEach(s => {
      if (s.status !== "deleted" && s.invoiceNumber) {
        set.add(s.invoiceNumber.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [scraps]);

  // Scraps filtered by invoice
  const filteredScrapsForValuation = useMemo(() => {
    if (scrapInvoiceFilter === "all") return scraps;
    return scraps.filter(s => (s.invoiceNumber || "").trim().toUpperCase() === scrapInvoiceFilter);
  }, [scraps, scrapInvoiceFilter]);

  // Derived Scrap Monetary Valuation for CON COLA pieces
  const scrapValuation = useMemo(() => {
    return calculateScrapValuation(filteredScrapsForValuation, scrapPeriod);
  }, [filteredScrapsForValuation, scrapPeriod]);

  // Enriched breakdown with reference descriptions and invoice tags
  const referenceBreakdownWithDetails = useMemo(() => {
    return scrapValuation.breakdown.map(item => {
      const refObj = references.find(r => r.code.toUpperCase() === item.reference.toUpperCase());
      const invoiceSet = new Set<string>();
      filteredScrapsForValuation.forEach(s => {
        if (s.status !== "deleted" && (s.reference || "").toUpperCase() === item.reference.toUpperCase()) {
          if (s.invoiceNumber) invoiceSet.add(s.invoiceNumber.trim().toUpperCase());
        }
      });
      return {
        ...item,
        description: refObj?.description || "",
        invoices: Array.from(invoiceSet)
      };
    });
  }, [scrapValuation, references, filteredScrapsForValuation]);

  // Invoices breakdown group
  const invoiceGroups = useMemo(() => {
    const groups: Record<string, {
      invoiceNumber: string;
      totalValue: number;
      totalPcs: number;
      conColaPcs: number;
      sinColaPcs: number;
      items: {
        reference: string;
        description: string;
        pcs: number;
        conColaPcs: number;
        sinColaPcs: number;
        unitPrice?: number;
        totalValue: number;
      }[];
    }> = {};

    const todayStrMorocco = getMoroccoTodayDateString();
    const currentMonthStr = todayStrMorocco.slice(0, 7);
    const now = new Date();
    const weekAgoStr = getMoroccoDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const periodScraps = filteredScrapsForValuation.filter(s => {
      if (s.status === "deleted") return false;
      const recordDate = s.date || (s.timestamp ? getMoroccoDateString(s.timestamp) : "");
      if (!recordDate) return true;
      if (scrapPeriod === "today") return recordDate === todayStrMorocco;
      if (scrapPeriod === "week") return recordDate >= weekAgoStr && recordDate <= todayStrMorocco;
      if (scrapPeriod === "month") return recordDate.startsWith(currentMonthStr);
      return true;
    });

    periodScraps.forEach(s => {
      const inv = (s.invoiceNumber || "NO-INVOICE").trim().toUpperCase();
      const refCode = (s.reference || "").trim().toUpperCase();
      const qty = s.quantity || 0;
      if (qty <= 0 || !refCode) return;
      const unitPrice = MESHES_PRICE_LIST[refCode];
      const val = unitPrice ? Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100 : 0;
      const refObj = references.find(r => r.code.toUpperCase() === refCode);
      const isCon = isConColaScrap(s);

      if (!groups[inv]) {
        groups[inv] = {
          invoiceNumber: inv,
          totalValue: 0,
          totalPcs: 0,
          conColaPcs: 0,
          sinColaPcs: 0,
          items: []
        };
      }

      groups[inv].totalValue = Math.round((groups[inv].totalValue + val + Number.EPSILON) * 100) / 100;
      groups[inv].totalPcs += qty;
      if (isCon) {
        groups[inv].conColaPcs += qty;
      } else {
        groups[inv].sinColaPcs += qty;
      }

      const existingItem = groups[inv].items.find(i => i.reference === refCode);
      if (existingItem) {
        existingItem.pcs += qty;
        if (isCon) existingItem.conColaPcs += qty;
        else existingItem.sinColaPcs += qty;
        existingItem.totalValue = Math.round((existingItem.totalValue + val + Number.EPSILON) * 100) / 100;
      } else {
        groups[inv].items.push({
          reference: refCode,
          description: refObj?.description || "",
          pcs: qty,
          conColaPcs: isCon ? qty : 0,
          sinColaPcs: isCon ? 0 : qty,
          unitPrice,
          totalValue: val
        });
      }
    });

    return Object.values(groups).sort((a, b) => b.totalValue - a.totalValue);
  }, [filteredScrapsForValuation, scrapPeriod, references]);

  // Filter and search references for the main list
  const filteredReferences = useMemo(() => {
    const q = (searchQuery || "").toLowerCase().trim();
    return references.filter(ref => {
      const matchesSearch = !q ? true : (
        (ref.code || "").toLowerCase().includes(q) || 
        (ref.description || "").toLowerCase().includes(q)
      );
      const matchesMaterial = materialFilter === "All" || ref.materialType === materialFilter;
      
      const s1PlusS2 = (ref.stock1 || 0) + (ref.stock2 || 0);
      const isLowStock = s1PlusS2 < 100;
      const matchesStockStatus = stockStatusFilter === "All" || 
                                 (stockStatusFilter === "Low Stock" && isLowStock) || 
                                 (stockStatusFilter === "Normal" && !isLowStock);

      return matchesSearch && matchesMaterial && matchesStockStatus;
    });
  }, [references, searchQuery, materialFilter, stockStatusFilter]);

  // Chart 1: Stock distribution across 3 stages
  const chartData = useMemo(() => {
    return references.map(ref => ({
      name: ref.code,
      "Stock 1 (Raw)": ref.stock1 || 0,
      "Stock 2 (Glued)": ref.stock2 || 0,
      "Stock 3 (Wheels)": ref.stock3 || 0,
    }));
  }, [references]);

  // Chart 2: Material Flow History
  const timelineChartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return getMoroccoDateString(d.toISOString());
    }).reverse();

    return days.map(day => {
      const dayTransfers = transactions
        .filter(t => {
          const tDay = getMoroccoDateString(t.timestamp);
          return tDay === day && (t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2");
        })
        .reduce((sum, t) => sum + t.quantity, 0);

      const dayDeliveries = transactions
        .filter(t => {
          const tDay = getMoroccoDateString(t.timestamp);
          return tDay === day && (t.movementType === "STOCK 3 OUT" || t.movementType === "DELIVERY" || t.movementType === "STOCK 2 OUT");
        })
        .reduce((sum, t) => sum + t.quantity, 0);

      const label = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Africa/Casablanca" });
      return {
        date: label,
        "Transfers": dayTransfers,
        "Deliveries": dayDeliveries,
      };
    });
  }, [transactions]);

  // Quick Action Handler
  const handleExecuteQuickAction = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeModal === "incoming") {
      const invNum = modalInvoiceNumber.trim().toUpperCase();
      if (!invNum) {
        setModalFeedback({ type: "error", message: "Please enter an invoice or delivery note number." });
        return;
      }

      const validItems = incomingItems
        .map(item => ({
          reference: item.reference.trim().toUpperCase(),
          quantity: parseInt(item.quantity, 10)
        }))
        .filter(it => it.reference && !isNaN(it.quantity) && it.quantity > 0);

      if (validItems.length === 0) {
        setModalFeedback({ type: "error", message: "Please enter at least one valid reference and quantity." });
        return;
      }

      setModalSubmitting(true);
      setModalFeedback(null);

      try {
        const operatorName = currentUser?.fullName || "Operator";
        const now = new Date().toISOString();
        const totalQty = validItems.reduce((sum, it) => sum + it.quantity, 0);

        // Group quantities by reference in case a reference appears multiple times
        const groupedMap: Record<string, number> = {};
        for (const item of validItems) {
          groupedMap[item.reference] = (groupedMap[item.reference] || 0) + item.quantity;
        }

        const deltas = Object.entries(groupedMap).map(([ref, q]) => ({
          reference: ref,
          delta1: incomingDestStock === "Stock 1" ? q : 0,
          delta2: incomingDestStock === "Stock 2" ? q : 0,
          delta2Subtype: incomingDestStock === "Stock 2" ? modalStock2Subtype : undefined,
          delta3: incomingDestStock === "Stock 3" ? q : 0
        }));

        const moveType = incomingDestStock === "Stock 1"
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
          notes: `Received via Invoice ${invNum} -> ${incomingDestStock}${modalNote ? ` (${modalNote})` : ""}`
        }));

        const invoiceId = `inv-${invNum.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-${Date.now()}`;

        await executeProtectedStockOperation({
          operationType: "INCOMING_RECEIPT",
          deltas,
          operatorName,
          reason: `Incoming Truck: ${invNum} -> ${incomingDestStock} (${validItems.length} references, ${totalQty} pcs)${modalNote ? ` (${modalNote})` : ""}`,
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
              notes: modalNote || "",
              totalBoxes: validItems.length,
              totalQuantity: totalQty,
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

        const successMsg = `Successfully added ${totalQty} pcs across ${validItems.length} reference${validItems.length > 1 ? "s" : ""} via Invoice ${invNum} to ${incomingDestStock}.`;
        setModalFeedback({ type: "success", message: successMsg });
        setTimeout(() => {
          setActiveModal(null);
          setModalSubmitting(false);
          setIncomingItems([{ id: "inc-1", reference: references[0]?.code || "", quantity: "" }]);
          setModalInvoiceNumber("");
          setModalNote("");
        }, 1500);
      } catch (err: any) {
        setModalFeedback({ type: "error", message: err.message || "Failed to process incoming stock." });
        setModalSubmitting(false);
      }
      return;
    }

    if (!modalRef || !modalQty) return;
    const qty = parseInt(modalQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setModalFeedback({ type: "error", message: "Please enter a valid positive quantity." });
      return;
    }

    setModalSubmitting(true);
    setModalFeedback(null);

    try {
      const operatorName = currentUser?.fullName || "Operator";
      let successMsg = "";

      if (activeModal === "mallas") {
        await executeProtectedStockOperation({
          operationType: "TRANSFER_S1_S2",
          referenceCode: modalRef,
          operatorName,
          reason: `Sent to Gluing/Processing (${modalStock2Subtype.toUpperCase()}): ${modalNote || "Mallas Pegadas"}`,
          execute: async (refData, transaction) => {
            const s1 = refData.stock1 || 0;
            if (qty > s1) {
              throw new Error(`Insufficient Stock 1! Available: ${s1} pcs, requested: ${qty} pcs.`);
            }
            const newS1 = s1 - qty;
            const curDis = refData.stock2Disassembly || 0;
            const curNorm = refData.stock2Normal !== undefined ? refData.stock2Normal : Math.max(0, (refData.stock2 || 0) - curDis);
            const newNorm = modalStock2Subtype === "normal" ? curNorm + qty : curNorm;
            const newDis = modalStock2Subtype === "disassembly" ? curDis + qty : curDis;
            const newS2 = newNorm + newDis;
            const newTotal = newS1 + newS2 + (refData.stock3 || 0);
            const transId = `trans-trf-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "TRANSFER S1->S2",
              stock: `Stock 1 -> Stock 2 (${modalStock2Subtype.toUpperCase()})`,
              quantity: qty,
              expectedQty: qty,
              actualQty: qty,
              operatorName,
              timestamp: now,
              notes: `Mallas Pegadas / Gluing Transfer (${modalStock2Subtype.toUpperCase()} Stock 2): ${modalNote || "Sent to Gluing/Processing"}`
            });

            return {
              stockChanges: [{ 
                referenceCode: modalRef, 
                newStock1: newS1, 
                newStock2: newS2, 
                newStock2Normal: newNorm, 
                newStock2Disassembly: newDis, 
                newStock3: refData.stock3 || 0, 
                newTotal 
              }]
            };
          }
        });
        successMsg = `Successfully transferred ${qty} pcs to Stock 2 (${modalStock2Subtype.toUpperCase()}).`;
      } else if (activeModal === "production") {
        const shift = modalShiftOrLine.trim() || "Shift A";
        await executeProtectedStockOperation({
          operationType: "PRODUCTION_OUT",
          referenceCode: modalRef,
          operatorName,
          reason: `Montaje Steering Wheel Assembly (${shift}) from ${modalStock2Subtype.toUpperCase()} Stock 2: ${modalNote || "Daily Production"}`,
          execute: async (refData, transaction) => {
            const curDis = refData.stock2Disassembly || 0;
            const curNorm = refData.stock2Normal !== undefined ? refData.stock2Normal : Math.max(0, (refData.stock2 || 0) - curDis);

            if (modalStock2Subtype === "disassembly") {
              if (qty > curDis) {
                throw new Error(`Insufficient Disassembly Stock 2! Available: ${curDis} pcs, requested: ${qty} pcs.`);
              }
            } else {
              if (qty > curNorm) {
                throw new Error(`Insufficient Normal Stock 2! Available: ${curNorm} pcs, requested: ${qty} pcs.`);
              }
            }

            const newNorm = modalStock2Subtype === "normal" ? curNorm - qty : curNorm;
            const newDis = modalStock2Subtype === "disassembly" ? curDis - qty : curDis;
            const newS2 = newNorm + newDis;
            const newS3 = (refData.stock3 || 0) + qty;
            const newTotal = (refData.stock1 || 0) + newS2 + newS3;
            const transId = `trans-prod-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 2 OUT / STOCK 3 IN",
              stock: `Stock 2 (${modalStock2Subtype.toUpperCase()}) -> Stock 3`,
              quantity: qty,
              expectedQty: qty,
              actualQty: qty,
              operatorName,
              timestamp: now,
              notes: `Production Output (${shift}) from ${modalStock2Subtype.toUpperCase()} Stock 2: ${modalNote || "None"}`
            });

            return {
              stockChanges: [{ 
                referenceCode: modalRef, 
                newStock1: refData.stock1 || 0, 
                newStock2: newS2, 
                newStock2Normal: newNorm, 
                newStock2Disassembly: newDis, 
                newStock3: newS3, 
                newTotal 
              }]
            };
          }
        });
        successMsg = `Successfully assembled ${qty} Steering Wheels from ${modalStock2Subtype.toUpperCase()} Stock 2 into Stock 3 (${shift}).`;
      } else if (activeModal === "precosido") {
        const invNum = modalInvoiceNumber.trim().toUpperCase() || "PRECOSIDO";
        await executeProtectedStockOperation({
          operationType: "DELIVERY_OUT",
          referenceCode: modalRef,
          operatorName,
          reason: `Precosido Invoice Dispatch: ${invNum} from ${modalStock2Subtype.toUpperCase()} Stock 2${modalNote ? ` - ${modalNote}` : ""}`,
          execute: async (refData, transaction) => {
            const curDis = refData.stock2Disassembly || 0;
            const curNorm = refData.stock2Normal !== undefined ? refData.stock2Normal : Math.max(0, (refData.stock2 || 0) - curDis);

            if (modalStock2Subtype === "disassembly") {
              if (qty > curDis) {
                throw new Error(`Insufficient Disassembly Stock 2! Available: ${curDis} pcs, requested: ${qty} pcs.`);
              }
            } else {
              if (qty > curNorm) {
                throw new Error(`Insufficient Normal Stock 2! Available: ${curNorm} pcs, requested: ${qty} pcs.`);
              }
            }

            const newNorm = modalStock2Subtype === "normal" ? curNorm - qty : curNorm;
            const newDis = modalStock2Subtype === "disassembly" ? curDis - qty : curDis;
            const newS2 = newNorm + newDis;
            const newTotal = (refData.stock1 || 0) + newS2 + (refData.stock3 || 0);
            const transId = `trans-pre-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 2 OUT",
              stock: `Stock 2 (${modalStock2Subtype.toUpperCase()})`,
              invoiceNumber: invNum,
              quantity: qty,
              expectedQty: qty,
              actualQty: qty,
              operatorName,
              timestamp: now,
              notes: `Precosido Invoice Dispatch from ${modalStock2Subtype.toUpperCase()} Stock 2: ${invNum}${modalNote ? ` - ${modalNote}` : ""}`
            });

            return {
              stockChanges: [{ 
                referenceCode: modalRef, 
                newStock1: refData.stock1 || 0, 
                newStock2: newS2, 
                newStock2Normal: newNorm, 
                newStock2Disassembly: newDis, 
                newStock3: refData.stock3 || 0, 
                newTotal 
              }]
            };
          }
        });
        successMsg = `Successfully dispatched ${qty} pcs Precosido from ${modalStock2Subtype.toUpperCase()} Stock 2 (Invoice: ${invNum}).`;
      } else if (activeModal === "villanova") {
        const invNum = modalInvoiceNumber.trim().toUpperCase() || "DELIVERY";
        const destination = modalDestination.trim() || "Villanova";
        await executeProtectedStockOperation({
          operationType: "DELIVERY_OUT",
          referenceCode: modalRef,
          operatorName,
          reason: `Delivery to ${destination}: Invoice ${invNum}${modalNote ? ` - ${modalNote}` : ""}`,
          execute: async (refData, transaction) => {
            const s3 = refData.stock3 || 0;
            if (qty > s3) {
              throw new Error(`Insufficient Stock 3! Available: ${s3} pcs, requested: ${qty} pcs.`);
            }
            const newS3 = s3 - qty;
            const newTotal = (refData.stock1 || 0) + (refData.stock2 || 0) + newS3;
            const transId = `trans-del-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 3 OUT",
              stock: "Stock 3",
              invoiceNumber: invNum,
              customer: destination,
              quantity: qty,
              expectedQty: qty,
              actualQty: qty,
              operatorName,
              timestamp: now,
              notes: `Delivery (${destination}): Invoice ${invNum}${modalNote ? ` - ${modalNote}` : ""}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: refData.stock1 || 0, newStock2: refData.stock2 || 0, newStock3: newS3, newTotal }]
            };
          }
        });
        successMsg = `Successfully shipped ${qty} Steering Wheels to ${destination} via Invoice ${invNum}.`;
      } else if (activeModal === "remove") {
        let stageName = "Stock 1";
        const reasonText = modalReasonType ? `${modalReasonType}${modalNote ? ` - ${modalNote}` : ""}` : (modalNote || "Removed by user");
        await executeProtectedStockOperation({
          operationType: "STOCK_ADJUSTMENT",
          referenceCode: modalRef,
          operatorName,
          reason: `Stock Deduction: ${reasonText}`,
          execute: async (refData, transaction) => {
            let s1 = refData.stock1 || 0;
            let s2 = refData.stock2 || 0;
            let s3 = refData.stock3 || 0;
            let curDis = refData.stock2Disassembly || 0;
            let curNorm = refData.stock2Normal !== undefined ? refData.stock2Normal : Math.max(0, s2 - curDis);
            let newNorm = curNorm;
            let newDis = curDis;

            if (removeStockStage === "stock1") {
              if (qty > s1) throw new Error(`Insufficient Stock 1! Available: ${s1} pcs, requested: ${qty} pcs.`);
              s1 = s1 - qty;
              stageName = "Stock 1";
            } else if (removeStockStage === "stock2") {
              if (modalStock2Subtype === "disassembly") {
                if (qty > curDis) throw new Error(`Insufficient Disassembly Stock 2! Available: ${curDis} pcs, requested: ${qty} pcs.`);
                newDis = curDis - qty;
              } else {
                if (qty > curNorm) throw new Error(`Insufficient Normal Stock 2! Available: ${curNorm} pcs, requested: ${qty} pcs.`);
                newNorm = curNorm - qty;
              }
              s2 = newNorm + newDis;
              stageName = `Stock 2 (${modalStock2Subtype.toUpperCase()})`;
            } else if (removeStockStage === "stock3") {
              if (qty > s3) throw new Error(`Insufficient Stock 3! Available: ${s3} pcs, requested: ${qty} pcs.`);
              s3 = s3 - qty;
              stageName = "Stock 3";
            }

            const newTotal = s1 + s2 + s3;
            const transId = `trans-rmv-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK REMOVED",
              stock: stageName,
              quantity: qty,
              expectedQty: qty,
              actualQty: qty,
              operatorName,
              timestamp: now,
              notes: `Stock Deduction (${stageName}): ${reasonText}`
            });

            return {
              stockChanges: [{ 
                referenceCode: modalRef, 
                newStock1: s1, 
                newStock2: s2, 
                newStock2Normal: newNorm, 
                newStock2Disassembly: newDis, 
                newStock3: s3, 
                newTotal 
              }]
            };
          }
        });
        successMsg = `Successfully removed ${qty} pcs from ${stageName}.`;
      }

      setModalQty("");
      setModalNote("");
      setModalInvoiceNumber("");
      setActiveModal(null);
      setModalFeedback(null);

      Swal.fire({
        title: "Good job!",
        text: successMsg || "Operation completed successfully!",
        icon: "success",
        confirmButtonText: "OK",
        confirmButtonColor: "#2563eb",
      });

    } catch (err: any) {
      console.error("Quick action error:", err);
      setModalFeedback({ type: "error", message: err.message || "Failed to process transaction." });
    } finally {
      setModalSubmitting(false);
    }
  };

  const openModal = (type: "incoming" | "mallas" | "production" | "precosido" | "villanova" | "remove") => {
    setActiveModal(type);
    setModalFeedback(null);
    setModalQty("");
    setModalNote("");
    setModalInvoiceNumber("");
    setIncomingDestStock("Stock 1");
    setModalStock2Subtype("normal");
    setModalShiftOrLine("Shift A");
    setModalDestination(type === "villanova" ? "Villanova" : type === "precosido" ? "Precosido" : "");
    setModalReasonType(type === "remove" ? "Correction of input error" : "");
    if (references.length > 0 && !modalRef) {
      setModalRef(references[0].code);
    }
    if (type === "incoming") {
      setIncomingItems([
        { id: `inc-${Date.now()}-1`, reference: references[0]?.code || "", quantity: "" }
      ]);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" id="dashboard-container">
      
      {/* Top KPI Summary Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Stock 1 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4 min-h-[104px]">
          <div className="w-12 h-12 min-w-12 min-h-12 rounded-2xl bg-blue-50/90 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
            <Warehouse className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 1</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">
              {metrics.totalWarehouseStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs font-semibold font-mono text-slate-600">
                {stock1Valuation.formattedValue}
              </span>
              {stock1Valuation.missingPriceCount > 0 && (
                <span 
                  className="text-[10px] text-amber-600 font-medium"
                  title={`Missing price for: ${stock1Valuation.missingPriceRefs.join(", ")}`}
                >
                  +{stock1Valuation.missingPriceCount} {stock1Valuation.missingPriceCount === 1 ? "reference" : "references"} without price
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Stock 2 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4 min-h-[104px]">
          <div className="w-12 h-12 min-w-12 min-h-12 rounded-2xl bg-amber-50/90 border border-amber-100/80 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <Factory className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 2</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">
              {metrics.totalProductionStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs font-semibold font-mono text-slate-600">
                {stock2Valuation.formattedValue}
              </span>
              {stock2Valuation.missingPriceCount > 0 && (
                <span 
                  className="text-[10px] text-amber-600 font-medium"
                  title={`Missing price for: ${stock2Valuation.missingPriceRefs.join(", ")}`}
                >
                  +{stock2Valuation.missingPriceCount} {stock2Valuation.missingPriceCount === 1 ? "reference" : "references"} without price
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Stock 3 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4 min-h-[104px]">
          <div className="w-12 h-12 min-w-12 min-h-12 rounded-2xl bg-emerald-50/90 border border-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
            <SteeringWheelIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 3</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">
              {metrics.totalFinishedStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs font-semibold font-mono text-slate-600">
                {stock3Valuation.formattedValue}
              </span>
              {stock3Valuation.missingPriceCount > 0 && (
                <span 
                  className="text-[10px] text-amber-600 font-medium"
                  title={`Missing price for: ${stock3Valuation.missingPriceRefs.join(", ")}`}
                >
                  +{stock3Valuation.missingPriceCount} {stock3Valuation.missingPriceCount === 1 ? "reference" : "references"} without price
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Low Stock Alerts */}
        <div 
          onClick={() => setIsAlertModalOpen(true)}
          className={`border rounded-3xl p-5 shadow-xl transition-all cursor-pointer relative overflow-hidden flex items-center justify-between gap-4 min-h-[96px] ${
            metrics.lowStockCount > 0 
              ? "bg-gradient-to-br from-rose-50/90 to-white border-rose-200 shadow-rose-500/10 hover:border-rose-300" 
              : "bg-white border-slate-100 shadow-slate-200/40"
          }`}
          id="dashboard-low-stock-kpi-card"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
              metrics.lowStockCount > 0 
                ? "bg-rose-600 text-white shadow-rose-500/30 animate-pulse" 
                : "bg-emerald-50 text-emerald-600"
            }`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <span>Low Stock Alert</span>
                {metrics.lowStockCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block"></span>
                )}
              </p>
              <h3 className={`text-xl font-extrabold mt-0.5 truncate ${metrics.lowStockCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
                {metrics.lowStockCount} <span className="text-xs font-medium text-slate-400">Refs &lt; 100 PCS</span>
              </h3>
            </div>
          </div>
          <button 
            type="button"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors shrink-0"
            title="View Low Stock References"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* 3-STAGE VISUAL FLOW BAR */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Pipeline
          </h3>
          <span className="text-xs font-medium text-slate-400 font-mono">
            {references.length} References
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-stretch">
          
          {/* STAGE 1: STOCK 1 */}
          <div className="md:col-span-3 bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                  Stock 1
                </span>
                <Warehouse className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Mallas Not Touched
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-slate-900">
                  {metrics.totalWarehouseStock.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">PCS</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold font-mono text-slate-500">
                  {stock1Valuation.formattedValue}
                </span>
                {stock1Valuation.missingPriceCount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium" title={`Missing price for: ${stock1Valuation.missingPriceRefs.join(", ")}`}>
                    +{stock1Valuation.missingPriceCount} without price
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR 1 -> 2 */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
            <div className="hidden md:flex flex-col items-center text-slate-400">
              <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 font-mono tracking-wider">GLUING</span>
              <div className="p-2 bg-slate-100 rounded-full border border-slate-200 shadow-xs">
                <ArrowRight className="w-4 h-4 text-slate-600" />
              </div>
            </div>
            <div className="flex md:hidden items-center text-slate-400 gap-1">
              <ArrowRight className="w-4 h-4 rotate-90" />
              <span className="text-xs font-medium">Gluing Line</span>
            </div>
          </div>

          {/* STAGE 2: STOCK 2 */}
          <div className="md:col-span-3 bg-amber-50/50 border border-amber-100 p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                  Stock 2
                </span>
                <Factory className="w-5 h-5 text-amber-500" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Mallas Pegadas
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-amber-700">
                  {metrics.totalProductionStock.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">PCS</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold font-mono text-slate-500">
                  {stock2Valuation.formattedValue}
                </span>
                {stock2Valuation.missingPriceCount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium" title={`Missing price for: ${stock2Valuation.missingPriceRefs.join(", ")}`}>
                    +{stock2Valuation.missingPriceCount} without price
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR 2 -> 3 */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
            <div className="hidden md:flex flex-col items-center text-slate-400">
              <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 font-mono tracking-wider">MONTAJE</span>
              <div className="p-2 bg-amber-100 rounded-full border border-amber-200 shadow-xs">
                <ArrowRight className="w-4 h-4 text-amber-700" />
              </div>
            </div>
            <div className="flex md:hidden items-center text-slate-400 gap-1">
              <ArrowRight className="w-4 h-4 rotate-90" />
              <span className="text-xs font-medium">Montaje Assembly</span>
            </div>
          </div>

          {/* STAGE 3: STOCK 3 */}
          <div className="md:col-span-3 bg-emerald-50/50 border border-emerald-100 p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  Stock 3
                </span>
                <SteeringWheelIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Steering Wheels
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-emerald-700">
                  {metrics.totalFinishedStock.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">PCS</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold font-mono text-slate-500">
                  {stock3Valuation.formattedValue}
                </span>
                {stock3Valuation.missingPriceCount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium" title={`Missing price for: ${stock3Valuation.missingPriceRefs.join(", ")}`}>
                    +{stock3Valuation.missingPriceCount} without price
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* QUICK ACTIONS BAR */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
            Quick Actions
          </h3>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsIncomingChoiceOpen(true)}
            className="flex-1 min-w-[150px] px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border border-blue-200/60 font-mono shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>+ Incoming</span>
            </div>
            <span className="text-[10px] font-normal text-blue-600/80">Raw Material • Return ZDF</span>
          </button>

          <button
            onClick={() => openModal("mallas")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border border-amber-200/60 font-mono shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4 text-amber-600" />
              <span>+ Stock 2</span>
            </div>
            <span className="text-[10px] font-normal text-amber-700/80">Transfer S1 → S2</span>
          </button>

          <button
            onClick={() => openModal("production")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border border-emerald-200/60 font-mono shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <Factory className="w-4 h-4 text-emerald-600" />
              <span>+ Production</span>
            </div>
            <span className="text-[10px] font-normal text-emerald-700/80">Assembly S2 → S3</span>
          </button>

          <button
            onClick={() => openModal("precosido")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border border-rose-200/60 font-mono shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <Package className="w-4 h-4 text-rose-600" />
              <span>+ Precosido</span>
            </div>
            <span className="text-[10px] font-normal text-rose-700/80">Invoice • S2 OUT</span>
          </button>

          <button
            onClick={() => openModal("villanova")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border border-purple-200/60 font-mono shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <Send className="w-4 h-4 text-purple-600" />
              <span>+ Delivery</span>
            </div>
            <span className="text-[10px] font-normal text-purple-700/80">Invoice • S3 OUT</span>
          </button>

          <button
            onClick={() => openModal("remove")}
            className="w-full sm:flex-1 min-w-[150px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border border-slate-300/80 font-mono shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <X className="w-4 h-4 text-slate-700" />
              <span>－ Remove</span>
            </div>
            <span className="text-[10px] font-normal text-slate-600">Deduct S1, S2, S3</span>
          </button>
        </div>
      </div>

      {/* MASTER INVENTORY TABLE */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/40 p-6 overflow-hidden" id="reference-inventory-list">
        
        {/* Table Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-800" />
              Inventory
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-xs rounded-2xl font-mono focus:outline-none transition-all w-48"
              />
            </div>

            <CustomSelect
              value={materialFilter}
              onChange={(val) => setMaterialFilter(val as any)}
              options={[
                { value: "All", label: "All Types" },
                { value: "Mesh", label: "Mesh Only" },
                { value: "Soft", label: "Soft Only" }
              ]}
              className="w-36"
              size="sm"
            />

            <CustomSelect
              value={stockStatusFilter}
              onChange={(val) => setStockStatusFilter(val as any)}
              options={[
                { value: "All", label: "All Levels" },
                { value: "Low Stock", label: "Low Warnings", badge: "Warning" },
                { value: "Normal", label: "Normal Levels" }
              ]}
              className="w-36"
              size="sm"
            />

            {/* Download Stock Report (Stock 1, 2, 3) */}
            <button
              type="button"
              id="btn-download-stock-report"
              onClick={() => exportStockAuditExcel(references)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-bold font-mono flex items-center gap-2 shadow-xs shadow-emerald-600/20 transition-all cursor-pointer shrink-0"
              title="Download Stock Report for Stock 1, 2, 3 directly to Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Stock Report</span>
            </button>
          </div>
        </div>

        {/* Clean Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                <th className="py-3 px-4 font-mono">Reference</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-3 text-right">Unit Price</th>
                <th className="py-3 px-3 text-center">Type</th>
                <th className="py-3 px-4 text-right">Stock 1</th>
                <th className="py-3 px-4 text-right">Stock 2</th>
                <th className="py-3 px-4 text-right">Stock 3</th>
                <th className="py-3 px-4 text-right font-bold text-slate-900">Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredReferences.map((ref) => {
                const s1 = ref.stock1 || 0;
                const s2 = ref.stock2 || 0;
                const s3 = ref.stock3 || 0;
                const total = s1 + s2 + s3;
                const s1PlusS2 = s1 + s2;
                const isLow = s1PlusS2 < 100;
                const unitPrice = MESHES_PRICE_LIST[ref.code.toUpperCase()];

                return (
                  <tr key={ref.id} className={`hover:bg-slate-50/70 transition-colors ${isLow ? "bg-rose-50/20" : ""}`}>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{ref.code}</td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                      {unitPrice !== undefined ? (
                        `€ ${unitPrice.toFixed(2)}`
                      ) : (
                        <span className="text-slate-400 font-normal italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                        {ref.materialType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-600">
                      {s1.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-amber-600">
                      {s2.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-600">
                      {s3.toLocaleString()}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono font-black ${isLow ? "text-rose-600 text-sm" : "text-slate-900"}`}>
                      {total.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isLow ? (
                        <span 
                          onClick={() => setIsAlertModalOpen(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer hover:bg-rose-100 transition-colors font-mono uppercase"
                          title="Click to view alert details"
                        >
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono uppercase">
                          NORMAL
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                      {ref.lastUpdate ? formatSystemTime(ref.lastUpdate) : "N/A"}
                    </td>
                  </tr>
                );
              })}

              {filteredReferences.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-mono text-xs">
                    No references found matching "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DEDICATED SCRAP EVALUATION SECTION */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/40 p-6 space-y-6" id="scrap-evaluation-section">
        
        {/* Section Header & Interactive Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Scrap Evaluation
                </h3>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Period Filters */}
            <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setScrapPeriod("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  scrapPeriod === "all"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setScrapPeriod("today")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  scrapPeriod === "today"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setScrapPeriod("week")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  scrapPeriod === "week"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setScrapPeriod("month")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  scrapPeriod === "month"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                This Month
              </button>
            </div>

            {/* Invoice Filter */}
            {availableScrapInvoices.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={scrapInvoiceFilter}
                  onChange={(e) => setScrapInvoiceFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="all">All Invoices ({availableScrapInvoices.length})</option>
                  {availableScrapInvoices.map((inv) => (
                    <option key={inv} value={inv}>
                      {inv}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* View Mode Toggle */}
            <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setScrapViewMode("reference")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  scrapViewMode === "reference"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                By Reference
              </button>
              <button
                type="button"
                onClick={() => setScrapViewMode("invoice")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  scrapViewMode === "invoice"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                By Invoice
              </button>
            </div>
          </div>
        </div>

        {/* KPI Summary Cards for Scrap Evaluation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Monetary Value of All Scrap */}
          <div className="p-5 bg-gradient-to-br from-rose-50/70 to-amber-50/40 border border-rose-200/80 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-mono font-bold text-rose-700 uppercase tracking-wider">
                Total Scrap Value
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 mt-1">
                {scrapValuation.formattedTotalValue}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-rose-200/50 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>Period: {scrapPeriod === "all" ? "All Time" : scrapPeriod === "today" ? "Today" : scrapPeriod === "week" ? "Last 7 Days" : "This Month"}</span>
              <span className="font-bold text-rose-700 text-xs sm:text-sm font-mono">{scrapValuation.totalScrapPcs.toLocaleString()} PCS TOTAL</span>
            </div>
          </div>

          {/* Card 2: CON COLA Volume & Value */}
          <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-mono font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                CON COLA
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 mt-1 flex items-baseline justify-between gap-3">
                <span>{scrapValuation.formattedConColaValue}</span>
                <span className="text-base sm:text-lg font-bold font-mono text-amber-700 shrink-0">
                  {scrapValuation.conColaPcs.toLocaleString()} <span className="text-xs sm:text-sm font-semibold text-amber-600">PCS</span>
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[11px] font-mono text-slate-500 flex items-center justify-between">
              <span>Valued with unit prices</span>
              <span className="font-bold text-amber-700 text-xs sm:text-sm font-mono">{scrapValuation.conColaPcs.toLocaleString()} PCS TOTAL</span>
            </div>
          </div>

          {/* Card 3: SIN COLA Volume & Value */}
          <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                SIN COLA
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 mt-1 flex items-baseline justify-between gap-3">
                <span>{scrapValuation.formattedSinColaValue}</span>
                <span className="text-base sm:text-lg font-bold font-mono text-slate-700 shrink-0">
                  {scrapValuation.sinColaPcs.toLocaleString()} <span className="text-xs sm:text-sm font-semibold text-slate-500">PCS</span>
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>Valued with unit prices</span>
              <span className="font-bold text-slate-700 text-xs sm:text-sm font-mono">{scrapValuation.sinColaPcs.toLocaleString()} PCS TOTAL</span>
            </div>
          </div>
        </div>

        {/* Missing Price Notice (if any) */}
        {scrapValuation.missingPriceCount > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2 font-mono">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Note:</strong> {scrapValuation.missingPriceCount} reference(s) ({scrapValuation.missingPriceRefs.join(", ")}) do not have a unit price configured in the price catalog. Their quantity is tracked but monetary value is omitted.
            </span>
          </div>
        )}

        {/* VIEW 1: BREAKDOWN BY REFERENCE */}
        {scrapViewMode === "reference" && (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 text-[11px] uppercase font-mono font-bold tracking-wider">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-3 text-right">CON COLA</th>
                  <th className="py-3 px-3 text-right">SIN COLA</th>
                  <th className="py-3 px-4 text-right">Total (PCS)</th>
                  <th className="py-3 px-4 text-right">Unit Price (€)</th>
                  <th className="py-3 px-4 text-right font-black text-slate-900">Total Value (€)</th>
                  <th className="py-3 px-4">Invoice(s)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono">
                {referenceBreakdownWithDetails.length > 0 ? (
                  referenceBreakdownWithDetails.map((item) => (
                    <tr key={item.reference} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {item.reference}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-600 truncate max-w-xs">
                        {item.description || "—"}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-800 whitespace-nowrap">
                        {item.conColaPcs > 0 ? `${item.conColaPcs.toLocaleString()} pcs` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600 whitespace-nowrap">
                        {item.sinColaPcs > 0 ? `${item.sinColaPcs.toLocaleString()} pcs` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {item.totalPcs.toLocaleString()} PCS
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 whitespace-nowrap">
                        {item.hasPrice ? `€ ${item.unitPrice?.toFixed(2)}` : <span className="text-amber-600 italic">No price</span>}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {item.hasPrice ? `€ ${item.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.invoices.length > 0 ? (
                            item.invoices.map((inv) => (
                              <span
                                key={inv}
                                onClick={() => setScrapInvoiceFilter(inv)}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold border border-slate-200/80 cursor-pointer transition-colors"
                                title={`Click to filter by invoice ${inv}`}
                              >
                                {inv}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-sans text-xs">
                      No scrap recorded for the selected period {scrapInvoiceFilter !== "all" ? `and Invoice ${scrapInvoiceFilter}` : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
              {referenceBreakdownWithDetails.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-mono font-black text-slate-900">
                    <td className="py-3.5 px-4" colSpan={2}>
                      TOTAL SCRAP EVALUATION
                    </td>
                    <td className="py-3.5 px-3 text-right text-amber-900 font-bold">
                      {scrapValuation.conColaPcs.toLocaleString()} pcs
                    </td>
                    <td className="py-3.5 px-3 text-right text-slate-700 font-bold">
                      {scrapValuation.sinColaPcs.toLocaleString()} pcs
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-900 font-black">
                      {scrapValuation.totalScrapPcs.toLocaleString()} PCS
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 font-normal">
                      —
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-600 text-sm font-black">
                      {scrapValuation.formattedTotalValue}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-normal">
                      {scrapValuation.breakdown.length} references
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* VIEW 2: BREAKDOWN GROUPED BY INVOICE */}
        {scrapViewMode === "invoice" && (
          <div className="space-y-3">
            {invoiceGroups.length > 0 ? (
              invoiceGroups.map((group) => (
                <div
                  key={group.invoiceNumber}
                  className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg font-mono font-black text-xs">
                        {group.invoiceNumber}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {group.items.length} {group.items.length === 1 ? "reference" : "references"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-xs font-mono font-bold text-slate-600">
                        {group.totalPcs.toLocaleString()} PCS (CON: {group.conColaPcs} / SIN: {group.sinColaPcs})
                      </span>
                      <span className="text-sm sm:text-base font-mono font-black text-rose-600">
                        € {group.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {group.items.map((it) => (
                      <div
                        key={it.reference}
                        className="p-2.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between text-xs font-mono shadow-2xs"
                      >
                        <div className="min-w-0 mr-2">
                          <div className="font-bold text-slate-900 truncate">{it.reference}</div>
                          <div className="text-[10px] text-slate-400 truncate">{it.description || "—"}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-slate-700">{it.pcs} PCS</div>
                          <div className="text-[11px] font-extrabold text-slate-900">
                            {it.unitPrice ? `€ ${it.totalValue.toFixed(2)}` : "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs font-mono bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No invoices found with scrap for the selected filter.
              </div>
            )}
          </div>
        )}

      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="dashboard-charts-grid">
        
        {/* Chart 1 */}
        <div className="bg-white p-6 border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
              Stock Stage Distribution
            </h3>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "16px", border: "none", color: "#fff", fontFamily: "monospace", fontSize: "11px", padding: "12px" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Bar dataKey="Stock 1 (Raw)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Stock 2 (Glued)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Stock 3 (Wheels)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2 */}
        <div className="bg-white p-6 border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
              7-Day Activity Flow
            </h3>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTransfers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDeliveries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "16px", border: "none", color: "#fff", fontFamily: "monospace", fontSize: "11px", padding: "12px" }}
                />
                <Area type="monotone" dataKey="Transfers" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTransfers)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="Deliveries" stroke="#9333ea" fillOpacity={1} fill="url(#colorDeliveries)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* QUICK ACTION MODAL DIALOG */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6">
          <div className={`bg-white border border-slate-100 rounded-3xl shadow-2xl ${activeModal === "incoming" ? "w-full max-w-xl sm:max-w-2xl" : "w-full max-w-md sm:max-w-lg"} p-4 sm:p-6 animate-fadeIn max-h-[92vh] overflow-y-auto`}>
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">
                  {activeModal === "incoming" && "🚛"}
                  {activeModal === "mallas" && "🔵"}
                  {activeModal === "production" && "🟢"}
                  {activeModal === "precosido" && "📦"}
                  {activeModal === "villanova" && "🚚"}
                  {activeModal === "remove" && "🗑️"}
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {activeModal === "incoming" && "Incoming Receipt (Stock IN)"}
                    {activeModal === "mallas" && "Transfer to Gluing (Stock 1 → 2)"}
                    {activeModal === "production" && "Assembly Output (Stock 2 → 3)"}
                    {activeModal === "precosido" && "Precosido Dispatch (Stock 2 OUT)"}
                    {activeModal === "villanova" && "Steering Wheels Delivery (Stock 3 OUT)"}
                    {activeModal === "remove" && "Remove / Deduct Stock"}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div className={`p-3 text-xs font-semibold rounded-2xl mb-4 ${
                modalFeedback.type === "success" 
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200" 
                  : "bg-rose-50 text-rose-900 border border-rose-200"
              }`}>
                {modalFeedback.message}
              </div>
            )}

            <form onSubmit={handleExecuteQuickAction} className="space-y-4 text-xs">
              {/* Single Reference Selection for non-incoming operations */}
              {activeModal !== "incoming" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Reference <span className="text-rose-500">*</span>
                  </label>
                  <CustomReferenceSelect
                    references={references}
                    value={modalRef}
                    onChange={(code) => setModalRef(code)}
                    placeholder="Select reference..."
                    required
                  />
                  {selectedModalRef && (
                    <div className="mt-2 flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] font-mono">
                      <span className="text-slate-600 font-medium truncate max-w-[150px]">
                        {selectedModalRef.description || selectedModalRef.code}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">
                          S1: <strong className="text-blue-600">{selectedModalRef.stock1 || 0}</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600">
                          S2: <strong className="text-amber-600">{selectedModalRef.stock2 || 0}</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600">
                          S3: <strong className="text-emerald-600">{selectedModalRef.stock3 || 0}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SPECIFIC FIELDS PER ACTION TYPE */}

              {/* 1. INCOMING: Destination Stock, Invoice Number & Multi-Reference List */}
              {activeModal === "incoming" && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Destination Stock <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                      {(["Stock 1", "Stock 2", "Stock 3"] as const).map((stk) => (
                        <button
                          key={stk}
                          type="button"
                          onClick={() => setIncomingDestStock(stk)}
                          className={`py-2 px-1.5 sm:px-2.5 rounded-2xl border text-[11px] sm:text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                            incomingDestStock === stk
                              ? "bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <span className="tracking-wide font-extrabold">{stk.toUpperCase()}</span>
                          <span className="text-[8px] sm:text-[9px] font-normal text-slate-500 mt-0.5 truncate max-w-full">
                            {stk === "Stock 1" ? "Warehouse Raw" : stk === "Stock 2" ? "Gluing WIP" : "Finished Wheels"}
                          </span>
                        </button>
                      ))}
                    </div>
                    {incomingDestStock === "Stock 2" && (
                      <div className="mt-2.5 p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl">
                        <label className="block text-slate-700 font-bold text-xs mb-1.5">
                          Target Stock 2 Subtype <span className="text-rose-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setModalStock2Subtype("normal")}
                            className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                              modalStock2Subtype === "normal"
                                ? "bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 font-black shadow-xs"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <span>NORMAL STOCK</span>
                            <span className="text-[9px] font-normal text-slate-500 mt-0.5">Regular WIP</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setModalStock2Subtype("disassembly")}
                            className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                              modalStock2Subtype === "disassembly"
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

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Invoice / Delivery Note Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A905220309"
                      value={modalInvoiceNumber}
                      onChange={(e) => setModalInvoiceNumber(e.target.value.toUpperCase())}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-mono font-bold text-slate-900 uppercase tracking-wider"
                      required
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-700 font-bold">
                        References in this Invoice <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleAddIncomingItem}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-mono text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Reference</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {incomingItems.map((item, idx) => (
                        <div key={item.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                            <div className="flex-1 min-w-0 w-full">
                              <CustomReferenceSelect
                                references={references}
                                value={item.reference}
                                onChange={(code) => handleUpdateIncomingItem(item.id, "reference", code)}
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
                                onChange={(e) => handleUpdateIncomingItem(item.id, "quantity", e.target.value)}
                                className="w-full sm:w-32 p-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-mono font-bold text-slate-900 text-xs shadow-2xs"
                                required
                              />
                              {incomingItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveIncomingItem(item.id)}
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

                    {incomingTotalQty > 0 && (
                      <div className="text-[11px] text-slate-600 font-mono text-right font-bold pt-0.5">
                        Total: {incomingTotalQty} PCS across {incomingItems.length} reference{incomingItems.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* MALLAS PEGADAS: Destination in Stock 2 */}
              {activeModal === "mallas" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">
                    Destination in Stock 2 <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModalStock2Subtype("normal")}
                      className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                        modalStock2Subtype === "normal"
                          ? "bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>NORMAL STOCK 2</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalStock2Subtype("disassembly")}
                      className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                        modalStock2Subtype === "disassembly"
                          ? "bg-purple-100 border-purple-500 text-purple-900 ring-2 ring-purple-500/20 shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>DISASSEMBLY STOCK 2</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 2. PRODUCTION: Shift selection & Stock 2 Subtype source */}
              {activeModal === "production" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">
                      Deduct from Stock 2 Subtype <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        const dis = selectedModalRef?.stock2Disassembly || 0;
                        const norm = selectedModalRef ? (selectedModalRef.stock2Normal !== undefined ? selectedModalRef.stock2Normal : Math.max(0, (selectedModalRef.stock2 || 0) - dis)) : 0;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => setModalStock2Subtype("normal")}
                              className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                                modalStock2Subtype === "normal"
                                  ? "bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 shadow-xs"
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <div>NORMAL STOCK 2</div>
                              <div className="text-[10px] font-normal text-slate-500 mt-0.5">{norm.toLocaleString()} PCS avail</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setModalStock2Subtype("disassembly")}
                              className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                                modalStock2Subtype === "disassembly"
                                  ? "bg-purple-100 border-purple-500 text-purple-900 ring-2 ring-purple-500/20 shadow-xs"
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <div>DISASSEMBLY STOCK 2</div>
                              <div className="text-[10px] font-normal text-slate-500 mt-0.5">{dis.toLocaleString()} PCS avail</div>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">
                      Production Shift
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {["Shift A", "Shift B"].map((sh) => (
                        <button
                          key={sh}
                          type="button"
                          onClick={() => setModalShiftOrLine(sh)}
                          className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                            modalShiftOrLine === sh
                              ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {sh}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. PRECOSIDO: Deduct Subtype & Invoice Number */}
              {activeModal === "precosido" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">
                      Deduct from Stock 2 Subtype <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        const dis = selectedModalRef?.stock2Disassembly || 0;
                        const norm = selectedModalRef ? (selectedModalRef.stock2Normal !== undefined ? selectedModalRef.stock2Normal : Math.max(0, (selectedModalRef.stock2 || 0) - dis)) : 0;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => setModalStock2Subtype("normal")}
                              className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                                modalStock2Subtype === "normal"
                                  ? "bg-rose-100 border-rose-500 text-rose-900 ring-2 ring-rose-500/20 shadow-xs"
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <div>NORMAL STOCK 2</div>
                              <div className="text-[10px] font-normal text-slate-500 mt-0.5">{norm.toLocaleString()} PCS avail</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setModalStock2Subtype("disassembly")}
                              className={`py-2 px-3 rounded-2xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                                modalStock2Subtype === "disassembly"
                                  ? "bg-purple-100 border-purple-500 text-purple-900 ring-2 ring-purple-500/20 shadow-xs"
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <div>DISASSEMBLY STOCK 2</div>
                              <div className="text-[10px] font-normal text-slate-500 mt-0.5">{dis.toLocaleString()} PCS avail</div>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">
                      Precosido Invoice / Dispatch Note <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PREC-2026-001"
                      value={modalInvoiceNumber}
                      onChange={(e) => setModalInvoiceNumber(e.target.value.toUpperCase())}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-rose-500 font-mono font-bold text-slate-900 uppercase tracking-wider"
                      required
                    />
                  </div>
                </div>
              )}

              {/* 4. DELIVERY / VILLANOVA: Invoice Number & Destination */}
              {activeModal === "villanova" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Invoice Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MPT2325"
                      value={modalInvoiceNumber}
                      onChange={(e) => setModalInvoiceNumber(e.target.value.toUpperCase())}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-purple-500 font-mono font-bold text-slate-900 uppercase tracking-wider"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Destination Customer
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Villanova"
                      value={modalDestination}
                      onChange={(e) => setModalDestination(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-purple-500 font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}

              {/* 5. REMOVE: Stock Stage & Reason */}
              {activeModal === "remove" && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Stock Stage to Deduct From <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["stock1", "stock2", "stock3"] as const).map((stage) => {
                        const label = stage === "stock1" ? "Stock 1" : stage === "stock2" ? "Stock 2" : "Stock 3";
                        const avail = stage === "stock1" ? selectedModalRef?.stock1 || 0 : stage === "stock2" ? selectedModalRef?.stock2 || 0 : selectedModalRef?.stock3 || 0;
                        return (
                          <button
                            key={stage}
                            type="button"
                            onClick={() => setRemoveStockStage(stage)}
                            className={`py-2 px-2 rounded-2xl border text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                              removeStockStage === stage
                                ? "bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 shadow-xs"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <span>{label}</span>
                            <span className="text-[10px] font-normal text-slate-500 mt-0.5">Avail: {avail}</span>
                          </button>
                        );
                      })}
                    </div>
                    {removeStockStage === "stock2" && (
                      <div className="mt-2.5 p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl">
                        <label className="block text-slate-700 font-bold mb-1 text-xs">
                          Deduct from Stock 2 Subtype <span className="text-rose-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(() => {
                            const dis = selectedModalRef?.stock2Disassembly || 0;
                            const norm = selectedModalRef ? (selectedModalRef.stock2Normal !== undefined ? selectedModalRef.stock2Normal : Math.max(0, (selectedModalRef.stock2 || 0) - dis)) : 0;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setModalStock2Subtype("normal")}
                                  className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                                    modalStock2Subtype === "normal"
                                      ? "bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 font-black shadow-xs"
                                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  <div>NORMAL STOCK 2</div>
                                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">{norm.toLocaleString()} PCS</div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalStock2Subtype("disassembly")}
                                  className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                                    modalStock2Subtype === "disassembly"
                                      ? "bg-purple-100 border-purple-500 text-purple-900 ring-2 ring-purple-500/20 font-black shadow-xs"
                                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  <div>DISASSEMBLY STOCK 2</div>
                                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">{dis.toLocaleString()} PCS</div>
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Reason for Removal
                    </label>
                    <CustomSelect
                      value={modalReasonType}
                      onChange={(val: any) => setModalReasonType(val)}
                      options={[
                        { value: "Correction of input error", label: "Correction of input error" },
                        { value: "Physical Count Discrepancy", label: "Physical Count Discrepancy" },
                        { value: "Damaged / Defective Goods", label: "Damaged / Defective Goods" },
                        { value: "Scrapped during handling", label: "Scrapped during handling" },
                        { value: "Other", label: "Other" }
                      ]}
                    />
                  </div>
                </>
              )}

              {/* Single Quantity input for non-incoming modals */}
              {activeModal !== "incoming" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Quantity (PCS) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty..."
                    value={modalQty}
                    onChange={(e) => setModalQty(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-mono font-bold text-slate-900"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Additional notes..."
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer font-mono text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className={`w-full sm:w-auto px-5 py-2.5 text-white rounded-2xl font-bold cursor-pointer transition-all disabled:opacity-50 shadow-md font-mono text-center ${
                    activeModal === "incoming" ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" :
                    activeModal === "mallas" ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20" :
                    activeModal === "production" ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" :
                    activeModal === "precosido" ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20" :
                    activeModal === "villanova" ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20" :
                    "bg-slate-800 hover:bg-slate-900 shadow-slate-700/20"
                  }`}
                >
                  {modalSubmitting ? "Processing..." : activeModal === "incoming" ? `Confirm Invoice (${incomingTotalQty} PCS)` : "Confirm"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Global Low Stock Alert Modal */}
      <LowStockAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        references={references}
      />

      {/* INCOMING RECEPTION CHOICE MODAL (RAW MATERIAL vs RETURN ZDF) */}
      {isIncomingChoiceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg p-5 sm:p-6 animate-fadeIn">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Incoming Truck Reception
                  </h3>
                  <p className="text-xs text-slate-400">
                    Select incoming shipment type
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIncomingChoiceOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Option 1: RAW MATERIAL */}
              <button
                type="button"
                onClick={() => {
                  setIsIncomingChoiceOpen(false);
                  openModal("incoming");
                }}
                className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-500 bg-white hover:bg-blue-50/40 transition-all text-left flex items-start gap-3.5 group cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Package className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                      RAW MATERIAL
                    </h4>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      Standard Meshes
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Normal invoice reference reception for meshes (Stock 1, Stock 2, or Stock 3).
                  </p>
                </div>
              </button>

              {/* Option 2: RETURN ZDF */}
              <div className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        RETURN ZDF
                      </h4>
                      <p className="text-xs text-slate-500">
                        ZF Lifetec return container / proforma shipment
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* RED CAGE -> S3 */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsIncomingChoiceOpen(false);
                      setReturnZdfCategory("RED_CAGE");
                      setIsReturnZdfOpen(true);
                    }}
                    className="p-3.5 rounded-xl border-2 border-rose-200 hover:border-rose-500 bg-rose-50/70 hover:bg-rose-100/80 text-left transition-all cursor-pointer group shadow-2xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-black text-rose-800 bg-rose-200 px-2 py-0.5 rounded-full">
                        Stock 3
                      </span>
                      <span className="text-xs font-bold text-rose-600 group-hover:translate-x-0.5 transition-transform">→</span>
                    </div>
                    <div className="text-xs font-black text-rose-900">RED CAGE</div>
                    <div className="text-[10px] text-rose-700/90 mt-0.5">Upload PDF → Add to S3</div>
                  </button>

                  {/* PRECOSIDO -> S2 */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsIncomingChoiceOpen(false);
                      setReturnZdfCategory("PRECOSIDO");
                      setIsReturnZdfOpen(true);
                    }}
                    className="p-3.5 rounded-xl border-2 border-teal-200 hover:border-teal-500 bg-teal-50/70 hover:bg-teal-100/80 text-left transition-all cursor-pointer group shadow-2xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-black text-teal-800 bg-teal-200 px-2 py-0.5 rounded-full">
                        Stock 2
                      </span>
                      <span className="text-xs font-bold text-teal-600 group-hover:translate-x-0.5 transition-transform">→</span>
                    </div>
                    <div className="text-xs font-black text-teal-900">PRECOSIDO</div>
                    <div className="text-[10px] text-teal-700/90 mt-0.5">Upload PDF → Add to S2</div>
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* RETURN ZDF MODAL */}
      {isReturnZdfOpen && (
        <ReturnZdfModal
          isOpen={isReturnZdfOpen}
          onClose={() => {
            setIsReturnZdfOpen(false);
            setReturnZdfCategory(null);
          }}
          references={references}
          currentUser={currentUser || null}
          initialCategory={returnZdfCategory}
        />
      )}

    </div>
  );
}
