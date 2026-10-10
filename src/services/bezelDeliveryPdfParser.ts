import * as pdfjsLib from "pdfjs-dist";
import { resolveBezelDeduction, hasAssociatedBezel } from "../data/bezelBOMMapping";
import { BezelReference } from "../types";

// Configure worker URL for client environment
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

export interface ParsedBezelDeliveryItem {
  id: string;
  orderNumber?: string;
  invoiceRef: string; // The reference printed on document (e.g. SW reference R001H666A)
  description: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  // BOM Resolved Bezel details
  associatedBezelRef?: string; // e.g. A025B907B
  targetStock: "Stock 2";
  isBezelDeduction: boolean;
  currentAvailableStock?: number;
  catalogFound: boolean;
  status: "ready" | "no_bezel_needed" | "insufficient_stock" | "not_in_catalog";
  included: boolean;
}

export interface ParsedBezelDeliveryDocument {
  invoiceNumber: string;
  invoiceDate?: string;
  totalQuantity: number; // Total SW pcs
  totalBezelQuantity: number; // Total Bezel pcs to deduct from Stock 2
  items: ParsedBezelDeliveryItem[];
}

/**
 * Extracts plain text lines grouped by Y coordinate from a PDF File or ArrayBuffer.
 */
async function extractLinesFromPDF(fileOrBuffer: File | ArrayBuffer): Promise<string[]> {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by line according to Y-coordinate
    const lineMap = new Map<number, { text: string; x: number }[]>();

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      // Round Y to nearest 3px to handle minor baseline deviations
      const yKey = Math.round(item.transform[5] / 3) * 3;
      const xPos = item.transform[4];

      const cur = lineMap.get(yKey) || [];
      cur.push({ text: item.str, x: xPos });
      lineMap.set(yKey, cur);
    }

    // Sort lines from top (higher Y) to bottom (lower Y)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);

    for (const y of sortedY) {
      const itemsInLine = lineMap.get(y)!;
      // Sort words by X position from left to right
      itemsInLine.sort((a, b) => a.x - b.x);
      const lineStr = itemsInLine.map((i) => i.text.trim()).join(" ");
      if (lineStr) {
        allLines.push(lineStr);
      }
    }
  }

  return allLines;
}

/**
 * Parses a delivery PDF invoice for Bezel deductions.
 * Automatically identifies Steering Wheel (SW) references, resolves which Bezel
 * to remove from Stock 2, and validates against available Stock 2 inventory.
 */
