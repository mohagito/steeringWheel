import React, { useState, useRef, useMemo } from "react";
import {
  Send,
  UploadCloud,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  Loader2,
  Trash2,
  Eye,
  Info,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import Swal from "sweetalert2";
import {
  parseBezelDeliveryPDF,
  ParsedBezelDeliveryDocument
} from "../../services/bezelDeliveryPdfParser";
import { STEERING_WHEEL_BEZEL_MAPPINGS } from "../../data/bezelBOMMapping";
import { BezelInvoice, BezelOperation, BezelReference, User } from "../../types";
import { deleteBezelDeliveryInvoice } from "../../services/bezelService";
import BezelDeliveryPdfModal from "./BezelDeliveryPdfModal";

interface BezelDeliveriesWorkspaceProps {
  invoices: BezelInvoice[];
  operations: BezelOperation[];
  references: BezelReference[];
  currentUser: User;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export default function BezelDeliveriesWorkspace({
  invoices,
  operations,
  references,
  currentUser,
  onSuccess,
  onError
}: BezelDeliveriesWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedDoc, setParsedDoc] = useState<ParsedBezelDeliveryDocument | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDecompositionTable, setShowDecompositionTable] = useState(false);

  // Delivery invoices (filter from bezel_invoices or bezel_operations where operationType === "BEZEL_DELIVERY")
  const deliveryOperations = operations.filter(
    (op) => op.operationType === "BEZEL_DELIVERY"
  );
  const totalDeliveredPcs = deliveryOperations.reduce((sum, op) => sum + op.quantity, 0);

  // Handle PDF file selection
  const handleProcessPdf = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      Swal.fire({
        icon: "warning",
        title: "PDF Required",
        text: "Please select a valid PDF delivery invoice."
      });
      return;
    }

    setIsParsing(true);
    try {
      const doc = await parseBezelDeliveryPDF(file, references);
      if (doc.items.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Items Detected",
          text: "No valid steering wheel or bezel line items found in this PDF document."
        });
        setIsParsing(false);
        return;
      }

      setParsedDoc(doc);
      setIsReviewModalOpen(true);
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "PDF Parsing Error",
        text: err?.message || "Failed to parse delivery PDF."
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleProcessPdf(f);
  };

  // Group delivery operations by invoice (collecting records by invoice)
  interface DeliveryInvoiceGroup {
    invoiceNumber: string;
    timestamp: string;
    dateStr: string;
    operatorName: string;
    totalQuantity: number;
    totalLines: number;
    referenceSummary: { reference: string; quantity: number }[];
    operations: BezelOperation[];
  }

  const groupedInvoices = useMemo(() => {
    const map = new Map<string, DeliveryInvoiceGroup>();

    deliveryOperations.forEach((op) => {
      const rawInv = (op.invoiceNumber || "").trim().toUpperCase();
      const invNum = rawInv || "UNASSIGNED";

      if (!map.has(invNum)) {
        map.set(invNum, {
          invoiceNumber: invNum,
          timestamp: op.timestamp ? String(op.timestamp) : "",
          dateStr: op.timestamp ? String(op.timestamp).slice(0, 16).replace("T", " ") : "—",
          operatorName: op.operatorName || "Operator",
          totalQuantity: 0,
          totalLines: 0,
          referenceSummary: [],
          operations: []
        });
      }

      const group = map.get(invNum)!;
      group.totalQuantity += op.quantity;
      group.totalLines += 1;
      group.operations.push(op);

      if ((!group.operatorName || group.operatorName === "Operator") && op.operatorName) {
        group.operatorName = op.operatorName;
      }
      if (!group.timestamp && op.timestamp) {
        group.timestamp = String(op.timestamp);
        group.dateStr = String(op.timestamp).slice(0, 16).replace("T", " ");
      }
    });

    const result = Array.from(map.values()).map((grp) => {
      const refCountMap = new Map<string, number>();
      grp.operations.forEach((op) => {
        refCountMap.set(op.reference, (refCountMap.get(op.reference) || 0) + op.quantity);
      });
      grp.referenceSummary = Array.from(refCountMap.entries()).map(([reference, quantity]) => ({
        reference,
        quantity
      }));
      return grp;
    });

    result.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    return result;
  }, [deliveryOperations]);

  // Filtered grouped delivery invoices
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedInvoices;
    const q = searchQuery.toLowerCase().trim();
    return groupedInvoices.filter((grp) => {
      if (grp.invoiceNumber.toLowerCase().includes(q)) return true;
      if (grp.operatorName.toLowerCase().includes(q)) return true;
      if (grp.operations.some((op) =>
        op.reference.toLowerCase().includes(q) ||
        (op.notes || "").toLowerCase().includes(q)
      )) return true;
      return false;
    });
  }, [groupedInvoices, searchQuery]);

  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});

  const toggleInvoice = (invNum: string) => {
    setExpandedInvoices((prev) => ({
      ...prev,
      [invNum]: !prev[invNum]
    }));
  };

  const isAllExpanded = filteredGroups.length > 0 && filteredGroups.every((g) => expandedInvoices[g.invoiceNumber]);
  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedInvoices({});
    } else {
      const all: Record<string, boolean> = {};
      filteredGroups.forEach((g) => {
        all[g.invoiceNumber] = true;
      });
      setExpandedInvoices(all);
    }
  };

  const handleDeleteInvoice = async (grp: DeliveryInvoiceGroup) => {
    if (currentUser.role !== "admin" && currentUser.role !== "supervisor") {
      onError("Only Supervisors or Managers can delete delivery records.");
      return;
    }

    const res = await Swal.fire({
      title: `Delete Delivery ${grp.invoiceNumber}?`,
      text: `Are you sure you want to delete delivery invoice ${grp.invoiceNumber}? This will restore ${grp.totalQuantity.toLocaleString()} PCS across ${grp.referenceSummary.length} reference(s) back to Stock 2.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete & Restore",
      cancelButtonText: "Cancel"
    });

    if (!res.isConfirmed) return;

    try {
      const count = await deleteBezelDeliveryInvoice({
        invoiceNumber: grp.invoiceNumber,
        operatorName: currentUser.fullName
      });
      onSuccess(`Deleted delivery invoice ${grp.invoiceNumber} (${count} operations restored to Stock 2).`);
    } catch (err: any) {
      onError(err?.message || "Failed to delete delivery invoice.");
    }
  };

  return (
    <div className="space-y-6" id="bezel-deliveries-workspace">
      
      {/* 1. Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Total Bezels Dispatched
            </span>
            <div className="text-2xl font-black text-purple-700 font-mono mt-0.5">
              {totalDeliveredPcs.toLocaleString()} <span className="text-xs font-normal text-slate-400">PCS</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Removed from Stock 2 (OUT)
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Stock 2 Ready Bezels
            </span>
            <div className="text-2xl font-black text-emerald-700 font-mono mt-0.5">
              {references.reduce((sum, r) => sum + (r.stock2 || 0), 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">PCS</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Available for delivery
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              SW → Bezel Mappings
            </span>
            <div className="text-2xl font-black text-slate-800 font-mono mt-0.5">
              {STEERING_WHEEL_BEZEL_MAPPINGS.length} <span className="text-xs font-normal text-slate-400">SW Rules</span>
            </div>
            
          </div>
          <button
            type="button"
            onClick={() => setShowDecompositionTable(!showDecompositionTable)}
            className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
            title="View SW to Bezel Decomposition Table"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. PDF Delivery Dropzone Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4 text-purple-600" />
              <span>Import Delivery Invoice (PDF)</span>
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowDecompositionTable(!showDecompositionTable)}
            className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition-colors inline-flex items-center gap-1.5 self-start cursor-pointer font-mono"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showDecompositionTable ? "Hide BOM Table" : "View SW → Bezel BOM"}</span>
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
            isDragging
              ? "border-purple-500 bg-purple-50/70 scale-[0.99]"
              : "border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/30"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleProcessPdf(f);
            }}
          />

          {isParsing ? (
            <div className="py-4 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
              <div className="text-xs font-bold text-slate-800">Reading Invoice & Resolving Bezels...</div>
              <div className="text-[11px] text-slate-400 font-mono">Decomposing SW references into Stock 2 bezels</div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-2xs">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-slate-800">
                  Drop Delivery PDF Invoice Here, or Click to Browse
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-purple-700 shadow-2xs">
                Auto-Deducts from S2
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3. SW -> Bezel BOM Decomposition Guide (Optional View) */}
      {showDecompositionTable && (
        <div className="bg-white border border-purple-200 rounded-2xl p-5 shadow-xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between mb-3 border-b border-purple-100 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono">
                Official SW → Bezel Decomposition Rules
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
              Stock 2 Deduction
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Bezel Reference</th>
                  <th className="py-2 px-3">SW Reference</th>
                  <th className="py-2 px-3">Description</th>
                  <th className="py-2 px-3 text-center">Deduction Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {STEERING_WHEEL_BEZEL_MAPPINGS.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-1.5 px-3 font-bold text-purple-700 bg-purple-50/40">
                      {m.bezelRef}
                    </td>
                    <td className="py-1.5 px-3 font-bold text-slate-900">
                      {m.steeringWheelRef}
                    </td>
                    <td className="py-1.5 px-3 text-slate-600 font-sans text-[11px]">
                      {m.description}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                        {m.targetStock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Grouped Delivery Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden" id="bezel-deliveries-register-card">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
              Bezel Delivery History (Collected by Invoice)
            </h3>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
              {filteredGroups.length} {filteredGroups.length === 1 ? "Invoice" : "Invoices"}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {filteredGroups.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
              >
                {isAllExpanded ? "Collapse All" : "Expand All"}
              </button>
            )}

            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by invoice, reference, operator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-purple-600 font-medium font-mono"
              />
            </div>
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="p-10 text-center text-slate-400 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Send className="w-5 h-5 stroke-1.5" />
            </div>
            <div className="text-xs font-semibold text-slate-700">No Bezel deliveries recorded yet</div>
            <p className="text-[11px] text-slate-500">
              {searchQuery ? "No delivery invoices match your search." : "Import a delivery PDF to record dispatches."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 font-mono">
                <tr>
                  <th className="py-2.5 px-3 w-8 text-center"></th>
                  <th className="py-2.5 px-3">Date / Time</th>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Bezel References</th>
                  <th className="py-2.5 px-3 text-right">Total Dispatched</th>
                  <th className="py-2.5 px-3 text-center">Movement</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3 text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGroups.map((grp) => {
                  const isExpanded = searchQuery.trim() ? true : !!expandedInvoices[grp.invoiceNumber];
                  return (
                    <React.Fragment key={grp.invoiceNumber}>
                      <tr
                        onClick={() => toggleInvoice(grp.invoiceNumber)}
                        className={`hover:bg-purple-50/40 transition-colors cursor-pointer font-mono select-none ${
                          isExpanded ? "bg-purple-50/20" : ""
                        }`}
                      >
                        {/* Expand chevron */}
                        <td className="py-2.5 px-2 text-center text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-purple-600 inline-block" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 inline-block" />
                          )}
                        </td>

                        {/* Date / Time */}
                        <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                          {grp.dateStr}
                        </td>

                        {/* Invoice # */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-purple-700 tracking-wide text-xs">
                              {grp.invoiceNumber}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                              {grp.referenceSummary.length} refs
                            </span>
                          </div>
                        </td>

                        {/* References summary pills */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {grp.referenceSummary.map((r) => (
                              <span
                                key={r.reference}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200"
                              >
                                <span>{r.reference}</span>
                                <span className="text-purple-600 font-extrabold text-[10px]">
                                  (-{r.quantity})
                                </span>
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Total quantity */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-black text-rose-600 text-sm">
                          -{grp.totalQuantity.toLocaleString()} <span className="text-[10px] font-normal text-slate-400 font-sans">PCS</span>
                        </td>

                        {/* Movement */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            S2 → OUT
                          </span>
                        </td>

                        {/* Operator */}
                        <td className="py-2.5 px-3 text-slate-700 font-sans text-xs whitespace-nowrap">
                          {grp.operatorName}
                        </td>

                        {/* Actions */}
                        <td
                          className="py-2.5 px-3 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(grp)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title={`Delete delivery invoice ${grp.invoiceNumber} and restore stock to Stock 2`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Sub-table */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-purple-100">
                          <td colSpan={8} className="p-3 pl-8">
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <div className="px-3 py-1.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                                <span>Itemized Line Records ({grp.operations.length} items)</span>
                                <span>Deductions from Stock 2</span>
                              </div>
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 font-mono">
                                  <tr>
                                    <th className="py-1.5 px-3">Bezel Reference</th>
                                    <th className="py-1.5 px-3 text-right">Deducted Qty</th>
                                    <th className="py-1.5 px-3 text-center">Movement</th>
                                    <th className="py-1.5 px-3">Details / Source SW</th>
                                    <th className="py-1.5 px-3">Record ID</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono">
                                  {grp.operations.map((op) => (
                                    <tr key={op.id} className="hover:bg-slate-50/50">
                                      <td className="py-1.5 px-3 font-bold text-slate-900">
                                        {op.reference}
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-black text-rose-600">
                                        -{op.quantity} PCS
                                      </td>
                                      <td className="py-1.5 px-3 text-center">
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-50 text-purple-700">
                                          S2 → OUT
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 text-[11px] text-slate-600 font-sans truncate max-w-md" title={op.notes}>
                                        {op.notes || "Delivery Dispatch"}
                                      </td>
                                      <td className="py-1.5 px-3 text-[10px] text-slate-400">
                                        {op.id}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {isReviewModalOpen && parsedDoc && (
        <BezelDeliveryPdfModal
          isOpen={isReviewModalOpen}
          onClose={() => {
            setIsReviewModalOpen(false);
            setParsedDoc(null);
          }}
          parsedDoc={parsedDoc}
          bezelReferences={references}
          currentUser={currentUser}
          onSuccess={(msg) => {
            onSuccess(msg);
            setIsReviewModalOpen(false);
            setParsedDoc(null);
          }}
          onError={onError}
        />
      )}

    </div>
  );
}
