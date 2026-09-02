import React, { useState, useMemo } from "react";
import { ReceivingInvoice, ScannedInvoiceBox, Reference, InventoryTransaction, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, Search, Calendar, User as UserIcon, CheckCircle2, 
  Clock, XCircle, Download, Printer, Eye, X, Layers, 
  Boxes, TrendingUp, AlertTriangle, ArrowUpDown, ChevronRight,
  ShieldCheck, RefreshCw, Hash, PackageCheck, Filter, ArrowUpRight,
  Trash2, AlertCircle, Pencil, Plus, Save, RotateCcw
} from "lucide-react";
import Swal from "sweetalert2";
import { CustomSelect } from "./CustomSelect";

interface InvoicesWorkspaceProps {
  invoices: ReceivingInvoice[];
  transactions: InventoryTransaction[];
  references: Reference[];
  currentUser: User;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  onClearAllInvoices?: () => Promise<void>;
  onUpdateInvoice?: (updatedInvoice: ReceivingInvoice, previousInvoice?: ReceivingInvoice) => Promise<void>;
}

export default function InvoicesWorkspace({
  invoices,
  transactions,
  references,
  currentUser,
  onDeleteInvoice,
  onClearAllInvoices,
  onUpdateInvoice
}: InvoicesWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedInvoice, setSelectedInvoice] = useState<ReceivingInvoice | null>(null);
  const [sortField, setSortField] = useState<"date" | "invoiceNumber" | "totalQuantity" | "totalBoxes">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isClearing, setIsClearing] = useState(false);

  // Edit Invoice States
  const [editingInvoice, setEditingInvoice] = useState<ReceivingInvoice | null>(null);
  const [originalInvoiceForEdit, setOriginalInvoiceForEdit] = useState<ReceivingInvoice | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Map references for fast metadata lookup (Customer, Material Type, Description)
  const refMap = useMemo(() => {
    const map = new Map<string, Reference>();
    references.forEach(r => {
      map.set(r.code.toUpperCase(), r);
      map.set(r.id.toUpperCase(), r);
    });
    return map;
  }, [references]);

  // Use actual real-time invoices from Firestore
  const unifiedInvoices = useMemo(() => {
    return invoices;
  }, [invoices]);

  // Filter and sort invoices
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return unifiedInvoices
      .filter(inv => {
        // Date filter
        if (dateFilter === "today") {
          const invDate = inv.createdAt.slice(0, 10);
          if (invDate !== todayStr) return false;
        } else if (dateFilter === "week") {
          const invTime = new Date(inv.createdAt).getTime();
          if (invTime < sevenDaysAgo.getTime()) return false;
        } else if (dateFilter === "month") {
          const invTime = new Date(inv.createdAt).getTime();
          if (invTime < thirtyDaysAgo.getTime()) return false;
        }

        // Search query filter (Invoice #, Operator, Reference codes)
        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase();
          const matchesInv = inv.invoiceNumber.toLowerCase().includes(query);
          const matchesOp = inv.operator.toLowerCase().includes(query);
          const matchesNotes = (inv.notes || "").toLowerCase().includes(query);
          const matchesRef = inv.items?.some(it => 
            it.reference.toLowerCase().includes(query) || 
            (it.boxBarcode && it.boxBarcode.toLowerCase().includes(query))
          );

          if (!matchesInv && !matchesOp && !matchesNotes && !matchesRef) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === "date") {
          comp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        } else if (sortField === "invoiceNumber") {
          comp = a.invoiceNumber.localeCompare(b.invoiceNumber);
        } else if (sortField === "totalQuantity") {
          comp = a.totalQuantity - b.totalQuantity;
        } else if (sortField === "totalBoxes") {
          comp = a.totalBoxes - b.totalBoxes;
        }
        return sortDirection === "desc" ? -comp : comp;
      });
  }, [unifiedInvoices, dateFilter, searchQuery, sortField, sortDirection]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalCount = unifiedInvoices.length;
    const approved = unifiedInvoices.filter(i => i.status === "approved");
    const pending = unifiedInvoices.filter(i => i.status === "pending");
    const cancelled = unifiedInvoices.filter(i => i.status === "cancelled");

    const totalApprovedQty = approved.reduce((sum, i) => sum + i.totalQuantity, 0);
    const totalBoxesReceived = approved.reduce((sum, i) => sum + i.totalBoxes, 0);

    // Unique references received across all approved invoices
    const uniqueRefs = new Set<string>();
    approved.forEach(i => {
      i.items?.forEach(it => uniqueRefs.add(it.reference.toUpperCase()));
    });

    return {
      totalCount,
      approvedCount: approved.length,
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      totalApprovedQty,
      totalBoxesReceived,
      uniqueRefsCount: uniqueRefs.size
    };
  }, [unifiedInvoices]);

  // Selected Invoice breakdown by Reference
  const selectedInvoiceBreakdown = useMemo(() => {
    if (!selectedInvoice || !selectedInvoice.items) return [];

    const groupMap = new Map<string, {
      reference: string;
      customer: string;
      materialType: string;
      description: string;
      boxCount: number;
      totalQuantity: number;
      expectedQuantity: number;
      difference: number;
      items: typeof selectedInvoice.items;
    }>();

    selectedInvoice.items.forEach(item => {
      const code = item.reference.toUpperCase();
      const refData = refMap.get(code);
      const existing = groupMap.get(code) || {
        reference: item.reference,
        customer: refData?.customer || "Standard",
        materialType: refData?.materialType || item.materialType || "Mesh",
        description: refData?.description || "",
        boxCount: 0,
        totalQuantity: 0,
        expectedQuantity: 0,
        difference: 0,
        items: []
      };

      existing.boxCount += 1;
      existing.totalQuantity += item.quantity;
      existing.expectedQuantity += item.expectedQty || item.quantity;
      existing.difference += (item.difference || 0);
      existing.items.push(item);

      groupMap.set(code, existing);
    });

    return Array.from(groupMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [selectedInvoice, refMap]);

  // Print Invoice Summary
  const handlePrintInvoice = () => {
    window.print();
  };

  // Export Selected Invoice or All Invoices to CSV
  const handleExportCSV = (inv?: ReceivingInvoice) => {
    const targetInvoices = inv ? [inv] : filteredInvoices;
    if (targetInvoices.length === 0) return;

    const headers = [
      "Invoice Number",
      "Status",
      "Created Date",
      "Approved Date",
      "Operator",
      "Reference Description",
      "Reference Code",
      "Customer",
      "Material Type",
      "Expected Qty",
      "Scanned Qty",
      "Difference",
      "Scan Timestamp"
    ];

    const rows: string[][] = [];

    targetInvoices.forEach(i => {
      if (i.items && i.items.length > 0) {
        i.items.forEach(it => {
          const refData = refMap.get(it.reference.toUpperCase());
          rows.push([
            `"${i.invoiceNumber}"`,
            `"${i.status.toUpperCase()}"`,
            `"${i.createdAt}"`,
            `"${i.approvedAt || ''}"`,
            `"${i.operator}"`,
            `"${refData?.description || ''}"`,
            `"${it.reference}"`,
            `"${refData?.customer || 'Standard'}"`,
            `"${refData?.materialType || it.materialType || 'Mesh'}"`,
            `${it.expectedQty || it.quantity}`,
            `${it.quantity}`,
            `${it.difference || 0}`,
            `"${it.scannedAt || ''}"`
          ]);
        });
      } else {
        rows.push([
          `"${i.invoiceNumber}"`,
          `"${i.status.toUpperCase()}"`,
          `"${i.createdAt}"`,
          `"${i.approvedAt || ''}"`,
          `"${i.operator}"`,
          `"-"`,
          `"-"`,
          `"-"`,
          `"-"`,
          `0`,
          `${i.totalQuantity}`,
          `0`,
          `"${i.createdAt}"`
        ]);
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = inv 
      ? `Invoice_${inv.invoiceNumber}_Traceability_${new Date().toISOString().slice(0, 10)}.csv`
      : `Invoices_Master_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (field: "date" | "invoiceNumber" | "totalQuantity" | "totalBoxes") => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleClearInvoices = async () => {
    if (!onClearAllInvoices) return;
    const result = await Swal.fire({
      title: "Clear All Invoices Register?",
      text: "Are you sure you want to remove all existing invoices from this register? Future incoming invoices will continue to be recorded here starting now.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Clear All Invoices",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        setIsClearing(true);
        await onClearAllInvoices();
        setSelectedInvoice(null);
        await Swal.fire({
          title: "Invoices Cleared",
          text: "The invoice register has been reset to empty. All future incoming material scans and invoices will be logged here going forward.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false
        });
      } catch (err: any) {
        console.error(err);
        await Swal.fire("Error", err?.message || "Failed to clear invoices.", "error");
      } finally {
        setIsClearing(false);
      }
    }
  };

  const handleDeleteSingleInvoice = async (inv: ReceivingInvoice) => {
    if (!onDeleteInvoice) return;
    const result = await Swal.fire({
      title: `Delete Invoice ${inv.invoiceNumber}?`,
      text: "Are you sure you want to remove this invoice record from the register?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete Record",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        await onDeleteInvoice(inv.id);
        if (selectedInvoice?.id === inv.id) {
          setSelectedInvoice(null);
        }
        await Swal.fire({
          title: "Invoice Removed",
          text: `Invoice ${inv.invoiceNumber} was removed from the register.`,
          icon: "success",
          timer: 1500,
          showConfirmButton: false
        });
      } catch (err: any) {
        console.error(err);
        await Swal.fire("Error", err?.message || "Failed to delete invoice.", "error");
      }
    }
  };

  // Grouped totals for the invoice currently being edited
  const editingInvoiceBreakdown = useMemo(() => {
    if (!editingInvoice || !editingInvoice.items) return [];
    const map = new Map<string, { reference: string; quantity: number; boxes: number }>();
    editingInvoice.items.forEach(item => {
      const ref = (item.reference || "").trim().toUpperCase();
      if (!ref) return;
      const cur = map.get(ref) || { reference: item.reference, quantity: 0, boxes: 0 };
      cur.quantity += (Number(item.quantity) || 0);
      cur.boxes += 1;
      map.set(ref, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [editingInvoice]);

  const handleOpenEditModal = (inv: ReceivingInvoice) => {
    setOriginalInvoiceForEdit(inv);
    const cloned: ReceivingInvoice = JSON.parse(JSON.stringify(inv));
    if (!cloned.items) cloned.items = [];
    setEditingInvoice(cloned);
  };

  const handleCloseEditModal = () => {
    setEditingInvoice(null);
    setOriginalInvoiceForEdit(null);
  };

  const handleEditItemChange = (index: number, field: keyof ScannedInvoiceBox, value: any) => {
    if (!editingInvoice) return;
    const updatedItems = [...editingInvoice.items];
    const item = { ...updatedItems[index] };

    if (field === "quantity" || field === "expectedQty") {
      const numVal = Math.max(0, parseInt(value, 10) || 0);
      item[field] = numVal;
      item.difference = (item.quantity || 0) - (item.expectedQty || 0);
    } else if (field === "reference") {
      const cleanRef = String(value).trim().toUpperCase();
      item.reference = cleanRef;
      const refData = refMap.get(cleanRef);
      if (refData?.materialType) {
        item.materialType = refData.materialType;
      }
    } else {
      (item as any)[field] = value;
    }

    updatedItems[index] = item;
    const totalBoxes = updatedItems.length;
    const totalQuantity = updatedItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    setEditingInvoice({
      ...editingInvoice,
      items: updatedItems,
      totalBoxes,
      totalQuantity
    });
  };

  const handleAddEditItem = () => {
    if (!editingInvoice) return;
    const defaultRef = references[0]?.code || "REF-001";
    const refData = refMap.get(defaultRef.toUpperCase());
    const newItem: ScannedInvoiceBox = {
      id: `box-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      boxBarcode: `BOX-${Date.now().toString().slice(-6)}`,
      reference: defaultRef,
      expectedQty: 100,
      quantity: 100,
      difference: 0,
      scannedAt: new Date().toISOString(),
      materialType: refData?.materialType || "Mesh"
    };

    const updatedItems = [...editingInvoice.items, newItem];
    const totalBoxes = updatedItems.length;
    const totalQuantity = updatedItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    setEditingInvoice({
      ...editingInvoice,
      items: updatedItems,
      totalBoxes,
      totalQuantity
    });
  };

  const handleRemoveEditItem = (index: number) => {
    if (!editingInvoice) return;
    if (editingInvoice.items.length <= 1) {
      Swal.fire({
        icon: "warning",
        title: "Minimum 1 Box Required",
        text: "An invoice must have at least one scanned box. To remove this entire invoice, use the Delete Invoice action."
      });
      return;
    }

    const updatedItems = editingInvoice.items.filter((_, i) => i !== index);
    const totalBoxes = updatedItems.length;
    const totalQuantity = updatedItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    setEditingInvoice({
      ...editingInvoice,
      items: updatedItems,
      totalBoxes,
      totalQuantity
    });
  };

  const handleSaveEditInvoice = async () => {
    if (!editingInvoice || !onUpdateInvoice) return;

    const cleanedInvoiceNumber = editingInvoice.invoiceNumber.trim().toUpperCase();
    if (!cleanedInvoiceNumber) {
      Swal.fire({
        icon: "error",
        title: "Invoice Number Required",
        text: "Please enter a valid Invoice or Delivery Note number."
      });
      return;
    }

    if (!editingInvoice.items || editingInvoice.items.length === 0) {
      Swal.fire({
        icon: "error",
        title: "No Scanned Boxes",
        text: "The invoice must contain at least one box record."
      });
      return;
    }

    for (let i = 0; i < editingInvoice.items.length; i++) {
      const it = editingInvoice.items[i];
      if (!it.reference.trim()) {
        Swal.fire({
          icon: "error",
          title: "Missing Reference",
          text: `Box #${i + 1} has no reference code assigned.`
        });
        return;
      }
      if (it.quantity <= 0) {
        Swal.fire({
          icon: "error",
          title: "Invalid Quantity",
          text: `Box #${i + 1} (${it.reference}) must have a quantity greater than zero.`
        });
        return;
      }
    }

    const isApproved = originalInvoiceForEdit?.status === "approved";
    const confirmRes = await Swal.fire({
      title: "Save Invoice Modifications?",
      html: `
        <div style="text-align: left; font-size: 13px; color: #334155; line-height: 1.5;">
          <p><strong>Invoice Number:</strong> <span style="color: #2563eb;">${cleanedInvoiceNumber}</span></p>
          <p><strong>Total Boxes:</strong> ${editingInvoice.totalBoxes} box(es)</p>
          <p><strong>Total Quantity:</strong> <strong>${editingInvoice.totalQuantity.toLocaleString()} PCS</strong></p>
          ${isApproved ? `
            <div style="margin-top: 12px; padding: 10px; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; color: #92400e; font-size: 12px;">
              <strong>Stock 1 Synchronization:</strong><br/>
              Because this invoice is already <strong>APPROVED</strong>, any changes in quantity will automatically adjust the Stock 1 inventory level for the affected references.
            </div>
          ` : ''}
        </div>
      `,
      icon: isApproved ? "warning" : "question",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Save Modifications"
    });

    if (!confirmRes.isConfirmed) return;

    try {
      setIsSavingEdit(true);
      await onUpdateInvoice(editingInvoice, originalInvoiceForEdit || undefined);

      // If details modal is open for this invoice, keep it synced
      if (selectedInvoice && selectedInvoice.id === editingInvoice.id) {
        setSelectedInvoice({
          ...editingInvoice,
          invoiceNumber: cleanedInvoiceNumber
        });
      }

      handleCloseEditModal();
      Swal.fire({
        icon: "success",
        title: "Invoice Updated",
        text: `Invoice ${cleanedInvoiceNumber} has been updated successfully.`,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: err?.message || "Failed to update invoice."
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6" id="invoices-workspace-container">
      
      {/* Top Banner & KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="invoices-kpi-grid">
        
        {/* Total Invoices */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between" id="kpi-total-invoices">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              TOTAL INVOICES
            </div>
            <div className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">
              {stats.totalCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Incoming delivery operations
            </div>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Total Approved & Stock 1 PCS */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between" id="kpi-approved-invoices">
          <div>
            <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider font-mono">
              VALIDATED STOCK 1
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
              {stats.totalApprovedQty.toLocaleString()} <span className="text-xs font-semibold text-emerald-600">PCS</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {stats.approvedCount} approved invoices ({stats.totalBoxesReceived} boxes)
            </div>
          </div>
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Control Bar: Search, Filters & Export */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3" id="invoices-filter-panel">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice #, reference code, operator..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
              id="invoices-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Date Filter */}
            <div className="w-36">
              <CustomSelect
                value={dateFilter}
                onChange={(val) => setDateFilter(val as any)}
                options={[
                  { value: "all", label: "All Time" },
                  { value: "today", label: "Today" },
                  { value: "week", label: "Last 7 Days" },
                  { value: "month", label: "Last 30 Days" }
                ]}
              />
            </div>

            {/* Export Master CSV */}
            <button
              onClick={() => handleExportCSV()}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0 border border-emerald-800/40"
              title="Export filtered invoices to CSV"
              id="invoices-export-csv-btn"
            >
              <Download className="w-3.5 h-3.5" />
              <span>EXPORT CSV</span>
            </button>

          </div>

        </div>

        {/* Active Filter Indicators */}
        {(searchQuery || dateFilter !== "all") && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Showing:</span>
            <span>{filteredInvoices.length} of {unifiedInvoices.length} invoices</span>
            <button
              onClick={() => {
                setSearchQuery("");
                setDateFilter("all");
              }}
              className="text-blue-600 hover:underline font-semibold ml-2"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="invoices-table-card">
        
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Stock 1 Incoming Invoices Register
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 font-mono">
              {filteredInvoices.length} {filteredInvoices.length === 1 ? 'record' : 'records'}
            </div>
            {invoices.length > 0 && onClearAllInvoices && (currentUser.role === "admin" || currentUser.role === "supervisor") && (
              <button
                onClick={handleClearInvoices}
                disabled={isClearing}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 rounded font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                title="Remove all invoice entries from the register"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>{isClearing ? "Clearing..." : "Clear Register"}</span>
              </button>
            )}
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3" id="invoices-empty-state">
            <FileText className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
            <div className="text-sm font-semibold text-slate-600">No invoices found matching criteria</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse" id="invoices-master-table">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                  
                  <th 
                    className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("invoiceNumber")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>INVOICE NUMBER</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th 
                    className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("date")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>DATE & TIME</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th className="p-3.5">OPERATOR</th>

                  <th 
                    className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("totalBoxes")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>SCANNED ITEMS / REFS</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th 
                    className="p-3.5 text-right cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("totalQuantity")}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>TOTAL QUANTITY</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th className="p-3.5 text-center">STATUS</th>

                  <th className="p-3.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const itemsCount = inv.items ? inv.items.length : 0;
                  const uniqueRefs = new Set(inv.items?.map(it => it.reference.toUpperCase()) || []);
                  const uniqueRefsCount = uniqueRefs.size;
                  
                  // Reference preview pills
                  const refList = Array.from(uniqueRefs);

                  return (
                    <tr 
                      key={inv.id} 
                      onClick={() => setSelectedInvoice(inv)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                      id={`invoice-row-${inv.invoiceNumber}`}
                    >
                      {/* Invoice Number */}
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-blue-100/70 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="text-blue-900 group-hover:text-blue-600 transition-colors">
                              {inv.invoiceNumber}
                            </div>
                            {inv.notes && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal truncate max-w-[150px]">
                                {inv.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="p-3.5 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                          <span className="text-slate-400 text-[11px] font-mono">
                            {new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      {/* Operator */}
                      <td className="p-3.5 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-xs">{inv.operator}</span>
                        </div>
                      </td>

                      {/* Scanned Items & Refs */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <Boxes className="w-3.5 h-3.5 text-slate-400" />
                            <span>{itemsCount} {itemsCount === 1 ? 'box' : 'boxes'}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-indigo-600 font-mono text-[11px]">{uniqueRefsCount} {uniqueRefsCount === 1 ? 'reference' : 'references'}</span>
                          </div>
                          {refList.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {refList.slice(0, 3).map((refCode) => (
                                <span 
                                  key={refCode} 
                                  className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono font-medium border border-slate-200"
                                >
                                  {refCode}
                                </span>
                              ))}
                              {refList.length > 3 && (
                                <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono font-medium">
                                  +{refList.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Total Quantity */}
                      <td className="p-3.5 text-right font-mono">
                        <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-900 group-hover:bg-blue-100 group-hover:text-blue-900 rounded font-extrabold text-xs sm:text-sm border border-slate-200 transition-colors">
                          {inv.totalQuantity.toLocaleString()} PCS
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {inv.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            APPROVED
                          </span>
                        )}
                        {inv.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            PENDING
                          </span>
                        )}
                        {inv.status === "cancelled" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            CANCELLED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInvoice(inv);
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 hover:border-blue-300 rounded font-bold text-xs inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                            title="View complete scanned breakdown"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Details</span>
                          </button>
                          {onUpdateInvoice && (currentUser.role === "admin" || currentUser.role === "supervisor") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(inv);
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 hover:border-amber-300 rounded font-bold text-xs inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                              title="Modify invoice details and items"
                            >
                              <Pencil className="w-3 h-3 text-amber-600" />
                              <span>Edit</span>
                            </button>
                          )}
                          {onDeleteInvoice && (currentUser.role === "admin" || currentUser.role === "supervisor") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSingleInvoice(inv);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                              title="Delete invoice record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-white w-full max-w-4xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
              id="invoice-details-modal"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/30 border border-blue-400/40 text-blue-400 flex items-center justify-center font-bold">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold font-mono text-white">
                        INVOICE: {selectedInvoice.invoiceNumber}
                      </h2>
                      {selectedInvoice.status === "approved" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          APPROVED &bull; IN STOCK 1
                        </span>
                      )}
                      {selectedInvoice.status === "pending" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          PENDING VALIDATION
                        </span>
                      )}
                      {selectedInvoice.status === "cancelled" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          CANCELLED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                      <span>Operator: <strong className="text-slate-200">{selectedInvoice.operator}</strong></span>
                      <span>&bull;</span>
                      <span>Created: {new Date(selectedInvoice.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onUpdateInvoice && (currentUser.role === "admin" || currentUser.role === "supervisor") && (
                    <button
                      onClick={() => handleOpenEditModal(selectedInvoice)}
                      className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Modify this invoice"
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-400" />
                      <span>Edit Invoice</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleExportCSV(selectedInvoice)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="Export Invoice to CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="p-2 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#f8fafc]">
                
                {/* Summary Info Header Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">TOTAL PCS</div>
                    <div className="text-xl font-extrabold text-blue-600 font-mono mt-0.5">
                      {selectedInvoice.totalQuantity.toLocaleString()}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">TOTAL BOXES</div>
                    <div className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">
                      {selectedInvoice.totalBoxes}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">UNIQUE REFS</div>
                    <div className="text-xl font-extrabold text-indigo-600 font-mono mt-0.5">
                      {selectedInvoiceBreakdown.length}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">TRACEABILITY</div>
                    <div className="text-xs font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Stock 1 Verified</span>
                    </div>
                  </div>
                </div>

                {/* Individual Scanned Records Table */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-blue-600" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                        All Scanned Records ({selectedInvoice.items?.length || 0} boxes)
                      </h3>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/60 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                          <th className="p-3">#</th>
                          <th className="p-3">REFERENCE DESCRIPTION</th>
                          <th className="p-3">REFERENCE</th>
                          <th className="p-3 text-right">EXPECTED</th>
                          <th className="p-3 text-right">SCANNED (PCS)</th>
                          <th className="p-3 text-right">DIFFERENCE</th>
                          <th className="p-3">SCAN TIME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedInvoice.items?.map((item, idx) => {
                          const diff = item.difference || 0;
                          const refData = refMap.get(item.reference.toUpperCase());
                          const refDesc = refData?.description || item.description || "—";
                          return (
                            <tr key={item.id || idx} className="hover:bg-slate-50">
                              <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-3 font-sans font-medium text-slate-800">
                                {refDesc}
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-900">
                                {item.reference}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-600">
                                {item.expectedQty || item.quantity}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                {item.quantity}
                              </td>
                              <td className="p-3 text-right font-mono">
                                {diff === 0 ? (
                                  <span className="text-slate-400">0</span>
                                ) : diff > 0 ? (
                                  <span className="text-emerald-600 font-bold">+{diff}</span>
                                ) : (
                                  <span className="text-rose-600 font-bold">{diff}</span>
                                )}
                              </td>
                              <td className="p-3 text-slate-500 font-mono text-[11px]">
                                {item.scannedAt ? new Date(item.scannedAt).toLocaleTimeString() : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100/90 border-t-2 border-slate-300 text-xs font-bold text-slate-800 font-mono">
                          <td className="p-3 text-slate-500 font-bold uppercase text-[10px]" colSpan={3}>
                            TOTAL SCANNED ({selectedInvoice.items?.length || 0} BOXES &bull; {selectedInvoiceBreakdown.length} UNIQUE REFS)
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600">
                            {selectedInvoice.items?.reduce((sum, it) => sum + (it.expectedQty || it.quantity), 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-blue-700 text-sm">
                            {selectedInvoice.totalQuantity.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {(() => {
                              const totalDiff = selectedInvoice.items?.reduce((sum, it) => sum + (it.difference || 0), 0) || 0;
                              if (totalDiff === 0) return <span className="text-slate-400">0</span>;
                              if (totalDiff > 0) return <span className="text-emerald-600 font-bold">+{totalDiff}</span>;
                              return <span className="text-rose-600 font-bold">{totalDiff}</span>;
                            })()}
                          </td>
                          <td className="p-3 text-slate-400 text-[10px] font-normal">
                            Complete
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* TOTAL SUMMARY BY REFERENCE (Under the Scanned Records) */}
                <div id="invoice-totals-by-reference" className="space-y-4">
                  {/* Detailed Cards Breakdown Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedInvoiceBreakdown.map((breakdown) => (
                      <div 
                        key={`card-${breakdown.reference}`}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 transition-all shadow-2xs flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-extrabold text-sm text-slate-900">
                                {breakdown.reference}
                              </span>
                              <span className="text-xs font-mono font-bold text-slate-400">=&gt;</span>
                              <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {breakdown.totalQuantity.toLocaleString()} pcs
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1 font-medium">
                              {breakdown.description || refMap.get(breakdown.reference.toUpperCase())?.description || "—"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Boxes</span>
                            <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                              {breakdown.boxCount}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span>Customer: <strong className="text-slate-700">{breakdown.customer}</strong></span>
                          <span>Avg/Box: <strong className="text-slate-700">{Math.round(breakdown.totalQuantity / breakdown.boxCount)} pcs</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
                <div className="text-xs text-slate-500">
                  EPP Inventory Control &bull; Stock 1 Receiving System
                </div>
                <div className="flex items-center gap-2">
                  {onUpdateInvoice && (currentUser.role === "admin" || currentUser.role === "supervisor") && (
                    <button
                      onClick={() => handleOpenEditModal(selectedInvoice)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer border border-amber-300 shadow-2xs"
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-600" />
                      <span>Edit Invoice</span>
                    </button>
                  )}
                  {onDeleteInvoice && (currentUser.role === "admin" || currentUser.role === "supervisor") && (
                    <button
                      onClick={() => handleDeleteSingleInvoice(selectedInvoice)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer border border-rose-200"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Delete Invoice</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleExportCSV(selectedInvoice)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Invoice Modal */}
      <AnimatePresence>
        {editingInvoice && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-white w-full max-w-4xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden"
              id="invoice-edit-modal"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center font-bold">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold font-mono text-white">
                        MODIFY INVOICE
                      </h2>
                      {editingInvoice.status === "approved" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          APPROVED &bull; STOCK 1 SYNC ACTIVE
                        </span>
                      )}
                      {editingInvoice.status === "pending" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          PENDING
                        </span>
                      )}
                      {editingInvoice.status === "cancelled" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          CANCELLED
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCloseEditModal}
                  className="p-2 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="Close edit modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#f8fafc]">
                
                {/* Primary Meta Fields: Invoice # & Operator */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 font-mono">
                        Invoice / Note Number *
                      </label>
                      <div className="relative">
                        <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={editingInvoice.invoiceNumber}
                          onChange={(e) => setEditingInvoice({ ...editingInvoice, invoiceNumber: e.target.value.toUpperCase() })}
                          placeholder="e.g. INV-2024-001"
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 font-mono">
                        Operator / Receiving Agent *
                      </label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={editingInvoice.operator}
                          onChange={(e) => setEditingInvoice({ ...editingInvoice, operator: e.target.value })}
                          placeholder="Operator name"
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items & Scanned Boxes Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                        Scanned Boxes ({editingInvoice.items.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddEditItem}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Box</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200 uppercase font-mono tracking-wider sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-12 text-center">#</th>
                          <th className="p-2.5 min-w-[200px]">Reference Code</th>
                          <th className="p-2.5 w-28 text-right">Actual Qty (PCS)</th>
                          <th className="p-2.5 w-28 text-right">Expected Qty</th>
                          <th className="p-2.5 w-20 text-center">Diff</th>
                          <th className="p-2.5 w-14 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editingInvoice.items.map((item, idx) => {
                          const diff = (item.quantity || 0) - (item.expectedQty || 0);
                          const refData = refMap.get(item.reference.toUpperCase());

                          return (
                            <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-2.5 text-center font-mono text-slate-400 font-bold">
                                {idx + 1}
                              </td>

                              <td className="p-2.5">
                                <select
                                  value={item.reference}
                                  onChange={(e) => handleEditItemChange(idx, "reference", e.target.value)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-mono font-bold text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                >
                                  {references.map((r) => (
                                    <option key={r.code} value={r.code}>
                                      {r.code} - {r.description || r.customer || "Reference"}
                                    </option>
                                  ))}
                                  {!references.some((r) => r.code === item.reference) && (
                                    <option value={item.reference}>{item.reference}</option>
                                  )}
                                </select>
                                {refData?.customer && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Customer: {refData.customer} &bull; {refData.materialType || "Mesh"}
                                  </div>
                                )}
                              </td>

                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => handleEditItemChange(idx, "quantity", e.target.value)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-mono font-bold text-xs text-blue-600 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>

                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.expectedQty}
                                  onChange={(e) => handleEditItemChange(idx, "expectedQty", e.target.value)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-mono text-xs text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>

                              <td className="p-2.5 text-center font-mono">
                                {diff === 0 ? (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                    0
                                  </span>
                                ) : diff > 0 ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200">
                                    +{diff}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded text-[10px] font-bold border border-rose-200">
                                    {diff}
                                  </span>
                                )}
                              </td>

                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditItem(idx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                                  title="Remove this box"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Total by Reference Summary (Live Breakdown) */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                        TOTAL BY REFERENCE
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Total: <strong className="text-blue-600">{editingInvoice.totalQuantity.toLocaleString()} PCS</strong> across <strong className="text-slate-700">{editingInvoice.totalBoxes} boxes</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {editingInvoiceBreakdown.map((item) => (
                      <div
                        key={item.reference}
                        className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono font-bold text-xs text-slate-800">
                            {item.reference}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {item.boxes} {item.boxes === 1 ? 'box' : 'boxes'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-sm text-blue-600">
                            {item.quantity.toLocaleString()} pcs
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
                <div className="text-xs text-slate-500">
                  Ready to update invoice &bull; Stock 1 Receiving System
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded transition-colors cursor-pointer"
                    disabled={isSavingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditInvoice}
                    disabled={isSavingEdit}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {isSavingEdit ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Modifications</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
