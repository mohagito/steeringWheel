import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Package, Layers, TrendingUp, Search, Filter, ArrowRight, 
  CheckCircle2, Clock, MapPin, Truck, AlertCircle, RefreshCw,
  Edit2, Trash2, X, Check, Settings, SlidersHorizontal
} from "lucide-react";

interface StockWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  currentUser: User;
  onDeleteBox?: (boxId: string) => Promise<void>;
  onUpdateBox?: (boxId: string, updatedFields: Partial<Box>) => Promise<void>;
  onUpdateReference?: (refId: string, updatedFields: Partial<Reference>) => Promise<void>;
}

// Map references to their corresponding Model/Project
export const MODEL_MAPPING: { [refCode: string]: string } = {
  "34340681C": "C519",
  "34340679A": "C519",
  "34340689D": "B479",
  "34340687B": "B479",
  "34316011B": "P33B",
  "R000B629B": "PZ1D",
  "R000B630A": "PZ1D",
  "A025M750B": "OV64/OV85",
  "A025M751B": "OV64/OV85",
  "A029G787B": "OV64/OV85",
  "R001W189B": "L74",
  "R000J601B": "CR3",
  "R000J600C": "CR3",
  "R000J610A": "CR3",
  "A026K122B": "K9",
  "R002W094A": "K9",
  "A026L577A": "BJA",
  "34364719C": "XJF"
};

