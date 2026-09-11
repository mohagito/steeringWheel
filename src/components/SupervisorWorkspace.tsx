import React, { useState, useMemo } from "react";
import { Box, Adjustment, Delivery, Production, ScrapEntry, InventoryTransaction, User, ReceivingInvoice, Reference } from "../types";
import { CustomSelect } from "./CustomSelect";
import { LowStockAlertModal } from "./LowStockAlertModal";
import { 
  Check, X, FileText, Search, TrendingDown, TrendingUp, Calendar, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, AlertCircle, Activity, Clock, Layers, Truck, Factory, ShieldAlert, MoreVertical,
  Eye, RotateCcw, Package, ArrowRightLeft, Undo2, Hash, UserCheck, ShieldCheck
} from "lucide-react";

interface SupervisorWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  deliveries: Delivery[];
  productions: Production[];
  transactions: InventoryTransaction[];
  scraps: ScrapEntry[];
  invoices?: ReceivingInvoice[];
  references?: Reference[];
  currentUser: User;
  onApproveAdjustment: (adjustmentId: string) => Promise<void>;
  onRejectAdjustment: (adjustmentId: string) => Promise<void>;
  onEditOperation?: (opId: string, category: string, newQty: number, reason: string) => Promise<void>;
  onReverseOperation?: (opId: string, category: string, reason: string) => Promise<void>;
  onDeleteOperation?: (opId: string, category: string, reason: string) => Promise<void>;
}

// Unified Operational Record Interface
export interface UnifiedOperation {
  id: string;
  rawId: string;
  timestamp: string;
  type: string;
  category: "invoice" | "delivery" | "production" | "scrap" | "transfer" | "return" | "adjustment" | "admin" | "transaction";
  reference: string;
  quantity: number;
  operator: string;
  affectedStock: string;
  details: string;
  status: string;
  invoiceNumber?: string;
  customer?: string;
  batchItems?: Array<{
    id?: string;
    reference: string;
    description?: string;
    materialType?: string;
    quantity: number;
    expectedQty?: number;
    boxBarcode?: string;
    barcode?: string;
    difference?: number;
    scannedAt?: string;
    destinationStock?: "Stock 1" | "Stock 3";
  }>;
  rawInvoice?: ReceivingInvoice;
  rawDelivery?: Delivery;
  rawProduction?: Production;
  rawScrap?: ScrapEntry;
  rawAdjustment?: Adjustment;
  rawTransaction?: InventoryTransaction;
  changeHistory?: Array<{ action: string; oldQty: number; newQty: number; modifiedBy: string; timestamp: number | string; reason: string }>;
}

