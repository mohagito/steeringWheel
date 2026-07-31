import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, User, InventoryTransaction } from "../types";
import { 
  Search, Filter, ArrowLeftRight, Clock, Trash2, Edit2, Check, X, Download, FileText, Calendar, UserCheck, Tag, Info,
  Boxes, Factory, CheckCircle2, FileSpreadsheet, Layers, Sparkles, Plus, Power, CheckCircle, AlertOctagon
} from "lucide-react";
import Swal from "sweetalert2";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";
import { AddEditReferenceModal } from "./AddEditReferenceModal";

interface StockWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  transactions: InventoryTransaction[];
  currentUser: User;
  onDeleteBox?: (boxId: string) => Promise<void>;
  onUpdateBox?: (boxId: string, updatedFields: Partial<Box>) => Promise<void>;
  onCreateReference?: (refData: {
    code: string;
    description: string;
    customer: string;
    materialType: string;
    associatedLeather?: string;
    active?: boolean;
  }) => Promise<void>;
  onUpdateReference?: (refId: string, updatedFields: Partial<Reference>) => Promise<void>;
}

export default function StockWorkspace({ 
  boxes = [], 
  adjustments = [], 
  references = [], 
  transactions = [],
  currentUser,
  onDeleteBox,
  onUpdateBox,
  onCreateReference,
  onUpdateReference
}: StockWorkspaceProps) {
  
  // Local navigation tab: "warehouse" (Stock 1), "production" (Stock 2), "finished" (Stock 3), "reports" (Reports Suite)
  const [activeSubTab, setActiveSubTab] = useState<"warehouse" | "production" | "finished" | "reports">("warehouse");

  // Filter States (Dashboard & Inventory Views)
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState<"All" | "Mesh" | "Soft">("All");

  // Reference Add/Edit Modal State
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);
  const [selectedRefForEdit, setSelectedRefForEdit] = useState<Reference | null>(null);

  // Box Editing / Management States (Admins & Supervisors)
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [editedBoxRef, setEditedBoxRef] = useState<string>("");
  const [editedBoxQty, setEditedBoxQty] = useState<number>(0);
  const [editedBoxLoc, setEditedBoxLoc] = useState<string>("");

  // Reference Stock Direct Adjustment States
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [editingRefStage, setEditingRefStage] = useState<"stock1" | "stock2" | "stock3">("stock1");
  const [editingRefQty, setEditingRefQty] = useState<number>(0);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // -------------------------------------------------------------
  // REPORTS SUITE STATES
  // -------------------------------------------------------------
  const [reportType, setReportType] = useState<"history" | "received" | "transfers" | "deliveries" | "s1_stock" | "s2_stock" | "s3_stock">("history");
  const [repRefFilter, setRepRefFilter] = useState("All");
  const [repDateFilter, setRepDateFilter] = useState("");
  const [repOperatorFilter, setRepOperatorFilter] = useState("All");
  const [repMovementFilter, setRepMovementFilter] = useState("All");

  // Overall totals calculation for the top KPI summary cards
  const totalStock1 = useMemo(() => references.reduce((acc, r) => acc + (r.stock1 || 0), 0), [references]);
  const totalStock2 = useMemo(() => references.reduce((acc, r) => acc + (r.stock2 || 0), 0), [references]);
  const totalStock3 = useMemo(() => references.reduce((acc, r) => acc + (r.stock3 || 0), 0), [references]);

  // Get unique operators from transactions for the filter dropdown
  const operatorsList = useMemo(() => {
    const list = transactions.map(t => t.operatorName).filter(Boolean);
    return ["All", ...Array.from(new Set(list))];
  }, [transactions]);

  // Compute filtered dataset for the selected report
  const reportData = useMemo(() => {
    let baseData: any[] = [];

    if (reportType === "history") {
      baseData = transactions;
    } else if (reportType === "received") {
      baseData = transactions.filter(t => t.movementType === "STOCK 1 IN");
    } else if (reportType === "transfers") {
      baseData = transactions.filter(t => t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2");
    } else if (reportType === "deliveries") {
      baseData = transactions.filter(t => t.movementType === "STOCK 3 OUT" || t.movementType === "DELIVERY");
    } else if (reportType === "s1_stock") {
      baseData = references.map(r => ({
        id: r.id,
        reference: r.code,
        quantity: r.stock1 || 0,
        description: r.description,
        materialType: r.materialType,
        movementType: "STOCK 1 (Warehouse)",
        operatorName: "System",
        timestamp: r.lastUpdate
      }));
    } else if (reportType === "s2_stock") {
      baseData = references.map(r => ({
        id: r.id,
        reference: r.code,
        quantity: r.stock2 || 0,
        description: r.description,
        materialType: r.materialType,
        movementType: "STOCK 2 (WIP)",
        operatorName: "System",
        timestamp: r.lastUpdate
      }));
    } else if (reportType === "s3_stock") {
      baseData = references.map(r => ({
        id: r.id,
        reference: r.code,
        quantity: r.stock3 || 0,
        description: r.description,
        materialType: r.materialType,
        movementType: "STOCK 3 (Finished Goods)",
        operatorName: "System",
        timestamp: r.lastUpdate
      }));
    }

    return baseData.filter(item => {
      const refCode = item.reference || item.code || "";
      const matchesRef = repRefFilter === "All" || refCode.toUpperCase() === repRefFilter.toUpperCase();
      
      const dateStr = item.timestamp || "";
      const matchesDate = !repDateFilter || dateStr.startsWith(repDateFilter);

      const matchesOp = repOperatorFilter === "All" || item.operatorName === repOperatorFilter;
      const matchesMove = repMovementFilter === "All" || item.movementType === repMovementFilter;

      return matchesRef && matchesDate && matchesOp && matchesMove;
    });

  }, [reportType, repRefFilter, repDateFilter, repOperatorFilter, repMovementFilter, transactions, references]);

  // Export filtered report to Excel/CSV
  const handleExportCSV = () => {
    if (reportData.length === 0) {
      Swal.fire({
        title: "No Data",
        text: "No data available to export.",
        icon: "info",
        confirmButtonColor: "#2563eb"
      });
      return;
    }

    let headers: string[] = [];
    let rows: string[][] = [];

    if (reportType === "s1_stock" || reportType === "s2_stock" || reportType === "s3_stock") {
      headers = ["Reference Code", "Description", "Material Type", "Current Stock (PCS)", "Last Update"];
      rows = reportData.map(row => [
        row.reference,
        `"${row.description.replace(/"/g, '""')}"`,
        row.materialType,
        row.quantity.toString(),
        row.timestamp ? new Date(row.timestamp).toLocaleString() : "N/A"
      ]);
    } else {
      headers = ["ID", "Timestamp", "Movement Type", "Reference", "Stock Level", "Quantity", "Operator", "Notes"];
      rows = reportData.map(row => [
        row.id,
        row.timestamp ? new Date(row.timestamp).toLocaleString() : "N/A",
        row.movementType,
        row.reference,
        row.stock || "N/A",
        row.quantity.toString(),
        row.operatorName,
        `"${(row.notes || "").replace(/"/g, '""')}"`
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = `MES_Report_${reportType}_${new Date().toISOString().split("T")[0]}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveBoxChange = async (boxId: string) => {
    if (!onUpdateBox) return;
    try {
      await onUpdateBox(boxId, {
        reference: editedBoxRef.trim().toUpperCase(),
        expectedQty: Number(editedBoxQty),
        actualQty: Number(editedBoxQty),
        location: editedBoxLoc.trim()
      });
      setStatusMsg({ type: "success", text: "Carton updated & stock recalculated successfully." });
      setEditingBoxId(null);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Failed to update: ${err.message || err}` });
    }
  };

  const handleDeleteBoxAction = async (boxId: string) => {
    if (!onDeleteBox) return;

    const result = await Swal.fire({
      title: "Delete Carton Box?",
      text: `Are you sure you want to permanently delete carton record "${boxId}" from Stock 1? The stock level for this reference will automatically be deducted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete Carton",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        await onDeleteBox(boxId);
        await Swal.fire({
          title: "Carton Deleted!",
          text: "The carton was successfully deleted and Stock 1 quantity updated.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false
        });
        setStatusMsg({ type: "success", text: "Carton deleted successfully and stock updated." });
        setTimeout(() => setStatusMsg(null), 3000);
      } catch (err: any) {
        console.error(err);
        await Swal.fire({
          title: "Error Deleting Carton",
          text: err?.message || "Failed to delete carton box.",
          icon: "error",
          confirmButtonColor: "#2563eb"
        });
        setStatusMsg({ type: "error", text: `Failed to delete: ${err.message || err}` });
      }
    }
  };

  const handleSaveRefStockChange = async (refId: string) => {
    if (!onUpdateReference) return;
    try {
      await onUpdateReference(refId, {
        [editingRefStage]: Number(editingRefQty)
      });
      setStatusMsg({ type: "success", text: `Reference ${editingRefStage.toUpperCase()} stock level updated successfully.` });
      setEditingRefId(null);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Failed to update reference stock: ${err.message || err}` });
    }
  };

  const filteredReferences = useMemo(() => {
    return references.filter(ref => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = ref.code.toLowerCase().includes(q) || 
                            ref.description.toLowerCase().includes(q) ||
                            (ref.customer && ref.customer.toLowerCase().includes(q));
      const matchesMaterial = materialFilter === "All" || ref.materialType === materialFilter;
      
      return matchesSearch && matchesMaterial;
    });
  }, [references, searchQuery, materialFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto" id="stock-workspace-container">
      
      {/* Visual KPI Summary Dashboard Cards (Zeeve.io inspired) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Stock 1 Raw Warehouse */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-inner">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 1 (Warehouse)</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{totalStock1.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
            <span className="inline-block mt-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Raw Storeroom
            </span>
          </div>
        </div>

        {/* Card 2: Stock 2 Storage 2 (Mallas Pegadas) */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 shadow-inner">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 2 (Mallas Pegadas)</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{totalStock2.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
            <span className="inline-block mt-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Storage 2 (Plantilla + Malla)
            </span>
          </div>
        </div>

        {/* Card 3: Stock 3 Finished Goods */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 3 (Finished)</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{totalStock3.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
            <span className="inline-block mt-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              Ready for Shipment
            </span>
          </div>
        </div>

        {/* Card 4: Master References */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 shadow-inner">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Master References</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{references.length} <span className="text-xs font-medium text-slate-400">Active</span></h3>
            <span className="inline-block mt-1 text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
              Catalog Items
            </span>
          </div>
        </div>

      </div>

      {/* Modern Floating Pill Tab Bar */}
      <div className="bg-white/80 backdrop-blur-md p-2 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-200/30 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2" id="stock-sub-tabs-bar">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveSubTab("warehouse")}
            className={`px-4 py-2.5 text-xs font-bold rounded-2xl cursor-pointer transition-all flex items-center gap-2 ${
              activeSubTab === "warehouse"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>1. Warehouse Raw (Stock 1)</span>
          </button>
          
          <button
            onClick={() => setActiveSubTab("production")}
            className={`px-4 py-2.5 text-xs font-bold rounded-2xl cursor-pointer transition-all flex items-center gap-2 ${
              activeSubTab === "production"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Factory className="w-4 h-4" />
            <span>2. MALLAS PEGADAS (Stock 2)</span>
          </button>
          
          <button
            onClick={() => setActiveSubTab("finished")}
            className={`px-4 py-2.5 text-xs font-bold rounded-2xl cursor-pointer transition-all flex items-center gap-2 ${
              activeSubTab === "finished"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>3. Finished Goods (Stock 3)</span>
          </button>
          
          <button
            onClick={() => setActiveSubTab("reports")}
            className={`px-4 py-2.5 text-xs font-bold rounded-2xl cursor-pointer transition-all flex items-center gap-2 ${
              activeSubTab === "reports"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>4. Traceability Reports</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-slate-500 pr-3">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          <span>Logged in: {currentUser.fullName}</span>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-2xl text-xs font-semibold border shadow-xs animate-fadeIn ${
          statusMsg.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
            : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: WAREHOUSE INVENTORY (STOCK 1)                      */}
      {/* ========================================================= */}
      {activeSubTab === "warehouse" && (
        <div className="space-y-6">
          
          {/* Main Stock 1 References List */}
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-blue-600" />
                  Stock 1 - Warehouse Raw Inventory
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Untouched raw materials stored in warehouse
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search code, customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-48 pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-xs rounded-2xl font-mono focus:outline-none transition-all"
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
                  className="w-32"
                  size="sm"
                />
                {(currentUser.role === "admin" || currentUser.role === "supervisor") && onCreateReference && (
                  <button
                    onClick={() => {
                      setSelectedRefForEdit(null);
                      setIsRefModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Reference</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                    <th className="py-3 px-4">Reference Code</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Material Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Warehouse Qty (Stock 1)</th>
                    <th className="py-3 px-4 text-right">Last Update</th>
                    {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                      <th className="py-3 px-4 text-center">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredReferences.map(ref => {
                    const isRefActive = ref.active !== false;
                    return (
                      <tr key={ref.id} className={`hover:bg-slate-50/70 transition-colors ${!isRefActive ? "bg-slate-50/50 opacity-75" : ""}`}>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {ref.code}
                        </td>
                        <td className="py-3 px-4">
                          {ref.customer ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md uppercase font-mono">
                              {ref.customer}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded-full">
                            {ref.materialType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isRefActive ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md uppercase font-mono">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold rounded-md uppercase font-mono">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-600 text-sm">
                          {editingRefId === ref.id && editingRefStage === "stock1" ? (
                            <input
                              type="number"
                              min="0"
                              value={editingRefQty}
                              onChange={(e) => setEditingRefQty(Number(e.target.value))}
                              className="w-24 text-right border border-blue-500 px-2 py-1 font-mono text-xs rounded-xl focus:outline-none"
                            />
                          ) : (
                            <>
                              {(ref.stock1 || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-sans font-normal">PCS</span>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                          {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleString() : "N/A"}
                        </td>
                        {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                          <td className="py-2 px-4 text-center">
                            {editingRefId === ref.id && editingRefStage === "stock1" ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleSaveRefStockChange(ref.id)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl cursor-pointer"
                                  title="Save Stock"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingRefId(null)}
                                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingRefId(ref.id);
                                    setEditingRefStage("stock1");
                                    setEditingRefQty(ref.stock1 || 0);
                                  }}
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                                  title="Edit Stock Level"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Stock</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedRefForEdit(ref);
                                    setIsRefModalOpen(true);
                                  }}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
                                  title="Edit Reference Metadata"
                                >
                                  <Tag className="w-3.5 h-3.5" />
                                </button>

                                {onUpdateReference && (
                                  <button
                                    onClick={() => onUpdateReference(ref.id, { active: !isRefActive })}
                                    className={`p-1.5 rounded-xl cursor-pointer transition-colors ${
                                      isRefActive 
                                        ? "bg-rose-50 hover:bg-rose-100 text-rose-700" 
                                        : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                                    }`}
                                    title={isRefActive ? "Deactivate Reference" : "Activate Reference"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Carton Box Inventory List (Scanned cartons list) */}
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden p-6">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-slate-700" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Stock 1 - Carton Boxes Registry (Traceability)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Individual carton box records logged by operators
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold font-mono text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                {boxes.length} Active Cartons
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                    <th className="py-3 px-4">Box Barcode</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Scanned At</th>
                    {(currentUser.role === "admin" || currentUser.role === "supervisor") && <th className="py-3 px-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {boxes.map(box => (
                    <tr key={box.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-slate-900 font-bold">{box.barcode}</td>
                      <td className="py-3 px-4 font-bold text-blue-700">
                        {editingBoxId === box.id ? (
                          <input
                            type="text"
                            value={editedBoxRef}
                            onChange={(e) => setEditedBoxRef(e.target.value)}
                            className="w-28 uppercase border border-blue-400 px-2 py-1 font-mono text-xs rounded-xl focus:outline-none"
                            placeholder="REF CODE"
                          />
                        ) : (
                          box.reference
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-sans text-xs">
                        {editingBoxId === box.id ? (
                          <input
                            type="text"
                            value={editedBoxLoc}
                            onChange={(e) => setEditedBoxLoc(e.target.value)}
                            className="w-32 border border-blue-400 px-2 py-1 font-sans text-xs rounded-xl focus:outline-none"
                            placeholder="Location"
                          />
                        ) : (
                          box.location
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                        {editingBoxId === box.id ? (
                          <input
                            type="number"
                            value={editedBoxQty}
                            onChange={(e) => setEditedBoxQty(Number(e.target.value))}
                            className="w-20 text-right border border-blue-400 px-2 py-1 font-mono text-xs rounded-xl focus:outline-none"
                          />
                        ) : box.actualQty !== undefined && box.actualQty !== box.expectedQty ? (
                          <div>
                            <span className="font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              Real: {box.actualQty} PCS
                            </span>
                            <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                              Label: {box.expectedQty} (Diff: {box.actualQty - box.expectedQty > 0 ? '+' : ''}{box.actualQty - box.expectedQty})
                            </span>
                          </div>
                        ) : (
                          <span>{(box.actualQty ?? box.expectedQty ?? 0).toLocaleString()} PCS</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-[11px] text-slate-400">
                        {box.createdAt ? new Date(box.createdAt).toLocaleString() : "N/A"}
                      </td>
                      {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                        <td className="py-2 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {editingBoxId === box.id ? (
                              <>
                                <button
                                  onClick={() => handleSaveBoxChange(box.id)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl cursor-pointer"
                                  title="Save Changes"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingBoxId(null)}
                                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingBoxId(box.id);
                                    setEditedBoxRef(box.reference || "");
                                    setEditedBoxQty(box.actualQty ?? box.expectedQty ?? 0);
                                    setEditedBoxLoc(box.location || "");
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl cursor-pointer"
                                  title="Edit Quantity"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBoxAction(box.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                                  title="Delete Carton"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {boxes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-mono">
                        No carton boxes in warehouse. Use Operator terminal to receive cartons.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PRODUCTION STOCK (STOCK 2)                        */}
      {/* ========================================================= */}
      {activeSubTab === "production" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Factory className="w-5 h-5 text-amber-500" />
                  Stock 2 - Production Floor Material Levels (Mallas Pegadas)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Materials transferred to gluing and active production lines
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search code, customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-48 pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 text-xs rounded-2xl font-mono focus:outline-none transition-all"
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
                  className="w-32"
                  size="sm"
                />
                {(currentUser.role === "admin" || currentUser.role === "supervisor") && onCreateReference && (
                  <button
                    onClick={() => {
                      setSelectedRefForEdit(null);
                      setIsRefModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Reference</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                    <th className="py-3 px-4">Reference Code</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Material Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Production Qty (Stock 2)</th>
                    <th className="py-3 px-4 text-right">Last Update</th>
                    {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                      <th className="py-3 px-4 text-center">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredReferences.map(ref => {
                    const isRefActive = ref.active !== false;
                    return (
                      <tr key={ref.id} className={`hover:bg-slate-50/70 transition-colors ${!isRefActive ? "bg-slate-50/50 opacity-75" : ""}`}>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{ref.code}</td>
                        <td className="py-3 px-4">
                          {ref.customer ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md uppercase font-mono">
                              {ref.customer}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-mono text-[10px] font-bold rounded-full">
                            {ref.materialType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isRefActive ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md uppercase font-mono">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold rounded-md uppercase font-mono">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-amber-600 text-sm">
                          {editingRefId === ref.id && editingRefStage === "stock2" ? (
                            <input
                              type="number"
                              min="0"
                              value={editingRefQty}
                              onChange={(e) => setEditingRefQty(Number(e.target.value))}
                              className="w-24 text-right border border-amber-500 px-2 py-1 font-mono text-xs rounded-xl focus:outline-none"
                            />
                          ) : (
                            <>
                              {(ref.stock2 || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-sans font-normal">PCS</span>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                          {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleString() : "N/A"}
                        </td>
                        {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                          <td className="py-2 px-4 text-center">
                            {editingRefId === ref.id && editingRefStage === "stock2" ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleSaveRefStockChange(ref.id)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl cursor-pointer"
                                  title="Save Stock"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingRefId(null)}
                                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingRefId(ref.id);
                                    setEditingRefStage("stock2");
                                    setEditingRefQty(ref.stock2 || 0);
                                  }}
                                  className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[10px] rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                                  title="Edit Stock 2"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Stock</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedRefForEdit(ref);
                                    setIsRefModalOpen(true);
                                  }}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
                                  title="Edit Reference Metadata"
                                >
                                  <Tag className="w-3.5 h-3.5" />
                                </button>
                                {onUpdateReference && (
                                  <button
                                    onClick={() => onUpdateReference(ref.id, { active: !isRefActive })}
                                    className={`p-1.5 rounded-xl cursor-pointer transition-colors ${
                                      isRefActive 
                                        ? "bg-rose-50 hover:bg-rose-100 text-rose-700" 
                                        : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                                    }`}
                                    title={isRefActive ? "Deactivate Reference" : "Activate Reference"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: FINISHED GOODS STOCK (STOCK 3)                     */}
      {/* ========================================================= */}
      {activeSubTab === "finished" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Stock 3 - Finished Goods Storeroom Levels
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Completed assembled items ready for shipping to clients
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search code, customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-48 pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-xs rounded-2xl font-mono focus:outline-none transition-all"
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
                  className="w-32"
                  size="sm"
                />
                {(currentUser.role === "admin" || currentUser.role === "supervisor") && onCreateReference && (
                  <button
                    onClick={() => {
                      setSelectedRefForEdit(null);
                      setIsRefModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Reference</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                    <th className="py-3 px-4">Reference Code</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Material Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Finished Goods Qty (Stock 3)</th>
                    <th className="py-3 px-4 text-right">Last Update</th>
                    {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                      <th className="py-3 px-4 text-center">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredReferences.map(ref => {
                    const isRefActive = ref.active !== false;
                    return (
                      <tr key={ref.id} className={`hover:bg-slate-50/70 transition-colors ${!isRefActive ? "bg-slate-50/50 opacity-75" : ""}`}>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{ref.code}</td>
                        <td className="py-3 px-4">
                          {ref.customer ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md uppercase font-mono">
                              {ref.customer}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold rounded-full">
                            {ref.materialType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isRefActive ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md uppercase font-mono">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold rounded-md uppercase font-mono">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-600 text-sm">
                          {editingRefId === ref.id && editingRefStage === "stock3" ? (
                            <input
                              type="number"
                              min="0"
                              value={editingRefQty}
                              onChange={(e) => setEditingRefQty(Number(e.target.value))}
                              className="w-24 text-right border border-emerald-500 px-2 py-1 font-mono text-xs rounded-xl focus:outline-none"
                            />
                          ) : (
                            <>
                              {(ref.stock3 || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-sans font-normal">PCS</span>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                          {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleString() : "N/A"}
                        </td>
                        {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                          <td className="py-2 px-4 text-center">
                            {editingRefId === ref.id && editingRefStage === "stock3" ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleSaveRefStockChange(ref.id)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl cursor-pointer"
                                  title="Save Stock"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingRefId(null)}
                                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingRefId(ref.id);
                                    setEditingRefStage("stock3");
                                    setEditingRefQty(ref.stock3 || 0);
                                  }}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                                  title="Edit Stock 3"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Stock</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedRefForEdit(ref);
                                    setIsRefModalOpen(true);
                                  }}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
                                  title="Edit Reference Metadata"
                                >
                                  <Tag className="w-3.5 h-3.5" />
                                </button>

                                {onUpdateReference && (
                                  <button
                                    onClick={() => onUpdateReference(ref.id, { active: !isRefActive })}
                                    className={`p-1.5 rounded-xl cursor-pointer transition-colors ${
                                      isRefActive 
                                        ? "bg-rose-50 hover:bg-rose-100 text-rose-700" 
                                        : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                                    }`}
                                    title={isRefActive ? "Deactivate Reference" : "Activate Reference"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: TRACEABILITY REPORTS SUITE                         */}
      {/* ========================================================= */}
      {activeSubTab === "reports" && (
        <div className="space-y-6">
          
          {/* Controls Panel */}
          <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-xl shadow-slate-200/40 space-y-5">
            
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-2xl">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Custom Reports &amp; Traceability Suite
                </h3>
                <p className="text-xs text-slate-400">
                  Compile custom stock logs and export formatted sheets to CSV / Excel
                </p>
              </div>
            </div>

            {/* Config Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* Report Category Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  1. Report Type
                </label>
                <CustomSelect
                  value={reportType}
                  onChange={(val) => setReportType(val as any)}
                  options={[
                    { value: "history", label: "Full Transaction History" },
                    { value: "received", label: "Material Received (S1 IN)" },
                    { value: "transfers", label: "Warehouse-Production Transfers" },
                    { value: "deliveries", label: "Customer Deliveries (S3 OUT)" },
                    { value: "s1_stock", label: "Current Raw Stock (S1)" },
                    { value: "s2_stock", label: "Current WIP Stock (S2)" },
                    { value: "s3_stock", label: "Current Finished Stock (S3)" }
                  ]}
                />
              </div>

              {/* Reference Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  2. Reference Filter
                </label>
                <CustomReferenceSelect
                  references={references}
                  value={repRefFilter === "All" ? "" : repRefFilter}
                  onChange={(val) => setRepRefFilter(val || "All")}
                  placeholder="All References"
                />
              </div>

              {/* Date Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  3. Date Filter
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={repDateFilter}
                    onChange={(e) => setRepDateFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 text-xs rounded-2xl font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Operator Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  4. Operator Name
                </label>
                <CustomSelect
                  value={repOperatorFilter}
                  onChange={(val) => setRepOperatorFilter(val)}
                  options={operatorsList.map(op => ({ value: op, label: op }))}
                />
              </div>

              {/* Movement Type Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  5. Movement Type
                </label>
                <CustomSelect
                  disabled={reportType !== "history"}
                  value={repMovementFilter}
                  onChange={(val) => setRepMovementFilter(val)}
                  options={[
                    { value: "All", label: "All Movements" },
                    { value: "STOCK 1 IN", label: "STOCK 1 IN" },
                    { value: "TRANSFER", label: "TRANSFER" },
                    { value: "STOCK 2 OUT", label: "STOCK 2 OUT" }
                  ]}
                />
              </div>

            </div>

            {/* Execution Buttons */}
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-500">
                Matches found: <strong className="text-slate-900">{reportData.length} entries</strong>
              </span>
              <button
                onClick={handleExportCSV}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold uppercase rounded-2xl shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export CSV / Excel
              </button>
            </div>

          </div>

          {/* Results Table Panel */}
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
              <Info className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                Report Output Results
              </h3>
            </div>

            <div className="overflow-x-auto">
              {reportType === "s1_stock" || reportType === "s2_stock" || reportType === "s3_stock" ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                      <th className="py-3 px-4">Reference Code</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Material Type</th>
                      <th className="py-3 px-4 text-right">Current Stock Qty</th>
                      <th className="py-3 px-4 text-right">Last System Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono">
                    {reportData.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{row.reference}</td>
                        <td className="py-3 px-4 font-sans text-slate-600 truncate max-w-xs">{row.description}</td>
                        <td className="py-3 px-4">{row.materialType}</td>
                        <td className="py-3 px-4 text-right text-slate-900 font-extrabold text-sm">{row.quantity.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-slate-400 text-[11px]">
                          {row.timestamp ? new Date(row.timestamp).toLocaleString() : "N/A"}
                        </td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-mono text-xs">
                          No stock entries available for compile.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Movement Type</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Source Stock</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono">
                    {reportData.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-[11px] text-slate-400">
                          {row.timestamp ? new Date(row.timestamp).toLocaleString() : "N/A"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                            row.movementType === "STOCK 1 IN" 
                              ? "bg-blue-50 text-blue-700" 
                              : row.movementType === "TRANSFER"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {row.movementType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.reference}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{row.stock}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm">
                          {row.quantity.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 font-sans">{row.operatorName}</td>
                        <td className="py-3 px-4 text-xs text-slate-500 font-sans max-w-xs truncate" title={row.notes}>
                          {row.notes}
                        </td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-mono text-xs">
                          No transactions found matching active report parameters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Reference Creation & Editing Modal */}
      {onCreateReference && onUpdateReference && (
        <AddEditReferenceModal
          isOpen={isRefModalOpen}
          onClose={() => {
            setIsRefModalOpen(false);
            setSelectedRefForEdit(null);
          }}
          existingRef={selectedRefForEdit}
          currentUser={currentUser}
          onCreateReference={onCreateReference}
          onUpdateReference={onUpdateReference}
        />
      )}

    </div>
  );
}

