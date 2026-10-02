import React, { useState, useRef, useMemo } from "react";
import { Reference, User, DisassemblyEntry } from "../types";
import { 
  parseGoogleSheetsFile, 
  parsePastedSheetText, 
  ParseResult 
} from "../utils/sheetParser";
import { 
  Hammer, 
  Upload, 
  Download, 
  ClipboardPaste, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Search, 
  Layers, 
  RotateCcw, 
  FileSpreadsheet, 
  Calendar, 
  History,
  X,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { getMoroccoTodayDateString, formatSystemTime, parseTimestampMs } from "../utils/timeUtils";
import { CustomReferenceSelect } from "./CustomReferenceSelect";

export interface DisassemblyStagedRow {
  id: string;
  reference: string;
  description: string;
  quantity: number;
  matchedReference?: {
    code: string;
    description: string;
    customer?: string;
    stock2: number;
    stock2Normal: number;
    stock2Disassembly: number;
    stock3: number;
  } | null;
}

export interface DisassemblyBatch {
  id: string;
  date: string;
  recordedTime: string;
  timestamp: any;
  records: DisassemblyEntry[];
  totalQty: number;
  uniqueReferencesCount: number;
}

interface DesassemblageWorkspaceProps {
  references: Reference[];
  currentUser: User;
  disassemblies?: DisassemblyEntry[];
  onValidateDisassembly: (
    entries: { date: string; reference: string; quantity: number; description?: string; notes?: string }[]
  ) => Promise<void>;
  onDeleteDisassembly?: (disassemblyId: string, reason?: string) => Promise<void>;
  onDeleteBatch?: (batchRecords: DisassemblyEntry[], reason?: string) => Promise<void>;
}

export default function DesassemblageWorkspace({
  references = [],
  currentUser,
  disassemblies = [],
  onValidateDisassembly,
  onDeleteDisassembly,
  onDeleteBatch
}: DesassemblageWorkspaceProps) {
  // Navigation Tabs: Intake vs History
  const [activeTab, setActiveTab] = useState<"intake" | "history">("intake");

  // Catalog Map for fast matching
  const refMap = useMemo(() => {
    const map = new Map<string, Reference>();
    references.forEach((r) => {
      if (r.code) map.set(r.code.toUpperCase().trim(), r);
      if (r.id) map.set(r.id.toUpperCase().trim(), r);
    });
    return map;
  }, [references]);

  // Staged Rows
  const [stagedRows, setStagedRows] = useState<DisassemblyStagedRow[]>([]);
  const [sourceName, setSourceName] = useState<string>("");
  const [disassemblyDate, setDisassemblyDate] = useState<string>(getMoroccoTodayDateString());
  const [disassemblyNote, setDisassemblyNote] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [manualQty, setManualQty] = useState("");

  // History filtering states
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState("all");
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to enrich raw items with catalog information
  const enrichRows = (items: { reference: string; description: string; quantity: number }[]): DisassemblyStagedRow[] => {
    return items.map((it, idx) => {
      const code = it.reference.toUpperCase().trim();
      const matched = refMap.get(code);
      const dis = matched?.stock2Disassembly || 0;
      const norm = matched ? (matched.stock2Normal !== undefined ? matched.stock2Normal : (matched.stock2 || 0) - dis) : 0;

      return {
        id: `staged-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        reference: code,
        description: it.description || matched?.description || "",
        quantity: it.quantity,
        matchedReference: matched
          ? {
              code: matched.code,
              description: matched.description,
              customer: matched.customer,
              stock2: matched.stock2 || 0,
              stock2Normal: Math.max(0, norm),
              stock2Disassembly: dis,
              stock3: matched.stock3 || 0
            }
          : null
      };
    });
  };

  // Handle uploaded file
  const handleFileUpload = async (file: File) => {
    setIsParsing(true);
    try {
      const result: ParseResult = await parseGoogleSheetsFile(file);
      if (result.rows.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Rows Found",
          text: "The uploaded file does not contain valid Reference and Quantity columns."
        });
        return;
      }

      const mapped = result.rows.map((r) => ({
        reference: r.refMaille,
        description: r.libelle || "",
        quantity: r.qtyConsommes
      }));

      const enriched = enrichRows(mapped);
      setStagedRows(enriched);
      setSourceName(file.name);

      Swal.fire({
        icon: "success",
        title: "File Loaded",
        text: `Successfully parsed ${enriched.length} references (${result.totalQuantity.toLocaleString()} PCS) from ${file.name}.`,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "File Import Error",
        text: err?.message || "Failed to parse spreadsheet file."
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Handle Pasted Text
  const handleProcessPastedText = () => {
    if (!pastedText.trim()) return;
    try {
      const result = parsePastedSheetText(pastedText);
      if (result.rows.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "Empty Content",
          text: "No valid tab/comma separated reference and quantity rows found."
        });
        return;
      }

      const mapped = result.rows.map((r) => ({
        reference: r.refMaille,
        description: r.libelle || "",
        quantity: r.qtyConsommes
      }));

      const enriched = enrichRows(mapped);
      setStagedRows(enriched);
      setSourceName("Pasted Clipboard Sheet");
      setPasteModalOpen(false);
      setPastedText("");
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Parse Error",
        text: err.message || "Failed to parse pasted text."
      });
    }
  };

  // Add manual row
  const handleAddManualRow = () => {
    if (!manualRef) return;
    const q = parseInt(manualQty, 10);
    if (isNaN(q) || q <= 0) {
      Swal.fire({ icon: "error", title: "Invalid Quantity", text: "Please enter a positive quantity." });
      return;
    }

    const newRows = enrichRows([{ reference: manualRef, description: "", quantity: q }]);
    setStagedRows((prev) => [...prev, ...newRows]);
    setManualRef("");
    setManualQty("");
    setManualModalOpen(false);
  };

  // Edit quantity in staged table
  const handleUpdateRowQty = (id: string, newQtyStr: string) => {
    const q = parseInt(newQtyStr, 10);
    setStagedRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, quantity: isNaN(q) || q < 0 ? 0 : q } : r))
    );
  };

  // Remove single row
  const handleRemoveRow = (id: string) => {
    setStagedRows((prev) => prev.filter((r) => r.id !== id));
  };

  // KPIs
  const totalStagedQty = useMemo(() => {
    return stagedRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
  }, [stagedRows]);

  const insufficientRows = useMemo(() => {
    return stagedRows.filter((r) => {
      const s3 = r.matchedReference?.stock3 ?? 0;
      return r.quantity > s3;
    });
  }, [stagedRows]);

  // Execute Disassembly Action: S3 -> S2 Disassembly
  const handleExecuteValidation = async () => {
    if (stagedRows.length === 0) return;

    if (totalStagedQty <= 0) {
      Swal.fire({
        icon: "error",
        title: "Zero Quantity",
        text: "Please specify positive disassembly quantities for your staged rows."
      });
      return;
    }

    const confirmHtml = `
      <div style="text-align: left; font-family: monospace; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; line-height: 1.6;">
        <p><strong>Total References:</strong> ${stagedRows.length} items</p>
        <p><strong>Total Disassembly Quantity:</strong> <span style="color: #9333ea; font-weight: 800; font-size: 15px;">${totalStagedQty.toLocaleString()} PCS</span></p>
        <p><strong>Stock Movement:</strong> <span style="color: #dc2626; font-weight: bold;">Deduct Stock 3 (Finished Goods)</span> &rarr; <span style="color: #9333ea; font-weight: bold;">Add to Stock 2 (Disassembly Stock)</span></p>
        <p><strong>Effective Date:</strong> ${disassemblyDate}</p>
        ${insufficientRows.length > 0 ? `
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 8px 10px; border-radius: 8px; margin-top: 10px;">
            <p style="color: #dc2626; font-weight: bold; font-size: 11px;">⚠️ Warning: ${insufficientRows.length} item(s) exceed current Stock 3 quantity.</p>
          </div>
        ` : ""}
      </div>
      <p style="font-size: 12px; color: #475569; margin-top: 12px; text-align: left;">
        Clicking confirm will atomically transfer ${totalStagedQty.toLocaleString()} PCS from Finished Goods (S3) into Production Disassembly Stock (S2 Disassembly).
      </p>
    `;

    const result = await Swal.fire({
      title: "Validate Desassemblage (S3 → S2)",
      html: confirmHtml,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Confirm (S3 → S2 Disassembly)",
      confirmButtonColor: "#9333ea",
      cancelButtonText: "Cancel"
    });

    if (!result.isConfirmed) return;

    setIsValidating(true);
    try {
      const payload = stagedRows.map((r) => ({
        date: disassemblyDate,
        reference: r.reference,
        quantity: r.quantity,
        description: r.description,
        notes: disassemblyNote ? `Disassembly: ${disassemblyNote}` : "Disassembly S3 -> S2"
      }));

      await onValidateDisassembly(payload);

      await Swal.fire({
        icon: "success",
        title: "Desassemblage Completed!",
        html: `
          <div style="font-family: monospace; font-size: 13px; text-align: left; padding: 12px; background: #faf5ff; border-radius: 8px; border: 1px solid #e9d5ff; line-height: 1.6;">
            <p><strong>Processed References:</strong> ${stagedRows.length} items</p>
            <p><strong>Deducted from Stock 3:</strong> <span style="color: #dc2626; font-weight: bold;">-${totalStagedQty.toLocaleString()} PCS</span></p>
            <p><strong>Added to Stock 2 Disassembly:</strong> <span style="color: #9333ea; font-weight: bold;">+${totalStagedQty.toLocaleString()} PCS</span></p>
            <p><strong>Status:</strong> Committed to Inventory & Recorded in History</p>
          </div>
        `,
        confirmButtonColor: "#9333ea"
      });

      setStagedRows([]);
      setSourceName("");
      setDisassemblyNote("");
    } catch (err: any) {
      console.error("Disassembly validation failed:", err);
      Swal.fire({
        icon: "error",
        title: "Validation Failed",
        text: err?.message || "Failed to commit disassembly transfer."
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Group historical disassembly records into batches
  const batches = useMemo(() => {
    const map = new Map<string, DisassemblyBatch>();

    disassemblies.forEach((rec) => {
      const batchKey = rec.batchId || `${rec.date}_${rec.operatorName || "system"}`;
      if (!map.has(batchKey)) {
        map.set(batchKey, {
          id: batchKey,
          date: rec.date,
          recordedTime: rec.timestamp ? formatSystemTime(rec.timestamp) : "—",
          timestamp: rec.timestamp,
          records: [],
          totalQty: 0,
          uniqueReferencesCount: 0
        });
      }

      const b = map.get(batchKey)!;
      b.records.push(rec);
      b.totalQty += rec.quantity || 0;
    });

    const list = Array.from(map.values());
    list.forEach((b) => {
      const unique = new Set(b.records.map((r) => r.reference.toUpperCase().trim()));
      b.uniqueReferencesCount = unique.size;
    });

    list.sort((a, b) => parseTimestampMs(b.timestamp) - parseTimestampMs(a.timestamp));
    return list;
  }, [disassemblies]);

  // Filtered Batches for History
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (historyDateFilter !== "all" && b.date !== historyDateFilter) return false;
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase().trim();
      return (
        b.id.toLowerCase().includes(q) ||
        b.date.includes(q) ||
        b.records.some((r) => r.reference.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)))
      );
    });
  }, [batches, historySearch, historyDateFilter]);

  // Revert Batch
  const handleRevertBatch = async (batch: DisassemblyBatch) => {
    if (!onDeleteBatch) return;

    const res = await Swal.fire({
      title: "Revert Disassembly Batch?",
      html: `
        <div style="font-family: monospace; font-size: 13px; text-align: left; background: #fff1f2; padding: 12px; border-radius: 8px; border: 1px solid #fecdd3;">
          <p><strong>Batch:</strong> ${batch.id}</p>
          <p><strong>Date:</strong> ${batch.date}</p>
          <p><strong>Total Quantity:</strong> ${batch.totalQty.toLocaleString()} PCS across ${batch.uniqueReferencesCount} references</p>
          <p style="color: #e11d48; margin-top: 8px;">⚠️ This will restore ${batch.totalQty} PCS back to Stock 3 and deduct them from Stock 2 Disassembly.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Revert Batch",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel"
    });

    if (res.isConfirmed) {
      try {
        await onDeleteBatch(batch.records, `Reverted by operator ${currentUser.fullName}`);
        Swal.fire({
          icon: "success",
          title: "Batch Reverted",
          text: `Successfully reverted ${batch.totalQty} PCS back to Stock 3.`,
          timer: 2000,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({ icon: "error", title: "Revert Failed", text: err.message || "Failed to revert batch." });
      }
    }
  };

  // Export History to Excel
  const handleExportHistory = () => {
    const rows = disassemblies.map((d) => ({
      Date: d.date,
      Reference: d.reference,
      Description: d.description || "",
      Quantity: d.quantity,
      Operator: d.operatorName,
      Timestamp: d.timestamp ? formatSystemTime(d.timestamp) : "",
      Notes: d.notes || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Desassemblage_History");
    XLSX.writeFile(workbook, `Desassemblage_Report_${getMoroccoTodayDateString()}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" id="desassemblage-workspace-container">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0 shadow-xs">
              <Hammer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-sans">
                  Désassemblage (S3 → S2)
                </h2>
                <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-800 text-[10px] font-mono font-bold uppercase">
                  Disassembly Stock
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Pill Switcher */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-mono font-bold">
            <button
              onClick={() => setActiveTab("intake")}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "intake"
                  ? "bg-white text-purple-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
              <span>File Import & Intake</span>
              {stagedRows.length > 0 && (
                <span className="px-1.5 py-0.2 bg-purple-600 text-white rounded-full text-[10px]">
                  {stagedRows.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "history"
                  ? "bg-white text-purple-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <History className="w-3.5 h-3.5 text-purple-600" />
              <span>Disassembly History</span>
              <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px]">
                {disassemblies.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: INTAKE & FILE IMPORT                                */}
      {/* ========================================================= */}
      {activeTab === "intake" && (
        <div className="space-y-6">

          {/* Upload & Staging Controls Card */}
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl p-6">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-mono font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-md shadow-purple-600/20 flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isParsing ? "Reading File..." : "Import Excel / CSV"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPasteModalOpen(true)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-2xl transition-all cursor-pointer border border-slate-200 flex items-center gap-2"
                >
                  <ClipboardPaste className="w-4 h-4 text-slate-600" />
                  <span>Paste Sheet Data</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualModalOpen(true)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-2xl transition-all cursor-pointer border border-slate-200 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-slate-600" />
                  <span>+ Add Reference</span>
                </button>
              </div>

              {/* Date & Batch Notes */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 text-xs font-mono">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500 font-bold">Date:</span>
                  <input
                    type="date"
                    value={disassemblyDate}
                    onChange={(e) => setDisassemblyDate(e.target.value)}
                    className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer"
                  />
                </div>

                {stagedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStagedRows([]);
                      setSourceName("");
                    }}
                    className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-2xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title="Reset staged list"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Staged</span>
                  </button>
                )}
              </div>
            </div>

            {/* Drag & Drop Area when list is empty */}
            {stagedRows.length === 0 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileUpload(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  isDragOver
                    ? "border-purple-500 bg-purple-50/50"
                    : "border-slate-200 hover:border-purple-400 hover:bg-slate-50/60"
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-600 shadow-2xs mt-2">
                  <span>Browse files or click to upload</span>
                </div>
              </div>
            ) : (
              /* Staged Preview Table */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-50/60 border border-purple-200/80 rounded-2xl p-4 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse"></span>
                    <span className="font-bold text-purple-950">Source: {sourceName || "Staged Items"}</span>
                    <span className="text-purple-600 font-normal">({stagedRows.length} references)</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-700">
                    <div>
                      Total to Disassemble: <strong className="text-purple-900 text-sm font-black">{totalStagedQty.toLocaleString()} PCS</strong>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px] uppercase font-mono font-bold tracking-wider">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Reference Code</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4 text-right">Available S3</th>
                        <th className="py-3 px-4 text-center">Disassembly Qty (S3 → S2)</th>
                        <th className="py-3 px-4 text-right">Remaining S3</th>
                        <th className="py-3 px-4 text-right">Target S2 Disassembly</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-mono">
                      {stagedRows.map((r, idx) => {
                        const s3 = r.matchedReference?.stock3 ?? 0;
                        const curS2Dis = r.matchedReference?.stock2Disassembly ?? 0;
                        const isInsufficient = r.quantity > s3;
                        const remainingS3 = s3 - r.quantity;
                        const targetS2Dis = curS2Dis + r.quantity;

                        return (
                          <tr key={r.id} className={`hover:bg-slate-50/80 transition-colors ${isInsufficient ? "bg-amber-50/40" : ""}`}>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">{idx + 1}</td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span>{r.reference}</span>
                                {!r.matchedReference && (
                                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 text-[9px] font-bold rounded">
                                    NEW
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-sans text-slate-600 truncate max-w-xs">
                              {r.description || r.matchedReference?.description || "—"}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-700">
                              {s3.toLocaleString()} PCS
                            </td>
                            <td className="py-2 px-4 text-center">
                              <input
                                type="number"
                                min="0"
                                value={r.quantity}
                                onChange={(e) => handleUpdateRowQty(r.id, e.target.value)}
                                className={`w-24 text-center py-1.5 px-2 bg-white border rounded-xl font-mono font-black text-xs focus:outline-none ${
                                  isInsufficient
                                    ? "border-rose-400 text-rose-700 ring-2 ring-rose-500/20"
                                    : "border-purple-300 text-purple-900 focus:border-purple-500"
                                }`}
                              />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className={`font-bold ${remainingS3 < 0 ? "text-rose-600" : "text-slate-800"}`}>
                                {remainingS3.toLocaleString()} PCS
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-purple-700">
                              +{r.quantity} → <strong className="text-purple-950 font-black">{targetS2Dis.toLocaleString()} PCS</strong>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(r.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Confirm Action Bar */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs font-mono text-slate-500">
                    <span>{stagedRows.length} items ready to commit</span>
                    {insufficientRows.length > 0 && (
                      <span className="ml-2 text-amber-700 font-bold">
                        (⚠️ {insufficientRows.length} exceed current Finished Goods Stock 3)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleExecuteValidation}
                      disabled={isValidating || stagedRows.length === 0}
                      className="w-full sm:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-mono font-bold text-xs rounded-2xl shadow-lg shadow-purple-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Hammer className="w-4 h-4" />
                      <span>{isValidating ? "Validating & Moving Stock..." : `Validate Desassemblage (${totalStagedQty.toLocaleString()} PCS)`}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: DISASSEMBLY HISTORY                                 */}
      {/* ========================================================= */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <History className="w-5 h-5 text-purple-600" />
                  <span>Désassemblage History Log</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Audit trail of all previous S3 → S2 Disassembly operations.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search reference or batch..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full sm:w-56 pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleExportHistory}
                  disabled={disassemblies.length === 0}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-2xl transition-all cursor-pointer border border-slate-200 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            {/* Batches Accordion Table */}
            <div className="space-y-3">
              {filteredBatches.map((batch) => {
                const isExpanded = !!expandedBatches[batch.id];

                return (
                  <div key={batch.id} className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div
                      onClick={() =>
                        setExpandedBatches((prev) => ({
                          ...prev,
                          [batch.id]: !prev[batch.id]
                        }))
                      }
                      className="p-4 bg-slate-50/80 hover:bg-slate-100/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                          <Hammer className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-slate-900 text-sm">
                              {batch.date}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/80 font-mono text-[10px] font-bold">
                              {batch.totalQty.toLocaleString()} PCS
                            </span>
                            <span className="text-slate-400 font-mono text-xs">
                              ({batch.uniqueReferencesCount} references)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Recorded: {batch.recordedTime} • Batch ID: {batch.id}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {(currentUser.role === "admin" || currentUser.role === "supervisor") && onDeleteBatch && (
                          <button
                            type="button"
                            onClick={() => handleRevertBatch(batch)}
                            className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200/80 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                            title="Revert entire batch"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Revert Batch</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBatches((prev) => ({
                              ...prev,
                              [batch.id]: !prev[batch.id]
                            }))
                          }
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Record List */}
                    {isExpanded && (
                      <div className="p-4 bg-white border-t border-slate-200/80 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="text-[10px] uppercase font-mono font-bold text-slate-400 border-b border-slate-100">
                              <th className="pb-2 px-3">Reference Code</th>
                              <th className="pb-2 px-3">Description</th>
                              <th className="pb-2 px-3 text-right">Disassembled Qty</th>
                              <th className="pb-2 px-3">Operator</th>
                              <th className="pb-2 px-3">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs font-mono">
                            {batch.records.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-3 font-bold text-slate-900">{r.reference}</td>
                                <td className="py-2.5 px-3 font-sans text-slate-600 truncate max-w-xs">
                                  {r.description || "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-purple-700">
                                  +{r.quantity.toLocaleString()} PCS
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">{r.operatorName}</td>
                                <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                                  {r.timestamp ? formatSystemTime(r.timestamp) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredBatches.length === 0 && (
                <div className="py-12 text-center text-slate-400 font-mono text-xs">
                  No disassembly operations recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paste Clipboard Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl shadow-2xl max-w-lg w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-900">
                Paste Desassemblage Sheet Data
              </h3>
              <button
                onClick={() => setPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 font-mono mb-3">
              Paste rows directly from Excel or Google Sheets (Ref, Description, Quantity):
            </p>
            <textarea
              rows={8}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="34316011B	VOLANT CUIR	50&#10;34340679A	BEZEL NOIR	120"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs focus:outline-none focus:border-purple-500 text-slate-800"
            />
            <div className="pt-4 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 font-bold font-mono text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessPastedText}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-bold font-mono text-xs shadow-md shadow-purple-600/20"
              >
                Parse & Stage Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Item Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-900">
                Add Disassembly Reference
              </h3>
              <button
                onClick={() => setManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Reference Code <span className="text-rose-500">*</span>
                </label>
                <CustomReferenceSelect
                  references={references}
                  value={manualRef}
                  onChange={(code) => setManualRef(code)}
                  placeholder="Select reference..."
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Quantity to Disassemble (PCS) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 50"
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div className="pt-4 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 font-bold font-mono text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddManualRow}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-bold font-mono text-xs shadow-md shadow-purple-600/20"
              >
                Add to List
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
