import * as pdfjsLib from "pdfjs-dist";
import { Reference } from "../types";
import { getISOWeekCode } from "../utils/timeUtils";

// Configure worker URL
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

export interface ParsedScrapRowItem {
  id: string;
  reference: string;
  description: string;
  quantity: number;
  stock: "Stock 1" | "Stock 2" | "Stock 3";
  stock2Subtype?: "normal" | "disassembly";
  cola: "CON_COLA" | "SIN_COLA";
  statusDisplay: "CON COLA" | "SIN COLA";
  unitPrice?: number;
  totalPrice?: number;
  stock1Avail: number;
  stock2Avail: number;
  stock3Avail: number;
}

export interface ParsedScrapDocument {
  invoiceNumber: string;
  invoiceDate?: string;
  week: string;
  totalMeshQuantity: number;
  totalMeshRows: number;
  nonMeshRowsCount: number;
  items: ParsedScrapRowItem[];
  nonMeshItems: {
    reference: string;
    description: string;
    quantity: number;
  }[];
  allExtractedRows: {
    reference: string;
    description: string;
    conColaQty: number;
    sinColaQty: number;
    totalQty: number;
    unitPrice?: number;
    totalPrice?: number;
    isMesh: boolean;
  }[];
}

// Known mesh reference codes in the factory catalog
export const KNOWN_MESH_CODES = new Set([
  "34340681C",
  "34340689D",
  "34316011B",
  "R000B629B",
  "R000B630A",
  "A025M750B",
  "A025M751B",
  "R001W189B",
  "R000J601B",
  "R000J600C",
  "A026K122B",
  "R002W094A",
  "A026L577A",
  "34364719C",
  "R001L200A",
  "R000J610A",
  "R001F923A"
]);

/**
 * Checks whether a catalog reference or line description corresponds to a Mesh item
 */
export function isMeshItem(
  refCode: string,
  description: string,
  catalogReferences: Reference[] = []
): boolean {
  const upper = refCode.trim().toUpperCase();
  if (KNOWN_MESH_CODES.has(upper)) return true;

  const found = catalogReferences.find((r) => (r.code || "").toUpperCase() === upper);
  if (found) {
    if (found.materialType?.toLowerCase() === "mesh") return true;
    if (found.description && /MALLA|HEAT|HEATING/i.test(found.description)) return true;
  }

  // Description heuristics: Heating elements, Heating mats, Mallas calefactadas
  if (/MALLA\s+CALEFACTADA/i.test(description)) return true;
  if (/HEATING\s*ELEMENT/i.test(description)) return true;
  if (/HEAT\s*MAT/i.test(description)) return true;
  if (/HEATING[\s\-]HOD/i.test(description)) return true;
  if (/HEATING\s*MATERIAL/i.test(description)) return true;
  if (/MALLA\s+L74/i.test(description)) return true;
  if (/MALLA\s+HEATING/i.test(description)) return true;
  if (/MALLA\s+OVCTF/i.test(description)) return true;
  if (/^MALLA\b/i.test(description)) return true;

  return false;
}

