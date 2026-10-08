import React, { useState, useMemo } from "react";
import { ArchivedInvoice, Delivery, Reference, User } from "../types";
import { 
  FileText, Search, ExternalLink, Eye, 
  Trash2, X, RefreshCw
} from "lucide-react";
import Swal from "sweetalert2";
import PdfViewerModal from "./PdfViewerModal";
import { 
  resolveInvoicePdfUrl, 
  deleteArchivedInvoice,
  clearAllArchivedInvoices
} from "../services/invoiceArchiveService";

interface InvoiceArchiveWorkspaceProps {
  archivedInvoices: ArchivedInvoice[];
  deliveries: Delivery[];
  references: Reference[];
  currentUser: User;
  onRefresh?: () => void;
}

export default function InvoiceArchiveWorkspace({
  archivedInvoices,
  deliveries,
  references,
  currentUser
}: InvoiceArchiveWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [onlyPdfFilter, setOnlyPdfFilter] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ArchivedInvoice | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"sw" | "meshes">("sw");
  
  // PDF Viewer Modal
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState<string>("");
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Display only invoices explicitly saved/uploaded to the archive
  // Historical deliveries stay separate in the Deliveries workspace so users can start from zero
  const allInvoices = useMemo(() => {
    const list = [...archivedInvoices];
    list.sort((a, b) => {
      const tA = new Date(a.uploadedAt || a.invoiceDate || 0).getTime();
      const tB = new Date(b.uploadedAt || b.invoiceDate || 0).getTime();
      return tB - tA;
    });
    return list;
  }, [archivedInvoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allInvoices.filter((inv) => {
      if (onlyPdfFilter && !inv.hasPdf && !inv.pdfDataUrl) return false;
      if (typeFilter !== "ALL") {
        const t = (inv.deliveryType || "").toUpperCase();
        if (typeFilter === "SW" && !t.includes("STEERING")) return false;
        if (typeFilter === "PRECOSIDO" && !t.includes("PRECOSIDO")) return false;
      }
      if (!q) return true;

      const matchesNum = inv.invoiceNumber.toLowerCase().includes(q);
      const matchesCust = (inv.customer || "").toLowerCase().includes(q) ||
        inv.swItems?.some((it) => {
          const cust = references.find((r) => r.code === it.invoiceRef)?.customer;
          return cust && cust.toLowerCase().includes(q);
        }) ||
        inv.meshItems?.some((it) => {
          const cust = references.find((r) => r.code === it.associatedMeshRef)?.customer;
          return cust && cust.toLowerCase().includes(q);
        });
      const matchesDate = (inv.invoiceDate || "").toLowerCase().includes(q);
      const matchesSw = inv.swItems?.some(
        (it) => it.invoiceRef.toLowerCase().includes(q) || (it.description || "").toLowerCase().includes(q)
      );
      const matchesMesh = inv.meshItems?.some(
        (it) => it.associatedMeshRef.toLowerCase().includes(q) || (it.description || "").toLowerCase().includes(q)
      );

      return matchesNum || matchesCust || matchesDate || matchesSw || matchesMesh;
    });
  }, [allInvoices, searchQuery, typeFilter, onlyPdfFilter]);

  // Summary Metrics (100% real mathematical calculation from line items)
  const metrics = useMemo(() => {
    const totalInvoices = allInvoices.length;
    const totalPcs = allInvoices.reduce((acc, i) => {
      const swSum = i.swItems && i.swItems.length > 0
        ? i.swItems.reduce((s, it) => s + (it.quantity || 0), 0)
        : (i.totalQuantity || 0);
      return acc + swSum;
    }, 0);
    const totalMeshPcs = allInvoices.reduce((acc, i) => {
      const meshSum = i.meshItems && i.meshItems.length > 0
        ? i.meshItems.reduce((s, it) => s + (it.quantity || 0), 0)
        : (i.totalMeshQuantity || 0);
      return acc + meshSum;
    }, 0);
    const withPdfCount = allInvoices.filter((i) => i.hasPdf || i.pdfDataUrl).length;
    return { totalInvoices, totalPcs, totalMeshPcs, withPdfCount };
  }, [allInvoices]);

  // Open PDF Preview Handler
  const handleOpenPdf = async (invoice: ArchivedInvoice) => {
    setIsLoadingPdf(true);
    setPreviewPdfTitle(`Invoice #${invoice.invoiceNumber}`);
    try {
      const url = await resolveInvoicePdfUrl(invoice);
      if (url) {
        setPreviewPdfUrl(url);
      } else {
        Swal.fire({
          icon: "info",
          title: "PDF Not Found",
          text: `No original PDF file is saved for invoice #${invoice.invoiceNumber}. You can attach one anytime.`
        });
      }
    } catch (err: any) {
      console.error("Failed to load PDF:", err);
      Swal.fire({
        icon: "error",
        title: "Failed to Open PDF",
        text: err?.message || "Could not retrieve the PDF file."
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const [isClearing, setIsClearing] = useState(false);

  const handleDelete = async (inv: ArchivedInvoice) => {
    if (currentUser.role === "operator") {
      Swal.fire({
        icon: "warning",
        title: "Access Restricted",
        text: "Only supervisors or managers can remove archived invoice records."
      });
      return;
    }

    const confirmRes = await Swal.fire({
      title: `Delete Invoice #${inv.invoiceNumber}?`,
      text: "This removes the invoice record and PDF from the Invoice Archive only. Physical stocks and all records in Deliveries will NOT be affected.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel"
    });

    if (confirmRes.isConfirmed) {
      try {
        await deleteArchivedInvoice(inv.id, inv.invoiceNumber);
        if (selectedInvoice?.id === inv.id) {
          setSelectedInvoice(null);
        }
        await Swal.fire({
          icon: "success",
          title: "Invoice Deleted",
          text: `Invoice #${inv.invoiceNumber} removed from directory. Stocks and deliveries remain intact.`,
          timer: 1500,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({
          icon: "error",
          title: "Delete Failed",
          text: err?.message || "Could not delete invoice."
        });
      }
    }
  };

  const handleClearArchive = async () => {
    if (currentUser.role === "operator") {
      Swal.fire({
        icon: "warning",
        title: "Access Restricted",
        text: "Only supervisors or managers can reset the invoice archive."
      });
      return;
    }

    const confirmRes = await Swal.fire({
      title: "Reset Invoice Archive to Zero?",
      text: "This removes all archived invoice documents from this archive screen. Your physical stocks and all records in Deliveries will remain 100% untouched.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Reset to Zero",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel"
    });

    if (confirmRes.isConfirmed) {
      setIsClearing(true);
      try {
        await clearAllArchivedInvoices();
        setSelectedInvoice(null);
        await Swal.fire({
          icon: "success",
          title: "Archive Reset",
          text: "The Invoice Archive has been cleared to zero. Stocks and deliveries remain intact.",
          timer: 1600,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({
          icon: "error",
          title: "Reset Failed",
          text: err?.message || "Could not clear invoice archive."
        });
      } finally {
        setIsClearing(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      
      {/* 1. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
            Total Invoices
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-0.5">
            {metrics.totalInvoices}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Archived records
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
            SW Pieces
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-blue-600 mt-0.5">
            {metrics.totalPcs.toLocaleString()} <span className="text-xs font-normal">PCS</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Steering wheels dispatched
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
            Mesh Deductions
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 mt-0.5">
            {metrics.totalMeshPcs.toLocaleString()} <span className="text-xs font-normal">PCS</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Linked heating elements
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
            With Original PDF
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 mt-0.5">
            {metrics.withPdfCount}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Original files ready to open
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice #, SW ref, Mesh ref, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTypeFilter("ALL")}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                typeFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("SW")}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                typeFilter === "SW" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Steering Wheels
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("PRECOSIDO")}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                typeFilter === "PRECOSIDO" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Precosido
            </button>
          </div>

          {/* Toggle PDF Only */}
          <button
            type="button"
            onClick={() => setOnlyPdfFilter(!onlyPdfFilter)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              onlyPdfFilter
                ? "bg-rose-50 border-rose-300 text-rose-700 shadow-2xs"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>PDF Only</span>
          </button>

          {allInvoices.length > 0 && currentUser.role !== "operator" && (
            <button
              type="button"
              onClick={handleClearArchive}
              disabled={isClearing}
              className="px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Clear all archived invoices to start from zero"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50/90 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Reference SW</th>
                <th className="py-3 px-3">Reference Meshes</th>
                <th className="py-3 px-3 text-right">Total Qty</th>
                <th className="py-3 px-3 text-center">PDF</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-mono">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span>No invoices found matching current criteria.</span>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const hasPdf = Boolean(inv.hasPdf || inv.pdfDataUrl);
                  const swRefs = inv.swItems?.map((s) => s.invoiceRef) || [];
                  const meshRefs = inv.meshItems?.map((m) => m.associatedMeshRef) || [];
                  const isPre = (inv.deliveryType || "").toUpperCase().includes("PRECOSIDO");

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {/* Invoice # */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-xs">
                            {inv.invoiceNumber}
                          </span>
                          {hasPdf && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              PDF
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                        {inv.invoiceDate || "—"}
                      </td>

                      {/* Delivery Type */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase border ${
                            isPre
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                          }`}
                        >
                          {isPre ? "Precosido" : "Steering Wheels"}
                        </span>
                      </td>

                      {/* Reference SW Preview */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {swRefs.length > 0 ? (
                          <div className="flex items-center gap-1 max-w-[200px] truncate">
                            <span className="font-bold text-slate-800">
                              {swRefs.slice(0, 2).join(", ")}
                            </span>
                            {swRefs.length > 2 && (
                              <span className="text-[10px] text-slate-400">
                                +{swRefs.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None logged</span>
                        )}
                      </td>

                      {/* Reference Meshes Preview */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {meshRefs.length > 0 ? (
                          <div className="flex items-center gap-1 max-w-[200px] truncate">
                            <span className="font-bold text-emerald-700">
                              {Array.from(new Set(meshRefs)).slice(0, 2).join(", ")}
                            </span>
                            {meshRefs.length > 2 && (
                              <span className="text-[10px] text-slate-400">
                                +{meshRefs.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No mesh</span>
                        )}
                      </td>

                      {/* Total Qty */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-slate-900 font-mono">
                        {(() => {
                          const displayQty = inv.swItems && inv.swItems.length > 0
                            ? inv.swItems.reduce((s, it) => s + (it.quantity || 0), 0)
                            : (inv.totalQuantity || 0);
                          return displayQty ? displayQty.toLocaleString() : "—";
                        })()}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">PCS</span>
                      </td>

                      {/* PDF Ready Icon */}
                      <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {hasPdf ? (
                          <button
                            type="button"
                            onClick={() => handleOpenPdf(inv)}
                            className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                            title="Open original PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="View invoice details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {hasPdf && (
                            <button
                              type="button"
                              onClick={() => handleOpenPdf(inv)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Open original PDF"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          {currentUser.role !== "operator" && (
                            <button
                              type="button"
                              onClick={() => handleDelete(inv)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete invoice record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* 6. Invoice Details Drawer / Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold font-mono text-sm shadow-2xs">
                  INV
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 font-mono tracking-tight">
                      Invoice #{selectedInvoice.invoiceNumber}
                    </h3>
                    {(selectedInvoice.hasPdf || selectedInvoice.pdfDataUrl) && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                        Original PDF Available
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                    <span>Date: {selectedInvoice.invoiceDate}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(selectedInvoice.hasPdf || selectedInvoice.pdfDataUrl) && (
                  <button
                    type="button"
                    onClick={() => handleOpenPdf(selectedInvoice)}
                    disabled={isLoadingPdf}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Open PDF</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Metrics Mini-Bar */}
            <div className="grid grid-cols-3 gap-2 p-4 bg-slate-50/40 border-b border-slate-100 font-mono text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Pieces</span>
                <span className="text-base font-black text-slate-900">
                  {(
                    selectedInvoice.swItems && selectedInvoice.swItems.length > 0
                      ? selectedInvoice.swItems.reduce((s, it) => s + (it.quantity || 0), 0)
                      : (selectedInvoice.totalQuantity || 0)
                  ).toLocaleString()} PCS
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Steering Wheel Refs</span>
                <span className="text-base font-black text-blue-600">{selectedInvoice.swItems?.length || 0} Lines</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Mesh Deductions</span>
                <span className="text-base font-black text-emerald-600">{selectedInvoice.meshItems?.length || 0} Lines</span>
              </div>
            </div>

            {/* Navigation Tabs between SW items and Meshes */}
            <div className="px-5 pt-3 border-b border-slate-200 flex items-center gap-3 bg-white">
              <button
                type="button"
                onClick={() => setActiveDetailTab("sw")}
                className={`pb-2.5 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  activeDetailTab === "sw"
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Reference SW (Steering Wheels)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
                  {selectedInvoice.swItems?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDetailTab("meshes")}
                className={`pb-2.5 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  activeDetailTab === "meshes"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Reference Meshes (Mallas)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {selectedInvoice.meshItems?.length || 0}
                </span>
              </button>
            </div>

            {/* Content Area */}
            <div className="p-5 overflow-y-auto flex-1">
              
              {/* TAB 1: SW ITEMS */}
              {activeDetailTab === "sw" && (
                <div className="space-y-3">
                  {(!selectedInvoice.swItems || selectedInvoice.swItems.length === 0) ? (
                    <div className="p-8 text-center text-slate-400 font-mono text-xs">
                      No individual Steering Wheel references registered for this invoice.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Reference SW</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3 text-right">Quantity</th>
                            <th className="py-2.5 px-3">Associated Mesh</th>
                            {selectedInvoice.swItems.some((s) => s.unitPrice) && (
                              <th className="py-2.5 px-3 text-right">Price</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedInvoice.swItems.map((item, idx) => {
                            const itemCustomer = references.find((r) => r.code === item.invoiceRef)?.customer || item.customer || "GENERAL";
                            return (
                              <tr key={`${item.invoiceRef}-${idx}`} className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                                  {item.invoiceRef}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs font-sans">
                                  {item.description || "—"}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                    {itemCustomer}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                                  {item.quantity.toLocaleString()} pcs
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {item.associatedMeshRef ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      {item.associatedMeshRef}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-[10px]">No mesh needed</span>
                                  )}
                                </td>
                                {selectedInvoice.swItems.some((s) => s.unitPrice) && (
                                  <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">
                                    {item.unitPrice ? `€${item.unitPrice.toFixed(2)}` : "—"}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: MESH ITEMS */}
              {activeDetailTab === "meshes" && (
                <div className="space-y-3">
                  {(!selectedInvoice.meshItems || selectedInvoice.meshItems.length === 0) ? (
                    <div className="p-8 text-center text-slate-400 font-mono text-xs">
                      No heating mesh deductions associated with this invoice.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Mesh Reference</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3 text-right">Required Qty</th>
                            <th className="py-2.5 px-3">Target Stock</th>
                            <th className="py-2.5 px-3">Source SW Ref</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedInvoice.meshItems.map((m, idx) => {
                            const meshCustomer = references.find((r) => r.code === m.associatedMeshRef)?.customer ||
                              references.find((r) => r.code === m.sourceSWRef)?.customer || "GENERAL";
                            return (
                              <tr key={`${m.associatedMeshRef}-${idx}`} className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-3 font-bold text-emerald-800 whitespace-nowrap">
                                  {m.associatedMeshRef}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs font-sans">
                                  {m.description || "Mesh Heating Element"}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                    {meshCustomer}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                                  -{m.quantity.toLocaleString()} pcs
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    m.targetStock === "Stock 2"
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-blue-50 text-blue-800 border-blue-200"
                                  }`}>
                                    {m.targetStock}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                                  {m.sourceSWRef || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end text-xs font-mono">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. Real High-Resolution Native Canvas PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={Boolean(previewPdfUrl)}
        onClose={() => setPreviewPdfUrl(null)}
        title={previewPdfTitle}
        pdfDataUrl={previewPdfUrl}
      />

    </div>
  );
}