export async function parseBezelDeliveryPDF(
  file: File,
  bezelReferences: BezelReference[] = []
): Promise<ParsedBezelDeliveryDocument> {
  const lines = await extractLinesFromPDF(file);
  const fullText = lines.join("\n");

  // 1. Detect Invoice Number (e.g. MPT2332, MPT2327, INV-...)
  let invoiceNumber = "";
  const invMatch =
    fullText.match(/MPT\d{3,6}/i) ||
    fullText.match(/(?:INVOICE|FACTURA|DELIVERY|ALBAR[AÁ]N|BL)\s*(?:N[ºO°]|NO|NUMBER)?\s*[:\s]?\s*([A-Z0-9\-_]+)/i);

  if (invMatch) {
    invoiceNumber = invMatch[1] ? invMatch[1].trim() : invMatch[0].trim();
  } else {
    invoiceNumber = `BZ-INV-${Date.now().toString().slice(-6)}`;
  }

  // 2. Detect Invoice Date
  let invoiceDate: string | undefined;
  const dateMatch = fullText.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  if (dateMatch) {
    invoiceDate = dateMatch[1];
  }

  // Lookup map of bezel references
  const bezelRefMap = new Map<string, BezelReference>();
  bezelReferences.forEach((r) => {
    if (r.code) bezelRefMap.set(r.code.toUpperCase().trim(), r);
    if (r.id) bezelRefMap.set(r.id.toUpperCase().trim(), r);
  });

  // 3. Extract Line Items
  const parsedItems: ParsedBezelDeliveryItem[] = [];
  const seenKeys = new Set<string>();

  // Words that can never be part references
  const invalidRefWords = new Set([
    "STEERING", "WHEELS", "VOLANTES", "PLANTILLAS", "CONTENEDORES", 
    "TOTAL", "MARRUECOS", "PORTUGAL", "TANGER", "BULTOS", "PESO", 
    "BRUTO", "NETO", "PALETS", "PALLETS", "EXPEDICION", "MATRICULA", 
    "CONDUCTOR", "ALBARAN", "CARGADOR", "DESTINATARIO", "TRANSPORTE",
    "OBSERVACIONES", "CLIENTE", "PROVEEDOR", "FECHA", "HORA", "INVOICE",
    "DOMICILIO", "ZONE", "FRANCHE", "NIF", "CIF", "FAX", "TEL"
  ]);

  // Standard automotive delivery invoice row regex:
  // [optional OrderNumber] [RefCode] [Description] [Quantity] [optional Prices]
  const rowRegex =
    /(?:(\d{8,12})\s+)?([A-Z0-9]{8,12})\s+(.+?)\s+(\d{1,5})(?:\s+[\d.,]+)?(?:\s*€)?(?:\s+[\d.,]+)?$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip headers, footers, weight and summary rows
    if (
      /ORDER\s+REF/i.test(trimmed) || 
      /TOTAL\s+H\.T/i.test(trimmed) || 
      /TOTAL\s+VOLANTES/i.test(trimmed) || 
      /TOTAL\s+PLANTILLAS/i.test(trimmed) ||
      /\(KG\)/i.test(trimmed) ||
      /CONTENEDORES/i.test(trimmed) ||
      /BULTOS/i.test(trimmed) ||
      /PESO\s*(?:BRUTO|NETO)?/i.test(trimmed) ||
      /MATRICULA|EXPEDICION|CONDUCTOR/i.test(trimmed) ||
      /REFERENCIA\s+QUANT/i.test(trimmed)
    ) {
      continue;
    }

    let parsedCandidate: {
      orderNumber?: string;
      ref: string;
      qty: number;
      desc: string;
    } | null = null;

    // Pattern A: Standard EPP / Delivery row with optional 10-digit order prefix:
    // [Order optional] [RefCode] [Description] [Quantity] [Price optional]
    const matchA = trimmed.match(rowRegex);
    if (matchA) {
      let orderNum = matchA[1];
      let candRef = matchA[2].toUpperCase().trim();
      let rDesc = matchA[3].trim();
      const q = parseInt(matchA[4], 10);

      if (q > 0 && !invalidRefWords.has(candRef)) {
        // If order number was captured as ref:
        if (/^55\d{8}$/.test(candRef)) {
          orderNum = candRef;
          const descParts = rDesc.split(/\s+/);
          const pRef = descParts[0]?.toUpperCase().trim();
          if (pRef && /^[A-Z0-9]{8,12}$/i.test(pRef) && !invalidRefWords.has(pRef)) {
            candRef = pRef;
            rDesc = descParts.slice(1).join(" ");
            parsedCandidate = { orderNumber: orderNum, ref: candRef, qty: q, desc: rDesc };
          }
        } else {
          parsedCandidate = { orderNumber: orderNum, ref: candRef, qty: q, desc: rDesc };
        }
      }
    }

    // Pattern B: Proforma / ZF format with currency prices:
    // [Ref] [optional G_Remessa] [optional Date] [Description] [Quantity] [Price €] [Total €]
    if (!parsedCandidate) {
      const pCurrPair =
        /^([A-Z0-9]{8,12})\s+(?:(\d{8,12})\s+)?(?:\d{2}[\/\-]\d{2}[\/\-]\d{4}\s+)?(.+?)\s+(\d{1,5})\s+(\d+(?:[.,]\d{1,4})?\s*(?:€|EUR))\s+(\d+(?:[.,]\d{1,4})?\s*(?:€|EUR))$/i;
      const mCurr = trimmed.match(pCurrPair);
      if (mCurr && !invalidRefWords.has(mCurr[1].toUpperCase().trim())) {
        parsedCandidate = {
          ref: mCurr[1].toUpperCase().trim(),
          qty: parseInt(mCurr[4], 10),
          desc: mCurr[3].trim(),
          orderNumber: mCurr[2]
        };
      }
    }

    // Pattern C: Proforma format with decimal prices without currency:
    if (!parsedCandidate) {
      const pDecPair =
        /^([A-Z0-9]{8,12})\s+(?:(\d{8,12})\s+)?(?:\d{2}[\/\-]\d{2}[\/\-]\d{4}\s+)?(.+?)\s+(\d{1,5})\s+(\d+[.,]\d{1,4})\s+(\d+[.,]\d{1,4})$/i;
      const mDec = trimmed.match(pDecPair);
      if (mDec && !invalidRefWords.has(mDec[1].toUpperCase().trim())) {
        parsedCandidate = {
          ref: mDec[1].toUpperCase().trim(),
          qty: parseInt(mDec[4], 10),
          desc: mDec[3].trim(),
          orderNumber: mDec[2]
        };
      }
    }

    if (parsedCandidate) {
      const { orderNumber, ref: invoiceRef, qty: quantity, desc: rawDesc } = parsedCandidate;
      if (invalidRefWords.has(invoiceRef) || quantity <= 0) continue;

      const dedupeKey = `${invoiceRef}-${quantity}-${rawDesc.slice(0, 10)}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      // Resolve SW -> BEZEL mapping
      const bezelBom = resolveBezelDeduction(invoiceRef);

      let associatedBezelRef: string | undefined;
      let isBezelDeduction = false;

      if (bezelBom) {
        associatedBezelRef = bezelBom.bezelRef;
        isBezelDeduction = true;
      } else if (bezelRefMap.has(invoiceRef)) {
        // Direct bezel reference was invoiced
        associatedBezelRef = invoiceRef;
        isBezelDeduction = true;
      }

      // Check available Stock 2 for the resolved bezel
      const bRef = associatedBezelRef ? bezelRefMap.get(associatedBezelRef) : undefined;
      const catalogFound = !!bRef;
      const availableS2 = bRef ? (bRef.stock2 || 0) : 0;

      let status: ParsedBezelDeliveryItem["status"] = "ready";
      if (!isBezelDeduction) {
        status = "no_bezel_needed";
      } else if (!catalogFound) {
        status = "not_in_catalog";
      } else if (availableS2 < quantity) {
        status = "insufficient_stock";
      }

      parsedItems.push({
        id: `bz-item-${Date.now()}-${parsedItems.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
        orderNumber,
        invoiceRef,
        description: rawDesc,
        quantity,
        associatedBezelRef,
        targetStock: "Stock 2",
        isBezelDeduction,
        currentAvailableStock: availableS2,
        catalogFound,
        status,
        included: isBezelDeduction // default include only items with bezel deduction
      });
    }
  }

  const totalQuantity = parsedItems.reduce((sum, it) => sum + it.quantity, 0);
  const totalBezelQuantity = parsedItems
    .filter((it) => it.isBezelDeduction && it.included)
    .reduce((sum, it) => sum + it.quantity, 0);

  return {
    invoiceNumber,
    invoiceDate,
    totalQuantity,
    totalBezelQuantity,
    items: parsedItems
  };
}