export const formatExactTimestamp = (ts?: string | number) => {
  if (!ts) return "N/A";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

export default function SupervisorWorkspace({
  boxes,
  adjustments,
  deliveries,
  productions,
  transactions,
  scraps,
  invoices = [],
  references = [],
  currentUser,
  onApproveAdjustment,
  onRejectAdjustment,
  onEditOperation,
  onReverseOperation,
  onDeleteOperation
}: SupervisorWorkspaceProps) {
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  // Operation management states
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeOp, setActiveOp] = useState<UnifiedOperation | null>(null);
  const [deleteMode, setDeleteMode] = useState<"delete" | "reverse">("delete");
  const [detailOp, setDetailOp] = useState<UnifiedOperation | null>(null);
  const [editOp, setEditOp] = useState<UnifiedOperation | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [deleteOp, setDeleteOp] = useState<UnifiedOperation | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpenMenu = (e: React.MouseEvent<HTMLButtonElement>, op: UnifiedOperation) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;

    let fixedTop = rect.bottom;
    let fixedLeft = rect.left;

    if (spaceBelow < menuHeight && rect.top > menuHeight) {
      fixedTop = rect.top - menuHeight - 8;
    } else {
      fixedTop = rect.bottom + 8;
    }

    if (spaceRight < menuWidth && rect.right > menuWidth) {
      fixedLeft = rect.right - menuWidth;
    }

    setMenuPosition({
      top: fixedTop,
      left: fixedLeft
    });
    setActionMenuOpenId(op.id);
    setActiveOp(op);
  };

  const handleExecuteEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOp || !onEditOperation) return;
    const qtyNum = Number(editQty);
    if (isNaN(qtyNum) || qtyNum < 0) {
      setActionError("Please enter a valid non-negative quantity.");
      return;
    }
    if (!editReason || editReason.trim() === "") {
      setActionError("A reason for correction is required.");
      return;
    }
    try {
      setActionLoading(true);
      setActionError(null);
      await onEditOperation(editOp.rawId, editOp.category, qtyNum, editReason);
      setEditOp(null);
      setEditQty("");
      setEditReason("");
    } catch (err: any) {
      setActionError(err.message || "Failed to update operation.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteOp) return;
    if (!deleteReason || deleteReason.trim() === "") {
      setActionError("A reason for deletion or reversal is required.");
      return;
    }
    try {
      setActionLoading(true);
      setActionError(null);
      if (deleteMode === "reverse" && onReverseOperation) {
        await onReverseOperation(deleteOp.rawId, deleteOp.category, deleteReason);
      } else if (onDeleteOperation) {
        await onDeleteOperation(deleteOp.rawId, deleteOp.category, deleteReason);
      }
      setDeleteOp(null);
      setDeleteReason("");
    } catch (err: any) {
      setActionError(err.message || "Failed to process operation.");
    } finally {
      setActionLoading(false);
    }
  };

  // Unified All Inventory Operations List (1 Real Operation = 1 Record)
  const [operationsTypeFilter, setOperationsTypeFilter] = useState<string>("all");
  const [operationsSearch, setOperationsSearch] = useState<string>("");

  const allOperations = useMemo<UnifiedOperation[]>(() => {
    const list: UnifiedOperation[] = [];
    const processedKeys = new Set<string>();

    // 1. Receiving Invoices (Stock 1 Receiving Sessions)
    invoices.forEach(inv => {
      const invKey = `inv-${inv.id || inv.invoiceNumber}`;
      if (processedKeys.has(invKey)) return;
      processedKeys.add(invKey);

      const items = inv.items || [];
      const uniqueRefs = Array.from(new Set(items.map(i => i.reference))).filter(Boolean);
      const refDisplay = uniqueRefs.length > 1 
        ? `${uniqueRefs.length} Refs (${uniqueRefs.slice(0, 3).join(", ")}${uniqueRefs.length > 3 ? "..." : ""})`
        : (uniqueRefs[0] || "General Mesh");

      const commitTime = inv.approvedAt || inv.createdAt;
      const totalQty = inv.totalQuantity || items.reduce((s, it) => s + (it.quantity || 0), 0);

      const hasS1 = items.some(it => it.destinationStock !== "Stock 3");
      const hasS3 = items.some(it => it.destinationStock === "Stock 3");
      const affectedStock = hasS1 && hasS3 
        ? "Stock 1 & Stock 3" 
        : hasS3 
          ? "Stock 3 (Finished Goods)" 
          : "Stock 1 (Warehouse)";
      const stockTypeTag = hasS1 && hasS3 ? "S1/S3 IN" : hasS3 ? "S3 IN" : "S1 IN";

      list.push({
        id: `inv-${inv.id}`,
        rawId: inv.id,
        timestamp: commitTime,
        type: inv.status === "approved" 
          ? stockTypeTag 
          : inv.status === "cancelled" 
            ? `${stockTypeTag} (CANCELLED)` 
            : `${stockTypeTag} (PENDING)`,
        category: "invoice",
        reference: refDisplay,
        quantity: totalQty,
        operator: inv.approvedBy ? `${inv.operator} (Approved by ${inv.approvedBy})` : inv.operator,
        affectedStock,
        details: `Invoice #${inv.invoiceNumber} • ${inv.totalBoxes || items.length} box(es) • ${totalQty} PCS${hasS1 && hasS3 ? ' (Mixed S1+S3)' : ''}`,
        status: inv.status === "approved" ? "approved" : inv.status === "cancelled" ? "deleted" : "pending",
        invoiceNumber: inv.invoiceNumber,
        batchItems: items,
        rawInvoice: inv
      });
    });

    // 2. Customer Deliveries & Dispatches (Stock 2 / Stock 3 OUT)
    deliveries.forEach(del => {
      const delKey = `del-${del.id}`;
      if (processedKeys.has(delKey)) return;
      processedKeys.add(delKey);

      const isPrecosido = del.deliveryType === "PRECOSIDO";
      const affectedStock = isPrecosido ? "Stock 2 (WIP)" : "Stock 3 (Finished Goods)";
      const typeLabel = isPrecosido ? "S2 OUT" : "S3 OUT";

      list.push({
        id: `del-${del.id}`,
        rawId: del.id,
        timestamp: del.timestamp,
        type: typeLabel,
        category: "delivery",
        reference: del.reference,
        quantity: del.quantity,
        operator: del.operatorName,
        affectedStock,
        details: `${isPrecosido ? 'Precosido' : 'Delivery SW'} • Inv: ${del.invoiceNumber} • Dest: ${del.customer}${del.notes ? ` • ${del.notes}` : ''}`,
        status: del.status || "approved",
        invoiceNumber: del.invoiceNumber,
        customer: del.customer,
        rawDelivery: del,
        changeHistory: del.changeHistory
      });
    });

    // 3. Daily Production Completions (Stock 2 WIP → Stock 3 Finished)
    productions.forEach(prod => {
      const prodKey = `prod-${prod.id}`;
      if (processedKeys.has(prodKey)) return;
      processedKeys.add(prodKey);

      list.push({
        id: `prod-${prod.id}`,
        rawId: prod.id,
        timestamp: prod.timestamp,
        type: "S2 => S3",
        category: "production",
        reference: prod.reference,
        quantity: prod.quantity,
        operator: prod.operatorName,
        affectedStock: "Stock 2 → Stock 3",
        details: `Production Date: ${prod.date}${prod.notes ? ` • ${prod.notes}` : ''}`,
        status: prod.status || "approved",
        rawProduction: prod,
        changeHistory: prod.changeHistory
      });
    });

    // 4. Scrap / NOK Discards
    scraps.forEach(scrap => {
      const scrapKey = `scrap-${scrap.id}`;
      if (processedKeys.has(scrapKey)) return;
      processedKeys.add(scrapKey);

      const affectedStock = scrap.stockDeductedFrom || (scrap.condition === "CON COLA" ? "Stock 3" : "Stock 2");
      const typeLabel = affectedStock === "Stock 1" ? "S1 OUT" : (affectedStock === "Stock 3" ? "S3 OUT" : "S2 OUT");

      list.push({
        id: `scrap-${scrap.id}`,
        rawId: scrap.id,
        timestamp: scrap.timestamp,
        type: typeLabel,
        category: "scrap",
        reference: scrap.reference,
        quantity: scrap.quantity,
        operator: scrap.supervisorName || "Supervisor",
        affectedStock,
        details: `Scrap NOK • ${scrap.invoiceNumber ? `Inv: ${scrap.invoiceNumber} • ` : ''}${scrap.notes || "Verified by supervisor"}`,
        status: scrap.status || "approved",
        invoiceNumber: scrap.invoiceNumber,
        rawScrap: scrap,
        changeHistory: scrap.changeHistory
      });
    });

    // 5. Generic / Batch Transactions (Pegadas Transfers, Returns, Admin Reversals)
    const approvedInvoiceNumbers = new Set(invoices.filter(i => i.status === "approved").map(i => i.invoiceNumber));

    // Group batch Pegadas transfers (transactions occurring together with TRANSFER S1->S2)
    const pegadasBatches: { [batchKey: string]: InventoryTransaction[] } = {};
    const standaloneTransactions: InventoryTransaction[] = [];

    transactions.forEach(tx => {
      // Eliminate duplicate transactions that were spawned by Delivery, Production, Scrap, Invoice, or Adjustment writes
      if (tx.movementType === "DELIVERY" || tx.id.startsWith("trans-del-del-")) {
        return;
      }
      if (tx.movementType === "STOCK 2 OUT / STOCK 3 IN" || tx.id.startsWith("trans-del-prod-") || tx.id.startsWith("trans-edit-prod-")) {
        return;
      }
      if (tx.movementType?.startsWith("SCRAP") || tx.id.startsWith("trans-del-scrap-") || tx.id.startsWith("trans-edit-scrap-")) {
        return;
      }
      if (tx.movementType === "STOCK 1 IN" || tx.id.startsWith("trans-s1in-") || tx.id.startsWith("trans-s3in-") || (tx.movementType === "STOCK 3 IN" && tx.invoiceNumber)) {
        return;
      }
      if (tx.notes?.includes("Invoice") && Array.from(approvedInvoiceNumbers).some(invNum => invNum && tx.notes?.includes(invNum))) {
        return;
      }
      if (tx.id.startsWith("trans-del-") && tx.notes?.includes("reversal") && adjustments.some(a => a.reference === tx.reference)) {
        return;
      }

      // Check if it is a Pegadas transfer (TRANSFER S1->S2 or TRANSFER)
      if (tx.movementType === "TRANSFER S1->S2" || tx.movementType === "TRANSFER") {
        const batchKey = `${tx.operatorName}_${tx.timestamp.slice(0, 16)}_${tx.movementType}`;
        if (!pegadasBatches[batchKey]) {
          pegadasBatches[batchKey] = [];
        }
        pegadasBatches[batchKey].push(tx);
      } else {
        standaloneTransactions.push(tx);
      }
    });

    // Add consolidated Pegadas Transfer Batches
    Object.entries(pegadasBatches).forEach(([batchKey, items]) => {
      if (items.length === 0) return;
      const first = items[0];
      const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const uniqueRefs = Array.from(new Set(items.map(i => i.reference))).filter(Boolean);
      const refDisplay = uniqueRefs.length > 1
        ? `${uniqueRefs.length} Refs (${uniqueRefs.slice(0, 3).join(", ")}${uniqueRefs.length > 3 ? "..." : ""})`
        : (uniqueRefs[0] || "Mesh Transfer");

      const batchItems = items.map((it, idx) => ({
        id: it.id || `trf-item-${idx}`,
        reference: it.reference,
        quantity: it.quantity,
        scannedAt: it.timestamp,
        materialType: "Mesh"
      }));

      list.push({
        id: `batch-trf-${first.id}`,
        rawId: first.id,
        timestamp: first.timestamp,
        type: "S1 => S2",
        category: "transfer",
        reference: refDisplay,
        quantity: totalQty,
        operator: first.operatorName,
        affectedStock: "Stock 1 → Stock 2 (WIP)",
        details: `Pegadas Transfer • ${items.length} item(s) • ${totalQty} PCS moved to S2`,
        status: "approved",
        batchItems,
        rawTransaction: first
      });
    });

    // Add remaining standalone transactions
    standaloneTransactions.forEach(tx => {
      const isReturn = tx.movementType === "RETURN S2->S1" || tx.movementType?.includes("RETURN");
      const isReversal = tx.notes?.toLowerCase().includes("reversal") || tx.operatorName?.includes("Reversal") || tx.movementType?.includes("REMOVED");

      let category: UnifiedOperation["category"] = "transaction";
      let typeLabel: string = tx.movementType;
      let affectedStock = tx.stock || "Stock Balances";

      if (isReturn) {
        category = "return";
        typeLabel = "S1 RETURN";
        affectedStock = "Stock 2 → Stock 1";
      } else if (tx.movementType === "STOCK 1 IN") {
        category = "invoice";
        typeLabel = "S1 IN";
        affectedStock = "Stock 1 (Warehouse)";
      } else if (isReversal) {
        category = "admin";
        if (tx.notes?.toLowerCase().includes("invoice") || tx.movementType?.includes("INVOICE")) {
          typeLabel = "DELETED INVOICE";
        } else if (tx.notes?.toLowerCase().includes("delivery") || tx.movementType?.includes("DELIVERY")) {
          typeLabel = "CANCELLED DELIVERY";
        } else if (tx.notes?.toLowerCase().includes("production") || tx.movementType?.includes("PRODUCTION")) {
          typeLabel = "CANCELLED PROD";
        } else if (tx.notes?.toLowerCase().includes("scrap") || tx.movementType?.includes("SCRAP")) {
          typeLabel = "CANCELLED SCRAP";
        } else {
          typeLabel = "DELETED / REVERSED";
        }
      } else if (tx.movementType?.startsWith("REFERENCE_")) {
        category = "admin";
        typeLabel = "CATALOG CHANGE";
      }

      list.push({
        id: `tx-${tx.id}`,
        rawId: tx.id,
        timestamp: tx.timestamp,
        type: typeLabel,
        category,
        reference: tx.reference || "System",
        quantity: tx.quantity || 0,
        operator: tx.operatorName,
        affectedStock,
        details: `${tx.stock ? `${tx.stock} • ` : ''}${tx.notes || "System inventory movement"}`,
        status: isReversal ? "reversed" : "approved",
        rawTransaction: tx
      });
    });

    // Sort strictly descending by exact timestamp
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return list;
  }, [invoices, deliveries, productions, scraps, adjustments, transactions]);

  const filteredOperations = useMemo(() => {
    return allOperations.filter(op => {
      const matchesSearch = 
        op.reference.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        op.operator.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        op.type.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        op.details.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        (op.invoiceNumber && op.invoiceNumber.toLowerCase().includes(operationsSearch.toLowerCase())) ||
        (op.customer && op.customer.toLowerCase().includes(operationsSearch.toLowerCase()));

      const matchesType = 
        operationsTypeFilter === "all" ||
        (operationsTypeFilter === "S1 IN" && op.type.startsWith("S1 IN")) ||
        (operationsTypeFilter === "S1 => S2" && op.type === "S1 => S2") ||
        (operationsTypeFilter === "S2 => S3" && op.type === "S2 => S3") ||
        (operationsTypeFilter === "S2 OUT" && op.type === "S2 OUT") ||
        (operationsTypeFilter === "S3 OUT" && op.type === "S3 OUT") ||
        (operationsTypeFilter === "S1 RETURN" && op.type === "S1 RETURN") ||
        (operationsTypeFilter === "DELETED" && (op.type.includes("DELETED") || op.type.includes("CANCELLED") || op.category === "admin" || op.type === "REVERSAL"));

      return matchesSearch && matchesType;
    });
  }, [allOperations, operationsSearch, operationsTypeFilter]);

  const lowStockReferences = useMemo(() => {
    return references.filter((r) => {
      const s1PlusS2 = (r.stock1 || 0) + (r.stock2 || 0);
      return s1PlusS2 < 100;
    });
  }, [references]);

  const getOperationBadge = (type: string) => {
    switch (type) {
      case "S1 IN":
      case "S1 IN (PENDING)":
      case "S1 IN (CANCELLED)":
        return "bg-amber-100 text-amber-900 border-amber-300 font-black";
      case "S1 => S2":
        return "bg-blue-100 text-blue-900 border-blue-300 font-black";
      case "S2 => S3":
        return "bg-emerald-100 text-emerald-900 border-emerald-300 font-black";
      case "S2 OUT":
        return "bg-purple-100 text-purple-900 border-purple-300 font-black";
      case "S3 OUT":
        return "bg-indigo-100 text-indigo-900 border-indigo-300 font-black";
      case "S1 RETURN":
        return "bg-cyan-100 text-cyan-900 border-cyan-300 font-black";
      case "DELETED INVOICE":
      case "CANCELLED DELIVERY":
      case "CANCELLED PROD":
      case "CANCELLED SCRAP":
      case "DELETED / REVERSED":
      case "REVERSAL":
        return "bg-rose-100 text-rose-900 border-rose-300 font-black";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300 font-black";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "invoice":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "transfer":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "return":
        return "bg-cyan-50 text-cyan-800 border-cyan-200";
      case "production":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "delivery":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "scrap":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "adjustment":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "admin":
        return "bg-slate-100 text-slate-700 border-slate-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6" id="supervisor-workspace-tab">
      
      {/* Header Profile Indicator & Low Stock Alert Summary */}
      <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-xs">
            SV
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 block tracking-widest uppercase">STATION CONTROL</span>
            <h3 className="font-bold text-slate-900 text-sm tracking-tight mt-0.5">Supervisor Workstation</h3>
          </div>
        </div>

        {/* Low Stock Quick Status Pill */}
        {lowStockReferences.length > 0 ? (
          <button
            type="button"
            onClick={() => setIsAlertModalOpen(true)}
            id="supervisor-low-stock-alert-trigger"
            className="flex items-center gap-2.5 px-4 py-2 bg-rose-50 hover:bg-rose-100/90 text-rose-800 border border-rose-200 rounded-xl text-xs font-mono font-bold transition-all shadow-xs cursor-pointer active:scale-95 animate-pulse"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>LOW STOCK ALERT: {lowStockReferences.length} REFERENCE{lowStockReferences.length > 1 ? "S" : ""} &lt; 100 PCS</span>
            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold ml-1">VIEW</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-mono font-bold">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>ALL REFERENCES STOCKS &ge; 100 PCS (NORMAL)</span>
          </div>
        )}
      </div>

      {/* Prominent Low Stock Alert Banner (when active) */}
      {lowStockReferences.length > 0 && (
        <div 
          className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
          id="supervisor-low-stock-active-banner"
        >
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-rose-900 font-mono flex items-center gap-2">
                <span>SUPERVISOR ATTENTION: STOCK LOW-LEVEL ALERT</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-200 text-rose-900 font-bold">
                  {lowStockReferences.length} CRITICAL
                </span>
              </h4>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAlertModalOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs font-mono flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Open Alert Console</span>
          </button>
        </div>
      )}

      {/* Complete Operational Control Center */}
      <div className="glass-panel p-5 sm:p-6 space-y-5" id="all-operations-control-center">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-2 font-mono">
                <Activity className="w-4 h-4 text-blue-600" />
                <span>COMPLETE INVENTORY OPERATIONAL CONTROL CENTER</span>
              </h4>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">TOTAL OPERATIONS:</span>
              <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg font-bold text-xs">
                {allOperations.length}
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by reference, operator, invoice #, customer, notes..."
                value={operationsSearch}
                onChange={(e) => setOperationsSearch(e.target.value)}
                id="operations-search-input"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-600 font-mono text-slate-800"
              />
            </div>

            <div className="flex items-center gap-2 font-mono">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">FILTER TYPE:</span>
              <CustomSelect
                value={operationsTypeFilter}
                onChange={(val) => setOperationsTypeFilter(val)}
                options={[
                  { value: "all", label: "ALL OPERATIONS" },
                  { value: "S1 IN", label: "S1 IN (TRUCK INTAKE)" },
                  { value: "S1 => S2", label: "S1 => S2 (PEGADAS)" },
                  { value: "S2 => S3", label: "S2 => S3 (PRODUCTION)" },
                  { value: "S2 OUT", label: "S2 OUT (PRECOSIDO / SCRAP)" },
                  { value: "S3 OUT", label: "S3 OUT (SW DELIVERY / SCRAP)" },
                  { value: "S1 RETURN", label: "S1 RETURN" },
                  { value: "DELETED", label: "DELETED / CANCELLED" }
                ]}
                className="w-56"
                size="sm"
              />
            </div>
          </div>

          {/* Desktop view: table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="industrial-table w-full min-w-[1100px]" id="all-operations-table">
              <thead>
                <tr>
                  <th className="w-[15%] min-w-[140px]">Exact Timestamp</th>
                  <th className="w-[13%] min-w-[110px]">Operation Type</th>
                  <th className="w-[16%] min-w-[130px]">Reference</th>
                  <th className="w-[10%] min-w-[90px] text-right">Quantity</th>
                  <th className="w-[14%] min-w-[120px]">Operator / User</th>
                  <th className="w-[27%] min-w-[200px]">Operational Details & Notes</th>
                  <th className="w-[5%] min-w-[60px] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                {filteredOperations.map((op) => {
                  return (
                    <tr 
                      key={op.id} 
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setDetailOp(op)}
                    >
                      <td className="text-slate-700 text-[11px] whitespace-nowrap font-bold">
                        {formatExactTimestamp(op.timestamp)}
                      </td>
                      <td>
                        <span className={`inline-flex items-center justify-center min-w-[70px] px-2 py-0.5 rounded text-[10px] font-mono font-black border uppercase shadow-2xs ${getOperationBadge(op.type)}`}>
                          {op.type}
                        </span>
                      </td>
                      <td className="font-bold text-slate-900 text-xs">{op.reference}</td>
                      <td className="text-right font-bold text-slate-950 text-xs">
                        {op.quantity > 0 ? `${op.quantity.toLocaleString()} PCS` : "-"}
                      </td>
                      <td className="text-slate-700 font-sans font-medium text-xs">{op.operator}</td>
                      <td className="text-xs text-slate-600 font-sans max-w-xs truncate" title={op.details}>
                        {op.details}
                      </td>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailOp(op)}
                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors cursor-pointer"
                            title="View Full Details"
                            id={`op-view-btn-${op.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleOpenMenu(e, op)}
                            className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors cursor-pointer"
                            title="Operation Actions"
                            id={`op-actions-btn-${op.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredOperations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                      No matching operations found for the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile view: list of cards */}
          <div className="md:hidden space-y-3" id="all-operations-mobile-list">
            {filteredOperations.map((op) => {
              return (
                <div 
                  key={op.id} 
                  className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 font-mono text-slate-800 relative cursor-pointer"
                  onClick={() => setDetailOp(op)}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-slate-700 font-bold text-[11px]">
                      {formatExactTimestamp(op.timestamp)}
                    </span>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleOpenMenu(e, op)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                        title="Operation Actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase">Operation Type</div>
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-[11px] font-mono font-black border uppercase shadow-2xs ${getOperationBadge(op.type)}`}>
                      {op.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Reference</div>
                      <div className="font-bold text-slate-900 text-xs">{op.reference}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase text-right">Quantity</div>
                      <div className="font-bold text-slate-950 text-xs text-right">
                        {op.quantity > 0 ? `${op.quantity.toLocaleString()} PCS` : "-"}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100 text-xs">
                    <div className="text-[10px] text-slate-400 uppercase">Operator</div>
                    <div className="text-slate-700 font-sans font-medium">{op.operator}</div>
                  </div>

                  {op.details && (
                    <div className="bg-slate-50 p-2.5 rounded-lg text-[11px] text-slate-600 font-sans mt-2">
                      <div className="text-[10px] font-bold font-mono text-slate-400 uppercase mb-0.5">Details</div>
                      <p className="line-clamp-2">{op.details}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredOperations.length === 0 && (
              <div className="py-12 text-center text-slate-400 font-sans bg-white border border-slate-200 rounded-xl">
                No matching operations found for the current filter.
              </div>
            )}
          </div>
        </div>

      {/* View Details Modal with Complete Batch & Audit Breakdown */}
      {detailOp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-5 font-mono max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>OPERATIONAL LEDGER AUDIT DETAILS</span>
              </h3>
              <button onClick={() => setDetailOp(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              
              {/* Header Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Operation ID</span>
                  <span className="font-bold text-slate-900 truncate block text-[11px]">{detailOp.rawId || detailOp.id}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Exact Commit Time</span>
                  <span className="font-bold text-blue-700">{formatExactTimestamp(detailOp.timestamp)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Operation Category</span>
                  <span className="font-bold text-slate-900 uppercase">{detailOp.category}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[10px] text-slate-400 block uppercase">Operation Type</span>
                  <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-mono font-black border uppercase shadow-2xs mt-1 ${getOperationBadge(detailOp.type)}`}>
                    {detailOp.type}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Affected Stock</span>
                  <span className="font-bold text-slate-900">{detailOp.affectedStock || "Stock Balances"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Reference / Summary</span>
                  <span className="font-bold text-slate-900">{detailOp.reference}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Total Quantity</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {detailOp.quantity > 0 ? `${detailOp.quantity.toLocaleString()} PCS` : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Operator / Supervisor</span>
                  <span className="font-bold text-slate-900 font-sans">{detailOp.operator}</span>
                </div>
              </div>

              {/* Operational Summary Card */}
              <div>
                <span className="text-[10px] text-slate-400 block uppercase mb-1">Operational Summary & Context</span>
                <div className="p-3 bg-slate-50 rounded-xl text-slate-800 font-sans text-xs border border-slate-100">
                  {detailOp.details}
                </div>
              </div>

              {/* Itemized Batch Breakdown Table (for Invoices, Pegadas Transfer Batches, or multi-item dispatches) */}
              {detailOp.batchItems && detailOp.batchItems.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold mb-1.5 flex items-center justify-between">
                    <span>Itemized Breakdown ({detailOp.batchItems.length} record{detailOp.batchItems.length > 1 ? "s" : ""} &bull; {detailOp.quantity} PCS)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Exact records captured in database</span>
                  </span>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-50 text-[10px] text-slate-500 border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="p-2 w-8 text-center">#</th>
                            <th className="p-2">Reference</th>
                            <th className="p-2">Destination</th>
                            <th className="p-2">Barcode / ID</th>
                            <th className="p-2 text-right">Quantity</th>
                            <th className="p-2 text-right">Scanned Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailOp.batchItems.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50/60">
                              <td className="p-2 text-center text-slate-400 text-[10px]">{idx + 1}</td>
                              <td className="p-2 font-bold text-slate-900">{item.reference}</td>
                              <td className="p-2">
                                {item.destinationStock === "Stock 3" ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                                    STOCK 3
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-200">
                                    STOCK 1
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-slate-500 text-[10px] truncate max-w-[140px]" title={item.boxBarcode || item.barcode || "-"}>
                                {item.boxBarcode || item.barcode || "-"}
                              </td>
                              <td className="p-2 text-right font-bold text-blue-700">
                                {item.quantity} PCS
                              </td>
                              <td className="p-2 text-right text-slate-400 text-[10px]">
                                {item.scannedAt ? new Date(item.scannedAt).toLocaleTimeString() : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                          <tr>
                            <td colSpan={4} className="p-2 text-right text-slate-600 text-[11px]">Total Itemized Quantity:</td>
                            <td className="p-2 text-right text-emerald-700 text-[11px]">{detailOp.quantity} PCS</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Audit Change History */}
              {detailOp.changeHistory && detailOp.changeHistory.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase mb-1">Audit Change History</span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {detailOp.changeHistory.map((h: any, idx: number) => (
                      <div key={idx} className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-[11px] space-y-0.5">
                        <div className="flex justify-between font-bold text-blue-900">
                          <span>{h.action} ({h.oldQty} → {h.newQty})</span>
                          <span>{formatExactTimestamp(h.timestamp)}</span>
                        </div>
                        <div className="text-slate-600 font-sans">By: {h.modifiedBy} | Reason: {h.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDetailOp(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                CLOSE DETAILS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Correct Modal */}
      {editOp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5 font-mono">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600" />
                <span>EDIT / CORRECT OPERATION</span>
              </h3>
              <button onClick={() => setEditOp(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-sans">
                {actionError}
              </div>
            )}

            <form onSubmit={handleExecuteEdit} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-500">Operation: <span className="font-bold text-slate-900">{editOp.type}</span></div>
                <div className="text-slate-500">Reference: <span className="font-bold text-slate-900">{editOp.reference}</span></div>
                <div className="text-slate-500">Original Quantity: <span className="font-bold text-slate-900">{editOp.quantity} PCS</span></div>
                <div className="text-slate-500">Committed At: <span className="font-bold text-blue-600">{formatExactTimestamp(editOp.timestamp)}</span></div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">New Quantity (PCS) *</label>
                <input
                  type="number"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reason for Correction *</label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Physical recount correction, duplicate scan adjustment..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-600"
                  rows={3}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditOp(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading ? "SAVING..." : "SAVE CORRECTION"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Reverse Operation Modal */}
      {deleteOp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5 font-mono">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className={`font-bold text-sm flex items-center gap-2 ${deleteMode === "delete" ? "text-rose-600" : "text-amber-600"}`}>
                {deleteMode === "delete" ? <ShieldAlert className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                <span>{deleteMode === "delete" ? "DELETE OPERATION & REVERSE STOCK" : "REVERSE OPERATION & ADJUST STOCK"}</span>
              </h3>
              <button onClick={() => setDeleteOp(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-sans">
                {actionError}
              </div>
            )}

            <form onSubmit={handleExecuteDelete} className="space-y-4 text-xs">
              <div className={`p-3 border rounded-xl space-y-1 ${deleteMode === "delete" ? "bg-rose-50/50 border-rose-100 text-rose-900" : "bg-amber-50/50 border-amber-100 text-amber-900"}`}>
                <div className="font-bold">
                  {deleteMode === "delete" 
                    ? "Warning: Deleting this operation will atomically reverse its stock impact." 
                    : "Notice: Reversing this operation will deduct or return stock to restore balances."}
                </div>
                <div className="text-slate-600">Reference: <span className="font-bold text-slate-900">{deleteOp.reference}</span></div>
                <div className="text-slate-600">Type: <span className="font-bold text-slate-900">{deleteOp.type}</span></div>
                <div className="text-slate-600">Quantity: <span className="font-bold text-slate-900">{deleteOp.quantity} PCS</span></div>
                <div className="text-slate-600">Committed At: <span className="font-bold text-blue-600">{formatExactTimestamp(deleteOp.timestamp)}</span></div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Reason for {deleteMode === "delete" ? "Deletion" : "Reversal"} *
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder={deleteMode === "delete" 
                    ? "e.g. Accidental duplicate scan, cancelled shipment..." 
                    : "e.g. Production cancellation, customer returned delivery..."}
                  className={`w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:outline-none ${deleteMode === "delete" ? "focus:border-rose-600" : "focus:border-amber-600"}`}
                  rows={3}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteOp(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  title="Delete Operation Confirm"
                  disabled={actionLoading || !deleteReason || deleteReason.trim() === ""}
                  className={`px-4 py-2 text-white rounded-xl font-bold cursor-pointer disabled:opacity-50 flex items-center gap-2 ${
                    deleteMode === "delete" 
                      ? "bg-rose-600 hover:bg-rose-500" 
                      : "bg-amber-600 hover:bg-amber-500"
                  }`}
                >
                  {actionLoading 
                    ? (deleteMode === 'delete' ? "DELETING..." : "REVERSING...") 
                    : (deleteMode === 'delete' ? "DELETE OPERATION" : "REVERSE OPERATION")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Viewport-Aware Dropdown Menu */}
      {actionMenuOpenId && menuPosition && activeOp && (
        <>
          {/* Backdrop overlay to close menu on click/tap outside */}
          <div 
            className="fixed inset-0 z-40 bg-transparent" 
            onClick={() => { setActionMenuOpenId(null); setMenuPosition(null); setActiveOp(null); }}
          />
          <div 
            style={{ 
              position: "fixed", 
              top: `${menuPosition.top}px`, 
              left: `${menuPosition.left}px`,
              width: "190px"
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 text-left font-sans text-xs"
          >
            {/* View Full Details */}
            <button
              onClick={() => { 
                setDetailOp(activeOp); 
                setActionMenuOpenId(null); 
                setMenuPosition(null); 
              }}
              className="w-full px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer font-medium"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>View Full Details</span>
            </button>

            {/* Edit / Correct */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && 
             activeOp.status !== "deleted" && (
              <button
                onClick={() => { 
                  setEditOp(activeOp); 
                  setEditQty(String(activeOp.quantity)); 
                  setEditReason(""); 
                  setActionMenuOpenId(null); 
                  setMenuPosition(null); 
                }}
                className="w-full px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-100"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                <span>Edit / Correct</span>
              </button>
            )}

            {/* Reverse Operation (for deliveries, productions, scraps, transfers, returns) */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && 
             activeOp.status !== "deleted" && 
             (activeOp.category === "delivery" || activeOp.category === "production" || activeOp.category === "scrap" || activeOp.category === "transfer" || activeOp.category === "return") && (
              <button
                onClick={() => { 
                  setDeleteOp(activeOp); 
                  setDeleteReason(""); 
                  setDeleteMode("reverse");
                  setActionMenuOpenId(null); 
                  setMenuPosition(null); 
                }}
                className="w-full px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-100"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span>Reverse Operation</span>
              </button>
            )}

            {/* Delete Operation */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && 
             activeOp.status !== "deleted" && (
              <button
                onClick={() => { 
                  setDeleteOp(activeOp); 
                  setDeleteReason(""); 
                  setDeleteMode("delete");
                  setActionMenuOpenId(null); 
                  setMenuPosition(null); 
                }}
                title="Delete Operation"
                className="w-full px-4 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-100"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>Delete Operation</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Supervisor Low Stock Alert Modal */}
      <LowStockAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        references={references}
      />

    </div>
  );
}
