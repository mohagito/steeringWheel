import * as XLSX from "xlsx";
import { resolveMeshDeduction, NON_MESH_STEERING_WHEEL_REFERENCES } from "../data/meshBOMMapping";

export interface SpreadsheetParseRow {
  refMaille: string;
  libelle: string;
  qtyConsommes: number;
}

export interface SpreadsheetParseResult {
  rows: SpreadsheetParseRow[];
  fileName?: string;
  rowCount: number;
  totalQuantity: number;
  warnings: string[];
}

function normalizeColHeader(header: any): string {
  if (!header) return "";
  return String(header)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

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

  if (refIdx === -1 && headers.length > 0) refIdx = 0;
  if (libelleIdx === -1 && headers.length > 1) libelleIdx = 1;
  if (qtyIdx === -1 && headers.length > 2) qtyIdx = 2;

  return { refIdx, libelleIdx, qtyIdx };
}

export function convertSpreadsheetDataToRows(
  sheetRows: any[][],
  fileName?: string
): SpreadsheetParseResult {
  const warnings: string[] = [];
  if (!sheetRows || sheetRows.length === 0) {
    return { rows: [], fileName, rowCount: 0, totalQuantity: 0, warnings: ["File is empty."] };
  }

  let headerRowIdx = 0;
  while (headerRowIdx < sheetRows.length && (!sheetRows[headerRowIdx] || sheetRows[headerRowIdx].every((cell) => cell === undefined || cell === null || String(cell).trim() === ""))) {
    headerRowIdx++;
  }

  if (headerRowIdx >= sheetRows.length) {
    return { rows: [], fileName, rowCount: 0, totalQuantity: 0, warnings: ["No valid content rows found."] };
  }

  const rawHeaders = sheetRows[headerRowIdx];
  const { refIdx, libelleIdx, qtyIdx } = detectColumnIndices(rawHeaders);

  const parsedRows: SpreadsheetParseRow[] = [];
  let totalQuantity = 0;

  for (let i = headerRowIdx + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.every((c) => c === undefined || c === null || String(c).trim() === "")) {
      continue;
    }

    const rawRef = row[refIdx] !== undefined ? String(row[refIdx]).trim() : "";
    const rawLibelle = row[libelleIdx] !== undefined ? String(row[libelleIdx]).trim() : "";
    const rawQty = row[qtyIdx];

    if (!rawRef) continue;

    let parsedQty = 0;
    if (typeof rawQty === "number") {
      parsedQty = Math.round(rawQty);
    } else if (rawQty) {
      const cleanStr = String(rawQty).replace(/[^0-9.-]/g, "").replace(",", ".");
      const val = parseFloat(cleanStr);
      parsedQty = isNaN(val) ? 0 : Math.round(val);
    }

    const refUpper = rawRef.toUpperCase();

    if (NON_MESH_STEERING_WHEEL_REFERENCES.has(refUpper)) {
      continue;
    }

    const bomResolved = resolveMeshDeduction(refUpper);
    const finalRefMaille = bomResolved ? bomResolved.meshRef : refUpper;

    parsedRows.push({
      refMaille: finalRefMaille,
      libelle: rawLibelle || bomResolved?.description || "",
      qtyConsommes: parsedQty
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

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve({ rows: [], fileName: file.name, rowCount: 0, totalQuantity: 0, warnings: ["File reading produced empty data."] });
          return;
        }

        const workbook = XLSX.read(data, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({ rows: [], fileName: file.name, rowCount: 0, totalQuantity: 0, warnings: ["Workbook has no sheets."] });
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const result = convertSpreadsheetDataToRows(rawJson, file.name);
        resolve(result);
      } catch (err) {
        console.error("Error parsing spreadsheet file:", err);
        reject(err);
      }
    };

    reader.onerror = (err) => {
      reject(err);
    };

    reader.readAsBinaryString(file);
  });
}

export function parsePastedSpreadsheetText(text: string): SpreadsheetParseResult {
  if (!text || !text.trim()) {
    return { rows: [], fileName: "Clipboard", rowCount: 0, totalQuantity: 0, warnings: ["Clipboard text is empty."] };
  }

  try {
    const workbook = XLSX.read(text, { type: "string" });
    const sheetName = workbook.SheetNames[0];
    if (sheetName) {
      const sheet = workbook.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      return convertSpreadsheetDataToRows(data, "Pasted Sheet Content");
    }
  } catch (e) {
    // Fallback to manual line splitting
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const data: string[][] = lines.map((l) => {
    if (l.includes("\t")) return l.split("\t").map((c) => c.trim());
    if (l.includes(";")) return l.split(";").map((c) => c.trim());
    return l.split(",").map((c) => c.trim());
  });

  return convertSpreadsheetDataToRows(data, "Pasted Content");
}