export default function StockWorkspace({ 
  boxes, 
  adjustments, 
  references, 
  currentUser,
  onDeleteBox,
  onUpdateBox,
  onUpdateReference
}: StockWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState<"All" | "Mesh" | "Soft">("All");
  const [customerFilter, setCustomerFilter] = useState<string>("All");

  // States for Manager Stock and Part Management
  const [selectedRefForManagement, setSelectedRefForManagement] = useState<Reference | null>(null);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [editedRefDesc, setEditedRefDesc] = useState("");
  const [editedRefCust, setEditedRefCust] = useState("");
  const [editedRefMat, setEditedRefMat] = useState<"Mesh" | "Soft">("Mesh");

  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [editedBoxQty, setEditedBoxQty] = useState<number>(0);
  const [editedBoxLoc, setEditedBoxLoc] = useState<string>("");

  const [confirmDeleteBoxId, setConfirmDeleteBoxId] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [managementSuccess, setManagementSuccess] = useState<string | null>(null);

  // Get unique customers list
  const customers = useMemo(() => {
    const list = references.map(r => r.customer).filter(Boolean) as string[];
    return ["All", ...Array.from(new Set(list))];
  }, [references]);

  // 1. Calculate Real-Time Stock per Reference (Sum of expectedQty of all boxes in warehouse)
  const referenceStock = useMemo(() => {
    return references.map(ref => {
      const activeBoxes = boxes.filter(b => b.reference === ref.code);
      const warehouseQty = activeBoxes.reduce((sum, b) => sum + b.expectedQty, 0);
      const boxCount = activeBoxes.length;

      return {
        ...ref,
        warehouseQty,
        boxCount,
        model: MODEL_MAPPING[ref.code] || "Other"
      };
    });
  }, [boxes, references]);

  // Find active boxes for the reference currently selected for management
  const activeRefBoxes = useMemo(() => {
    if (!selectedRefForManagement) return [];
    return boxes.filter(b => b.reference === selectedRefForManagement.code);
  }, [boxes, selectedRefForManagement]);

  // 2. Global Stats representing real-time quantities
  const stats = useMemo(() => {
    // Total physical warehouse stock
    const totalPhysicalStock = boxes.reduce((sum, b) => sum + b.expectedQty, 0);
    const totalBoxes = boxes.length;

    return {
      availableUnits: totalPhysicalStock,
      totalBoxes
    };
  }, [boxes]);

  // Filter references based on search query, material type and customer filter
  const filteredReferences = useMemo(() => {
    return referenceStock.filter(ref => {
      const matchesSearch = 
        ref.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ref.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ref.model.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesMaterial = 
        materialFilter === "All" || 
        ref.materialType === materialFilter;

      const matchesCustomer = 
        customerFilter === "All" || 
        ref.customer === customerFilter;

      return matchesSearch && matchesMaterial && matchesCustomer;
    });
  }, [referenceStock, searchQuery, materialFilter, customerFilter]);

  // Get recent stock adjustment history (movements)
  const recentMovements = useMemo(() => {
    return adjustments
      .filter(a => a.status === "approved")
      .slice(0, 5)
      .map(adj => {
        const refInfo = references.find(r => r.code === adj.reference);
        return {
          id: adj.id,
          reference: adj.reference,
          description: refInfo?.description || "Unknown part",
          operator: adj.operatorName,
          qty: adj.actualQty,
          difference: adj.difference,
          timestamp: adj.timestamp,
          barcode: adj.barcode,
          type: refInfo?.materialType || "Mesh"
        };
      });
  }, [adjustments, references]);

  // Manager Actions
  const handleSaveRefMetadata = async () => {
    if (!selectedRefForManagement || !onUpdateReference) return;
    setManagementError(null);
    setManagementSuccess(null);
    try {
      await onUpdateReference(selectedRefForManagement.id, {
        description: editedRefDesc.trim(),
        customer: editedRefCust.trim(),
        materialType: editedRefMat
      });
      setManagementSuccess("Part reference successfully updated!");
      setIsEditingRef(false);
      // Update selected state locally to prevent stale state display
      setSelectedRefForManagement({
        ...selectedRefForManagement,
        description: editedRefDesc.trim(),
        customer: editedRefCust.trim(),
        materialType: editedRefMat
      });
      setTimeout(() => setManagementSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setManagementError("Failed to update part reference details.");
    }
  };

  const handleStartEditBox = (box: Box) => {
    setEditingBoxId(box.id);
    setEditedBoxQty(box.expectedQty);
    setEditedBoxLoc(box.location);
    setConfirmDeleteBoxId(null);
  };

  const handleSaveBoxChange = async (boxId: string) => {
    if (!onUpdateBox) return;
    if (isNaN(editedBoxQty) || editedBoxQty < 0) {
      setManagementError("Quantity must be a valid positive number.");
      return;
    }
    setManagementError(null);
    setManagementSuccess(null);
    try {
      await onUpdateBox(boxId, {
        expectedQty: Number(editedBoxQty),
        location: editedBoxLoc.trim()
      });
      setManagementSuccess("Carton details successfully updated!");
      setEditingBoxId(null);
      setTimeout(() => setManagementSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setManagementError("Failed to update carton details.");
    }
  };

  const handleDeleteBoxAction = async (boxId: string) => {
    if (!onDeleteBox) return;
    setManagementError(null);
    setManagementSuccess(null);
    try {
      await onDeleteBox(boxId);
      setManagementSuccess("Carton deleted successfully!");
      setConfirmDeleteBoxId(null);
      setTimeout(() => setManagementSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setManagementError("Failed to delete carton.");
    }
  };

  return (
    <div className="space-y-6" id="stock-workspace-tab">
      
      {/* Header Banner mirroring the design in the provided image */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-display text-slate-900 tracking-tight uppercase" id="stock-title-h2">
              Stock
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Logged in as <span className="text-emerald-600 font-semibold">{currentUser.fullName}</span> in the <span className="font-semibold text-slate-700">{currentUser.role === 'admin' ? 'Manager' : currentUser.role === 'supervisor' ? 'Supervisor' : 'Worker'}</span> view workspace.
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs bg-slate-50 p-1.5 rounded-lg border border-slate-100">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-600 font-mono">Real-time Stock Engine Active</span>
          </div>
        </div>
      </div>

      {/* Main Stock Inventory Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        
        {/* Top Control Bar with tabs, badges and totals */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold text-slate-800 font-display flex items-center gap-2 uppercase tracking-wide">
              <Package className="w-5 h-5 text-slate-500" />
              Available Stock Per Reference
            </span>
          </div>

          {/* Core Real-Time Metrics Badges */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
            <div className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg font-bold flex items-center gap-1.5 font-mono" title="Exactly 17 master steering wheel part references are loaded and tracked in the database">
              {references.length} / 17 Master Parts Active
            </div>
            <div className="text-slate-400">|</div>
            <div className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-100 rounded-lg font-bold flex items-center gap-1.5 font-mono" title="Total number of active physical cartons registered in the warehouse">
              {stats.totalBoxes} Active Cartons
            </div>
            <div className="text-slate-400 hidden sm:block">|</div>
            <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg font-bold flex items-center gap-1.5 font-mono" title="Sum of all pieces currently registered in the warehouse">
              {stats.availableUnits.toLocaleString()} Pcs in Stock
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-5 sm:p-6 bg-white border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by reference code or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 focus:bg-white transition-all text-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Customer Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 flex items-center gap-1 font-semibold">
                <Truck className="w-3.5 h-3.5 text-slate-400" /> Customer:
              </span>
              <div className="flex bg-slate-100 p-1 rounded-lg text-[11px] font-semibold flex-wrap gap-1">
                {customers.map((cust) => (
                  <button
                    key={cust}
                    onClick={() => setCustomerFilter(cust)}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      customerFilter === cust
                        ? "bg-white text-slate-800 shadow-xs border border-slate-200/50"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {cust}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 flex items-center gap-1 font-semibold">
                <Filter className="w-3.5 h-3.5 text-slate-400" /> Type:
              </span>
              <div className="flex bg-slate-100 p-1 rounded-lg text-[11px] font-semibold gap-1">
                {(["All", "Mesh", "Soft"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setMaterialFilter(type)}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      materialFilter === type
                        ? "bg-white text-slate-800 shadow-xs border border-slate-200/50"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Grid Content */}
        <div className="p-5 sm:p-6 bg-slate-50/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="reference-stock-grid">
            {filteredReferences.map((ref) => (
              <motion.div
                key={ref.id}
                whileHover={{ y: -3, transition: { duration: 0.1 } }}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[195px] h-full w-full"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[12px] sm:text-[13px] font-bold text-slate-900 font-mono tracking-tight uppercase bg-slate-100 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded border border-slate-200/40 shrink-0">
                      {ref.code}
                    </span>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {ref.boxCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-mono font-bold whitespace-nowrap">
                          {ref.boxCount} {ref.boxCount === 1 ? "box" : "boxes"}
                        </span>
                      )}
                      {ref.customer && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200/50 rounded text-[9px] font-mono font-bold uppercase tracking-wider whitespace-nowrap">
                          {ref.customer}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Reference Description */}
                  <p className="text-xs font-semibold text-slate-700 mt-3 line-clamp-2" title={ref.description}>
                    {ref.description}
                  </p>

                  <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                    <span className="font-semibold text-slate-500">Model: {ref.model}</span>
                    <span>•</span>
                    <span className={`font-bold ${ref.materialType === 'Mesh' ? 'text-indigo-600' : 'text-teal-600'}`}>{ref.materialType}</span>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-slate-100">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[9px] text-slate-400 font-mono">
                      Last: {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleDateString() : "Never"}
                    </span>
                    <div className="flex items-baseline gap-1 shrink-0">
                      <span className="text-2xl font-extrabold text-slate-900 font-display">
                        {ref.warehouseQty.toLocaleString()}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 font-sans">
                        pcs
                      </span>
                    </div>
                  </div>

                  {/* Manager Controls */}
                  {currentUser.role === "admin" && (
                    <button
                      onClick={() => {
                        setSelectedRefForManagement(ref);
                        setEditedRefDesc(ref.description);
                        setEditedRefCust(ref.customer || "");
                        setEditedRefMat(ref.materialType);
                        setIsEditingRef(false);
                        setEditingBoxId(null);
                        setConfirmDeleteBoxId(null);
                        setManagementError(null);
                        setManagementSuccess(null);
                      }}
                      className="mt-3 w-full py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-800 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-500" />
                      Manage Part & Stock
                    </button>
                  )}
                </div>
              </motion.div>
            ))}

            {filteredReferences.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white border border-dashed border-slate-200 rounded-xl text-slate-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No references found matching filters</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time Stock Movement Feed */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-slate-500" />
          Recent Stock Audits & Counts
        </h3>

        <div className="divide-y divide-slate-100">
          {recentMovements.map((movement) => (
            <div key={movement.id} className="py-3 sm:py-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg mt-0.5 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-bold text-slate-800 font-mono">{movement.reference}</span>
                    <span className="text-[10px] font-mono text-slate-400">({movement.description})</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>By: {movement.operator}</span>
                    <span>•</span>
                    <span>Carton: {movement.barcode}</span>
                    <span>•</span>
                    <span>{new Date(movement.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-slate-900">+{movement.qty} pcs</div>
                <div className={`text-[10px] font-mono font-semibold ${
                  movement.difference === 0 
                    ? "text-slate-400" 
                    : movement.difference > 0 
                      ? "text-emerald-500" 
                      : "text-rose-500"
                }`}>
                  {movement.difference === 0 ? "Perfect Match" : `${movement.difference > 0 ? "+" : ""}${movement.difference} diff`}
                </div>
              </div>
            </div>
          ))}

          {recentMovements.length === 0 && (
            <div className="py-6 text-center text-slate-400 text-xs">
              No recent stock audit movements. Complete an operator count to seed this log.
            </div>
          )}
        </div>
      </div>

      {/* Manager's Stock Management Overlay Modal */}
      <AnimatePresence>
        {selectedRefForManagement && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 font-display uppercase tracking-wide">
                      Manage Reference & Stock
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                      Modifying part <span className="font-mono font-bold text-slate-700">{selectedRefForManagement.code}</span> details & physical stock.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedRefForManagement(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                
                {/* Error and Success Banners */}
                {managementError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-center gap-2 font-semibold animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{managementError}</span>
                  </div>
                )}

                {managementSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{managementSuccess}</span>
                  </div>
                )}

                {/* SECTION 1: REFERENCE INFORMATION */}
                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-150">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      Catalog Information
                    </h4>
                    <button
                      onClick={() => setIsEditingRef(!isEditingRef)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {isEditingRef ? "Cancel" : "Edit Details"}
                    </button>
                  </div>

                  {isEditingRef ? (
                    <div className="space-y-3.5 mt-3 pt-3 border-t border-slate-200/50">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Part Description
                        </label>
                        <input
                          type="text"
                          value={editedRefDesc}
                          onChange={(e) => setEditedRefDesc(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Customer
                          </label>
                          <input
                            type="text"
                            value={editedRefCust}
                            onChange={(e) => setEditedRefCust(e.target.value.toUpperCase())}
                            placeholder="e.g. RENAULT"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 uppercase focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Material Type
                          </label>
                          <select
                            value={editedRefMat}
                            onChange={(e) => setEditedRefMat(e.target.value as "Mesh" | "Soft")}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="Mesh">Mesh</option>
                            <option value="Soft">Soft</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={handleSaveRefMetadata}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save Part Details
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Description</span>
                        <span className="font-semibold text-slate-800 mt-0.5 block">{selectedRefForManagement.description}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Customer</span>
                          <span className="font-mono font-bold text-slate-700 mt-0.5 block">{selectedRefForManagement.customer || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Material Type</span>
                          <span className="font-bold text-indigo-600 mt-0.5 block">{selectedRefForManagement.materialType}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 2: PHYSICAL CARTONS */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 mb-3.5">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    Active Physical Cartons ({activeRefBoxes.length})
                  </h4>

                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                    {activeRefBoxes.map((box) => {
                      const isEditing = editingBoxId === box.id;
                      const isDeleting = confirmDeleteBoxId === box.id;

                      return (
                        <div key={box.id} className="p-4 bg-white hover:bg-slate-50/20 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                          
                          {/* Carton identity */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-500 shrink-0 border border-slate-100">
                              <Layers className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-extrabold text-slate-800 font-mono block">
                                {box.barcode}
                              </span>
                              {box.invoiceNumber && (
                                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                                  Invoice: {box.invoiceNumber}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Inline editor or static info */}
                          {isEditing ? (
                            <div className="flex items-center gap-2.5 flex-1 max-w-sm justify-end">
                              <div className="w-24">
                                <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Qty</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editedBoxQty}
                                  onChange={(e) => setEditedBoxQty(Number(e.target.value))}
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div className="w-32">
                                <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</label>
                                <input
                                  type="text"
                                  value={editedBoxLoc}
                                  onChange={(e) => setEditedBoxLoc(e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div className="flex items-center gap-1 mt-3.5 shrink-0">
                                <button
                                  onClick={() => handleSaveBoxChange(box.id)}
                                  className="p-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingBoxId(null)}
                                  className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : isDeleting ? (
                            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100/50 p-2 rounded-lg text-xs shrink-0 animate-fade-in">
                              <span className="text-rose-700 font-semibold">Delete from stock?</span>
                              <button
                                onClick={() => handleDeleteBoxAction(box.id)}
                                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold cursor-pointer transition-colors text-[10px]"
                              >
                                Yes, Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteBoxId(null)}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-semibold cursor-pointer transition-colors text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between md:justify-end gap-6 flex-1">
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Location</span>
                                <span className="text-xs font-bold text-slate-700 flex items-center gap-1 justify-end mt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  {box.location || "Unassigned"}
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Quantity</span>
                                <span className="text-xs font-mono font-black text-slate-900 mt-0.5 block">
                                  {box.expectedQty} pcs
                                </span>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleStartEditBox(box)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
                                  title="Edit Carton"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmDeleteBoxId(box.id);
                                    setEditingBoxId(null);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Delete Carton"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}

                    {activeRefBoxes.length === 0 && (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No cartons currently registered for this steering wheel reference.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setSelectedRefForManagement(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-98"
                >
                  Close
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
