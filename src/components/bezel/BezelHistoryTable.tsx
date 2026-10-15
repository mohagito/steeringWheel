import React, { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Truck,
  Cpu,
  Send,
  RotateCcw,
  Trash2,
  Clock,
  ClipboardCheck,
  Edit2,
  X,
  Check
} from "lucide-react";
import { BezelOperation, BezelOperationType, BezelReference, UserRole } from "../../types";
import { formatSystemTime } from "../../utils/timeUtils";
import {
  deleteBezelOperation,
  editBezelOperation
} from "../../services/bezelService";

interface BezelHistoryTableProps {
  operations: BezelOperation[];
  references?: BezelReference[];
  userRole: UserRole;
  operatorName: string;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export default function BezelHistoryTable({
  operations,
  references = [],
  userRole,
  operatorName,
  onSuccess,
  onError
}: BezelHistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Delete dialog state
  const [deletingOp, setDeletingOp] = useState<BezelOperation | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Edit dialog state
  const [editingOp, setEditingOp] = useState<BezelOperation | null>(null);
  const [editReference, setEditReference] = useState("");
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [editDestinationStock, setEditDestinationStock] = useState<"STOCK 1" | "STOCK 2">("STOCK 1");
  const [editSourceStock, setEditSourceStock] = useState<"STOCK 1" | "STOCK 2">("STOCK 1");
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deletingOp && !isSubmittingDelete) {
          setDeletingOp(null);
          setDeleteReason("");
        }
        if (editingOp && !isSubmittingEdit) {
          setEditingOp(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletingOp, isSubmittingDelete, editingOp, isSubmittingEdit]);

  const isManager = userRole === "admin" || userRole === "supervisor";

  const filtered = operations.filter((op) => {
    const q = (searchTerm || "").toLowerCase().trim();
    const matchesSearch = !q ? true : (
      (op.reference || "").toLowerCase().includes(q) ||
      (op.id || "").toLowerCase().includes(q) ||
      (op.operatorName || "").toLowerCase().includes(q) ||
      (op.invoiceNumber && (op.invoiceNumber || "").toLowerCase().includes(q)) ||
      (op.reason && (op.reason || "").toLowerCase().includes(q))
    );

    const matchesType = selectedType === "ALL" || op.operationType === selectedType;

    return matchesSearch && matchesType;
  });

