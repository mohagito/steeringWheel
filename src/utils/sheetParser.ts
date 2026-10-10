import * as XLSX from "xlsx";
import { DailyProductionRow } from "../data/dailyProductionDemoData";
import { Reference } from "../types";
import { resolveMeshDeduction, NON_MESH_STEERING_WHEEL_REFERENCES } from "../data/meshBOMMapping";

export interface ParseResult {
  rows: DailyProductionRow[];
  fileName?: string;
  rowCount: number;
  totalQuantity: number;
  warnings: string[];
}

/**
 * Normalizes header string to find matching column index
 */
function normalizeColHeader(header: any): string {
  if (!header) return "";
  return String(header)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents: é -> e, etc.
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Detect column indices for Ref, Libelle, and Quantity
 */
function detectColumnIndices(headers: any[]): {
  refIdx: number;
  libelleIdx: number;
  qtyIdx: number;
} {
  let refIdx = -1;
  let libelleIdx = -1;
  let qtyIdx = -1;

  headers.forEach((h, idx) => {
    const norm = normalizeColHeader(h);
    if (refIdx === -1 && (norm.includes("ref") || norm.includes("code") || norm.includes("maille") || norm === "item")) {
      refIdx = idx;
    } else if (libelleIdx === -1 && (norm.includes("libelle") || norm.includes("designation") || norm.includes("desc") || norm.includes("name"))) {
      libelleIdx = idx;
    } else if (qtyIdx === -1 && (norm.includes("qty") || norm.includes("quantite") || norm.includes("consomme") || norm.includes("conso") || norm.includes("total") || norm === "qte")) {
      qtyIdx = idx;
    }
  });

  // Fallbacks if not explicitly found
  if (refIdx === -1 && headers.length > 0) refIdx = 0;
  if (libelleIdx === -1 && headers.length > 1) libelleIdx = 1;
  if (qtyIdx === -1 && headers.length > 2) qtyIdx = 2;

  return { refIdx, libelleIdx, qtyIdx };
}

/**
 * Converts 2D array of cells (from CSV or XLSX) to structured DailyProductionRow[]
 */
export function convertSheetDataToRows(
  sheetRows: any[][],
  referencesCatalog: Reference[] = [],
  fileName?: string
): ParseResult {
  const warnings: string[] = [];
  if (!sheetRows || sheetRows.length === 0) {
    return { rows: [], fileName, rowCount: 0, totalQuantity: 0, warnings: ["File is empty."] };
  }

  // Find header row (skip leading blank rows)
  let headerRowIdx = 0;
  while (headerRowIdx < sheetRows.length && (!sheetRows[headerRowIdx] || sheetRows[headerRowIdx].every((cell) => cell === undefined || cell === null || String(cell).trim() === ""))) {
    headerRowIdx++;
  }

  if (headerRowIdx >= sheetRows.length) {
    return { rows: [], fileName, rowCount: 0, totalQuantity: 0, warnings: ["No valid content rows found."] };
  }

  const rawHeaders = sheetRows[headerRowIdx];
  const { refIdx, libelleIdx, qtyIdx } = detectColumnIndices(rawHeaders);

  const refMap = new Map<string, Reference>();
  referencesCatalog.forEach((r) => {
    if (r.code) refMap.set(r.code.toUpperCase().trim(), r);
    if (r.id) refMap.set(r.id.toUpperCase().trim(), r);
  });

  const parsedRows: DailyProductionRow[] = [];
  let totalQuantity = 0;

  for (let i = headerRowIdx + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.every((c) => c === undefined || c === null || String(c).trim() === "")) {
      continue;
    }

    const rawRef = row[refIdx] !== undefined ? String(row[refIdx]).trim() : "";
    const rawLibelle = row[libelleIdx] !== undefined ? String(row[libelleIdx]).trim() : "";
    const rawQty = row[qtyIdx];

    // If no ref, skip row
    if (!rawRef) continue;

    // Clean quantity: handles numbers or strings like "55", "55 PCS", "55,00", etc.
    let parsedQty = 0;
    if (typeof rawQty === "number") {
      parsedQty = Math.round(rawQty);
    } else if (rawQty) {
      const cleanStr = String(rawQty).replace(/[^0-9.-]/g, "").replace(",", ".");
      const val = parseFloat(cleanStr);
      parsedQty = isNaN(val) ? 0 : Math.round(val);
    }

    const refUpper = rawRef.toUpperCase();

    // Check if explicitly non-mesh reference (per user: ignore references outside the 23 verified list)
    if (NON_MESH_STEERING_WHEEL_REFERENCES.has(refUpper)) {
      continue;
    }

    const bomResolved = resolveMeshDeduction(refUpper);
    const finalRefMaille = bomResolved ? bomResolved.meshRef : refUpper;
    const matchedRef = refMap.get(finalRefMaille) || (bomResolved ? refMap.get(refUpper) : undefined);

    const isValid = parsedQty > 0;
    let validationError: string | undefined;
    if (parsedQty <= 0) {
      validationError = "Quantity must be greater than 0";
    }

    parsedRows.push({
      id: `row-${i}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`,
      refMaille: finalRefMaille,
      libelle: rawLibelle || bomResolved?.description || matchedRef?.description || "",
      qtyConsommes: parsedQty,
      matchedReference: matchedRef
        ? {
            code: matchedRef.code,
            description: matchedRef.description,
            customer: matchedRef.customer,
            stock2: matchedRef.stock2 || 0,
            stock3: matchedRef.stock3 || 0
          }
        : null,
      isValid,
      validationError
    });

    totalQuantity += parsedQty;
  }

  return {
    rows: parsedRows,
    fileName,
    rowCount: parsedRows.length,
    totalQuantity,
    warnings
  };
}

/**
 * Parses a File object (CSV, TSV, XLSX, XLS)
 */
export async function parseGoogleSheetsFile(
  file: File,
  referencesCatalog: Reference[] = []
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) {
          resolve({ rows: [], fileName: file.name, rowCount: 0, totalQuantity: 0, warnings: ["Could not read file."] });
          return;
        }

        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({ rows: [], fileName: file.name, rowCount: 0, totalQuantity: 0, warnings: ["Workbook has no sheets."] });
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        const result = convertSheetDataToRows(rawJson, referencesCatalog, file.name);
        resolve(result);
      } catch (err: any) {
        console.error("Error parsing spreadsheet file:", err);
        reject(new Error(err?.message || "Failed to parse file. Please ensure it is a valid CSV or Excel file."));
      }
    };

    reader.onerror = () => {
      reject(new Error("File reading error."));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parses raw text pasted from Google Sheets or CSV string
 */
export function parsePastedSheetText(
  text: string,
  referencesCatalog: Reference[] = []
): ParseResult {
  try {
    const workbook = XLSX.read(text, { type: "string" });
    const sheetName = workbook.SheetNames[0];
    if (sheetName) {
      const sheet = workbook.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      return convertSheetDataToRows(data, referencesCatalog, "Pasted Sheet Content");
    }
  } catch (e) {
    // Fallback manual CSV/TSV parser if XLSX string read fails
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    const data: any[][] = lines.map((line) => {
      if (line.includes("\t")) {
        return line.split("\t");
      }
      if (line.includes(";")) {
        return line.split(";");
      }
      return line.split(",");
    });
    return convertSheetDataToRows(data, referencesCatalog, "Pasted Content");
  }

  return { rows: [], fileName: "Pasted Content", rowCount: 0, totalQuantity: 0, warnings: ["No valid content parsed."] };
}
