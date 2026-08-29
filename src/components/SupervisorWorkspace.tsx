import React, { useState, useMemo } from "react";
import { Box, Adjustment, Delivery, Production, ScrapEntry, InventoryTransaction, User, ReceivingInvoice, Reference } from "../types";
import { motion } from "motion/react";
import { CustomSelect } from "./CustomSelect";
import { LowStockAlertModal } from "./LowStockAlertModal";
import { 
  Check, X, FileText, Search, TrendingDown, TrendingUp, Calendar, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, AlertCircle, Activity, Clock, Layers, Truck, Factory, ShieldAlert, MoreVertical,
  Eye, RotateCcw
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
  const [activeOp, setActiveOp] = useState<any | null>(null);
  const [deleteMode, setDeleteMode] = useState<"delete" | "reverse">("delete");
  const [detailOp, setDetailOp] = useState<any | null>(null);
  const [editOp, setEditOp] = useState<any | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [deleteOp, setDeleteOp] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpenMenu = (e: React.MouseEvent<HTMLButtonElement>, op: any) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 160; // Estimated height of 4 buttons
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;

    let fixedTop = rect.bottom;
    let fixedLeft = rect.left;

    // If there's not enough space below, open upward
    if (spaceBelow < menuHeight && rect.top > menuHeight) {
      fixedTop = rect.top - menuHeight - 8; // 8px spacing
    } else {
      fixedTop = rect.bottom + 8;
    }

    // If there's not enough space on the right, align menu right-edge with button right-edge
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
      await onEditOperation(editOp.id, editOp.category, qtyNum, editReason);
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
    if (!deleteOp || !onDeleteOperation) return;
    if (!deleteReason || deleteReason.trim() === "") {
      setActionError("A reason for deletion is required.");
      return;
    }
    try {
      setActionLoading(true);
      setActionError(null);
      await onDeleteOperation(deleteOp.id, deleteOp.category, deleteReason);
      setDeleteOp(null);
      setDeleteReason("");
    } catch (err: any) {
      setActionError(err.message || "Failed to delete operation.");
    } finally {
      setActionLoading(false);
    }
  };

  // Unified All Inventory Operations List
  const [operationsTypeFilter, setOperationsTypeFilter] = useState<string>("all");
  const [operationsSearch, setOperationsSearch] = useState<string>("");

  const allOperations = useMemo(() => {
    const list: {
      id: string;
      timestamp: string;
      type: string;
      category: "adjustment" | "delivery" | "production" | "scrap" | "transaction";
      reference: string;
      quantity: number;
      operator: string;
      details: string;
      status?: string;
    }[] = [];

    // 1. Deliveries / Dispatches
    deliveries.forEach(del => {
      list.push({
        id: del.id,
        timestamp: del.timestamp,
        type: `Delivery (${del.deliveryType || "Villanova"})`,
        category: "delivery",
        reference: del.reference,
        quantity: del.quantity,
        operator: del.operatorName,
        details: `Invoice: ${del.invoiceNumber} | Customer: ${del.customer} | Note: ${del.notes || "None"}`,
        status: del.status || "approved"
      });
    });

    // 2. Physical Counts / Adjustments (handled in transactions list and trace logs tab - no need to duplicate)

    // 3. Productions / WIP -> Finished
    productions.forEach(prod => {
      list.push({
        id: prod.id,
        timestamp: prod.timestamp,
        type: "Production Completion",
        category: "production",
        reference: prod.reference,
        quantity: prod.quantity,
        operator: prod.operatorName,
        details: `Prod Date: ${prod.date} | Stock 2 WIP -> Stock 3 Finished | Note: ${prod.notes || "None"}`,
        status: prod.status || "approved"
      });
    });

    // 4. Scraps / NOK
    scraps.forEach(scrap => {
      list.push({
        id: scrap.id,
        timestamp: scrap.timestamp,
        type: `Scrap (${scrap.condition})`,
        category: "scrap",
        reference: scrap.reference,
        quantity: scrap.quantity,
        operator: scrap.supervisorName || "Supervisor",
        details: `Deducted from ${scrap.stockDeductedFrom} | Inv: ${scrap.invoiceNumber || "N/A"} | Note: ${scrap.notes || "None"}`,
        status: scrap.status || "approved"
      });
    });

    // 5. Generic Transactions (Transfers, Stock 1 IN, etc.) if not already covered
    transactions.forEach(tx => {
      list.push({
        id: `tx-${tx.id}`,
        timestamp: tx.timestamp,
        type: tx.movementType,
        category: "transaction",
        reference: tx.reference,
        quantity: tx.quantity,
        operator: tx.operatorName,
        details: `${tx.stock} | ${tx.notes || "System movement"}`,
        status: "approved"
      });
    });

    // 6. Receiving Invoices (Stock 1 Receiving Sessions)
    invoices.forEach(inv => {
      const uniqueRefs = Array.from(new Set(inv.items.map(i => i.reference))).join(", ") || "No items";
      list.push({
        id: `inv-${inv.id}`,
        timestamp: inv.createdAt,
        type: `Invoice Intake (${inv.status.toUpperCase()})`,
        category: "invoice" as any,
        reference: uniqueRefs,
        quantity: inv.totalQuantity,
        operator: inv.operator,
        details: `Invoice: ${inv.invoiceNumber} | ${inv.totalBoxes} boxes | Status: ${inv.status.toUpperCase()}${inv.approvedAt ? ` | Approved: ${new Date(inv.approvedAt).toLocaleTimeString()}` : ''}`,
        status: inv.status,
        rawInvoice: inv
      } as any);
    });

    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  }, [adjustments, deliveries, productions, scraps, transactions, invoices]);

  const filteredOperations = useMemo(() => {
    return allOperations.filter(op => {
      const matchesSearch = 
        op.reference.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        op.operator.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        op.type.toLowerCase().includes(operationsSearch.toLowerCase()) ||
        op.details.toLowerCase().includes(operationsSearch.toLowerCase());

      const matchesType = operationsTypeFilter === "all" || op.category === operationsTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [allOperations, operationsSearch, operationsTypeFilter]);

  const lowStockReferences = useMemo(() => {
    return references.filter((r) => {
      const total = (r.stock1 || 0) + (r.stock2 || 0) + (r.stock3 || 0);
      return total < 100;
    });
  }, [references]);

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
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">TOTAL EVENTS:</span>
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
                placeholder="Search operations by reference, operator, or details..."
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
                  { value: "invoice", label: "RECEIVING INVOICES (STOCK 1)" },
                  { value: "delivery", label: "DELIVERIES" },
                  { value: "production", label: "PRODUCTION" },
                  { value: "scrap", label: "SCRAP / NOK" },
                  { value: "transaction", label: "TRANSFERS / OTHER" }
                ]}
                className="w-48"
                size="sm"
              />
            </div>
          </div>

          {/* Desktop view: table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="industrial-table w-full min-w-[1050px]" id="all-operations-table">
              <thead>
                <tr>
                  <th className="w-[14%] min-w-[130px]">Timestamp</th>
                  <th className="w-[18%] min-w-[170px]">Operation Type</th>
                  <th className="w-[12%] min-w-[110px]">Reference</th>
                  <th className="w-[8%] min-w-[80px] text-right">Quantity</th>
                  <th className="w-[14%] min-w-[120px]">Operator / User</th>
                  <th className="w-[22%] min-w-[200px]">Operational Details & Notes</th>
                  <th className="w-[8%] min-w-[80px] text-center">Status</th>
                  <th className="w-[4%] min-w-[50px] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                {filteredOperations.map((op) => {
                  const categoryColors: Record<string, string> = {
                    adjustment: "bg-blue-50 text-blue-700 border-blue-200",
                    invoice: "bg-amber-50 text-amber-800 border-amber-200",
                    delivery: "bg-purple-50 text-purple-700 border-purple-200",
                    production: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    scrap: "bg-rose-50 text-rose-700 border-rose-200",
                    transaction: "bg-slate-100 text-slate-700 border-slate-200"
                  };

                  return (
                    <tr key={op.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="text-slate-500 text-[10px] whitespace-nowrap">
                        {new Date(op.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold border uppercase ${categoryColors[op.category] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                          {op.type}
                        </span>
                      </td>
                      <td className="font-bold text-slate-900">{op.reference}</td>
                      <td className="text-right font-bold text-slate-950">
                        {op.quantity > 0 ? op.quantity : "-"}
                      </td>
                      <td className="text-slate-700 font-sans font-medium text-xs">{op.operator}</td>
                      <td className="text-xs text-slate-600 font-sans max-w-xs truncate" title={op.details}>
                        {op.details}
                      </td>
                      <td className="text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold border uppercase ${op.status === 'deleted' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {op.status || "Completed"}
                        </span>
                      </td>
                      <td className="text-center">
                        <button
                          onClick={(e) => handleOpenMenu(e, op)}
                          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors cursor-pointer"
                          title="Operation Actions"
                          id={`op-actions-btn-${op.id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredOperations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
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
              const categoryColors: Record<string, string> = {
                adjustment: "bg-blue-50 text-blue-700 border-blue-200",
                delivery: "bg-purple-50 text-purple-700 border-purple-200",
                production: "bg-emerald-50 text-emerald-700 border-emerald-200",
                scrap: "bg-rose-50 text-rose-700 border-rose-200",
                transaction: "bg-slate-100 text-slate-700 border-slate-200"
              };

              return (
                <div key={op.id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 font-mono text-slate-800 relative">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 text-[10px]">
                      {new Date(op.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold border uppercase ${op.status === 'deleted' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {op.status || "Completed"}
                      </span>
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
                    <div className="text-[10px] text-slate-400 uppercase">Operation</div>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${categoryColors[op.category] || "bg-slate-100 text-slate-700"}`}>
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
                        {op.quantity > 0 ? op.quantity : "-"}
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





      {/* View Details Modal */}
      {detailOp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5 font-mono">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>OPERATION AUDIT DETAILS</span>
              </h3>
              <button onClick={() => setDetailOp(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Operation ID</span>
                  <span className="font-bold text-slate-900 truncate block">{detailOp.id}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Timestamp</span>
                  <span className="font-bold text-slate-900">{new Date(detailOp.timestamp).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Operation Type</span>
                  <span className="font-bold text-blue-600">{detailOp.type}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Reference</span>
                  <span className="font-bold text-slate-900">{detailOp.reference}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Quantity</span>
                  <span className="font-bold text-slate-950 text-sm">{detailOp.quantity > 0 ? detailOp.quantity : "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Operator</span>
                  <span className="font-bold text-slate-900 font-sans">{detailOp.operator}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block uppercase mb-1">Operational Details & Notes</span>
                <div className="p-3 bg-slate-50 rounded-xl text-slate-800 font-sans text-xs">
                  {detailOp.details}
                </div>
              </div>

              {detailOp.rawInvoice?.items && detailOp.rawInvoice.items.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase mb-1">
                    Scanned Boxes under Invoice ({detailOp.rawInvoice.items.length} boxes &bull; {detailOp.rawInvoice.totalQuantity} PCS)
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                    {detailOp.rawInvoice.items.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="p-2 bg-slate-50 rounded-lg flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-slate-200 text-[10px] flex items-center justify-center font-bold text-slate-700">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900">{item.reference}</span>
                            <span className="text-[10px] text-slate-400 block">{item.boxBarcode}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {item.quantity} PCS
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {item.scannedAt ? new Date(item.scannedAt).toLocaleTimeString() : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailOp.changeHistory && detailOp.changeHistory.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase mb-1">Audit Change History</span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {detailOp.changeHistory.map((h: any, idx: number) => (
                      <div key={idx} className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-[11px] space-y-0.5">
                        <div className="flex justify-between font-bold text-blue-900">
                          <span>{h.action} ({h.oldQty} → {h.newQty})</span>
                          <span>{new Date(h.timestamp).toLocaleString()}</span>
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
                CLOSE
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
                <div className="text-slate-500">Original Quantity: <span className="font-bold text-slate-900">{editOp.quantity}</span></div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">New Quantity *</label>
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
                <div className="text-slate-600">Quantity: <span className="font-bold text-slate-900">{deleteOp.quantity}</span></div>
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
                className="w-full px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                <span>Edit / Correct</span>
              </button>
            )}

            {/* Reverse Operation (only for deliveries, productions, scraps) */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && 
             activeOp.status !== "deleted" && 
             (activeOp.category === "delivery" || activeOp.category === "production" || activeOp.category === "scrap") && (
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
