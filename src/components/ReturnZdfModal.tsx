import React, { useState, useRef, useMemo } from "react";
import { 
  X, UploadCloud, FileText, CheckCircle2, AlertTriangle, 
  Trash2, Plus, ArrowLeft, Loader2, Layers, ShieldCheck, Box
} from "lucide-react";
import Swal from "sweetalert2";
import { Reference, User } from "../types";
import { 
  parseZdfReturnPDF, 
  ParsedZdfReturnDocument, 
  ParsedZdfReturnItem 
} from "../services/returnZdfPdfParser";
import { executeProtectedStockOperation } from "../services/protectionLayer";
import { doc } from "firebase/firestore";
import { db } from "../firebase";

interface ReturnZdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  references: Reference[];
  currentUser: User | null;
  initialCategory?: "RED_CAGE" | "PRECOSIDO" | null;
}

export default function ReturnZdfModal({
  isOpen,
  onClose,
  references = [],
  currentUser,
  initialCategory = null
}: ReturnZdfModalProps) {
  // Navigation step: 1 = choose category (if not set), 2 = upload PDF, 3 = review table
  const [category, setCategory] = useState<"RED_CAGE" | "PRECOSIDO" | null>(initialCategory);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedDoc, setParsedDoc] = useState<ParsedZdfReturnDocument | null>(null);
  const [items, setItems] = useState<ParsedZdfReturnItem[]>([]);
  const [containerNumber, setContainerNumber] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Catalog reference codes set
  const catalogCodes = useMemo(() => {
    return references.map((r) => r.code).filter(Boolean);
  }, [references]);

  // Sync category if initialCategory changes
  React.useEffect(() => {
    if (initialCategory) {
      setCategory(initialCategory);
    }
  }, [initialCategory]);

  if (!isOpen) return null;

  const targetStock = category === "RED_CAGE" ? "Stock 3" : "Stock 2";

  // Handle PDF Parsing
  const handleProcessFile = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      Swal.fire({
        icon: "warning",
        title: "PDF Required",
        text: "Please upload a valid PDF document (e.g. ZF Expedição de Retorno or Proforma)."
      });
      return;
    }

    if (!category) return;

    setFile(selectedFile);
    setIsParsing(true);
    try {
      const docData = await parseZdfReturnPDF(selectedFile, category, references);

      if (docData.items.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Line Items Detected",
          text: "Could not find valid references or quantities in this PDF. Please check the document format."
        });
        setIsParsing(false);
        return;
      }

      setParsedDoc(docData);
      setItems(docData.items);
      setContainerNumber(docData.containerOrInvoiceNumber);
    } catch (err: any) {
      console.error("Return ZDF PDF Parsing Error:", err);
      Swal.fire({
        icon: "error",
        title: "PDF Read Error",
        text: err?.message || "Failed to parse return document."
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleProcessFile(droppedFile);
  };

  // Row update helpers
  const handleToggleInclude = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, included: !it.included } : it))
    );
  };

  const handleUpdateItem = (
    id: string,
    field: "meshReference" | "quantity",
    val: string | number
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === "quantity") {
          const q = typeof val === "number" ? val : parseInt(val, 10);
          return { ...it, quantity: isNaN(q) ? 0 : Math.max(0, q) };
        }
        return { ...it, meshReference: String(val).toUpperCase().trim() };
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleAddManualRow = () => {
    const defaultRef = references[0]?.code || "34316011B";
    const newItem: ParsedZdfReturnItem = {
      id: `manual-${Date.now()}-${items.length + 1}`,
      client: "MANUAL",
      docReference: defaultRef,
      description: "Manual Return Line",
      meshReference: defaultRef,
      quantity: 1,
      targetStock,
      isMeshDirect: true,
      bomResolved: false,
      included: true
    };
    setItems((prev) => [...prev, newItem]);
  };

  // Calculated totals for included rows
  const includedItems = items.filter((it) => it.included && it.quantity > 0 && it.meshReference);
  const totalIncludedPcs = includedItems.reduce((sum, it) => sum + it.quantity, 0);

  // Submit and commit stock intake into Firestore
  const handleConfirmIntake = async () => {
    const cleanContainer = containerNumber.trim().toUpperCase();
    if (!cleanContainer) {
      Swal.fire({
        icon: "warning",
        title: "Container # Required",
        text: "Please provide a container or invoice number for traceability."
      });
      return;
    }

    if (includedItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Items Selected",
        text: "Please ensure at least one valid item is selected with quantity > 0."
      });
      return;
    }

    const confirmRes = await Swal.fire({
      title: `Confirm Return to ${targetStock}?`,
      text: `Add ${totalIncludedPcs.toLocaleString()} PCS across ${includedItems.length} reference(s) to ${targetStock} (${category === "RED_CAGE" ? "RED CAGE" : "PRECOSIDO"}).`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: category === "RED_CAGE" ? "#e11d48" : "#0d9488",
      confirmButtonText: `Add to ${targetStock}`,
      cancelButtonText: "Review"
    });

    if (!confirmRes.isConfirmed) return;

    setIsSubmitting(true);
    try {
      const operatorName = currentUser?.fullName || "Manager";
      const now = new Date().toISOString();

      // Aggregate quantities by mesh reference
      const meshTotals: Record<string, number> = {};
      for (const item of includedItems) {
        const mesh = item.meshReference.trim().toUpperCase();
        meshTotals[mesh] = (meshTotals[mesh] || 0) + item.quantity;
      }

      // Build deltas
      const deltas = Object.entries(meshTotals).map(([refCode, qty]) => ({
        reference: refCode,
        delta1: 0,
        delta2: targetStock === "Stock 2" ? qty : 0,
        delta3: targetStock === "Stock 3" ? qty : 0
      }));

      const opType = category === "RED_CAGE" ? "RETURN_ZDF_RED_CAGE" : "RETURN_ZDF_PRECOSIDO";
      const moveType = targetStock === "Stock 3" ? "STOCK 3 IN" : "STOCK 2 IN";

      // Transactions
      const transactions = includedItems.map((item, idx) => ({
        id: `trans-zdf-${Date.now()}-${idx}`,
        reference: item.meshReference.trim().toUpperCase(),
        movementType: moveType,
        stock: targetStock,
        destinationStock: targetStock,
        invoiceNumber: cleanContainer,
        quantity: item.quantity,
        expectedQty: item.quantity,
        actualQty: item.quantity,
        operatorName,
        timestamp: now,
        notes: `RETURN ZDF [${category}] (${item.docReference} -> ${item.meshReference}) Container: ${cleanContainer}${note ? ` - ${note}` : ""}`
      }));

      const deliveryId = `deliv-zdf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      await executeProtectedStockOperation({
        operationType: "INCOMING_RECEIPT",
        deltas,
        operatorName,
        reason: `RETURN ZDF [${category}]: ${cleanContainer} -> ${targetStock} (${includedItems.length} items, ${totalIncludedPcs} pcs)`,
        transactions,
        additionalWrites: (transaction, timestamp) => {
          // Record delivery receipt in deliveries collection
          const delivRef = doc(db, "deliveries", deliveryId);
          transaction.set(delivRef, {
            id: deliveryId,
            deliveryId,
            invoiceNumber: cleanContainer,
            deliveryType: category === "RED_CAGE" ? "RETURN_ZDF_RED_CAGE" : "RETURN_ZDF_PRECOSIDO",
            deliveryCategory: category === "RED_CAGE" ? "STEERING WHEELS" : "PRECOSIDO",
            targetStock,
            destinationStock: targetStock,
            date: now.slice(0, 10),
            createdAt: timestamp,
            registeredBy: operatorName,
            operatorName,
            status: "approved",
            totalQuantity: totalIncludedPcs,
            totalBoxes: includedItems.length,
            notes: note ? `RETURN ZDF (${category}): ${note}` : `RETURN ZDF (${category})`,
            items: includedItems.map((it, i) => ({
              id: `item-${deliveryId}-${i + 1}`,
              reference: it.meshReference.trim().toUpperCase(),
              originalRef: it.docReference,
              description: it.description,
              quantity: it.quantity,
              client: it.client,
              targetStock
            }))
          });
        }
      });

      await Swal.fire({
        icon: "success",
        title: "Return Processed",
        text: `Successfully added ${totalIncludedPcs.toLocaleString()} PCS to ${targetStock} under container ${cleanContainer}.`,
        timer: 2000,
        showConfirmButton: false
      });

      // Reset and close
      handleReset();
      onClose();
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Intake Failed",
        text: err?.message || "An error occurred while adding returned stock."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCategory(null);
    setFile(null);
    setParsedDoc(null);
    setItems([]);
    setContainerNumber("");
    setNote("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
              category === "RED_CAGE" 
                ? "bg-rose-600 text-white shadow-rose-500/20" 
                : category === "PRECOSIDO"
                ? "bg-teal-600 text-white shadow-teal-500/20"
                : "bg-slate-900 text-white"
            }`}>
              ZDF
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight truncate">
                  RETURN ZDF
                </h2>
                {category && (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${
                    category === "RED_CAGE"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-teal-50 text-teal-700 border-teal-200"
                  }`}>
                    {category === "RED_CAGE" ? "RED CAGE → Stock 3" : "PRECOSIDO → Stock 2"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {!category 
                  ? "Select destination category" 
                  : !parsedDoc 
                  ? `Upload return invoice to add meshes to ${targetStock}`
                  : `Review and verify line items before stocking into ${targetStock}`}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          
          {/* STEP 1: CHOOSE CATEGORY (RED CAGE vs PRECOSIDO) */}
          {!category && (
            <div className="space-y-4 max-w-xl mx-auto py-4">
              <div className="text-center space-y-1 mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  Select Return ZDF Category
                </h3>
                <p className="text-xs text-slate-400">
                  Choose where the returned parts must be added
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* RED CAGE Button */}
                <button
                  type="button"
                  onClick={() => setCategory("RED_CAGE")}
                  className="p-5 rounded-2xl border-2 border-rose-200 hover:border-rose-500 bg-rose-50/50 hover:bg-rose-50 transition-all text-left flex flex-col justify-between gap-3 group cursor-pointer shadow-xs hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      S3
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                      Stock 3
                    </span>
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900 group-hover:text-rose-700 transition-colors">
                      RED CAGE
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Add directly to <strong className="text-rose-700">Stock 3</strong> (Finished Goods Steering Wheels).
                    </p>
                  </div>
                  <div className="text-xs font-bold text-rose-600 flex items-center gap-1 pt-1 border-t border-rose-100">
                    <span>Upload Invoice PDF →</span>
                  </div>
                </button>

                {/* PRECOSIDO Button */}
                <button
                  type="button"
                  onClick={() => setCategory("PRECOSIDO")}
                  className="p-5 rounded-2xl border-2 border-teal-200 hover:border-teal-500 bg-teal-50/50 hover:bg-teal-50 transition-all text-left flex flex-col justify-between gap-3 group cursor-pointer shadow-xs hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      S2
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                      Stock 2
                    </span>
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors">
                      PRECOSIDO
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Add directly to <strong className="text-teal-700">Stock 2</strong> (WIP / Sub-assembly Plantillas).
                    </p>
                  </div>
                  <div className="text-xs font-bold text-teal-600 flex items-center gap-1 pt-1 border-t border-teal-100">
                    <span>Upload Invoice PDF →</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: UPLOAD PDF */}
          {category && !parsedDoc && (
            <div className="space-y-4 max-w-xl mx-auto py-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCategory(null)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change Category</span>
                </button>

                <div className="text-xs font-mono font-bold text-slate-600">
                  Destination: <span className={category === "RED_CAGE" ? "text-rose-600 font-extrabold" : "text-teal-600 font-extrabold"}>{targetStock}</span>
                </div>
              </div>

              {/* PDF Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? "border-rose-500 bg-rose-50/60 scale-[0.99]"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleProcessFile(f);
                  }}
                />

                {isParsing ? (
                  <div className="py-6 flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-rose-600 animate-spin" />
                    <div className="text-sm font-bold text-slate-800">Reading Return PDF & Resolving BOM Meshes...</div>
                    <div className="text-xs text-slate-400 font-mono">Parsing ZF references and quantities</div>
                  </div>
                ) : (
                  <>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 ${
                      category === "RED_CAGE" ? "bg-rose-100 text-rose-600" : "bg-teal-100 text-teal-600"
                    }`}>
                      <UploadCloud className="w-7 h-7" />
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-slate-800">
                        Upload Return PDF for {category === "RED_CAGE" ? "RED CAGE (S3)" : "PRECOSIDO (S2)"}
                      </h4>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Drop the ZF Lifetec return invoice or delivery note here, or click to browse.
                      </p>
                    </div>

                    <div className="text-[11px] font-mono font-semibold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600 mt-1 shadow-2xs">
                      Supported: Expedição de Retorno, Proforma, ZF Return Notes
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & INTAKE TABLE */}
          {category && parsedDoc && (
            <div className="space-y-4">
              
              {/* Top Meta Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                    Container / Invoice #
                  </label>
                  <input
                    type="text"
                    value={containerNumber}
                    onChange={(e) => setContainerNumber(e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    placeholder="e.g. 990-985-981"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                    Target Stock
                  </label>
                  <div className={`px-2.5 py-1.5 text-xs font-mono font-extrabold rounded-xl border flex items-center justify-between ${
                    category === "RED_CAGE"
                      ? "bg-rose-50 border-rose-200 text-rose-800"
                      : "bg-teal-50 border-teal-200 text-teal-800"
                  }`}>
                    <span>{category === "RED_CAGE" ? "RED CAGE" : "PRECOSIDO"}</span>
                    <span className="font-mono text-[11px] font-black">{targetStock}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                    Total Extracted PCS
                  </label>
                  <div className="px-2.5 py-1.5 text-xs font-mono font-black text-slate-900 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                    <span>{includedItems.length} references</span>
                    <span className={category === "RED_CAGE" ? "text-rose-600 font-black text-sm" : "text-teal-600 font-black text-sm"}>
                      +{totalIncludedPcs.toLocaleString()} PCS
                    </span>
                  </div>
                </div>
              </div>

              {/* Precosido Mesh Selection Status */}
              {category === "PRECOSIDO" && (parsedDoc?.ignoredSetCount ?? 0) > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2 bg-teal-50/80 border border-teal-200/90 rounded-2xl text-xs text-teal-900 font-mono">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                    <span className="font-bold shrink-0">Meshes Only:</span>
                    <span className="truncate">Ignored {parsedDoc?.ignoredSetCount} SET references • Selected only meshes ({items.length} items) for Stock 2</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-md shrink-0">
                    Stock 2 Meshes
                  </span>
                </div>
              )}

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/80 sticky top-0 z-10 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-10">Inc</th>
                        <th className="py-2.5 px-3">OEM</th>
                        <th className="py-2.5 px-3">Doc Ref</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Mesh Ref (To Add)</th>
                        <th className="py-2.5 px-3 text-right w-24">Quantity</th>
                        <th className="py-2.5 px-3 text-center w-24">Target</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it, idx) => (
                        <tr 
                          key={it.id} 
                          className={`hover:bg-slate-50/80 transition-colors ${
                            !it.included ? "opacity-40 bg-slate-50/30" : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={it.included}
                              onChange={() => handleToggleInclude(it.id)}
                              className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                          </td>

                          {/* Client */}
                          <td className="py-2 px-3 font-mono font-bold text-[11px] text-slate-600">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                              {it.client || "ZF"}
                            </span>
                          </td>

                          {/* Doc Reference */}
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {it.docReference}
                          </td>

                          {/* Description */}
                          <td className="py-2 px-3 text-slate-500 text-[11px] max-w-[200px] truncate" title={it.description}>
                            {it.description}
                          </td>

                          {/* Mesh Reference (Editable Selector) */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={it.meshReference}
                              onChange={(e) => handleUpdateItem(it.id, "meshReference", e.target.value)}
                              list={`mesh-list-${it.id}`}
                              className={`px-2 py-1 text-xs font-mono font-bold rounded-lg border w-32 focus:outline-none focus:ring-1 ${
                                it.bomResolved 
                                  ? "bg-emerald-50/50 border-emerald-300 text-emerald-900 focus:ring-emerald-500" 
                                  : "bg-white border-slate-300 text-slate-900 focus:ring-rose-500"
                              }`}
                              placeholder="Mesh Ref"
                            />
                            <datalist id={`mesh-list-${it.id}`}>
                              {catalogCodes.map((code) => (
                                <option key={code} value={code} />
                              ))}
                            </datalist>
                          </td>

                          {/* Quantity */}
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="1"
                              value={it.quantity || ""}
                              onChange={(e) => handleUpdateItem(it.id, "quantity", e.target.value)}
                              className="w-20 px-2 py-1 text-right text-xs font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-900"
                            />
                          </td>

                          {/* Target Stock */}
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                              targetStock === "Stock 3"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-teal-100 text-teal-800"
                            }`}>
                              {targetStock}
                            </span>
                          </td>

                          {/* Delete */}
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(it.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Delete Row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer */}
                <div className="p-3 bg-slate-50/90 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Row</span>
                  </button>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-500">Selected: {includedItems.length} / {items.length}</span>
                    <span className="font-bold text-slate-900">Total: +{totalIncludedPcs.toLocaleString()} PCS</span>
                  </div>
                </div>
              </div>

              {/* Note (Optional) */}
              <div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional internal note (e.g. Returned from Kaleido, Container #990-985-981 verified)..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                />
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div>
            {category && parsedDoc && (
              <button
                type="button"
                onClick={() => {
                  setParsedDoc(null);
                  setItems([]);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Upload Another PDF</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {category && parsedDoc && (
              <button
                type="button"
                onClick={handleConfirmIntake}
                disabled={isSubmitting || includedItems.length === 0}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  category === "RED_CAGE"
                    ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                    : "bg-teal-600 hover:bg-teal-700 shadow-teal-500/20"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Add +{totalIncludedPcs.toLocaleString()} PCS to {targetStock}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