  const getBadgeForType = (type: BezelOperationType) => {
    switch (type) {
      case "NEW_TRUCK":
        return {
          icon: <Truck className="w-3.5 h-3.5" />,
          label: "NEW TRUCK",
          className: "bg-blue-50 text-blue-800 border-blue-200"
        };
      case "BEZEL_ASSEMBLAGE":
        return {
          icon: <Cpu className="w-3.5 h-3.5" />,
          label: "ASSEMBLAGE",
          className: "bg-emerald-50 text-emerald-800 border-emerald-200"
        };
      case "BEZEL_DELIVERY":
        return {
          icon: <Send className="w-3.5 h-3.5" />,
          label: "DELIVERY",
          className: "bg-purple-50 text-purple-800 border-purple-200"
        };
      case "BEZEL_RETURN":
        return {
          icon: <RotateCcw className="w-3.5 h-3.5" />,
          label: "RETURN",
          className: "bg-amber-50 text-amber-800 border-amber-200"
        };
      case "BEZEL_SCRAP":
        return {
          icon: <Trash2 className="w-3.5 h-3.5" />,
          label: "SCRAP",
          className: "bg-rose-50 text-rose-800 border-rose-200"
        };
      case "PHYSICAL_INVENTORY":
        return {
          icon: <ClipboardCheck className="w-3.5 h-3.5" />,
          label: "INVENTORY",
          className: "bg-teal-50 text-teal-800 border-teal-200"
        };
      default:
        return {
          icon: <Clock className="w-3.5 h-3.5" />,
          label: type,
          className: "bg-slate-50 text-slate-800 border-slate-200"
        };
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingOp) return;

    setIsSubmittingDelete(true);
    try {
      await deleteBezelOperation({
        operationId: deletingOp.id,
        operatorName,
        reason: deleteReason.trim() || "Deleted by manager"
      });
      onSuccess(`Record ${deletingOp.id} deleted. Stock adjusted successfully.`);
      setDeletingOp(null);
      setDeleteReason("");
    } catch (err: any) {
      onError(err.message || "Failed to delete record.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const handleStartEdit = (op: BezelOperation) => {
    setEditingOp(op);
    setEditReference(op.reference);
    setEditQuantity(op.quantity);
    setEditDestinationStock((op.destinationStock as any) === "STOCK 2" ? "STOCK 2" : "STOCK 1");
    setEditSourceStock(op.sourceStock === "STOCK 2" ? "STOCK 2" : "STOCK 1");
    setEditInvoiceNumber(op.invoiceNumber || "");
    setEditReason(op.reason || "");
    setEditNotes(op.notes || "");
  };

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOp) return;

    const qty = Number(editQuantity);
    if (isNaN(qty) || qty <= 0) {
      onError("Please enter a valid quantity greater than zero.");
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await editBezelOperation({
        operationId: editingOp.id,
        operatorName,
        newQuantity: qty,
        newReference: editReference,
        newDestinationStock: editingOp.operationType === "NEW_TRUCK" ? editDestinationStock : undefined,
        newSourceStock: editingOp.operationType === "BEZEL_SCRAP" ? editSourceStock : undefined,
        newInvoiceNumber: editInvoiceNumber.trim(),
        newReason: editReason.trim(),
        newNotes: editNotes.trim()
      });
      onSuccess(`Record ${editingOp.id} updated. Stock adjusted successfully.`);
      setEditingOp(null);
    } catch (err: any) {
      onError(err.message || "Failed to update record.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Operations History
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-semibold font-mono">
              {filtered.length} of {operations.length}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Operation Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="ALL">All Operations</option>
            <option value="NEW_TRUCK">New Truck</option>
            <option value="BEZEL_ASSEMBLAGE">Assemblage</option>
            <option value="BEZEL_DELIVERY">Delivery</option>
            <option value="BEZEL_RETURN">Return</option>
            <option value="BEZEL_SCRAP">Scrap / NOK</option>
            <option value="PHYSICAL_INVENTORY">Physical Inventory</option>
          </select>

          {/* Search Bar */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reference, ID, user..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Operations Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Operation ID</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Reference</th>
              <th className="py-3 px-4 text-right">Quantity</th>
              <th className="py-3 px-4">Movement</th>
              <th className="py-3 px-4">Operator</th>
              <th className="py-3 px-4">Date & Time (Morocco)</th>
              <th className="py-3 px-4">Details</th>
              {isManager && <th className="py-3 px-4 text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={isManager ? 9 : 8}
                  className="py-10 text-center text-slate-400"
                >
                  {operations.length === 0
                    ? "No operations recorded yet."
                    : "No operations match the current filter."}
                </td>
              </tr>
            ) : (
              filtered.map((op) => {
                const badge = getBadgeForType(op.operationType);
                const isReversed = op.status === "reversed";

                return (
                  <tr
                    key={op.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isReversed ? "opacity-60 bg-slate-50/40" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-mono text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[100px]" title={op.id}>
                          {op.id}
                        </span>
                        {isReversed && (
                          <span className="text-[10px] uppercase font-bold text-rose-600 px-1 py-0.2 rounded bg-rose-50 border border-rose-200">
                            REVERSED
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase border ${badge.className}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {op.reference}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {op.quantity.toLocaleString()}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        {op.sourceStock ? (
                          <span className="font-semibold text-slate-800">
                            {op.sourceStock}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        <span>→</span>
                        <span className="font-semibold text-slate-800">
                          {op.destinationStock || "OUT"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {op.operatorName}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatSystemTime(op.timestamp)}
                    </td>

                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                      {op.invoiceNumber && (
                        <span className="font-mono font-semibold text-slate-700 mr-2">
                          Doc: {op.invoiceNumber}
                        </span>
                      )}
                      {op.reason && (
                        <span className="text-rose-700 font-medium mr-2">
                          Reason: {op.reason}
                        </span>
                      )}
                      {op.notes && <span>{op.notes}</span>}
                    </td>

                    {isManager && (
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(op)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Edit record & adjust stock"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => setDeletingOp(op)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete record & remove from stock"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingOp && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingDelete) {
              setDeletingOp(null);
              setDeleteReason("");
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900">
                  Delete Record
                </h4>
                <p className="text-[11px] text-slate-500 font-mono truncate">
                  {deletingOp.id}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Operation:</span>
                <span className="font-bold text-slate-800">{deletingOp.operationType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Reference:</span>
                <span className="font-mono font-bold text-slate-900">{deletingOp.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Quantity:</span>
                <span className="font-mono font-bold text-slate-900">{deletingOp.quantity} PCS</span>
              </div>
            </div>

            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mb-3 leading-relaxed">
              {deletingOp.status === "reversed"
                ? "This operation was already reversed. The record will be permanently deleted."
                : "Deleting this record will automatically adjust reference stock levels."}
            </p>

            <form onSubmit={handleConfirmDelete} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Deletion
                </label>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, counting mistake"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingOp(null);
                    setDeleteReason("");
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDelete}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingDelete ? "Deleting..." : "Delete Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Record Dialog */}
      {editingOp && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingEdit) {
              setEditingOp(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Edit Operation Record
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {editingOp.id} ({editingOp.operationType})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOp(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEdit} className="space-y-3 text-xs">
              {/* Reference */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reference
                </label>
                {references && references.length > 0 ? (
                  <select
                    value={editReference}
                    onChange={(e) => setEditReference(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {references.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} - {r.description || r.code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={editReference}
                    onChange={(e) => setEditReference(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Quantity (PCS) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-1.5 font-mono font-bold text-slate-900 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Destination Stock (For NEW_TRUCK) */}
              {editingOp.operationType === "NEW_TRUCK" && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Destination Stock
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditDestinationStock("STOCK 1")}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        editDestinationStock === "STOCK 1"
                          ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      STOCK 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDestinationStock("STOCK 2")}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        editDestinationStock === "STOCK 2"
                          ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      STOCK 2
                    </button>
                  </div>
                </div>
              )}

              {/* Source Stock (For BEZEL_SCRAP) */}
              {editingOp.operationType === "BEZEL_SCRAP" && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Source Stock
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditSourceStock("STOCK 1")}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        editSourceStock === "STOCK 1"
                          ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      STOCK 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditSourceStock("STOCK 2")}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        editSourceStock === "STOCK 2"
                          ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      STOCK 2
                    </button>
                  </div>
                </div>
              )}

              {/* Document / Invoice # */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Document / Invoice #
                </label>
                <input
                  type="text"
                  value={editInvoiceNumber}
                  onChange={(e) => setEditInvoiceNumber(e.target.value)}
                  placeholder="Optional document number"
                  className="w-full px-3 py-1.5 font-mono text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reason for Modification
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Typo in entered quantity"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-[11px] text-blue-800 leading-relaxed">
                Stock will be adjusted automatically for the difference.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOp(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

