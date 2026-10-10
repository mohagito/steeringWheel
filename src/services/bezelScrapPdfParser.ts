import * as pdfjsLib from "pdfjs-dist";
import { BezelReference } from "../types";

// Configure worker URL for client environment
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

export interface ParsedBezelScrapItem {
  id: string;
  reference: string;
  description: string;
  quantity: number;
  selectedStock: "STOCK 1" | "STOCK 2";
  stock1Available: number;
  stock2Available: number;
  catalogFound: boolean;
  included: boolean;
}

export interface ParsedBezelScrapDocument {
  invoiceNumber: string;
  invoiceDate?: string;
  totalBezelPieces: number;
  totalRowsDetected: number;
  nonBezelCount: number;
  items: ParsedBezelScrapItem[];
}

interface TextItemPos {
  text: string;
  x: number;
  y: number;
  width?: number;
}

/**
 * Words that can NEVER be references.
 */
const INVALID_REF_WORDS = new Set([
  "RECIPIENT", "DESTINATARIO", "DESTINATAIRE", "CARGADOR", "CONDUCTOR", "TRANSPORTE",
  "EXPEDICION", "MATRICULA", "OBSERVACIONES", "BULTOS", "PALETS", "PALLETS", "PESO",
  "BRUTO", "NETO", "GROSS", "WEIGHT", "TOTAL", "INVOICE", "FACTURA", "ALBARAN",
  "CLIENTE", "PROVEEDOR", "DOMICILIO", "ZONE", "FRANCHE", "NIF", "CIF", "TEL", "FAX",
  "UNIDADES", "PIEZAS", "PIEZA", "QUANTITY", "PRECIO", "IMPORTE", "BEZEL", "VOLANTE",
  "VOLANTES", "PLANTILLA", "PLANTILLAS", "RETURN", "DEVOLUCION", "DEVOLUCIÓN",
  "REFERENCE", "REFERENCIA", "DESCRIPCION", "DESCRIPCIÓN", "PART", "NAME", "UNIT", "PRICE",
  "SH", "PCS", "PC", "UN", "PZ", "ST", "PCE", "DATE", "FECHA", "HORA"
]);

/**
 * Known standard Bezel references defined in the system.
 */
const KNOWN_BEZEL_CODES = new Set(["A024H181B", "A015E335A", "A025B907B"]);

/**
 * Checks whether a line is a header or trailer/summary line that should be skipped.
 */
