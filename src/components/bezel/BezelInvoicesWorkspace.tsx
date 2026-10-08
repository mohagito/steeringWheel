import React, { useState, useMemo } from "react";
import {
  BezelInvoice,
  BezelReference,
  User
} from "../../types";
import {
  FileText,
  Search,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  Download,
  Eye,
  Trash2,
  ArrowUpDown,
  Boxes,
  Plus,
  Truck,
  Package,
  Layers,
  X,
  Printer
} from "lucide-react";
import Swal from "sweetalert2";
import { deleteBezelInvoice, clearAllBezelInvoices } from "../../services/bezelService";
import { formatSystemTime, getMoroccoTodayDateString } from "../../utils/timeUtils";

interface BezelInvoicesWorkspaceProps {
  invoices: BezelInvoice[];
  references: BezelReference[];
  currentUser: User;
  onOpenNewTruckModal: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function BezelInvoicesWorkspace({
  invoices,
  references,
  currentUser,
  onOpenNewTruckModal,
  onSuccess,
  onError
}: BezelInvoicesWorkspaceProps) {
  const isManager = currentUser.role === "admin" || currentUser.role === "supervisor";

  const [searchQuery, setSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"ALL" | "SHIFT A" | "SHIFT B">("ALL");
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedInvoice, setSelectedInvoice] = useState<BezelInvoice | null>(null);
  const [sortField, setSortField] = useState<"date" | "invoiceNumber" | "totalQuantity">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isClearing, setIsClearing] = useState(false);

  // References lookup map for quick descriptions
  const refMap = useMemo(() => {
    const map = new Map<string, BezelReference>();
    references.forEach((r) => map.set(r.code.toUpperCase(), r));
    return map;
  }, [references]);

  // Filter & sort invoices
  const filteredInvoices = useMemo(() => {
    let list = invoices.filter((inv) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNum = (inv.invoiceNumber || "").toLowerCase().includes(q);
        const matchesOp = (inv.operator || "").toLowerCase().includes(q);
        const matchesRef = (inv.references || []).some((r) => r.toLowerCase().includes(q));
        if (!matchesNum && !matchesOp && !matchesRef) return false;
      }

      // 2. Shift Filter
      if (shiftFilter !== "ALL") {
        const invShift = (inv.shift || "").toUpperCase();
        if (shiftFilter === "SHIFT A" && !invShift.includes("A")) return false;
        if (shiftFilter === "SHIFT B" && !invShift.includes("B")) return false;
      }

      // 3. Time Filter
      if (timeFilter !== "all") {
        const invDate = inv.date || (inv.timestamp ? String(inv.timestamp).slice(0, 10) : "");
        const today = getMoroccoTodayDateString();

        if (timeFilter === "today" && invDate !== today) {
          return false;
        }

        if (timeFilter === "week") {
          const invTime = new Date(inv.timestamp || invDate).getTime();
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (invTime < oneWeekAgo) return false;
        }

        if (timeFilter === "month") {
          const invTime = new Date(inv.timestamp || invDate).getTime();
          const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          if (invTime < oneMonthAgo) return false;
        }
      }

      return true;
    });

    // Sort
    list.sort((a, b) => {
      if (sortField === "date") {
        const timeA = new Date(a.timestamp || a.date).getTime();
        const timeB = new Date(b.timestamp || b.date).getTime();
        return sortDirection === "desc" ? timeB - timeA : timeA - timeB;
      }
      if (sortField === "invoiceNumber") {
        return sortDirection === "desc"
          ? b.invoiceNumber.localeCompare(a.invoiceNumber)
          : a.invoiceNumber.localeCompare(b.invoiceNumber);
      }
      if (sortField === "totalQuantity") {
        return sortDirection === "desc"
          ? b.totalQuantity - a.totalQuantity
          : a.totalQuantity - b.totalQuantity;
      }
      return 0;
    });

