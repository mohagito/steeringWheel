import React, { useState, useRef, useMemo, useEffect } from "react";
import { Reference, User } from "../types";
import { 
  DailyProductionRow, 
  INITIAL_DEMO_CSV, 
  INITIAL_DEMO_ROWS 
} from "../data/dailyProductionDemoData";
import { 
  parseGoogleSheetsFile, 
  parsePastedSheetText, 
  ParseResult 
} from "../utils/sheetParser";
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
  Database,
  ExternalLink,
  ClipboardPaste,
  X,
  Save,
  HelpCircle,
  Factory
} from "lucide-react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { getMoroccoTodayDateString } from "../utils/timeUtils";

interface DailyProductionDemoProps {
  references: Reference[];
  currentUser: User;
  onNavigateToProduction?: (stagedRows?: { reference: string; quantity: number; notes?: string }[]) => void;
  onSubmitProduction?: (productionEntries: { date: string; reference: string; quantity: number; notes?: string }[]) => Promise<void>;
  onValidateToStock3?: (
    entries: { date: string; reference: string; quantity: number; description?: string; notes?: string }[],
    mode?: "DIRECT_STOCK_3" | "TRANSFER_S2_TO_S3"
  ) => Promise<void>;
}

export default function DailyProductionDemo({
  references = [],
  currentUser,
  onNavigateToProduction,
  onSubmitProduction,
  onValidateToStock3
}: DailyProductionDemoProps) {
  // Catalog map for fast matching
  const refMap = useMemo(() => {
    const map = new Map<string, Reference>();
    references.forEach((r) => {
      if (r.code) map.set(r.code.toUpperCase().trim(), r);
      if (r.id) map.set(r.id.toUpperCase().trim(), r);
    });
    return map;
  }, [references]);

  // Enrich demo rows with live catalog data
  const enrichRows = (rows: DailyProductionRow[]): DailyProductionRow[] => {
    return rows.map((row) => {
      const matched = refMap.get(row.refMaille.toUpperCase().trim());
      return {
        ...row,
        refMaille: row.refMaille.toUpperCase().trim(),
        matchedReference: matched
          ? {
              code: matched.code,
              description: matched.description,
              customer: matched.customer,
              stock2: matched.stock2 || 0,
              stock3: matched.stock3 || 0
            }
          : null,
        libelle: row.libelle || matched?.description || ""
      };
    });
  };

  // State: Loaded rows
  const [rows, setRows] = useState<DailyProductionRow[]>(() => enrichRows(INITIAL_DEMO_ROWS));
  const [currentSource, setCurrentSource] = useState<string>("Preloaded Daily Production Intake");
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [productionDate, setProductionDate] = useState<string>(getMoroccoTodayDateString());
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  // Re-match catalog when references change
  useEffect(() => {
    setRows((prev) => enrichRows(prev));
  }, [references, refMap]);

  // Inline row edit state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRef, setEditRef] = useState("");
  const [editLibelle, setEditLibelle] = useState("");
  const [editQty, setEditQty] = useState("");

  // Paste modal state
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState("");

  // Add new row state
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRef, setNewRef] = useState("");
  const [newLibelle, setNewLibelle] = useState("");
  const [newQty, setNewQty] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Statistics calculation
  const stats = useMemo(() => {
    const totalItems = rows.length;
    const totalPcs = rows.reduce((sum, r) => sum + (r.qtyConsommes || 0), 0);
    const matchedCount = rows.filter((r) => r.matchedReference !== null && r.matchedReference !== undefined).length;
    const unmatchedCount = totalItems - matchedCount;
    return { totalItems, totalPcs, matchedCount, unmatchedCount };
  }, [rows]);

  // Filtered rows for search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.refMaille.toLowerCase().includes(q) ||
        r.libelle.toLowerCase().includes(q) ||
        r.matchedReference?.customer?.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  // Handle Drag Events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processUploadedFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processUploadedFile(file);
      // Reset input value so the same file can be uploaded again if needed
      e.target.value = "";
    }
  };

  const processUploadedFile = async (file: File) => {
    setIsParsing(true);
    try {
      const result: ParseResult = await parseGoogleSheetsFile(file, references);
      if (result.rows.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Data Found",
          text: result.warnings[0] || "Could not detect any rows with references and quantities in the uploaded file."
        });
        return;
      }

      setRows(result.rows);
      setCurrentSource(`File: ${file.name} (${result.rows.length} rows parsed)`);

      Swal.fire({
        icon: "success",
        title: "Google Sheets File Loaded!",
        html: `
          <div style="font-family: monospace; font-size: 13px; text-align: left; line-height: 1.6; padding: 10px; background: #f8fafc; border-radius: 6px;">
            <p><strong>File Name:</strong> ${file.name}</p>
            <p><strong>Rows Converted:</strong> <span style="color: #2563eb; font-weight: bold;">${result.rows.length} items</span></p>
            <p><strong>Total Consumed Quantity:</strong> <span style="color: #059669; font-weight: bold;">${result.totalQuantity.toLocaleString()} PCS</span></p>
          </div>
        `,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Parsing Failed",
        text: err.message || "Failed to read the file. Please ensure it is a valid CSV or Excel file exported from Google Sheets."
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Process text pasted directly from Google Sheets
  const handleProcessPastedText = () => {
    if (!pastedText.trim()) return;
    setIsParsing(true);
    try {
      const result = parsePastedSheetText(pastedText, references);
      if (result.rows.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Rows Recognized",
          text: "Please copy cells directly from Google Sheets (including headers: Ref Maille, Libellé, Qty consommés) and paste."
        });
        return;
      }
      setRows(result.rows);
      setCurrentSource(`Pasted Google Sheets (${result.rows.length} rows)`);
      setShowPasteModal(false);
      setPastedText("");
      Swal.fire({
        icon: "success",
        title: "Pasted Data Converted",
        text: `Successfully converted ${result.rows.length} rows (${result.totalQuantity.toLocaleString()} PCS).`,
        timer: 1800,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error Parsing Text",
        text: err?.message || "Could not parse the pasted text."
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Reset to the exact demo data provided by user
  const handleResetToUserDemo = () => {
    setRows(enrichRows(INITIAL_DEMO_ROWS));
    setCurrentSource("Sample Google Sheets Data (Provided)");
    Swal.fire({
      icon: "info",
      title: "Reset to Provided Demo Data",
      text: "The 8 demo items from your request have been reloaded.",
      timer: 1400,
      showConfirmButton: false
    });
  };

  // Download Sample Template CSV
  const handleDownloadSampleCSV = () => {
    const blob = new Blob([INITIAL_DEMO_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "daily_production_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export current converted data to Excel (.xlsx)
  const handleExportXLSX = () => {
    if (rows.length === 0) return;
    const sheetData = rows.map((r) => ({
      "Ref Maille": r.refMaille,
      "Libellé": r.libelle,
      "Qty consommés": r.qtyConsommes,
      "Catalog Status": r.matchedReference ? "MATCHED" : "UNMATCHED",
      "Customer": r.matchedReference?.customer || "—",
      "Stock 2 (WIP)": r.matchedReference?.stock2 ?? "—",
      "Stock 3 (FG)": r.matchedReference?.stock3 ?? "—"
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Production");
    XLSX.writeFile(workbook, `daily_production_converted_${getMoroccoTodayDateString()}.xlsx`);
  };

  // Copy converted data as CSV
  const handleCopyCSV = () => {
    if (rows.length === 0) return;
    const header = "Ref Maille,Libellé,Qty consommés\n";
    const body = rows.map((r) => `"${r.refMaille}","${(r.libelle || "").replace(/"/g, '""')}",${r.qtyConsommes}`).join("\n");
    navigator.clipboard.writeText(header + body);
    setCopiedStatus("csv");
    setTimeout(() => setCopiedStatus(null), 2000);
  };

  // Copy converted data as JSON
  const handleCopyJSON = () => {
    if (rows.length === 0) return;
    const cleanJson = rows.map((r) => ({
      reference: r.refMaille,
      description: r.libelle,
      quantity: r.qtyConsommes
    }));
    navigator.clipboard.writeText(JSON.stringify(cleanJson, null, 2));
    setCopiedStatus("json");
    setTimeout(() => setCopiedStatus(null), 2000);
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Start row edit
  const handleStartEdit = (row: DailyProductionRow) => {
    setEditingRowId(row.id);
    setEditRef(row.refMaille);
    setEditLibelle(row.libelle);
    setEditQty(row.qtyConsommes.toString());
  };

  // Save row edit
  const handleSaveEdit = (id: string) => {
    const q = parseInt(editQty, 10);
    if (isNaN(q) || q <= 0) {
      Swal.fire("Invalid Quantity", "Please enter a valid positive quantity.", "warning");
      return;
    }
    const cleanRef = editRef.trim().toUpperCase();
    const matched = refMap.get(cleanRef);

    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              refMaille: cleanRef,
              libelle: editLibelle.trim() || matched?.description || "",
              qtyConsommes: q,
              matchedReference: matched
                ? {
                    code: matched.code,
                    description: matched.description,
                    customer: matched.customer,
                    stock2: matched.stock2 || 0,
                    stock3: matched.stock3 || 0
                  }
                : null,
              isValid: true,
              validationError: undefined
            }
          : r
      )
    );
    setEditingRowId(null);
  };

  // Add new row
  const handleAddNewRow = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = newRef.trim().toUpperCase();
    const q = parseInt(newQty, 10);
    if (!cleanRef) {
      Swal.fire("Missing Reference", "Please enter a reference code.", "warning");
      return;
    }
    if (isNaN(q) || q <= 0) {
      Swal.fire("Invalid Quantity", "Please enter a positive quantity.", "warning");
      return;
    }

    const matched = refMap.get(cleanRef);
    const newEntry: DailyProductionRow = {
      id: `manual-${Date.now()}`,
      refMaille: cleanRef,
      libelle: newLibelle.trim() || matched?.description || "",
      qtyConsommes: q,
      matchedReference: matched
        ? {
            code: matched.code,
            description: matched.description,
            customer: matched.customer,
            stock2: matched.stock2 || 0,
            stock3: matched.stock3 || 0
          }
        : null,
      isValid: true
    };

    setRows((prev) => [newEntry, ...prev]);
    setNewRef("");
    setNewLibelle("");
    setNewQty("");
    setShowAddRow(false);
  };

  // Action: Validate records and add directly to Stock 3 Finished Goods
  const handleValidateToStock3 = async () => {
    if (rows.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Records to Validate",
        text: "Please import or add at least one reference record before validating."
      });
      return;
    }

    // 1. Validation check
    const invalidRows: { index: number; ref: string; reason: string }[] = [];
    rows.forEach((r, idx) => {
      const cleanRef = r.refMaille.trim().toUpperCase();
      if (!cleanRef) {
        invalidRows.push({ index: idx + 1, ref: "BLANK", reason: "Missing reference code" });
      } else if (!r.qtyConsommes || r.qtyConsommes <= 0) {
        invalidRows.push({ index: idx + 1, ref: cleanRef, reason: "Quantity must be greater than 0" });
      }
    });

    if (invalidRows.length > 0) {
      Swal.fire({
        icon: "error",
        title: "Validation Issues Found",
        html: `
          <div style="text-align: left; font-size: 12px; font-family: monospace; background: #fff1f2; border: 1px solid #fecdd3; padding: 10px; border-radius: 6px; max-height: 200px; overflow-y: auto;">
            ${invalidRows.map((item) => `<p>• Row ${item.index} [${item.ref}]: ${item.reason}</p>`).join("")}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-top: 10px;">Please fix these errors before validating to Stock 3.</p>
        `
      });
      return;
    }

    const totalQty = rows.reduce((acc, r) => acc + (r.qtyConsommes || 0), 0);
    const dateToday = productionDate || getMoroccoTodayDateString();

    const newRefs = rows.filter((r) => !refMap.has(r.refMaille.toUpperCase().trim()));

    const confirmResult = await Swal.fire({
      title: "Validate & Add to Stock 3",
      html: `
        <div style="text-align: left; font-family: monospace; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; line-height: 1.6;">
          <p><strong>Total References:</strong> ${rows.length} items</p>
          <p><strong>Total Stock 3 Addition:</strong> <span style="color: #059669; font-weight: 800; font-size: 15px;">+${totalQty.toLocaleString()} PCS</span></p>
          <p><strong>Target Stock:</strong> <span style="color: #2563eb; font-weight: bold;">Stock 3 (Finished Goods)</span></p>
          <p><strong>Effective Date:</strong> ${dateToday}</p>
          <p><strong>Operator:</strong> ${currentUser.fullName}</p>
          ${newRefs.length > 0 ? `<p style="color: #d97706; margin-top: 8px; font-size: 11px;">⚠️ <strong>Note:</strong> ${newRefs.length} new reference(s) will be automatically registered in the catalog.</p>` : ""}
        </div>
        <p style="font-size: 12px; color: #475569; margin-top: 12px; text-align: left;">
          Clicking confirm will commit the transactions and increase Finished Goods Stock 3 for all listed references.
        </p>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Validate & Add to Stock 3",
      confirmButtonColor: "#059669",
      cancelButtonText: "Cancel"
    });

    if (!confirmResult.isConfirmed) return;

    setIsValidating(true);
    try {
      const payload = rows.map((r) => ({
        date: dateToday,
        reference: r.refMaille.toUpperCase().trim(),
        quantity: r.qtyConsommes,
        description: r.libelle || "",
        notes: `Validated Daily Production: ${r.libelle || ""}`
      }));

      if (onValidateToStock3) {
        await onValidateToStock3(payload, "DIRECT_STOCK_3");
      } else if (onSubmitProduction) {
        await onSubmitProduction(payload);
      }

      await Swal.fire({
        icon: "success",
        title: "Successfully Added to Stock 3!",
        html: `
          <div style="font-family: monospace; font-size: 13px; text-align: left; padding: 12px; background: #ecfdf5; border-radius: 8px; border: 1px solid #a7f3d0; line-height: 1.6;">
            <p><strong>Validated Records:</strong> ${rows.length} references</p>
            <p><strong>Added to Stock 3:</strong> <span style="color: #059669; font-weight: bold;">+${totalQty.toLocaleString()} PCS</span></p>
            <p><strong>Effective Date:</strong> ${dateToday}</p>
            <p><strong>Status:</strong> Committed to Inventory & Logged in Production</p>
          </div>
        `,
        confirmButtonColor: "#059669"
      });
    } catch (err: any) {
      console.error("Failed to validate records to Stock 3:", err);
      Swal.fire({
        icon: "error",
        title: "Stock 3 Validation Failed",
        text: err?.message || "An error occurred while validating records to Stock 3."
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Stage / Transfer converted rows to Daily Production
  const handleCommitToProduction = async () => {
    await handleValidateToStock3();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16" id="daily-production-demo-root">
      
      {/* ---------------------------------------------------- */}
      {/* 1. HERO DEMO BANNER */}
      {/* ---------------------------------------------------- */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-lg border border-blue-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-emerald-400 shrink-0" />
              <span>Daily Production</span>
            </h1>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. DRAG & DROP ZONE & IMPORT CONTROLS */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Drag & Drop Card (Takes 2 cols on lg) */}
        <div className="lg:col-span-2">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            id="google-sheets-dropzone"
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 transition-all text-center cursor-pointer flex flex-col items-center justify-center min-h-[220px] ${
              isDragging
                ? "border-blue-500 bg-blue-50/60 scale-[1.01] shadow-md ring-4 ring-blue-500/10"
                : "border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/50 shadow-2xs"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".csv,.xlsx,.xls,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
            />

            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3.5 shadow-2xs border border-blue-100 group-hover:scale-105 transition-transform">
              <Upload className="w-7 h-7" />
            </div>

            <h3 className="text-base font-bold text-slate-800">
              {isDragging ? "Drop your Google Sheets file here!" : "Drag & Drop Google Sheets File Here"}
            </h3>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Browse Files</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPasteModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-slate-600" />
                <span>Paste Google Sheets Cells</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Summary & Current Source Info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                Current Dataset
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono font-bold border border-emerald-200">
                ACTIVE
              </span>
            </div>

            <div className="mt-3.5 space-y-3">
              <div>
                <div className="text-[11px] text-slate-500 font-medium">Source / Origin:</div>
                <div className="text-xs font-mono font-bold text-slate-800 break-all mt-0.5">
                  {currentSource}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] text-slate-500 font-mono uppercase font-bold">Total Items</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">{stats.totalItems}</div>
                </div>
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80">
                  <div className="text-[10px] text-blue-700 font-mono uppercase font-bold">Consumed PCS</div>
                  <div className="text-xl font-black font-mono text-blue-800 mt-0.5">+{stats.totalPcs.toLocaleString()}</div>
                </div>
              </div>

              <div className="text-[11px] space-y-1.5 pt-1 text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Catalog Verified:
                  </span>
                  <span className="font-mono font-bold text-emerald-700">{stats.matchedCount} of {stats.totalItems}</span>
                </div>
                {stats.unmatchedCount > 0 && (
                  <div className="flex items-center justify-between text-amber-700">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Unmatched in Catalog:
                    </span>
                    <span className="font-mono font-bold">{stats.unmatchedCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action to validate records and add to stock 3 */}
          <div className="pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={handleValidateToStock3}
              disabled={isValidating || rows.length === 0}
              id="demo-commit-production-btn"
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-100" />
              <span>Validate to Stock 3</span>
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-emerald-200" />
            </button>
          </div>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. PARSED & CONVERTED DATA TABLE */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="daily-production-table-card">
        
        {/* Table Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                Converted Daily Data ({filteredRows.length} {filteredRows.length === 1 ? "reference" : "references"})
              </h2>
              <p className="text-xs text-slate-500">
                Data extracted directly from Google Sheets file format ready for daily operations
              </p>
            </div>
          </div>

          {/* Search & Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by ref or libellé..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Add row manually */}
            <button
              onClick={() => setShowAddRow(!showAddRow)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>

            {/* Copy CSV */}
            <button
              onClick={handleCopyCSV}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono flex items-center gap-1.5 border border-slate-200 cursor-pointer"
              title="Copy table as CSV text"
            >
              {copiedStatus === "csv" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedStatus === "csv" ? "Copied CSV!" : "Copy CSV"}</span>
            </button>

            {/* Copy JSON */}
            <button
              onClick={handleCopyJSON}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono flex items-center gap-1.5 border border-slate-200 cursor-pointer"
              title="Copy table as JSON structured objects"
            >
              {copiedStatus === "json" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedStatus === "json" ? "Copied JSON!" : "Copy JSON"}</span>
            </button>

            {/* Export XLSX */}
            <button
              onClick={handleExportXLSX}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Export as Microsoft Excel / Google Sheets format"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .XLSX</span>
            </button>
          </div>
        </div>

        {/* Add Row Drawer Form */}
        {showAddRow && (
          <form
            onSubmit={handleAddNewRow}
            className="p-4 bg-blue-50/50 border-b border-blue-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase font-mono mb-1">
                Ref Maille *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 34316011B"
                value={newRef}
                onChange={(e) => setNewRef(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-600 uppercase font-mono mb-1">
                Libellé / Designation
              </label>
              <input
                type="text"
                placeholder="e.g. HEATING ELEMENT ASSY P33B SW"
                value={newLibelle}
                onChange={(e) => setNewLibelle(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-600 uppercase font-mono mb-1">
                  Qty consommés *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 55"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold self-end cursor-pointer h-[34px]"
              >
                Insert
              </button>
            </div>
          </form>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="daily-production-converted-table">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 font-mono">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Ref Maille</th>
                <th className="py-3 px-4">Libellé</th>
                <th className="py-3 px-4 text-right">Qty consommés</th>
                <th className="py-3 px-4">Catalog Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-sans">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-600">No rows to display</p>
                    <p className="text-xs mt-1">Drag and drop a Google Sheets file or click "Load User Sample".</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const isEditing = editingRowId === row.id;
                  const isMatched = row.matchedReference !== null && row.matchedReference !== undefined;

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-blue-50/40 transition-colors group"
                      id={`daily-prod-row-${row.refMaille}`}
                    >
                      {/* # Number */}
                      <td className="py-3 px-4 text-center font-mono text-slate-400 text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Ref Maille */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editRef}
                            onChange={(e) => setEditRef(e.target.value)}
                            className="px-2 py-1 text-xs border border-blue-400 rounded bg-white font-mono uppercase font-bold"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                              {row.refMaille}
                            </span>
                            {row.matchedReference?.customer && (
                              <span className="text-[10px] text-slate-500 font-mono px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200">
                                {row.matchedReference.customer}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Libellé */}
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editLibelle}
                            onChange={(e) => setEditLibelle(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          <span>{row.libelle || "—"}</span>
                        )}
                      </td>

                      {/* Qty consommés */}
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border border-blue-400 rounded bg-white text-right font-mono font-bold"
                          />
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {row.qtyConsommes.toLocaleString()} <span className="text-[10px] font-semibold text-emerald-600">PCS</span>
                          </span>
                        )}
                      </td>

                      {/* Catalog Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isMatched ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-semibold">Catalog Matched</span>
                            <span className="text-[10px] text-slate-500 font-mono ml-1">
                              (S2: {row.matchedReference?.stock2} | S3: {row.matchedReference?.stock3})
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-semibold">Unmatched</span>
                            <span className="text-[10px] text-slate-400">(New reference)</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleSaveEdit(row.id)}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                              title="Save changes"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingRowId(null)}
                              className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(row)}
                              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Edit item"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Summary Footer */}
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100/80 font-mono font-bold text-slate-800 text-xs border-t-2 border-slate-200">
                  <td colSpan={3} className="py-3.5 px-4 uppercase text-slate-600">
                    Total Daily Consumption ({filteredRows.length} references)
                  </td>
                  <td className="py-3.5 px-4 text-right text-emerald-800 font-black text-sm">
                    {filteredRows.reduce((acc, r) => acc + (r.qtyConsommes || 0), 0).toLocaleString()} PCS
                  </td>
                  <td colSpan={2} className="py-3.5 px-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. BOTTOM ACTION: VALIDATE TO STOCK 3 */}
      {/* ---------------------------------------------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-5 sm:p-6 text-white shadow-xl border border-emerald-900/60 flex flex-col md:flex-row md:items-center justify-between gap-5" id="validate-stock-3-bottom-card">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Direct Stock 3 Intake
            </span>
            <span className="text-xs text-slate-400 font-mono">
              &bull; {rows.length} records ready
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Commit Validated Records to Stock 3</span>
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <div className="bg-white/10 rounded-xl px-4 py-2.5 border border-white/15 text-left min-w-[150px]">
            <div className="text-[10px] text-slate-400 font-mono uppercase font-bold">Total Finished Goods</div>
            <div className="text-xl font-black font-mono text-emerald-400 mt-0.5">
              +{stats.totalPcs.toLocaleString()} PCS
            </div>
          </div>

          <button
            onClick={handleValidateToStock3}
            disabled={isValidating || rows.length === 0}
            id="validate-to-stock-3-btn"
            className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 border border-emerald-400/40 transition-all cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-white" />
                <span>Validating & Adding to Stock 3...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span>VALIDATE TO STOCK 3</span>
                <ArrowRight className="w-4 h-4 text-emerald-200" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 5. MODAL: PASTE GOOGLE SHEETS CONTENT */}
      {/* ---------------------------------------------------- */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
                <ClipboardPaste className="w-5 h-5 text-blue-600" />
                <span>Paste Google Sheets Cells</span>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Select rows directly in your Google Sheets file, copy them (<kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-300 font-mono">Ctrl+C</kbd>), and paste below (<kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-300 font-mono">Ctrl+V</kbd>):
            </p>

            <textarea
              rows={8}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Ref Maille&#9;Libellé&#9;Qty consommés&#10;34316011B&#9;HEATING ELEMENT ASSY P33B SW&#9;55&#10;A026K122B&#9;HEAT MAT HES K9 MCM SW OVCTF&#9;276"
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessPastedText}
                disabled={!pastedText.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Convert & Import
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
