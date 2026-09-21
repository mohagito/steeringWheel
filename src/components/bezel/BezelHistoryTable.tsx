import React, { useState } from "react";
import {
  Search,
  Filter,
  Truck,
  Cpu,
  Send,
  RotateCcw,
  Trash2,
  Undo2,
  Clock,
  AlertTriangle
} from "lucide-react";
import { BezelOperation, BezelOperationType, UserRole } from "../../types";
import { formatSystemTime, MOROCCO_TIMEZONE_LABEL } from "../../utils/timeUtils";
import { reverseBezelOperation } from "../../services/bezelService";

interface BezelHistoryTableProps {
  operations: BezelOperation[];
  userRole: UserRole;
  operatorName: string;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export default function BezelHistoryTable({
  operations,
  userRole,
  operatorName,
  onSuccess,
  onError
}: BezelHistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [reversingOpId, setReversingOpId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);

  const isManager = userRole === "admin" || userRole === "supervisor";

  const filtered = operations.filter((op) => {
    const matchesSearch =
      op.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.operatorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (op.invoiceNumber && op.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (op.reason && op.reason.toLowerCase().includes(searchTerm.toLowerCase()));

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
      default:
        return {
          icon: <Clock className="w-3.5 h-3.5" />,
          label: type,
          className: "bg-slate-50 text-slate-800 border-slate-200"
        };
    }
  };

  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingOpId) return;

    setIsSubmittingReversal(true);
    try {
      await reverseBezelOperation({
        operationId: reversingOpId,
        reason: reversalReason.trim() || "Operational correction",
        operatorName
      });
      onSuccess(`Operation ${reversingOpId} has been successfully reversed.`);
      setReversingOpId(null);
      setReversalReason("");
    } catch (err: any) {
      onError(err.message || "Failed to reverse operation.");
    } finally {
      setIsSubmittingReversal(false);
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
          <p className="text-[11px] text-slate-500 mt-0.5">
            Real-time audit trail in local {MOROCCO_TIMEZONE_LABEL}
          </p>
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
              {isManager && <th className="py-3 px-4 text-center">Action</th>}
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
                    ? "No operations recorded yet. Use the action buttons above to perform your first Bezel transaction."
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
                      {op.quantity}
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
                        {!isReversed && (
                          <button
                            onClick={() => setReversingOpId(op.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Reverse operation (Undo stock movement)"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Reversal Confirmation Dialog */}
      {reversingOpId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Reverse Bezel Operation
                </h4>
                <p className="text-xs text-slate-500 font-mono">
                  ID: {reversingOpId}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Reversing this operation will atomically restore the reference stock
              levels to their state prior to this transaction. This action will be
              logged.
            </p>

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Reversal *
                </label>
                <input
                  type="text"
                  required
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Operator entered duplicate truck entry"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversingOpId(null);
                    setReversalReason("");
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReversal || !reversalReason.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingReversal ? "Reversing..." : "Confirm Reversal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