    return list;
  }, [invoices, searchQuery, shiftFilter, timeFilter, sortField, sortDirection]);

  // Aggregate Metrics
  const totalInvoicesCount = invoices.length;
  const totalQuantitySum = invoices.reduce((sum, i) => sum + (i.totalQuantity || 0), 0);
  const totalFilteredQuantity = filteredInvoices.reduce((sum, i) => sum + (i.totalQuantity || 0), 0);

  const handleSort = (field: "date" | "invoiceNumber" | "totalQuantity") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Export CSV
  const handleExportCSV = (singleInvoice?: BezelInvoice) => {
    const targetInvoices = singleInvoice ? [singleInvoice] : filteredInvoices;
    if (targetInvoices.length === 0) {
      Swal.fire({
        icon: "info",
        title: "No Invoices to Export",
        text: "There are no invoices matching the current filter."
      });
      return;
    }

    const headers = [
      "Invoice Number",
      "Date",
      "Timestamp",
      "Operator",
      "Shift",
      "Reference",
      "Description",
      "Destination Stock",
      "Quantity",
      "Status"
    ];

    const rows: string[][] = [];
    targetInvoices.forEach((inv) => {
      if (inv.items && inv.items.length > 0) {
        inv.items.forEach((it) => {
          const refObj = refMap.get(it.reference.toUpperCase());
          rows.push([
            `"${inv.invoiceNumber}"`,
            `"${inv.date}"`,
            `"${inv.timestamp}"`,
            `"${inv.operator}"`,
            `"${inv.shift || 'N/A'}"`,
            `"${it.reference}"`,
            `"${refObj?.description || ''}"`,
            `"${it.destinationStock}"`,
            `"${it.quantity}"`,
            `"${inv.status.toUpperCase()}"`
          ]);
        });
      } else {
        rows.push([
          `"${inv.invoiceNumber}"`,
          `"${inv.date}"`,
          `"${inv.timestamp}"`,
          `"${inv.operator}"`,
          `"${inv.shift || 'N/A'}"`,
          `"${(inv.references || []).join(';')}"`,
          `""`,
          `"STOCK 1"`,
          `"${inv.totalQuantity}"`,
          `"${inv.status.toUpperCase()}"`
        ]);
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = singleInvoice
      ? `Bezel_Invoice_${singleInvoice.invoiceNumber}_${getMoroccoTodayDateString()}.csv`
      : `Bezel_Invoices_Master_Report_${getMoroccoTodayDateString()}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete single invoice
  const handleDeleteInvoice = async (inv: BezelInvoice) => {
    if (!isManager) {
      onError("Only Supervisors or Managers can delete invoice records.");
      return;
    }

    const res = await Swal.fire({
      title: `Delete Invoice ${inv.invoiceNumber}?`,
      text: "Are you sure you want to remove this invoice record from the Bezel register?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete Record",
      cancelButtonText: "Cancel"
    });

    if (!res.isConfirmed) return;

    try {
      await deleteBezelInvoice(inv.id);
      if (selectedInvoice?.id === inv.id) {
        setSelectedInvoice(null);
      }
      onSuccess(`Invoice ${inv.invoiceNumber} removed from register.`);
    } catch (err: any) {
      onError(err.message || "Failed to delete invoice record.");
    }
  };

  // Clear entire register
  const handleClearRegister = async () => {
    if (!isManager) {
      onError("Only Supervisors or Managers can clear the invoice register.");
      return;
    }

    const res = await Swal.fire({
      title: "Clear All Bezel Invoices?",
      text: "Are you sure you want to clear all invoice records from the Bezel register? Future truck deliveries will continue to be recorded here.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Clear Register",
      cancelButtonText: "Cancel"
    });

    if (!res.isConfirmed) return;

    try {
      setIsClearing(true);
      await clearAllBezelInvoices();
      setSelectedInvoice(null);
      onSuccess("Bezel invoice register cleared.");
    } catch (err: any) {
      onError(err.message || "Failed to clear invoices.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6" id="bezel-invoices-workspace">
      {/* 1. Top Metrics KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Invoices */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Total Invoices
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
              {totalInvoicesCount.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Registered truck deliveries
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Total Quantity */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Total Incoming Quantity
            </span>
            <div className="text-2xl font-black text-emerald-700 font-mono mt-0.5">
              {totalQuantitySum.toLocaleString()} <span className="text-xs font-normal text-slate-400">PCS</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Received across all trucks
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        {/* Active Catalog References */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Bezel Catalog
            </span>
            <div className="text-2xl font-black text-slate-800 font-mono mt-0.5">
              {references.length} <span className="text-xs font-normal text-slate-400">Refs</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Official catalog components
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Search & Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoices, operators, refs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Filters & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Shift Pill Filters */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase px-1.5 font-mono">Shift:</span>
              {(["ALL", "SHIFT A", "SHIFT B"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShiftFilter(s)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    shiftFilter === s
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {s === "ALL" ? "All" : s.replace("SHIFT ", "")}
                </button>
              ))}
            </div>

            {/* Time Filter Select */}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-600 transition-all cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Past 7 Days</option>
              <option value="month">Past 30 Days</option>
            </select>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={() => handleExportCSV()}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer border border-emerald-800/40"
              title="Export filtered invoices to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>EXPORT CSV</span>
            </button>

            {/* Quick Receive Truck Button */}
            <button
              type="button"
              onClick={onOpenNewTruckModal}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer uppercase tracking-wider font-mono"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>+ New Truck Intake</span>
            </button>
          </div>
        </div>

        {/* Filter Summary indicator */}
        {(searchQuery || shiftFilter !== "ALL" || timeFilter !== "all") && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Showing:</span>
            <span className="font-mono">{filteredInvoices.length} of {invoices.length} invoices ({totalFilteredQuantity.toLocaleString()} PCS)</span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setShiftFilter("ALL");
                setTimeFilter("all");
              }}
              className="text-blue-600 hover:underline font-semibold ml-2 cursor-pointer text-xs"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Invoices Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden" id="bezel-invoices-register-card">
        {/* Card Header matching screenshot */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
              BEZEL INCOMING INVOICES REGISTER
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 font-mono">
              {filteredInvoices.length} {filteredInvoices.length === 1 ? "record" : "records"}
            </div>

            {invoices.length > 0 && isManager && (
              <button
                type="button"
                onClick={handleClearRegister}
                disabled={isClearing}
                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                title="Clear all invoice records from register"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>{isClearing ? "Clearing..." : "Clear Register"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <FileText className="w-6 h-6 stroke-1.5" />
            </div>
            <div className="text-sm font-semibold text-slate-700">No invoices in Bezel register</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || shiftFilter !== "ALL" || timeFilter !== "all"
                ? "No records found matching the active filters. Try clearing your search parameters."
                : "Receive a new truck or log an invoice to populate this register."}
            </p>
            <button
              type="button"
              onClick={onOpenNewTruckModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-2xs font-mono"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Receive New Truck</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                  {/* INVOICE NUMBER */}
                  <th
                    className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("invoiceNumber")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>INVOICE NUMBER</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  {/* DATE & TIME */}
                  <th
                    className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("date")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>DATE & TIME</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  {/* OPERATOR */}
                  <th className="p-3.5">OPERATOR</th>

                  {/* SCANNED ITEMS / REFS */}
                  <th className="p-3.5">SCANNED ITEMS / REFS</th>

                  {/* TOTAL QUANTITY */}
                  <th
                    className="p-3.5 text-right cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                    onClick={() => handleSort("totalQuantity")}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>TOTAL QUANTITY</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  {/* STATUS */}
                  <th className="p-3.5 text-center">STATUS</th>

                  {/* ACTIONS */}
                  <th className="p-3.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredInvoices.map((inv) => {
                  const formattedTime = formatSystemTime(inv.timestamp);
                  const itemCount = inv.items?.length || 1;
                  const uniqueRefs = inv.references || [];

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* INVOICE NUMBER */}
                      <td className="p-3.5 font-mono font-bold whitespace-nowrap">
                        <div
                          onClick={() => setSelectedInvoice(inv)}
                          className="flex items-center gap-2 text-blue-700 hover:text-blue-900 cursor-pointer group"
                        >
                          <div className="w-6 h-6 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <span>{inv.invoiceNumber}</span>
                        </div>
                      </td>

                      {/* DATE & TIME */}
                      <td className="p-3.5 whitespace-nowrap text-slate-600 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{inv.date}</span>
                          <span className="text-[10px] text-slate-400">{formattedTime}</span>
                        </div>
                      </td>

                      {/* OPERATOR */}
                      <td className="p-3.5 whitespace-nowrap text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold">{inv.operator}</span>
                        </div>
                      </td>

                      {/* SCANNED ITEMS / REFS */}
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Package className="w-3 h-3 text-slate-400" />
                            <span>
                              {itemCount} {itemCount === 1 ? "item" : "items"}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-indigo-600 font-bold">
                              {uniqueRefs.length} {uniqueRefs.length === 1 ? "reference" : "references"}
                            </span>
                          </div>
                          {/* Reference badges */}
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {uniqueRefs.slice(0, 3).map((r) => (
                              <span
                                key={r}
                                className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {r}
                              </span>
                            ))}
                            {uniqueRefs.length > 3 && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-mono text-slate-500">
                                +{uniqueRefs.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* TOTAL QUANTITY */}
                      <td className="p-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap text-sm">
                        <span className="px-2.5 py-1 bg-slate-100/80 rounded-md border border-slate-200/60">
                          {inv.totalQuantity.toLocaleString()} PCS
                        </span>
                      </td>

                      {/* STATUS */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>APPROVED</span>
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Details Button matching screenshot */}
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                            title="View Invoice Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>

                          {/* Delete Button */}
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(inv)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                              title="Delete Invoice Record"
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

      {/* 4. Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 font-mono">
                      {selectedInvoice.invoiceNumber}
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                      APPROVED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {selectedInvoice.date} • {formatSystemTime(selectedInvoice.timestamp)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Operator</span>
                  <span className="font-semibold text-slate-800">{selectedInvoice.operator}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Shift</span>
                  <span className="font-semibold text-slate-800">{selectedInvoice.shift || "SHIFT A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Items</span>
                  <span className="font-semibold text-slate-800">{selectedInvoice.items?.length || 1}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Quantity</span>
                  <span className="font-bold text-emerald-700">{selectedInvoice.totalQuantity.toLocaleString()} PCS</span>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono mb-2">
                  Invoice Items Breakdown
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 font-mono uppercase">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Reference</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Destination Stock</th>
                        <th className="p-2.5 text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedInvoice.items || []).map((it, idx) => {
                        const refObj = refMap.get(it.reference.toUpperCase());
                        return (
                          <tr key={it.id || idx} className="hover:bg-slate-50/60">
                            <td className="p-2.5 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                            <td className="p-2.5 font-mono font-bold text-blue-700">{it.reference}</td>
                            <td className="p-2.5 text-slate-600">{refObj?.description || it.description || "—"}</td>
                            <td className="p-2.5 font-mono text-[11px]">
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                it.destinationStock === "STOCK 2"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                                  : "bg-blue-50 text-blue-700 border border-blue-200"
                              }`}>
                                {it.destinationStock}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                              {it.quantity.toLocaleString()} PCS
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => handleExportCSV(selectedInvoice)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Invoice CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