function isHeaderOrTrailerLine(lineStr: string): boolean {
  const upper = lineStr.toUpperCase().trim();
  if (!upper) return true;

  // Header patterns
  if (
    /^(?:ORDER|REF|REFERENCE|REFERENCIA|PART\s*NUMBER|DESCRIP|DESIGNATION|LIBELLE|QUANT|QTE|QTY|CANTIDAD|UNIT|PRECIO|PRICE)/i.test(upper) ||
    /ORDER\s+REF/i.test(upper) ||
    /REF\.\s+CLIENTE/i.test(upper) ||
    /ORDEN\s+DE\s+COMPRA/i.test(upper)
  ) {
    return true;
  }

  // Trailer / Summary patterns (e.g. "RECIPIENT QUANTITY GROSS WEIGHT TOTAL BEZEL: 158")
  if (
    /TOTAL\s+BEZEL/i.test(upper) ||
    /TOTAL\s+VOLANTES/i.test(upper) ||
    /TOTAL\s+PLANTILLAS/i.test(upper) ||
    /TOTAL\s+GENERAL/i.test(upper) ||
    /TOTAL\s+GERAL/i.test(upper) ||
    /TOTAL\s+FACTURA/i.test(upper) ||
    /TOTAL\s+ALBAR[AÁ]N/i.test(upper) ||
    /TOTAL\s+H\.T/i.test(upper) ||
    /BASE\s+IMPONIBLE/i.test(upper) ||
    /GROSS\s+WEIGHT/i.test(upper) ||
    /NET\s+WEIGHT/i.test(upper) ||
    /PESO\s*(?:BRUTO|NETO)?/i.test(upper) ||
    /QUANTITY\s+GROSS/i.test(upper) ||
    /RECIPIENT/i.test(upper) ||
    /DESTINATARIO/i.test(upper) ||
    /DESTINATAIRE/i.test(upper) ||
    /CARGADOR/i.test(upper) ||
    /CONDUCTOR/i.test(upper) ||
    /MATRICULA/i.test(upper) ||
    /EXPEDICION/i.test(upper) ||
    /BULTOS/i.test(upper) ||
    /PALETS|PALLETS/i.test(upper) ||
    /CONTENEDORES/i.test(upper) ||
    /ZONE\s+FRANCHE/i.test(upper) ||
    /CONDICIONES/i.test(upper)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether a candidate reference is genuinely an automotive part code.
 */
function isValidPartReferencePattern(refCode: string): boolean {
  if (!refCode) return false;
  const upper = refCode.trim().toUpperCase();

  // Reject blacklist words
  if (INVALID_REF_WORDS.has(upper)) return false;

  // Pure letters or pure digits are NEVER part reference codes
  if (/^[A-Z]+$/.test(upper) || /^\d+$/.test(upper)) return false;

  // Pattern A: Renault/PSA/Stellantis (e.g. A024H181B, A015E335A, A025B907B)
  if (/^[A-Z]\d{3}[A-Z0-9]{3,6}[A-Z]$/.test(upper)) return true;

  // Pattern B: Ford / ZF (e.g. 34316011B)
  if (/^\d{7,8}[A-Z]{1,2}$/.test(upper)) return true;

  // Pattern C: Standard alphanumeric part code (8-12 chars, must contain both letters and digits)
  const letters = (upper.match(/[A-Z]/g) || []).length;
  const digits = (upper.match(/\d/g) || []).length;
  if (upper.length >= 8 && upper.length <= 12 && letters >= 1 && digits >= 3 && /^[A-Z0-9]+$/.test(upper)) {
    return true;
  }

  return false;
}

/**
 * Checks whether a catalog reference or line description corresponds to a Bezel item.
 */
export function isBezelReference(
  refCode: string,
  description: string = "",
  bezelReferences: BezelReference[] = []
): boolean {
  if (!refCode) return false;
  const upperCode = refCode.trim().toUpperCase();
  const upperDesc = description.toUpperCase().trim();

  // Disqualify invalid words or pure text
  if (INVALID_REF_WORDS.has(upperCode)) return false;
  if (/^[A-Z]+$/.test(upperCode) || /^\d+$/.test(upperCode)) return false;

  // Disqualify if description looks like a summary row (e.g. "QUANTITY GROSS WEIGHT TOTAL BEZEL:")
  if (/TOTAL|GROSS|WEIGHT|PESO|RECIPIENT|DESTINATARIO/i.test(upperDesc)) {
    return false;
  }

  // 1. Direct match in bezel references catalog (from DB)
  if (bezelReferences.some((b) => (b.code || "").toUpperCase().trim() === upperCode)) {
    return true;
  }

  // 2. Known standard Bezel references
  if (KNOWN_BEZEL_CODES.has(upperCode)) {
    return true;
  }

  // 3. Valid automotive part pattern AND description mentions BEZEL or RIM BADGE
  if (isValidPartReferencePattern(upperCode) && (/BEZEL/i.test(upperDesc) || /RIM\s*BADGE/i.test(upperDesc))) {
    return true;
  }

  return false;
}

/**
 * Parses a Scrap / Return PDF document specifically extracting BEZEL references only.
 * Ignores mesh and non-bezel items.
 */
export async function parseBezelScrapPDF(
  fileOrBuffer: File | ArrayBuffer,
  bezelReferences: BezelReference[] = []
): Promise<ParsedBezelScrapDocument> {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const allPageLines: { y: number; items: TextItemPos[]; lineStr: string }[] = [];
  let fullPlainText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by rounded Y coordinate (tolerance of 4px)
    const lineMap = new Map<number, TextItemPos[]>();

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const yKey = Math.round(item.transform[5] / 4) * 4;
      const xPos = item.transform[4];
      const cur = lineMap.get(yKey) || [];
      cur.push({
        text: item.str.trim(),
        x: xPos,
        y: item.transform[5],
        width: item.width || 0
      });
      lineMap.set(yKey, cur);
    }

    // Sort lines top to bottom (Y descending)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const itemsInLine = lineMap.get(y)!;
      // Sort words by X ascending
      itemsInLine.sort((a, b) => a.x - b.x);
      const lineStr = itemsInLine.map((i) => i.text).join(" ");
      if (lineStr) {
        allPageLines.push({ y, items: itemsInLine, lineStr });
        fullPlainText += lineStr + "\n";
      }
    }
  }

  // 1. Detect Invoice Number (e.g. MPT637-Dev, MPT-637, etc.)
  let invoiceNumber = "";
  const invMatch =
    fullPlainText.match(/MPT[\-_]?\d{3,6}(?:-?[A-Za-z0-9]+)?/i) ||
    fullPlainText.match(/DEV[\-_]?\d{3,6}(?:-?[A-Za-z0-9]+)?/i) ||
    fullPlainText.match(/(?:INVOICE|FACTURA|ALBAR[AÁ]N|DEVOLUCI[OÓ]N)\s*(?:N[Oº°]|NUMBER)?\s*[:\s#]?\s*([A-Z0-9\-_]+)/i);

  if (invMatch) {
    invoiceNumber = invMatch[1] ? invMatch[1].trim() : invMatch[0].trim();
  } else {
    invoiceNumber = `MPT-${Date.now().toString().slice(-6)}`;
  }

  // 2. Detect Invoice Date
  let invoiceDate: string | undefined;
  const dateMatch =
    fullPlainText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/) ||
    fullPlainText.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
  if (dateMatch) {
    invoiceDate = dateMatch[1];
  }

  const items: ParsedBezelScrapItem[] = [];
  let nonBezelCount = 0;

  for (let i = 0; i < allPageLines.length; i++) {
    const line = allPageLines[i];
    
    // Skip headers and trailer/summary rows
    if (isHeaderOrTrailerLine(line.lineStr)) {
      continue;
    }

    const lineItems = line.items;
    if (lineItems.length < 2) continue;

    // Look for genuine reference candidate
    let refCode = "";
    let refIndex = -1;

    for (let k = 0; k < Math.min(lineItems.length, 3); k++) {
      const candidate = lineItems[k].text.toUpperCase().trim();
      if (INVALID_REF_WORDS.has(candidate)) continue;
      // Pure letters or pure digits cannot be references
      if (/^[A-Z]+$/.test(candidate) || /^\d+$/.test(candidate)) continue;

      if (
        bezelReferences.some((b) => (b.code || "").toUpperCase() === candidate) ||
        KNOWN_BEZEL_CODES.has(candidate) ||
        isValidPartReferencePattern(candidate)
      ) {
        refCode = candidate;
        refIndex = k;
        break;
      }
    }

    if (!refCode || refIndex === -1) continue;

    // Remaining items on the line: description and numbers
    const remainingItems = lineItems.slice(refIndex + 1);
    const textTokens: string[] = [];
    const numTokens: { str: string; val: number; isFloat: boolean }[] = [];

    for (const it of remainingItems) {
      const cleanNum = it.text.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
      const parsedNum = parseFloat(cleanNum);

      if (!isNaN(parsedNum) && /^\d+(?:[.,]\d+)?$/.test(it.text.replace(/\s+/g, ""))) {
        numTokens.push({
          str: it.text,
          val: parsedNum,
          isFloat: it.text.includes(",") || (it.text.includes(".") && parsedNum % 1 !== 0)
        });
      } else {
        textTokens.push(it.text);
      }
    }

    const description = textTokens.join(" ").trim();

    // Check if this reference is a genuine Bezel reference
    const isBezel = isBezelReference(refCode, description, bezelReferences);
    if (!isBezel) {
      nonBezelCount++;
      continue;
    }

    // Integers for quantity: filter out floats (unit prices, total prices)
    const intTokens = numTokens.filter((n) => !n.isFloat && Number.isInteger(n.val) && n.val > 0);

    let quantity = 0;
    if (intTokens.length >= 3) {
      // Typically [CON COLA, SIN COLA, TOTAL]
      quantity = intTokens[intTokens.length - 1].val;
    } else if (intTokens.length === 2) {
      // Either [CON COLA, TOTAL] or [QTY, TOTAL]
      quantity = Math.max(intTokens[0].val, intTokens[1].val);
    } else if (intTokens.length === 1) {
      quantity = intTokens[0].val;
    }

    if (quantity <= 0) continue;

    // Find catalog stock balances
    const catRef = bezelReferences.find(
      (b) => (b.code || "").toUpperCase() === refCode.toUpperCase()
    );

    const s1Avail = catRef?.stock1 ?? 0;
    const s2Avail = catRef?.stock2 ?? 0;

    // Default stock source to Stock 1, or Stock 2 if S1 has 0 and S2 has stock
    const defaultStock: "STOCK 1" | "STOCK 2" = s1Avail >= quantity ? "STOCK 1" : (s2Avail > 0 ? "STOCK 2" : "STOCK 1");

    items.push({
      id: `bezel-scrap-pdf-${refCode}-${i}-${Date.now()}`,
      reference: refCode,
      description: description || catRef?.description || "Bezel Component",
      quantity,
      selectedStock: defaultStock,
      stock1Available: s1Avail,
      stock2Available: s2Avail,
      catalogFound: !!catRef,
      included: true
    });
  }

  const totalBezelPieces = items.reduce((acc, it) => acc + (it.included ? it.quantity : 0), 0);

  return {
    invoiceNumber,
    invoiceDate,
    totalBezelPieces,
    totalRowsDetected: items.length,
    nonBezelCount,
    items
  };
}
