import React, { useState } from "react";
import { ParsedDeliveryDocument, ParsedDeliveryLineItem } from "../services/deliveryPdfParser";
import { Delivery, Reference, User } from "../types";
import { CheckCircle2, AlertCircle, ArrowRight, X, FileText, Layers, RefreshCw, Archive } from "lucide-react";
import Swal from "sweetalert2";
import { saveArchivedInvoice } from "../services/invoiceArchiveService";

interface DeliveryPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedDoc: ParsedDeliveryDocument | null;
  references: Reference[];
  onApplyDelivery: (deliveriesData: Omit<Delivery, "id" | "timestamp" | "operatorName">[]) => Promise<void>;
  onLoadIntoForm: (doc: ParsedDeliveryDocument) => void;
  pdfDataUrl?: string;
  pdfFileName?: string;
  pdfFileSize?: number;
  currentUser?: User;
}

export default function DeliveryPdfModal({
  isOpen,
  onClose,
  parsedDoc,
  references,
  onApplyDelivery,
  onLoadIntoForm,
  pdfDataUrl,
  pdfFileName,
  pdfFileSize,
  currentUser
}: DeliveryPdfModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [isArchivingOnly, setIsArchivingOnly] = useState(false);

  if (!isOpen || !parsedDoc) return null;

  // Filter items: Mesh deduction items are the ones that affect stock
  const meshItems = parsedDoc.items.filter((item) => item.isMeshDeduction && item.associatedMeshRef);
  const nonMeshItems = parsedDoc.items.filter((item) => !item.isMeshDeduction);

  const totalDeductionQty = meshItems.reduce((acc, i) => acc + i.quantity, 0);
  const hasInsufficientStock = meshItems.some((i) => i.status === "insufficient_stock");

  const buildArchiveRecord = (status: "applied" | "archived") => {
    const swItems = parsedDoc.items.map((item) => ({
      orderNumber: item.orderNumber,
      invoiceRef: item.invoiceRef,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      associatedMeshRef: item.associatedMeshRef
    }));

    const meshDeductions = meshItems.map((item) => ({
      associatedMeshRef: item.associatedMeshRef!,
      description: item.description,
      quantity: item.quantity,
      targetStock: item.targetStock,
      sourceSWRef: item.invoiceRef,
      applied: status === "applied"
    }));

    return {
      invoiceNumber: parsedDoc.invoiceNumber,
      invoiceDate: parsedDoc.invoiceDate || new Date().toISOString().slice(0, 10),
      deliveryType: parsedDoc.deliveryType,
      targetStock: parsedDoc.targetStock,
      customer: "",
      totalQuantity: parsedDoc.totalQuantity,
      totalMeshQuantity: totalDeductionQty,
      totalAmount: parsedDoc.totalAmount ?? null,
      transportVia: parsedDoc.transportVia || "",
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser?.fullName || currentUser?.username || "Operator",
      status,
      swItems: swItems.map(s => ({
        ...s,
        unitPrice: s.unitPrice ?? null,
        totalPrice: s.totalPrice ?? null
      })),
      meshItems: meshDeductions,
      hasPdf: Boolean(pdfDataUrl),
      pdfFileName: pdfFileName || `${parsedDoc.invoiceNumber}.pdf`,
      pdfFileSize: pdfFileSize ?? null,
      notes: status === "applied" ? "Stock deducted and archived" : "Archived without stock deduction"
    };
  };

  const handleConfirmApply = async () => {
    if (meshItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Mesh Deductions",
        text: "None of the references in this invoice require mesh stock deduction."
      });
      return;
    }

    if (hasInsufficientStock) {
      const confirmOverride = await Swal.fire({
        icon: "warning",
        title: "Insufficient Stock Warning",
        text: "One or more mesh items exceed the currently recorded system stock. Do you want to proceed?",
        showCancelButton: true,
        confirmButtonText: "Proceed Anyway",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#e11d48"
      });
      if (!confirmOverride.isConfirmed) return;
    }

    setIsApplying(true);
    try {
      // Build payload for executeProtectedDeliveries
      const payload: Omit<Delivery, "id" | "timestamp" | "operatorName">[] = meshItems.map((item) => {
        const catRef = references.find((r) => r.code === item.associatedMeshRef);
        const customer = catRef?.customer?.trim() || "";
        return {
          invoiceNumber: parsedDoc.invoiceNumber,
          reference: item.associatedMeshRef!,
          quantity: item.quantity,
          customer,
          deliveryType: item.targetStock === "Stock 2" ? "PRECOSIDO" : "STEERING WHEELS",
          notes: `PDF Import [${parsedDoc.invoiceNumber}]: ${item.invoiceRef} (${item.description}) -> ${item.associatedMeshRef}`
        };
      });

      await onApplyDelivery(payload);

      // Auto-archive in Invoice Directory
      try {
        await saveArchivedInvoice(buildArchiveRecord("applied"), pdfDataUrl);
      } catch (archiveErr) {
        console.warn("Auto-archive notice:", archiveErr);
      }

      await Swal.fire({
        icon: "success",
        title: "Delivery Applied & Archived",
        text: `Invoice #${parsedDoc.invoiceNumber}: Deducted ${totalDeductionQty.toLocaleString()} PCS across ${meshItems.length} mesh references and archived in Directory.`,
        timer: 1800,
        showConfirmButton: false
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Failed to Apply Delivery",
        text: err?.message || "An error occurred while committing delivery records."
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleArchiveOnly = async () => {
    setIsArchivingOnly(true);
    try {
      await saveArchivedInvoice(buildArchiveRecord("archived"), pdfDataUrl);
      await Swal.fire({
        icon: "success",
        title: "Invoice Archived",
        text: `Invoice #${parsedDoc.invoiceNumber} saved to Invoice Directory without deducting stock.`,
        timer: 1800,
        showConfirmButton: false
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Archive Failed",
        text: err?.message || "Failed to save invoice to Directory."
      });
    } finally {
      setIsArchivingOnly(false);
    }
  };

  const handleTransferToForm = () => {
    onLoadIntoForm(parsedDoc);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs font-mono">
              PDF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 font-mono tracking-tight">
                  Invoice #{parsedDoc.invoiceNumber}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase border ${
                    parsedDoc.deliveryType === "PRECOSIDO"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-blue-50 text-blue-800 border-blue-200"
                  }`}
                >
                  {parsedDoc.deliveryType === "PRECOSIDO" ? "Precosido (Stock 2)" : "Steering Wheels (Stock 3)"}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {parsedDoc.rawCategoryText} • {parsedDoc.items.length} lines parsed
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Total Invoiced</span>
              <strong className="text-slate-800 font-bold">{parsedDoc.totalQuantity.toLocaleString()} PCS</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Mesh Deductions</span>
              <strong className="text-emerald-700 font-bold">{meshItems.length} references</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Deduction Qty</span>
              <strong className="text-emerald-700 font-bold">{totalDeductionQty.toLocaleString()} PCS</strong>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">INVOICE ITEM</th>
                    <th className="py-2.5 px-3">DEDUCTED MESH</th>
                    <th className="py-2.5 px-3 text-right">QTY</th>
                    <th className="py-2.5 px-3">TARGET</th>
                    <th className="py-2.5 px-3 text-right">STOCK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedDoc.items.map((item, idx) => {
                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          !item.isMeshDeduction ? "opacity-50 bg-slate-50/30" : ""
                        }`}
                      >
                        {/* 1. Invoice Ref */}
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{item.invoiceRef}</div>
                          <div className="text-[10px] text-slate-500 font-sans truncate max-w-[200px]" title={item.description}>
                            {item.description}
                          </div>
                        </td>

                        {/* 2. Deducted Mesh */}
                        <td className="py-2 px-3">
                          {item.isMeshDeduction && item.associatedMeshRef ? (
                            <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                              {item.associatedMeshRef}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No mesh required</span>
                          )}
                        </td>

                        {/* 3. Quantity */}
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {item.quantity.toLocaleString()}
                        </td>

                        {/* 4. Target Stock */}
                        <td className="py-2 px-3">
                          {item.isMeshDeduction ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.targetStock === "Stock 2"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {item.targetStock === "Stock 2" ? "S2" : "S3"}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 5. Stock Check */}
                        <td className="py-2 px-3 text-right">
                          {item.isMeshDeduction ? (
                            item.status === "insufficient_stock" ? (
                              <span className="text-rose-600 font-bold" title="Insufficient stock available">
                                {item.currentAvailableStock} (Short)
                              </span>
                            ) : (
                              <span className="text-slate-600">
                                {item.currentAvailableStock}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTransferToForm}
            className="px-3.5 py-2 text-xs font-mono font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            title="Populate the manual delivery form with these items"
          >
            Load into Form
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-mono text-slate-500 hover:text-slate-800 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchiveOnly}
              disabled={isArchivingOnly || isApplying}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Archive invoice with all references and PDF without modifying physical stock"
            >
              <Archive className="w-3.5 h-3.5 text-blue-400" />
              <span>{isArchivingOnly ? "Archiving..." : "Archive Only"}</span>
            </button>
            <button
              type="button"
              onClick={handleConfirmApply}
              disabled={isApplying || isArchivingOnly || meshItems.length === 0}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs tracking-wide shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Deducting...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apply & Deduct ({totalDeductionQty.toLocaleString()} PCS)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
