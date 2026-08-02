import React, { useState, useMemo } from "react";
import { Reference, User, Box, InventoryTransaction, Delivery, Production, ScrapEntry, Adjustment } from "../types";
import { 
  Search, Plus, Edit2, Power, Trash2, FolderTree, AlertTriangle, ShieldAlert, CheckCircle2, X, RefreshCw
} from "lucide-react";
import { CustomSelect } from "./CustomSelect";
import { AddEditReferenceModal } from "./AddEditReferenceModal";
import Swal from "sweetalert2";

interface ManageReferencesWorkspaceProps {
  references: Reference[];
  boxes: Box[];
  transactions: InventoryTransaction[];
  deliveries: Delivery[];
  productions: Production[];
  scraps: ScrapEntry[];
  adjustments: Adjustment[];
  currentUser: User;
  onCreateReference: (refData: {
    code: string;
    description: string;
    customer: string;
    materialType: string;
    associatedLeather?: string;
    active?: boolean;
  }) => Promise<void>;
  onUpdateReference: (refId: string, updatedFields: Partial<Reference>) => Promise<void>;
  onDeleteReference: (refId: string, refCode: string) => Promise<void>;
}

export default function ManageReferencesWorkspace({
  references,
  boxes,
  transactions,
  deliveries,
  productions,
  scraps,
  adjustments,
  currentUser,
  onCreateReference,
  onUpdateReference,
  onDeleteReference,
}: ManageReferencesWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [materialFilter, setMaterialFilter] = useState<string>("All");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRefForEdit, setSelectedRefForEdit] = useState<Reference | null>(null);

  // Deletion Blocking Modal State
  const [blockedRefInfo, setBlockedRefInfo] = useState<{
    ref: Reference;
    reasonSummary: string[];
  } | null>(null);

  // Deletion Confirmation Modal State for safe unused references
  const [confirmDeleteRefInfo, setConfirmDeleteRefInfo] = useState<Reference | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered references calculation
  const filteredReferences = useMemo(() => {
    return references.filter((ref) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        ref.code.toLowerCase().includes(q) ||
        ref.description.toLowerCase().includes(q) ||
        (ref.customer && ref.customer.toLowerCase().includes(q)) ||
        (ref.materialType && ref.materialType.toLowerCase().includes(q));

      const matchesMaterial = materialFilter === "All" || ref.materialType === materialFilter;
      const isRefActive = ref.active !== false;
      const matchesStatus =
        statusFilter === "All" || (statusFilter === "Active" ? isRefActive : !isRefActive);

      return matchesSearch && matchesMaterial && matchesStatus;
    });
  }, [references, searchQuery, statusFilter, materialFilter]);

  // Statistics summaries
  const stats = useMemo(() => {
    const total = references.length;
    const active = references.filter((r) => r.active !== false).length;
    const inactive = total - active;
    const customersCount = new Set(references.map((r) => r.customer).filter(Boolean)).size;
    return { total, active, inactive, customersCount };
  }, [references]);

  // Handle click on DELETE button: Evaluate safety rules
  const handleDeleteClick = (ref: Reference) => {
    const codeUpper = ref.code.toUpperCase();
    const s1 = ref.stock1 || 0;
    const s2 = ref.stock2 || 0;
    const s3 = ref.stock3 || 0;
    const curStock = ref.currentStock || (s1 + s2 + s3);

    const hasStock = curStock > 0 || s1 > 0 || s2 > 0 || s3 > 0;
    const matchingBoxes = boxes.filter((b) => b.reference && b.reference.toUpperCase() === codeUpper);
    const matchingTransactions = transactions.filter(
      (t) => t.reference && t.reference.toUpperCase() === codeUpper
    );
    const matchingDeliveries = deliveries.filter(
      (d) => d.reference && d.reference.toUpperCase() === codeUpper
    );
    const matchingProductions = productions.filter(
      (p) => p.reference && p.reference.toUpperCase() === codeUpper
    );
    const matchingScraps = scraps.filter((s) => s.reference && s.reference.toUpperCase() === codeUpper);
    const matchingAdjustments = adjustments.filter(
      (a) => a.reference && a.reference.toUpperCase() === codeUpper
    );

    const reasons: string[] = [];
    if (hasStock) reasons.push(`Non-zero Stock (${curStock} PCS total in system)`);
    if (matchingBoxes.length > 0) reasons.push(`${matchingBoxes.length} Registered Cartons / Barcodes`);
    if (matchingTransactions.length > 0) reasons.push(`${matchingTransactions.length} Audit Movement Logs`);
    if (matchingDeliveries.length > 0) reasons.push(`${matchingDeliveries.length} Delivery Records`);
    if (matchingProductions.length > 0) reasons.push(`${matchingProductions.length} Production Consumption Entries`);
    if (matchingScraps.length > 0) reasons.push(`${matchingScraps.length} NOK Scrap Records`);
    if (matchingAdjustments.length > 0) reasons.push(`${matchingAdjustments.length} Physical Count Adjustments`);

    if (reasons.length > 0) {
      // Safety rule triggered: CANNOT permanently delete! Offer Deactivation.
      setBlockedRefInfo({ ref, reasonSummary: reasons });
    } else {
      // Reference has NEVER been used: Safe to confirm permanent deletion
      setConfirmDeleteRefInfo(ref);
    }
  };

  // Perform permanent delete for safe unused reference
  const handleConfirmPermanentDelete = async () => {
    if (!confirmDeleteRefInfo) return;
    setIsDeleting(true);
    try {
      await onDeleteReference(confirmDeleteRefInfo.id, confirmDeleteRefInfo.code);
      await Swal.fire({
        title: "Reference Deleted",
        text: `Reference ${confirmDeleteRefInfo.code} has been permanently removed.`,
        icon: "success",
        timer: 1800,
        showConfirmButton: false,
      });
      setConfirmDeleteRefInfo(null);
    } catch (err: any) {
      console.error("Delete error:", err);
      Swal.fire({
        title: "Delete Failed",
        text: err.message || "Failed to delete reference.",
        icon: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Quick toggle active/inactive status
  const handleToggleActive = async (ref: Reference) => {
    const isCurrentlyActive = ref.active !== false;
    const newStatus = !isCurrentlyActive;
    try {
      await onUpdateReference(ref.id, { active: newStatus });
      Swal.fire({
        title: newStatus ? "Reference Activated" : "Reference Deactivated",
        text: `Reference ${ref.code} is now ${newStatus ? "ACTIVE" : "INACTIVE"}.`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      console.error("Status update failed:", err);
      Swal.fire({
        title: "Update Failed",
        text: err.message || "Could not update status.",
        icon: "error",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" id="manage-references-workspace">
      
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight font-display">
                MANAGE REFERENCES
              </h1>
            </div>
          </div>
        </div>

        {/* Action Button: Add Reference */}
        {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
          <button
            onClick={() => {
              setSelectedRefForEdit(null);
              setIsModalOpen(true);
            }}
            id="btn-add-reference"
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ ADD REFERENCE</span>
          </button>
        )}
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            Total Catalog
          </p>
          <p className="text-2xl font-extrabold text-slate-900 font-mono mt-1">
            {stats.total}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider font-mono">
            Active Catalog
          </p>
          <p className="text-2xl font-extrabold text-emerald-700 font-mono mt-1">
            {stats.active}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-rose-500 uppercase tracking-wider font-mono">
            Inactive
          </p>
          <p className="text-2xl font-extrabold text-rose-600 font-mono mt-1">
            {stats.inactive}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wider font-mono">
            Customers
          </p>
          <p className="text-2xl font-extrabold text-purple-700 font-mono mt-1">
            {stats.customersCount}
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search reference code, description, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-xs sm:text-sm rounded-xl font-mono focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 overflow-x-auto shrink-0">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setStatusFilter("All")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === "All"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter("Active")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === "Active"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => setStatusFilter("Inactive")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === "Inactive"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Inactive ({stats.inactive})
            </button>
          </div>

          {/* Material Type Dropdown */}
          <CustomSelect
            value={materialFilter}
            onChange={(val) => setMaterialFilter(val)}
            options={[
              { value: "All", label: "All Materials" },
              { value: "Mesh", label: "Mesh" },
              { value: "Soft", label: "Soft" },
            ]}
            className="w-36"
            size="sm"
          />
        </div>
      </div>

      {/* Main Reference Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200 text-[11px] uppercase font-mono font-bold tracking-wider">
                <th className="py-3.5 px-4">Reference Code</th>
                <th className="py-3.5 px-4">Description</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Material Type</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Stock Breakdown (S1 / S2 / S3)</th>
                <th className="py-3.5 px-4 text-right">Last Update</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredReferences.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <FolderTree className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-600 text-sm">No references match your filter</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try clearing search terms or selecting "All" statuses.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredReferences.map((ref) => {
                  const isRefActive = ref.active !== false;
                  const s1 = ref.stock1 || 0;
                  const s2 = ref.stock2 || 0;
                  const s3 = ref.stock3 || 0;
                  const totalStock = ref.currentStock || (s1 + s2 + s3);

                  return (
                    <tr
                      key={ref.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        !isRefActive ? "bg-slate-50/40 opacity-75" : ""
                      }`}
                    >
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-extrabold text-slate-900 text-sm">
                        {ref.code}
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate" title={ref.description}>
                        {ref.description}
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        {ref.customer ? (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md uppercase font-mono tracking-wide">
                            {ref.customer}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Material Type */}
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded-full">
                          {ref.materialType || "Mesh"}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        {isRefActive ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md uppercase font-mono tracking-wide flex items-center gap-1 w-max">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-[10px] font-extrabold rounded-md uppercase font-mono tracking-wide flex items-center gap-1 w-max">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Stock Summary */}
                      <td className="py-3.5 px-4 text-center font-mono text-[11px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold" title="Stock 1 (Warehouse)">
                            S1: {s1}
                          </span>
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-bold" title="Stock 2 (Production)">
                            S2: {s2}
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold" title="Stock 3 (Finished)">
                            S3: {s3}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-800 text-white rounded font-extrabold text-[10px]" title="Total Stock">
                            Tot: {totalStock}
                          </span>
                        </div>
                      </td>

                      {/* Last Update */}
                      <td className="py-3.5 px-4 text-right text-[11px] text-slate-400 font-mono">
                        <div>{ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleDateString() : "N/A"}</div>
                        {ref.updatedBy && <div className="text-[10px] text-slate-400">{ref.updatedBy}</div>}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Edit Button */}
                          <button
                            onClick={() => {
                              setSelectedRefForEdit(ref);
                              setIsModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                            title="Edit Reference Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          {/* Toggle Active / Deactivate Button */}
                          <button
                            onClick={() => handleToggleActive(ref)}
                            className={`px-2.5 py-1.5 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1 ${
                              isRefActive
                                ? "bg-amber-50 hover:bg-amber-100 text-amber-800"
                                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                            }`}
                            title={isRefActive ? "Deactivate Reference" : "Activate Reference"}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{isRefActive ? "Deactivate" : "Activate"}</span>
                          </button>

                          {/* Delete Button (triggers safe deletion audit) */}
                          <button
                            onClick={() => handleDeleteClick(ref)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition-colors cursor-pointer"
                            title="Delete Reference"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Reference Modal */}
      <AddEditReferenceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedRefForEdit(null);
        }}
        existingRef={selectedRefForEdit}
        currentUser={currentUser}
        onCreateReference={onCreateReference}
        onUpdateReference={onUpdateReference}
      />

      {/* Safety Deletion Blocked Modal (when reference has stock or historical records) */}
      {blockedRefInfo && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-rose-200 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Deletion Blocked: Safety Protection
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Reference: <strong>{blockedRefInfo.ref.code}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-2">
              <p className="font-bold">
                This reference contains historical or inventory data and cannot be permanently deleted.
              </p>
              <p className="text-[11px] text-rose-800">
                To protect system integrity and financial audit history, references with active records must be deactivated instead.
              </p>
            </div>

            {/* Reasons breakdown */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Existing Historical Records Found:
              </p>
              <ul className="space-y-1">
                {blockedRefInfo.reasonSummary.map((reason, idx) => (
                  <li key={idx} className="text-xs text-slate-700 flex items-center gap-2 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                onClick={() => setBlockedRefInfo(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const refToDeactivate = blockedRefInfo.ref;
                  setBlockedRefInfo(null);
                  await handleToggleActive(refToDeactivate);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Power className="w-4 h-4" />
                <span>Deactivate Reference</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Permanent Delete (only for completely unused references) */}
      {confirmDeleteRefInfo && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  DELETE REFERENCE?
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Reference: <strong>{confirmDeleteRefInfo.code}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              This reference has zero stock and no historical movement records in the system. Are you sure you want to permanently delete it?
            </p>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-[11px] text-rose-900 font-bold">
              This action cannot be undone.
            </div>

            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                disabled={isDeleting}
                onClick={() => setConfirmDeleteRefInfo(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                disabled={isDeleting}
                onClick={handleConfirmPermanentDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>PERMANENTLY DELETE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