interface TextItemPos {
  text: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Parses Scrap Return / Devolución PDF Invoices (e.g. MPT639-Dev)
 * Extracts meshes, duplicates rows when both SIN COLA and CON COLA are present,
 * and sets up interactive Stock selection rows.
 */
export async function parseScrapPDF(
  fileOrBuffer: File | ArrayBuffer,
  catalogReferences: Reference[] = []
): Promise<ParsedScrapDocument> {
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

  // 1. Detect Invoice Number (e.g. MPT639-Dev, MPT-639, DEV-2024, etc.)
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

  // 2. Detect Invoice Date & calculate ISO Week Code (e.g. W39)
  let invoiceDate: string | undefined;
  let week = getISOWeekCode();
  const dateMatch = fullPlainText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/) || fullPlainText.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
  if (dateMatch) {
    invoiceDate = dateMatch[1];
    try {
      let d = 1, m = 0, y = 2026;
      if (invoiceDate.includes("/") || invoiceDate.includes("-")) {
        const parts = invoiceDate.split(/[\/\-]/);
        if (parts[0].length === 4) {
          y = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10) - 1;
          d = parseInt(parts[2], 10);
        } else {
          d = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10) - 1;
          y = parseInt(parts[2], 10);
        }
        const dt = new Date(y, m, d);
        if (!isNaN(dt.getTime())) {
          week = getISOWeekCode(dt.toISOString());
        }
      }
    } catch {
      // fallback to current week
    }
  }

  // 3. Locate Table Headers & Column X Boundaries
  let xConCola = 450;
  let xSinCola = 550;
  let xTotalQty = 650;
  let foundHeaders = false;

  for (const line of allPageLines) {
    const textUpper = line.lineStr.toUpperCase();
    if ((textUpper.includes("COLA") || textUpper.includes("C.COLA") || textUpper.includes("S.COLA")) && 
        (textUpper.includes("REF") || textUpper.includes("CÓD") || textUpper.includes("COD") || textUpper.includes("TOTAL") || textUpper.includes("CANT"))) {
      
      // Examine each item or consecutive pairs
      for (let idx = 0; idx < line.items.length; idx++) {
        const item = line.items[idx];
        const nextItem = line.items[idx + 1];
        const combined = (item.text + " " + (nextItem?.text || "")).toUpperCase();

        if (combined.includes("CON COLA") || combined.includes("C/COLA") || combined.includes("C. COLA")) {
          xConCola = item.x;
          foundHeaders = true;
        } else if (combined.includes("SIN COLA") || combined.includes("S/COLA") || combined.includes("S. COLA")) {
          xSinCola = item.x;
          foundHeaders = true;
        } else if (item.text.toUpperCase() === "TOTAL" && item.x > 300) {
          xTotalQty = item.x;
        }
      }
      if (foundHeaders) break;
    }
  }

  const midConSin = (xConCola + xSinCola) / 2;

  // 4. Extract Line Items
  const allExtractedRows: ParsedScrapDocument["allExtractedRows"] = [];
  const generatedMeshRows: ParsedScrapRowItem[] = [];
  const nonMeshItems: ParsedScrapDocument["nonMeshItems"] = [];
  let nonMeshCount = 0;

  // Reference Pattern: 8 to 12 alphanumeric characters (e.g., 34316011B, A025M750B, R000B629B)
  const refCodeRegex = /^[A-Z0-9]{8,12}$/i;
  const skipWords = new Set(["SH", "TOTAL", "INVOICE", "RETURN", "DEVOLUCION", "DEVOLUCIÓN", "CANTIDAD", "PRECIO", "IMPORTE", "FECHA", "CLIENTE", "PROVEEDOR", "REFERENCIA", "DESCRIPCION", "DESCRIPCIÓN"]);

  for (let i = 0; i < allPageLines.length; i++) {
    const line = allPageLines[i];
    const items = line.items;
    if (items.length < 2) continue;

    // Find the reference code in the line (usually index 0, or index 1 if index 0 is a line number)
    let refCode = "";
    let refIndex = -1;

    for (let k = 0; k < Math.min(items.length, 3); k++) {
      const candidate = items[k].text.toUpperCase().trim();
      if (skipWords.has(candidate)) continue;

      // Check if it's directly in known mesh codes or catalog references
      if (KNOWN_MESH_CODES.has(candidate) || catalogReferences.some(r => r.code?.toUpperCase() === candidate)) {
        refCode = candidate;
        refIndex = k;
        break;
      }

      // Check standard 8-12 alphanumeric regex
      if (refCodeRegex.test(candidate) && !/^\d+$/.test(candidate)) {
        refCode = candidate;
        refIndex = k;
        break;
      }
    }

    if (!refCode || refIndex === -1) continue;

    // Remaining items: description and numeric columns
    const remainingItems = items.slice(refIndex + 1);
    const textTokens: string[] = [];
    const numTokens: { str: string; val: number; x: number; isFloat: boolean }[] = [];

    for (let k = 0; k < remainingItems.length; k++) {
      const it = remainingItems[k];
      const cleanNum = it.text.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
      const parsedNum = parseFloat(cleanNum);

      if (!isNaN(parsedNum) && /^\d+(?:[.,]\d+)?$/.test(it.text.replace(/\s+/g, ""))) {
        numTokens.push({
          str: it.text,
          val: parsedNum,
          x: it.x,
          isFloat: it.text.includes(",") || (it.text.includes(".") && parsedNum % 1 !== 0)
        });
      } else {
        textTokens.push(it.text);
      }
    }

    const description = textTokens.join(" ").trim();
    const lineTextUpper = line.lineStr.toUpperCase();

    // Check for inline status mention
    const hasConColaText = /CON\s+COLA|C\/COLA|CON-COLA/i.test(lineTextUpper);
    const hasSinColaText = /SIN\s+COLA|S\/COLA|SIN-COLA/i.test(lineTextUpper);

    // Integers vs float prices
    const intTokens = numTokens.filter((n) => !n.isFloat && Number.isInteger(n.val) && n.val >= 0);
    const floatTokens = numTokens.filter((n) => n.isFloat);

    let conColaQty = 0;
    let sinColaQty = 0;
    let totalQty = 0;

    if (intTokens.length >= 3) {
      // 3 integer columns: CON COLA, SIN COLA, TOTAL (or SIN, CON, TOTAL depending on header position)
      if (xSinCola < xConCola) {
        sinColaQty = intTokens[0].val;
        conColaQty = intTokens[1].val;
        totalQty = intTokens[2].val;
      } else {
        conColaQty = intTokens[0].val;
        sinColaQty = intTokens[1].val;
        totalQty = intTokens[2].val;
      }
      if (totalQty === 0 && (conColaQty > 0 || sinColaQty > 0)) {
        totalQty = conColaQty + sinColaQty;
      }
    } else if (intTokens.length === 2) {
      const q1 = intTokens[0];
      const q2 = intTokens[1];

      if (q1.val === q2.val) {
        // [qty, total] where qty === total
        totalQty = q1.val;
        if (hasConColaText && !hasSinColaText) {
          conColaQty = q1.val;
        } else if (hasSinColaText && !hasConColaText) {
          sinColaQty = q1.val;
        } else if (q1.x >= midConSin) {
          if (xSinCola > xConCola) sinColaQty = q1.val;
          else conColaQty = q1.val;
        } else {
          if (xConCola < xSinCola) conColaQty = q1.val;
          else sinColaQty = q1.val;
        }
      } else {
        // Two distinct quantities: CON and SIN
        if (xSinCola < xConCola) {
          sinColaQty = q1.val;
          conColaQty = q2.val;
        } else {
          conColaQty = q1.val;
          sinColaQty = q2.val;
        }
        totalQty = conColaQty + sinColaQty;
      }
    } else if (intTokens.length === 1) {
      const q = intTokens[0];
      totalQty = q.val;
      if (hasSinColaText && !hasConColaText) {
        sinColaQty = q.val;
      } else if (hasConColaText && !hasSinColaText) {
        conColaQty = q.val;
      } else if (q.x >= midConSin) {
        if (xSinCola > xConCola) sinColaQty = q.val;
        else conColaQty = q.val;
      } else {
        if (xConCola < xSinCola) conColaQty = q.val;
        else sinColaQty = q.val;
      }
    } else if (numTokens.length > 0) {
      totalQty = Math.round(numTokens[0].val);
      if (hasSinColaText) sinColaQty = totalQty;
      else conColaQty = totalQty;
    }

    const unitPrice = floatTokens.length > 0 ? floatTokens[0].val : undefined;
    const totalPrice = floatTokens.length > 1 ? floatTokens[1].val : undefined;

    const isMesh = isMeshItem(refCode, description, catalogReferences);

    allExtractedRows.push({
      reference: refCode,
      description,
      conColaQty,
      sinColaQty,
      totalQty,
      unitPrice,
      totalPrice,
      isMesh
    });

    if (!isMesh) {
      nonMeshCount++;
      nonMeshItems.push({
        reference: refCode,
        description,
        quantity: totalQty > 0 ? totalQty : (conColaQty + sinColaQty)
      });
      continue;
    }

    // Look up live inventory balances
    const catRef = catalogReferences.find((r) => (r.code || "").toUpperCase() === refCode.toUpperCase());
    const stock1Avail = catRef?.stock1 ?? 0;
    const stock2Avail = catRef?.stock2 ?? 0;
    const stock3Avail = catRef?.stock3 ?? 0;

    // WORKFLOW RULE: Duplicate rows if the reference has some SIN COLA and some CON COLA
    let rowIdx = 1;

    // 1. If SIN COLA quantity > 0 -> Add SIN COLA row
    if (sinColaQty > 0) {
      generatedMeshRows.push({
        id: `${refCode}-sin-${allExtractedRows.length}-${rowIdx++}`,
        reference: refCode,
        description,
        quantity: sinColaQty,
        stock: "Stock 2", // Default to S2
        stock2Subtype: "normal",
        cola: "SIN_COLA",
        statusDisplay: "SIN COLA",
        unitPrice,
        totalPrice,
        stock1Avail,
        stock2Avail,
        stock3Avail
      });
    }

    // 2. If CON COLA quantity > 0 -> Add CON COLA row
    if (conColaQty > 0) {
      generatedMeshRows.push({
        id: `${refCode}-con-${allExtractedRows.length}-${rowIdx++}`,
        reference: refCode,
        description,
        quantity: conColaQty,
        stock: "Stock 2", // Default to S2
        stock2Subtype: "normal",
        cola: "CON_COLA",
        statusDisplay: "CON COLA",
        unitPrice,
        totalPrice,
        stock1Avail,
        stock2Avail,
        stock3Avail
      });
    }

    // 3. Fallback if both were 0 but totalQty > 0
    if (sinColaQty === 0 && conColaQty === 0 && totalQty > 0) {
      const colaStatus = hasSinColaText ? "SIN_COLA" : "CON_COLA";
      generatedMeshRows.push({
        id: `${refCode}-tot-${allExtractedRows.length}-${rowIdx++}`,
        reference: refCode,
        description,
        quantity: totalQty,
        stock: "Stock 2",
        stock2Subtype: "normal",
        cola: colaStatus,
        statusDisplay: colaStatus === "SIN_COLA" ? "SIN COLA" : "CON COLA",
        unitPrice,
        totalPrice,
        stock1Avail,
        stock2Avail,
        stock3Avail
      });
    }
  }

  const totalMeshQty = generatedMeshRows.reduce((acc, r) => acc + r.quantity, 0);

  return {
    invoiceNumber,
    invoiceDate,
    week,
    totalMeshQuantity: totalMeshQty,
    totalMeshRows: generatedMeshRows.length,
    nonMeshRowsCount: nonMeshCount,
    items: generatedMeshRows,
    nonMeshItems,
    allExtractedRows
  };
}
