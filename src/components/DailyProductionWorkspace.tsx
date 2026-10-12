import React, { useState, useRef, useMemo } from "react";
import { Reference, User, Production } from "../types";
import { parseDeliveryPDF } from "../services/deliveryPdfParser";
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  Copy, 
  Check, 
  FileText, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  ClipboardPaste, 
  X, 
  Save, 
  Calendar, 
  ChevronDown, 
  ChevronRight,
  Sparkles
} from "lucide-react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { 
  getMoroccoTodayDateString, 
  getMoroccoYesterdayDateString, 
  formatSystemTime, 
  parseTimestampMs 
} from "../utils/timeUtils";

export interface DailyProductionRow {
  id: string;
  refMaille: string;
  libelle: string;
  qtyConsommes: number;
  matchedReference?: {
    code: string;
    description: string;
    customer?: string;
    stock2: number;
    stock3: number;
  } | null;
  isValid: boolean;
  validationError?: string;
}

export interface DailyProductionBatch {
  id: string;
  date: string;
  timestamp: string;
  displayTime: string;
  sourceOrigin: string;
  itemsCount: number;
  totalQuantity: number;
  records: Production[];
}

export interface DailyProductionWorkspaceProps {
  references: Reference[];
  currentUser: User;
  productions?: Production[];
  onNavigateToProduction?: () => void;
  onSubmitProduction?: (productionEntries: { date: string; reference: string; quantity: number; notes?: string }[]) => Promise<void>;
  onValidateToStock3: (
    entries: { date: string; reference: string; quantity: number; description?: string; notes?: string }[],
    mode?: "DIRECT_STOCK_3" | "TRANSFER_S2_TO_S3"
  ) => Promise<void>;
  onDeleteProduction?: (id: string, reason?: string) => Promise<void>;
  onUpdateProduction?: (id: string, updatedData: any, reason?: string) => Promise<void>;
  onDeleteBatch?: (batchRecords: Production[], reason?: string) => Promise<void>;
}

