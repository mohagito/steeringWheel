import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, User, InventoryTransaction } from "../types";
import { 
  Search, Filter, ArrowLeftRight, Clock, Trash2, Edit2, Check, X, Download, FileText, Calendar, UserCheck, Tag, Info
} from "lucide-react";

interface StockWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  transactions: InventoryTransaction[];
  currentUser: User;
  onDeleteBox?: (boxId: string) => Promise<void>;
  onUpdateBox?: (boxId: string, updatedFields: Partial<Box>) => Promise<void>;
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
  onUpdateReference
}: StockWorkspaceProps) {
  
  // Local navigation tab: "warehouse" (Stock 1), "production" (Stock 2), "reports" (Reports Suite)
  const [activeSubTab, setActiveSubTab] = useState<"warehouse" | "production" | "reports">("warehouse");

  // Filter States (Dashboard & Inventory Views)
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState<"All" | "Mesh" | "Soft">("All");

  // Box Editing / Management States (Admins only)
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [editedBoxQty, setEditedBoxQty] = useState<number>(0);
  const [editedBoxLoc, setEditedBoxLoc] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // -------------------------------------------------------------
  // REPORTS SUITE STATES
  // -------------------------------------------------------------
  const [reportType, setReportType] = useState<"history" | "received" | "transfers" | "deliveries" | "s1_stock" | "s2_stock">("history");
  const [repRefFilter, setRepRefFilter] = useState("All");
  const [repDateFilter, setRepDateFilter] = useState("");
  const [repOperatorFilter, setRepOperatorFilter] = useState("All");
  const [repMovementFilter, setRepMovementFilter] = useState("All");

  // Get unique operators from transactions for the filter dropdown
  const operatorsList = useMemo(() => {
    const list = transactions.map(t => t.operatorName).filter(Boolean);
    return ["All", ...Array.from(new Set(list))];
  }, [transactions]);

  // Compute filtered dataset for the selected report
  const reportData = useMemo(() => {
    let baseData: any[] = [];

    // 1. Select the base dataset based on Report Type
    if (reportType === "history") {
      baseData = transactions;
    } else if (reportType === "received") {
      baseData = transactions.filter(t => t.movementType === "STOCK 1 IN");
    } else if (reportType === "transfers") {
      baseData = transactions.filter(t => t.movementType === "TRANSFER");
    } else if (reportType === "deliveries") {
      baseData = transactions.filter(t => t.movementType === "STOCK 2 OUT");
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
        movementType: "STOCK 2 (Production)",
        operatorName: "System",
        timestamp: r.lastUpdate
      }));
    }

    // 2. Apply Filters (Reference, Date, Operator, Movement Type)
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

  // 3. Export filtered report to Excel/CSV
  const handleExportCSV = () => {
    if (reportData.length === 0) {
      alert("No data available to export.");
      return;
    }

    let headers: string[] = [];
    let rows: string[][] = [];

    if (reportType === "s1_stock" || reportType === "s2_stock") {
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

  // -------------------------------------------------------------
  // STOCK ACTIONS (Admins only)
  // -------------------------------------------------------------
  const handleSaveBoxChange = async (boxId: string) => {
    if (!onUpdateBox) return;
    try {
      await onUpdateBox(boxId, {
        expectedQty: Number(editedBoxQty),
        location: editedBoxLoc.trim()
      });
      setStatusMsg({ type: "success", text: "Carton quantity updated successfully." });
      setEditingBoxId(null);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Failed to update: ${err.message || err}` });
    }
  };

  const handleDeleteBoxAction = async (boxId: string) => {
    if (!onDeleteBox) return;
    if (!window.confirm("Are you sure you want to permanently delete this carton record from Stock 1?")) return;
    try {
      await onDeleteBox(boxId);
      setStatusMsg({ type: "success", text: "Carton deleted successfully." });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Failed to delete: ${err.message || err}` });
    }
  };

  // Filter references based on basic search query in Inventory Tabs
  const filteredReferences = useMemo(() => {
    return references.filter(ref => {
      const matchesSearch = ref.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            ref.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMaterial = materialFilter === "All" || ref.materialType === materialFilter;
      return matchesSearch && matchesMaterial;
    });
  }, [references, searchQuery, materialFilter]);

  return (
    <div className="space-y-6" id="stock-workspace-container">
      
      {/* Sub Tab Navigation */}
      <div className="flex justify-between items-center bg-slate-200 p-1 border border-slate-300 rounded-sm" id="stock-sub-tabs-bar">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveSubTab("warehouse")}
            className={`px-4 py-2 font-mono text-xs font-bold uppercase rounded-sm cursor-pointer transition-all ${
              activeSubTab === "warehouse"
                ? "bg-white text-slate-900 shadow-xs border-b border-slate-400"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            1. Warehouse Inventory (Stock 1)
          </button>
          <button
            onClick={() => setActiveSubTab("production")}
            className={`px-4 py-2 font-mono text-xs font-bold uppercase rounded-sm cursor-pointer transition-all ${
              activeSubTab === "production"
                ? "bg-white text-slate-900 shadow-xs border-b border-slate-400"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            2. Production Stock (Stock 2)
          </button>
          <button
            onClick={() => setActiveSubTab("reports")}
            className={`px-4 py-2 font-mono text-xs font-bold uppercase rounded-sm cursor-pointer transition-all ${
              activeSubTab === "reports"
                ? "bg-white text-slate-900 shadow-xs border-b border-slate-400"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            3. Traceability Reports Suite
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mr-2 uppercase">
          <span>Active Operator: {currentUser.fullName}</span>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-sm text-xs font-mono border ${
          statusMsg.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-rose-50 border-rose-200 text-rose-800"
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
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 bg-sky-600 rounded-sm"></div>
                <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-slate-800">
                  Stock 1 - Warehouse Storeroom Levels
                </h3>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Filter references..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono w-40"
                />
                <select
                  value={materialFilter}
                  onChange={(e) => setMaterialFilter(e.target.value as any)}
                  className="px-2 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono"
                >
                  <option value="All">All types</option>
                  <option value="Mesh">Mesh</option>
                  <option value="Soft">Soft</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-mono font-bold">
                    <th className="py-2 px-4">Reference Code</th>
                    <th className="py-2 px-4">Description</th>
                    <th className="py-2 px-4">Material Type</th>
                    <th className="py-2 px-4 text-right">Warehouse Qty (Stock 1)</th>
                    <th className="py-2 px-4 text-right">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredReferences.map(ref => (
                    <tr key={ref.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 font-mono font-bold text-slate-900">{ref.code}</td>
                      <td className="py-2 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                      <td className="py-2 px-4 font-mono">{ref.materialType}</td>
                      <td className="py-2 px-4 text-right font-mono font-bold text-sky-600">
                        {(ref.stock1 || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-sans">PCS</span>
                      </td>
                      <td className="py-2 px-4 text-right text-[10px] text-slate-400 font-mono">
                        {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleString() : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Carton Box Inventory List (Scanned cartons list) */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-slate-800">
                  Stock 1 - Carton Boxes Registry (Traceability)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-sm">
                {boxes.length} Active Cartons
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-mono font-bold">
                    <th className="py-2 px-4">Box Barcode</th>
                    <th className="py-2 px-4">Reference</th>
                    <th className="py-2 px-4">Location</th>
                    <th className="py-2 px-4 text-right">Quantity</th>
                    <th className="py-2 px-4 text-right">Scanned At</th>
                    {currentUser.role === "admin" && <th className="py-2 px-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {boxes.map(box => (
                    <tr key={box.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 text-slate-900 font-bold">{box.barcode}</td>
                      <td className="py-2 px-4">{box.reference}</td>
                      <td className="py-2 px-4 text-slate-500 font-sans text-[11px]">{box.location}</td>
                      <td className="py-2 px-4 text-right font-bold text-slate-850">
                        {editingBoxId === box.id ? (
                          <input
                            type="number"
                            value={editedBoxQty}
                            onChange={(e) => setEditedBoxQty(Number(e.target.value))}
                            className="w-16 text-right border border-slate-400 px-1 py-0.5 font-mono text-xs rounded-sm"
                          />
                        ) : (
                          (box.expectedQty || 0).toLocaleString()
                        )}
                      </td>
                      <td className="py-2 px-4 text-right text-[10px] text-slate-400">
                        {box.createdAt ? new Date(box.createdAt).toLocaleString() : "N/A"}
                      </td>
                      {currentUser.role === "admin" && (
                        <td className="py-1 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {editingBoxId === box.id ? (
                              <>
                                <button
                                  onClick={() => handleSaveBoxChange(box.id)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-sm cursor-pointer"
                                  title="Save Changes"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingBoxId(null)}
                                  className="p-1 text-slate-500 hover:bg-slate-100 rounded-sm cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingBoxId(box.id);
                                    setEditedBoxQty(box.expectedQty || 0);
                                    setEditedBoxLoc(box.location || "");
                                  }}
                                  className="p-1 text-sky-600 hover:bg-sky-50 rounded-sm cursor-pointer"
                                  title="Edit Quantity"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBoxAction(box.id)}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded-sm cursor-pointer"
                                  title="Delete Carton"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 bg-emerald-600 rounded-sm"></div>
                <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-slate-800">
                  Stock 2 - Production Floor Material Levels
                </h3>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Filter references..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono w-40"
                />
                <select
                  value={materialFilter}
                  onChange={(e) => setMaterialFilter(e.target.value as any)}
                  className="px-2 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono"
                >
                  <option value="All">All types</option>
                  <option value="Mesh">Mesh</option>
                  <option value="Soft">Soft</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-mono font-bold">
                    <th className="py-2 px-4">Reference Code</th>
                    <th className="py-2 px-4">Description</th>
                    <th className="py-2 px-4">Material Type</th>
                    <th className="py-2 px-4 text-right">Production Qty (Stock 2)</th>
                    <th className="py-2 px-4 text-right">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredReferences.map(ref => (
                    <tr key={ref.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 font-mono font-bold text-slate-900">{ref.code}</td>
                      <td className="py-2 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                      <td className="py-2 px-4 font-mono">{ref.materialType}</td>
                      <td className="py-2 px-4 text-right font-mono font-bold text-emerald-600">
                        {(ref.stock2 || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-sans">PCS</span>
                      </td>
                      <td className="py-2 px-4 text-right text-[10px] text-slate-400 font-mono">
                        {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleString() : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: TRACEABILITY REPORTS SUITE                         */}
      {/* ========================================================= */}
      {activeSubTab === "reports" && (
        <div className="space-y-6">
          
          {/* Controls Panel */}
          <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-4">
            
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="w-5 h-5 text-slate-700" />
              <div>
                <h3 className="text-xs uppercase font-bold tracking-wider text-slate-800 font-mono">
                  Custom Reports Generator
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Select and filter trace-data. Export dynamically compiled sheets to standard Excel/CSV formats.
                </p>
              </div>
            </div>

            {/* Config Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* Report Category Selection */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-500">
                  1. Report Type
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-300 text-xs rounded-sm font-mono focus:outline-none focus:border-slate-800 cursor-pointer"
                >
                  <option value="history">Full Transaction History</option>
                  <option value="received">Material Received (S1 IN)</option>
                  <option value="transfers">Warehouse-Production Transfers</option>
                  <option value="deliveries">Production Deliveries (S2 OUT)</option>
                  <option value="s1_stock">Current Warehouse Stock (S1)</option>
                  <option value="s2_stock">Current Production Stock (S2)</option>
                </select>
              </div>

              {/* Reference Selection */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-500">
                  2. Reference Filter
                </label>
                <select
                  value={repRefFilter}
                  onChange={(e) => setRepRefFilter(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-300 text-xs rounded-sm font-mono focus:outline-none focus:border-slate-800 cursor-pointer"
                >
                  <option value="All">All References</option>
                  {references.map(r => (
                    <option key={r.id} value={r.code}>{r.code}</option>
                  ))}
                </select>
              </div>

              {/* Date Selection */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-500">
                  3. Date (YYYY-MM-DD)
                </label>
                <div className="relative">
                  <Calendar className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={repDateFilter}
                    onChange={(e) => setRepDateFilter(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-300 text-xs rounded-sm font-mono focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              {/* Operator Selection */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-500">
                  4. Operator Name
                </label>
                <select
                  value={repOperatorFilter}
                  onChange={(e) => setRepOperatorFilter(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-300 text-xs rounded-sm font-mono focus:outline-none focus:border-slate-800 cursor-pointer"
                >
                  {operatorsList.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              {/* Movement Type Selection */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-500">
                  5. Movement Type
                </label>
                <select
                  disabled={reportType !== "history"}
                  value={repMovementFilter}
                  onChange={(e) => setRepMovementFilter(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-300 text-xs rounded-sm font-mono focus:outline-none focus:border-slate-800 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <option value="All">All Movements</option>
                  <option value="STOCK 1 IN">STOCK 1 IN</option>
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="STOCK 2 OUT">STOCK 2 OUT</option>
                </select>
              </div>

            </div>

            {/* Execution Buttons */}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-mono text-slate-500">
                Matches found: <strong className="text-slate-900">{reportData.length} entries</strong>
              </span>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-mono text-xs font-bold uppercase rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export to Excel (CSV)
              </button>
            </div>

          </div>

          {/* Results Table Panel */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-slate-800">
                  Compiled Report Results Output
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              {reportType === "s1_stock" || reportType === "s2_stock" ? (
                // Stock-specific columns table format
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-mono font-bold">
                      <th className="py-2.5 px-4">Predefined Reference</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4">Material Type</th>
                      <th className="py-2.5 px-4 text-right">Current Stock Qty</th>
                      <th className="py-2.5 px-4 text-right">Last System Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono">
                    {reportData.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="py-2 px-4 font-bold text-slate-900">{row.reference}</td>
                        <td className="py-2 px-4 font-sans text-slate-600 truncate max-w-xs">{row.description}</td>
                        <td className="py-2 px-4">{row.materialType}</td>
                        <td className="py-2 px-4 text-right text-slate-850 font-bold">{row.quantity.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right text-slate-400 text-[10px]">
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
                // Standard transactions log format
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-mono font-bold">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Movement Type</th>
                      <th className="py-2.5 px-4">Reference</th>
                      <th className="py-2.5 px-4">Source Stock</th>
                      <th className="py-2.5 px-4 text-right">Quantity</th>
                      <th className="py-2.5 px-4">Operator</th>
                      <th className="py-2.5 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono">
                    {reportData.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-[10px] text-slate-400">
                          {row.timestamp ? new Date(row.timestamp).toLocaleString() : "N/A"}
                        </td>
                        <td className="py-2 px-4">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm border ${
                            row.movementType === "STOCK 1 IN" 
                              ? "bg-sky-50 text-sky-700 border-sky-100" 
                              : row.movementType === "TRANSFER"
                              ? "bg-amber-50 text-amber-700 border-amber-100"
                              : "bg-emerald-50 text-emerald-700 border-emerald-100"
                          }`}>
                            {row.movementType}
                          </span>
                        </td>
                        <td className="py-2 px-4 font-bold text-slate-900">{row.reference}</td>
                        <td className="py-2 px-4 text-slate-500 text-[11px]">{row.stock}</td>
                        <td className="py-2 px-4 text-right font-bold text-slate-850">
                          {row.quantity.toLocaleString()}
                        </td>
                        <td className="py-2 px-4 text-[11px] text-slate-700 font-sans">{row.operatorName}</td>
                        <td className="py-2 px-4 text-[11px] text-slate-500 font-sans max-w-xs truncate" title={row.notes}>
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

    </div>
  );
}