export default function DailyProductionWorkspace({
  references = [],
  currentUser,
  productions = [],
  onValidateToStock3,
  onDeleteProduction,
  onUpdateProduction,
  onDeleteBatch
}: DailyProductionWorkspaceProps) {
  // Date selection state
  const todayStr = getMoroccoTodayDateString();
  const yesterdayStr = getMoroccoYesterdayDateString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Staged data
  const [stagedRows, setStagedRows] = useState<DailyProductionRow[]>([]);
  const [sourceName, setSourceName] = useState<string>("");
  const [filterText, setFilterText] = useState<string>("");
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Modals & Panels
  const [isPasteModalOpen, setIsPasteModalOpen] = useState<boolean>(false);
  const [pastedContent, setPastedContent] = useState<string>("");
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState<boolean>(false);
  const [newRowRef, setNewRowRef] = useState<string>("");
  const [newRowLibelle, setNewRowLibelle] = useState<string>("");
  const [newRowQty, setNewRowQty] = useState<string>("");
  const [editingRow, setEditingRow] = useState<DailyProductionRow | null>(null);

  // History expansion toggles
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({ [todayStr]: true });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build reference lookup map
  const refCatalogMap = useMemo(() => {
    const map = new Map<string, Reference>();
    references.forEach((r) => {
      if (r.code) map.set(r.code.toUpperCase().trim(), r);
      if (r.id) map.set(r.id.toUpperCase().trim(), r);
    });
    return map;
  }, [references]);

  // Enrich raw rows with catalog verification
  const enrichRows = (
    raw: { refMaille: string; libelle: string; qtyConsommes: number }[]
  ): DailyProductionRow[] => {
    return raw.map((item, idx) => {
      const cleanRef = (item.refMaille || "").toUpperCase().trim();
      const matched = refCatalogMap.get(cleanRef);
      const isValid = cleanRef.length > 0 && item.qtyConsommes > 0;
      let error = "";
      if (!cleanRef) error = "Missing reference code";
      else if (item.qtyConsommes <= 0) error = "Quantity must be > 0";

      return {
        id: `row-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        refMaille: cleanRef,
        libelle: item.libelle || (matched?.description ?? ""),
        qtyConsommes: item.qtyConsommes,
        matchedReference: matched
          ? {
              code: matched.code,
              description: matched.description,
              customer: matched.customer,
              stock2: matched.stock2 || 0,
              stock3: matched.stock3 || 0
            }
          : null,
        isValid,
        validationError: error
      };
    });
  };

  // Parse 2D cell grid from Excel / CSV
  const parseGridData = (data: any[][]): { refMaille: string; libelle: string; qtyConsommes: number }[] => {
    if (!data || data.length === 0) return [];

    let headerIdx = 0;
    while (
      headerIdx < data.length &&
      (!data[headerIdx] || data[headerIdx].every((cell) => cell === undefined || cell === null || String(cell).trim() === ""))
    ) {
      headerIdx++;
    }

    if (headerIdx >= data.length) return [];

    const headers = data[headerIdx].map((h) => String(h || "").trim().toLowerCase());
    let refIdx = headers.findIndex((h) => h.includes("ref") || h.includes("code") || h.includes("maille") || h === "item");
    let libIdx = headers.findIndex((h) => h.includes("libelle") || h.includes("desc") || h.includes("designation"));
    let qtyIdx = headers.findIndex((h) => h.includes("qty") || h.includes("quantite") || h.includes("consomme") || h.includes("total") || h === "qte");

    if (refIdx === -1) refIdx = 0;
    if (libIdx === -1) libIdx = 1;
    if (qtyIdx === -1) qtyIdx = 2;

    const parsed: { refMaille: string; libelle: string; qtyConsommes: number }[] = [];

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.every((c) => c === undefined || c === null || String(c).trim() === "")) continue;

      const ref = String(row[refIdx] || "").trim().toUpperCase();
      const lib = String(row[libIdx] || "").trim();
      const rawQty = row[qtyIdx];
      const qtyNum = typeof rawQty === "number" ? rawQty : parseInt(String(rawQty || "0").replace(/[^0-9]/g, ""), 10) || 0;

      if (ref && qtyNum > 0) {
        parsed.push({ refMaille: ref, libelle: lib, qtyConsommes: qtyNum });
      }
    }

    return parsed;
  };

  // Handle file upload (XLSX, CSV, PDF)
  const handleFileUpload = async (file: File) => {
    setIsProcessingFile(true);
    try {
      const fileNameLower = file.name.toLowerCase();

      // 1. PDF File handling
      if (fileNameLower.endsWith(".pdf")) {
        const pdfResult = await parseDeliveryPDF(file, references);
        if (!pdfResult.items || pdfResult.items.length === 0) {
          throw new Error("No valid delivery line items found in PDF.");
        }
        const extracted = pdfResult.items.map((it) => ({
          refMaille: it.associatedMeshRef || it.invoiceRef,
          libelle: it.description || "",
          qtyConsommes: it.quantity
        }));
        const enriched = enrichRows(extracted);
        setStagedRows(enriched);
        setSourceName(file.name);
        Swal.fire({
          icon: "success",
          title: "PDF Parsed",
          text: `Extracted ${enriched.length} items from ${file.name}.`,
          timer: 2000,
          showConfirmButton: false
        });
        return;
      }

      // 2. Excel / CSV File handling
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const parsed = parseGridData(data);
      if (parsed.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Rows Found",
          text: "The uploaded spreadsheet does not contain recognizable Reference and Quantity columns."
        });
        return;
      }

      const enriched = enrichRows(parsed);
      setStagedRows(enriched);
      setSourceName(file.name);

      Swal.fire({
        icon: "success",
        title: "Spreadsheet Loaded",
        text: `Loaded ${enriched.length} reference rows from ${file.name}.`,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "File Import Error",
        text: err?.message || "Failed to process the uploaded file."
      });
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle clipboard text pasting (tab-delimited or comma-separated)
  const handleProcessPastedText = () => {
    if (!pastedContent.trim()) return;

    try {
      const lines = pastedContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const grid: any[][] = lines.map((line) => {
        if (line.includes("\t")) return line.split("\t");
        if (line.includes(";")) return line.split(";");
        return line.split(",");
      });

      const parsed = parseGridData(grid);
      if (parsed.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "Empty or Unmatched Rows",
          text: "Could not detect valid Reference and Quantity rows from the pasted text."
        });
        return;
      }

      const enriched = enrichRows(parsed);
      setStagedRows(enriched);
      setSourceName("Pasted Clipboard Data");
      setIsPasteModalOpen(false);
      setPastedContent("");

      Swal.fire({
        icon: "success",
        title: "Pasted Data Loaded",
        text: `Loaded ${enriched.length} references from clipboard.`,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Paste Processing Error",
        text: err?.message || "Failed to process pasted content."
      });
    }
  };

  // Add manual single row
  const handleAddManualRow = () => {
    const cleanRef = newRowRef.trim().toUpperCase();
    const qty = parseInt(newRowQty.trim(), 10);

    if (!cleanRef) {
      Swal.fire({ icon: "error", title: "Missing Reference", text: "Please enter a valid reference code." });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      Swal.fire({ icon: "error", title: "Invalid Quantity", text: "Please enter a positive quantity." });
      return;
    }

    const newRows = enrichRows([{ refMaille: cleanRef, libelle: newRowLibelle.trim(), qtyConsommes: qty }]);
    setStagedRows((prev) => [...prev, ...newRows]);
    if (!sourceName) setSourceName("Manual Entry");

    setNewRowRef("");
    setNewRowLibelle("");
    setNewRowQty("");
    setIsAddRowModalOpen(false);
  };

  // Delete a staged row
  const handleDeleteRow = (id: string) => {
    setStagedRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Save edited row
  const handleSaveEditRow = () => {
    if (!editingRow) return;
    const cleanRef = editingRow.refMaille.trim().toUpperCase();
    const qty = editingRow.qtyConsommes;

    if (!cleanRef || qty <= 0) {
      Swal.fire({ icon: "error", title: "Validation Error", text: "Reference code and positive quantity are required." });
      return;
    }

    const updated = enrichRows([{ refMaille: cleanRef, libelle: editingRow.libelle, qtyConsommes: qty }])[0];
    setStagedRows((prev) => prev.map((r) => (r.id === editingRow.id ? { ...updated, id: editingRow.id } : r)));
    setEditingRow(null);
  };

  // Validate & Transfer (S2 -> S3)
  const handleValidateTransfer = async () => {
    if (stagedRows.length === 0) return;

    const totalQty = stagedRows.reduce((sum, r) => sum + r.qtyConsommes, 0);

    const result = await Swal.fire({
      title: "Commit Daily Production?",
      html: `
        <div class="text-left text-xs text-slate-700 space-y-2 font-mono">
          <p><strong>Date:</strong> ${selectedDate}</p>
          <p><strong>References:</strong> ${stagedRows.length} items</p>
          <p><strong>Total Quantity:</strong> <span style="color: #059669; font-weight: bold;">+${totalQty.toLocaleString()} PCS</span></p>
          <div style="background-color: #f1f5f9; padding: 8px; border-radius: 8px; margin-top: 10px;">
            <p style="color: #1e293b;">• Deducts from <strong>Stock 2 (Production WIP)</strong></p>
            <p style="color: #059669;">• Adds to <strong>Stock 3 (Finished Goods)</strong></p>
          </div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Validate & Commit Transfer",
      confirmButtonColor: "#059669",
      cancelButtonText: "Cancel"
    });

    if (!result.isConfirmed) return;

    setIsValidating(true);
    try {
      const payload = stagedRows.map((r) => ({
        date: selectedDate,
        reference: r.refMaille,
        quantity: r.qtyConsommes,
        description: r.libelle || `Daily Production ${r.refMaille}`,
        notes: `Validated from ${sourceName || "Daily Production Intake"}`
      }));

      await onValidateToStock3(payload, "TRANSFER_S2_TO_S3");

      Swal.fire({
        icon: "success",
        title: "Production Validated",
        text: `Successfully transferred ${totalQty.toLocaleString()} PCS into Stock 3.`,
        timer: 2500,
        showConfirmButton: false
      });

      // Clear staged rows on success
      setStagedRows([]);
      setSourceName("");
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Validation Failed",
        text: err?.message || "Failed to commit daily production transfer."
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Export Staged Data to Excel
  const handleExportXLSX = () => {
    if (stagedRows.length === 0) return;

    const exportData = stagedRows.map((r, idx) => ({
      "#": idx + 1,
      "Ref Maille": r.refMaille,
      "Libellé": r.libelle,
      "Qty Consommés": r.qtyConsommes,
      "Catalog Status": r.matchedReference ? "Verified in Catalog" : "Uncataloged",
      "Stock 2": r.matchedReference?.stock2 ?? "-",
      "Stock 3": r.matchedReference?.stock3 ?? "-"
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Production");
    XLSX.writeFile(wb, `Daily_Production_${selectedDate}.xlsx`);
  };

  // Copy CSV to clipboard
  const handleCopyCSV = () => {
    if (stagedRows.length === 0) return;
    const header = "Ref Maille,Libellé,Qty consommés";
    const body = stagedRows.map((r) => `"${r.refMaille}","${r.libelle}",${r.qtyConsommes}`).join("\n");
    navigator.clipboard.writeText(`${header}\n${body}`);
    Swal.fire({ icon: "success", title: "Copied CSV", timer: 1200, showConfirmButton: false });
  };

  // Copy JSON to clipboard
  const handleCopyJSON = () => {
    if (stagedRows.length === 0) return;
    const jsonStr = JSON.stringify(
      stagedRows.map((r) => ({
        refMaille: r.refMaille,
        libelle: r.libelle,
        qtyConsommes: r.qtyConsommes
      })),
      null,
      2
    );
    navigator.clipboard.writeText(jsonStr);
    Swal.fire({ icon: "success", title: "Copied JSON", timer: 1200, showConfirmButton: false });
  };

  // Filter staged rows
  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return stagedRows;
    const query = filterText.toLowerCase().trim();
    return stagedRows.filter(
      (r) => r.refMaille.toLowerCase().includes(query) || r.libelle.toLowerCase().includes(query)
    );
  }, [stagedRows, filterText]);

  // Metrics
  const totalStagedQty = useMemo(() => stagedRows.reduce((sum, r) => sum + r.qtyConsommes, 0), [stagedRows]);
  const catalogVerifiedCount = useMemo(() => stagedRows.filter((r) => Boolean(r.matchedReference)).length, [stagedRows]);

  // Group historical productions by date & batch
  const groupedHistory = useMemo(() => {
    const groupsByDate = new Map<string, Production[]>();

    productions.forEach((p) => {
      const d = p.date || "No Date";
      if (!groupsByDate.has(d)) groupsByDate.set(d, []);
      groupsByDate.get(d)!.push(p);
    });

    const dates = Array.from(groupsByDate.keys()).sort((a, b) => b.localeCompare(a));

    return dates.map((d) => {
      const recs = groupsByDate.get(d)!;
      const batchesMap = new Map<string, Production[]>();

      recs.forEach((p, idx) => {
        const bId = p.batchId || `auto-batch-${p.date}-${Math.floor(parseTimestampMs(p.timestamp) / 120000) || idx}`;
        if (!batchesMap.has(bId)) batchesMap.set(bId, []);
        batchesMap.get(bId)!.push(p);
      });

      const batches: DailyProductionBatch[] = Array.from(batchesMap.entries()).map(([batchId, bRecs]) => {
        const first = bRecs[0];
        const bTotal = bRecs.reduce((sum, r) => sum + r.quantity, 0);
        return {
          id: batchId,
          date: d,
          timestamp: first?.timestamp || "",
          displayTime: formatSystemTime(first?.timestamp),
          sourceOrigin: first?.notes || "Daily Production Intake",
          itemsCount: bRecs.length,
          totalQuantity: bTotal,
          records: bRecs
        };
      });

      const dayTotal = recs.reduce((sum, r) => sum + r.quantity, 0);

      return {
        date: d,
        totalQuantity: dayTotal,
        totalItems: recs.length,
        batches
      };
    });
  }, [productions]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-[#132247] rounded-3xl p-6 shadow-xl shadow-slate-950/20 text-white flex items-center justify-between border border-blue-900/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 shadow-inner">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Daily Production
            </h2>
            <p className="text-xs text-blue-200/70 font-mono mt-0.5">
              Sheets Intake & Stock 3 Validation Pipeline
            </p>
          </div>
        </div>
      </div>

      {/* 2. TOP ACTION ROW (3 COLUMNS) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* CARD 1: PRODUCTION DATE */}
        <div className="md:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Production Date
              </span>
            </div>
            <div className="text-sm font-extrabold text-slate-800 font-mono">
              {selectedDate === todayStr ? `Today (${todayStr})` : selectedDate === yesterdayStr ? `Yesterday (${yesterdayStr})` : selectedDate}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                selectedDate === todayStr
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                selectedDate === yesterdayStr
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Yesterday
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* CARD 2: DRAG & DROP UPLOAD */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          className="md:col-span-4 bg-white border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center text-center group transition-all"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Upload className="w-5 h-5" />
          </div>

          <h4 className="text-xs font-extrabold text-slate-800">
            Drop Google Sheets, Excel or PDF Invoice
          </h4>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 mb-3">
            CSV, XLSX, TSV, PDF
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isProcessingFile}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isProcessingFile ? "Reading..." : "Browse"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPasteModalOpen(true)}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>
          </div>
        </div>

        {/* CARD 3: CURRENT DATASET METRICS & ACTION */}
        <div className="md:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold font-mono uppercase">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Current Dataset</span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                stagedRows.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
              }`}>
                {stagedRows.length > 0 ? "STAGED" : "ACTIVE"}
              </span>
            </div>

            <div className="space-y-1 text-xs font-mono text-slate-500">
              <p>
                Production Date: <strong className="text-slate-800">{selectedDate}</strong>
              </p>
              <p className="truncate">
                Source: <strong className="text-slate-700">{sourceName || "No files loaded (Point Zero — Ready for Intake)"}</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Total Items</span>
                <span className="text-lg font-black font-mono text-slate-800">{stagedRows.length}</span>
              </div>
              <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-mono text-blue-600 font-bold block">Consumed PCS</span>
                <span className="text-lg font-black font-mono text-emerald-600">+{totalStagedQty.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center justify-between">
              <span>Catalog Verified:</span>
              <strong className="text-slate-700">{catalogVerifiedCount} of {stagedRows.length}</strong>
            </div>
          </div>

          <button
            type="button"
            disabled={stagedRows.length === 0 || isValidating}
            onClick={handleValidateTransfer}
            className="w-full mt-4 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isValidating ? "Validating & Deducting..." : "Validate & Transfer (S2 → S3)"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. CONVERTED DAILY DATA TABLE */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        {/* Table toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 font-mono tracking-tight flex items-center gap-2">
                CONVERTED DAILY DATA ({stagedRows.length} REFERENCES)
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  {selectedDate === todayStr ? "TODAY" : selectedDate}
                </span>
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by ref or libellé..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
              />
            </div>

            <button
              onClick={() => setIsAddRowModalOpen(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>

            <button
              onClick={handleCopyCSV}
              disabled={stagedRows.length === 0}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy CSV</span>
            </button>

            <button
              onClick={handleCopyJSON}
              disabled={stagedRows.length === 0}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy JSON</span>
            </button>

            <button
              onClick={handleExportXLSX}
              disabled={stagedRows.length === 0}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .XLSX</span>
            </button>
          </div>
        </div>

        {/* Table content */}
        {filteredRows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center">
            <FileText className="w-8 h-8 text-slate-300 stroke-[1.5]" />
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-2xl">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-200/80">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-4">Ref Maille</th>
                  <th className="py-3 px-4">Libellé</th>
                  <th className="py-3 px-4 text-right">Qty Consommés</th>
                  <th className="py-3 px-4 text-center">Catalog Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                    <td className="py-3 px-4 font-black text-slate-900">{row.refMaille}</td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{row.libelle || "-"}</td>
                    <td className="py-3 px-4 text-right font-black text-emerald-600">
                      +{row.qtyConsommes.toLocaleString()} PCS
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.matchedReference ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Catalog (S2: {row.matchedReference.stock2} | S3: {row.matchedReference.stock3})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Not in catalog</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingRow({ ...row })}
                          className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
                          title="Edit Row"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          title="Remove Row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. HISTORICAL PRODUCTION BATCHES & AUDIT LOG */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 font-mono tracking-tight">
                PRODUCTION HISTORY & BATCH REVERSALS
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {productions.length} total entries recorded
              </p>
            </div>
          </div>
        </div>

        {groupedHistory.length === 0 ? (
          <div className="py-8 text-center text-slate-400 font-mono text-xs">
            No historical daily production batches recorded yet.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedHistory.map((group) => {
              const isExpanded = Boolean(expandedDates[group.date]);

              return (
                <div key={group.date} className="border border-slate-200 rounded-2xl overflow-hidden">
                  {/* Day header accordion */}
                  <div
                    onClick={() =>
                      setExpandedDates((prev) => ({
                        ...prev,
                        [group.date]: !isExpanded
                      }))
                    }
                    className="bg-slate-50 hover:bg-slate-100/80 px-4 py-3 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                      <span className="font-mono font-black text-slate-900 text-xs">
                        {group.date}
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {group.batches.length} batch{group.batches.length !== 1 ? "es" : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono font-bold">
                      <span className="text-slate-500">{group.totalItems} records</span>
                      <span className="text-emerald-600">+{group.totalQuantity.toLocaleString()} PCS</span>
                    </div>
                  </div>

                  {/* Day body: Batches */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 bg-white">
                      {group.batches.map((batch) => (
                        <div key={batch.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200/60 text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{batch.displayTime || batch.date}</span>
                              <span className="text-[10px] text-slate-400">({batch.sourceOrigin})</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-emerald-600">+{batch.totalQuantity.toLocaleString()} PCS</span>
                              {onDeleteBatch && (
                                <button
                                  onClick={async () => {
                                    const confirm = await Swal.fire({
                                      title: "Revert Batch?",
                                      text: `This will remove ${batch.totalQuantity.toLocaleString()} PCS from Stock 3 and restore Stock 2.`,
                                      icon: "warning",
                                      showCancelButton: true,
                                      confirmButtonText: "Revert Batch",
                                      confirmButtonColor: "#dc2626"
                                    });
                                    if (confirm.isConfirmed) {
                                      await onDeleteBatch(batch.records, "Operator reverted daily production batch");
                                    }
                                  }}
                                  className="text-rose-600 hover:text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-md hover:bg-rose-50 cursor-pointer"
                                >
                                  Revert Batch
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {batch.records.map((rec) => (
                              <div key={rec.id} className="bg-white p-2 rounded-lg border border-slate-100 flex items-center justify-between text-[11px] font-mono">
                                <div>
                                  <span className="font-bold text-slate-800">{rec.reference}</span>
                                  {rec.notes && <span className="text-slate-400 block text-[9px] truncate">{rec.notes}</span>}
                                </div>
                                <span className="font-black text-slate-700">+{rec.quantity.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PASTE DATA MODAL */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-blue-600" />
                <span>Paste Rows from Google Sheets or Excel</span>
              </h3>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-mono">
              Copy cells directly from Google Sheets or Excel (including columns: Ref Maille, Libellé, Qty consommés) and paste here:
            </p>

            <textarea
              rows={8}
              value={pastedContent}
              onChange={(e) => setPastedContent(e.target.value)}
              placeholder="Ref Maille&#9;Libellé&#9;Qty consommés&#10;34316011B&#9;HEATING ELEMENT&#9;55&#10;A026K122B&#9;HEAT MAT&#9;276"
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-2xl font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessPastedText}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-sm cursor-pointer"
              >
                Parse & Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MANUAL ROW MODAL */}
      {isAddRowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Add Reference Row</span>
              </h3>
              <button
                onClick={() => setIsAddRowModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Ref Maille</label>
                <input
                  type="text"
                  placeholder="e.g. 34316011B"
                  value={newRowRef}
                  onChange={(e) => setNewRowRef(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Libellé (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Heating Element"
                  value={newRowLibelle}
                  onChange={(e) => setNewRowLibelle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Qty Consommés</label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  min="1"
                  value={newRowQty}
                  onChange={(e) => setNewRowQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddRowModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddManualRow}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-sm cursor-pointer"
              >
                Add Row
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ROW MODAL */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <span>Edit Reference Row</span>
              </h3>
              <button
                onClick={() => setEditingRow(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Ref Maille</label>
                <input
                  type="text"
                  value={editingRow.refMaille}
                  onChange={(e) => setEditingRow({ ...editingRow, refMaille: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Libellé</label>
                <input
                  type="text"
                  value={editingRow.libelle}
                  onChange={(e) => setEditingRow({ ...editingRow, libelle: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Qty Consommés</label>
                <input
                  type="number"
                  min="1"
                  value={editingRow.qtyConsommes}
                  onChange={(e) => setEditingRow({ ...editingRow, qtyConsommes: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditRow}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
