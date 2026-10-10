import * as pdfjsLib from "pdfjs-dist";
import { 
  resolveMeshDeduction, 
  STEERING_WHEEL_MESH_MAPPINGS, 
  PRECOSIDO_MESH_MAPPINGS,
  NON_MESH_STEERING_WHEEL_REFERENCES,
  SteeringWheelMeshMapping,
  PrecosidoMeshMapping
} from "../data/meshBOMMapping";
import { Reference } from "../types";

// Configure worker URL
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

export interface ParsedDeliveryLineItem {
  id?: string;
  orderNumber?: string;
  invoiceRef: string;
  description: string;
  customer?: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  // BOM Resolved Mesh details
  associatedMeshRef?: string;
  targetStock: "Stock 2" | "Stock 3";
  isMeshDeduction: boolean; // true if this item deducts a mesh from inventory
  currentAvailableStock?: number;
  catalogFound: boolean;
  status: "ready" | "no_mesh_needed" | "insufficient_stock" | "not_in_catalog";
  included?: boolean;
}

export interface ParsedDeliveryDocument {
  invoiceNumber: string;
  invoiceDate?: string;
  deliveryType: "STEERING WHEELS" | "PRECOSIDO";
  targetStock: "Stock 2" | "Stock 3";
  rawCategoryText: string;
  transportVia?: string;
  totalQuantity: number;
  totalAmount?: number;
  items: ParsedDeliveryLineItem[];
}

/**
 * Fast lookup for authoritative 23 Steering Wheel references.
 */
const SW_MAPPING_MAP = new Map<string, SteeringWheelMeshMapping>();
for (const m of STEERING_WHEEL_MESH_MAPPINGS) {
  SW_MAPPING_MAP.set(m.steeringWheelRef.trim().toUpperCase(), m);
}

/**
 * Fast lookup for Precosido references.
 */
const PRECOSIDO_MAPPING_MAP = new Map<string, PrecosidoMeshMapping>();
for (const m of PRECOSIDO_MESH_MAPPINGS) {
  PRECOSIDO_MAPPING_MAP.set(m.plantillaRef.trim().toUpperCase(), m);
}

/**
 * Automatically infers automotive OEM customer from reference code, description, and mesh link.
 */
export function resolveOEMCustomer(
  refCode: string,
  desc?: string,
  meshRef?: string,
  catalogRefs?: Reference[]
): string {
  const upperRef = (refCode || "").toUpperCase().trim();
  const upperDesc = (desc || "").toUpperCase().trim();
  const upperMesh = (meshRef || "").toUpperCase().trim();

  // 1. Direct match in catalog references
  if (catalogRefs && catalogRefs.length > 0) {
    const direct = catalogRefs.find((r) => r.code?.toUpperCase().trim() === upperRef);
    if (direct?.customer && direct.customer.trim() && direct.customer.toUpperCase() !== "GENERAL") {
      return direct.customer.trim().toUpperCase();
    }
    if (upperMesh) {
      const meshCat = catalogRefs.find((r) => r.code?.toUpperCase().trim() === upperMesh);
      if (meshCat?.customer && meshCat.customer.trim() && meshCat.customer.toUpperCase() !== "GENERAL") {
        return meshCat.customer.trim().toUpperCase();
      }
    }
  }

  // 2. High-precision OEM project signatures
  if (upperDesc.includes("VOLVO") || upperDesc.includes("V316") || upperDesc.includes("SPA")) {
    return "VOLVO";
  }
  if (upperDesc.includes("PEUGEOT")) {
    return "PEUGEOT";
  }
  if (upperDesc.includes("OPEL") || upperMesh === "A025M750B" || upperMesh === "A025M751B") {
    return "OPEL";
  }
  if (
    upperDesc.includes("STELLANTIS") || 
    upperDesc.includes("CITROEN") || 
    upperDesc.includes("CR3") || 
    upperDesc.includes("OV64") || 
    upperDesc.includes("K9") || 
    upperDesc.includes("OVCTF") ||
    upperMesh === "R000J600C" ||
    upperMesh === "R000J601B" ||
    upperMesh === "R000J610A" ||
    upperMesh === "R002W094A" ||
    upperMesh === "A026K122B"
  ) {
    return "STELLANTIS";
  }
  if (
    upperDesc.includes("FORD") || 
    upperDesc.includes("B479") || 
    upperDesc.includes("C519") || 
    upperDesc.includes("CX482") ||
    upperMesh === "34340679A" ||
    upperMesh === "34340681C" ||
    upperMesh === "34340687B" ||
    upperMesh === "34340689D"
  ) {
    return "FORD";
  }
  if (
    upperDesc.includes("BJA") || 
    upperDesc.includes("ALPINE") || 
    upperDesc.includes("P64") || 
    upperDesc.includes("P74") || 
    upperDesc.includes("RENAULT") || 
    upperDesc.includes("DACIA") ||
    upperMesh === "A026L577A" ||
    upperMesh === "34364719C"
  ) {
    return upperDesc.includes("ALPINE") ? "ALPINE" : "RENAULT";
  }
  if (
    upperDesc.includes("P33B") || 
    upperDesc.includes("PZ1D") || 
    upperDesc.includes("NISSAN") || 
    upperMesh === "34316011B" || 
    upperMesh === "R000B630A" || 
    upperMesh === "R000B629B"
  ) {
    return "NISSAN";
  }

  // 3. Prefix-based automotive standard mapping
  if (upperRef.startsWith("343")) return "FORD";
  if (upperRef.startsWith("A0")) return "RENAULT";
  if (upperRef.startsWith("R0")) return "STELLANTIS";

  return "GENERAL";
}

interface RawTextItem {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * Adaptive Y-clustering algorithm for PDF lines.
 * Groups visual elements on the same horizontal row even if minor baseline shifts exist (tolerance 4.5pt).
 * Within each line, items are ordered from left to right by their X coordinate.
 */
function clusterTextItemsIntoLines(items: RawTextItem[], tolerance: number = 4.5): { lineStr: string; items: RawTextItem[] }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineClusters: { ySum: number; count: number; items: RawTextItem[] }[] = [];

  for (const item of sorted) {
    let matched = false;
    for (const cluster of lineClusters) {
      const avgY = cluster.ySum / cluster.count;
      if (Math.abs(item.y - avgY) <= tolerance) {
        cluster.items.push(item);
        cluster.ySum += item.y;
        cluster.count += 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      lineClusters.push({ ySum: item.y, count: 1, items: [item] });
    }
  }

  return lineClusters.map((cluster) => {
    cluster.items.sort((a, b) => a.x - b.x);
    const lineStr = cluster.items
      .map((i) => i.text.trim())
      .filter(Boolean)
      .join(" ");
    return { lineStr, items: cluster.items };
  });
}

/**
 * Extracts plain text lines and full text from a PDF File or ArrayBuffer.
 */
async function extractLinesFromPDF(fileOrBuffer: File | ArrayBuffer): Promise<{
  allLines: string[];
  fullText: string;
}> {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const rawItems: RawTextItem[] = [];
    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      rawItems.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        height: item.height || 9
      });
    }

    const pageLines = clusterTextItemsIntoLines(rawItems, 4.5);
    for (const lineObj of pageLines) {
      if (lineObj.lineStr.trim()) {
        allLines.push(lineObj.lineStr.trim());
      }
    }
  }

  return {
    allLines,
    fullText: allLines.join("\n")
  };
}

/**
 * Parses numeric price string (handles "4,9776", "4.9776", "388,25 €", etc.)
 */
function parsePrice(token: string): number | undefined {
  if (!token) return undefined;
  const clean = token.replace(/[€$\sEUR]/gi, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? undefined : num;
}

/**
 * High-accuracy quantity and price extractor for a line containing an automotive reference.
 */
function extractQuantityAndDetails(
  lineStr: string,
  matchedRefCode: string
): {
  quantity: number;
  orderNumber?: string;
  unitPrice?: number;
  totalPrice?: number;
  cleanDescription?: string;
} {
  const tokens = lineStr.trim().split(/\s+/);
  
  // Find where the reference is positioned in tokens
  let refIdx = -1;
  const cleanCode = matchedRefCode.toUpperCase();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (tok === cleanCode) {
      refIdx = i;
      break;
    }
  }

  // 1. Order Number detection (typically an 8-12 digit integer)
  let orderNumber: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const rawTok = tokens[i].trim();
    if (/^\d{8,12}$/.test(rawTok) || /^55\d{6,10}$/.test(rawTok)) {
      orderNumber = rawTok;
      break;
    }
  }

  // Tokens to analyze for quantity and pricing (prefer tokens after reference if refIdx found)
  const candidateTokens = refIdx >= 0 ? tokens.slice(refIdx + 1) : tokens;
  const remainingTokens = [...candidateTokens].filter((t) => t !== orderNumber);

  let quantity = 0;
  let unitPrice: number | undefined;
  let totalPrice: number | undefined;

  const isCurrency = (t: string) => /^(?:€|EUR|\$|USD)$/i.test(t);
  const isUnit = (t: string) => /^(?:PCS|PC|UN|UNIDADES|UNIDADE|PZ|ST|U|PCE|PIEZAS|PIEZA)$/i.test(t);

  // Strategy A: Look for explicit Unit marker (e.g., "120 UN", "120 PCS")
  for (let i = 0; i < remainingTokens.length; i++) {
    if (isUnit(remainingTokens[i])) {
      if (i > 0) {
        const prevClean = remainingTokens[i - 1].replace(/[^0-9]/g, "");
        const val = parseInt(prevClean, 10);
        if (!isNaN(val) && val > 0 && val < 50000) {
          quantity = val;
          // Remove qty & unit from tail tokens
          remainingTokens.splice(i - 1, 2);
          break;
        }
      }
    }
  }

  // Strategy B: Parse from right-to-left for prices and quantity
  const tailTokens = [...remainingTokens];

  // Pop trailing currency symbol
  while (tailTokens.length > 0 && isCurrency(tailTokens[tailTokens.length - 1])) {
    tailTokens.pop();
  }

  // Check if rightmost token is Total Price (e.g., "1.740,00" or "597,31")
  if (tailTokens.length > 0) {
    const lastTok = tailTokens[tailTokens.length - 1];
    const parsed = parsePrice(lastTok);
    if (parsed !== undefined && /[.,]/.test(lastTok)) {
      totalPrice = parsed;
      tailTokens.pop();
      while (tailTokens.length > 0 && isCurrency(tailTokens[tailTokens.length - 1])) {
        tailTokens.pop();
      }
    }
  }

  // Check if next rightmost token is Unit Price (e.g., "14,50" or "4.9776")
  if (tailTokens.length > 0) {
    const candTok = tailTokens[tailTokens.length - 1];
    const parsed = parsePrice(candTok);
    if (parsed !== undefined && /[.,]/.test(candTok)) {
      unitPrice = parsed;
      tailTokens.pop();
      while (tailTokens.length > 0 && isCurrency(tailTokens[tailTokens.length - 1])) {
        tailTokens.pop();
      }
    }
  }

  // Pop any unit if still at tail
  while (tailTokens.length > 0 && isUnit(tailTokens[tailTokens.length - 1])) {
    tailTokens.pop();
  }

  // If quantity was not resolved by unit marker, rightmost integer is Quantity
  if (quantity <= 0 && tailTokens.length > 0) {
    const lastTok = tailTokens[tailTokens.length - 1].replace(/[^0-9]/g, "");
    const qVal = parseInt(lastTok, 10);
    if (!isNaN(qVal) && qVal > 0 && qVal < 50000) {
      quantity = qVal;
      tailTokens.pop();
    }
  }

  // Fallback: search backwards for any integer between 1 and 50000
  if (quantity <= 0) {
    for (let k = tailTokens.length - 1; k >= 0; k--) {
      const qVal = parseInt(tailTokens[k].replace(/[^0-9]/g, ""), 10);
      if (!isNaN(qVal) && qVal > 0 && qVal < 50000) {
        quantity = qVal;
        tailTokens.splice(k, 1);
        break;
      }
    }
  }

  // Fallback 2: Check before reference if tokens after reference had no quantity
  if (quantity <= 0 && refIdx > 0) {
    for (let k = refIdx - 1; k >= 0; k--) {
      const tok = tokens[k];
      if (tok === orderNumber) continue;
      const qVal = parseInt(tok.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(qVal) && qVal > 0 && qVal < 50000) {
        quantity = qVal;
        break;
      }
    }
  }

  const cleanDescription = tailTokens.join(" ").trim();

  return {
    quantity,
    orderNumber,
    unitPrice,
    totalPrice,
    cleanDescription
  };
}

/**
 * Checks whether a line is a header or trailer to be skipped.
 */
function isHeaderOrTrailerLine(line: string): boolean {
  const trimmed = line.trim().toUpperCase();
  if (!trimmed) return true;

  // Skip table header lines
  if (
    /^(?:ORDER|REF|REFERENCE|REFERENCIA|PART\s*NUMBER|DESCRIP|DESIGNATION|LIBELLE|QUANT|QTE|QTY|CANTIDAD|UNIT|PRECIO|PRICE|TOTAL\s*H\.T|IMPORTE)/i.test(trimmed) ||
    /ORDER\s+REF\s+DESCRIP/i.test(trimmed) ||
    /REF\.\s+CLIENTE/i.test(trimmed) ||
    /ORDEN\s+DE\s+COMPRA/i.test(trimmed)
  ) {
    return true;
  }

  // Skip trailer / summary lines
  if (
    /^(?:TOTAL\s+VOLANTES|TOTAL\s+PLANTILLAS|TOTAL\s+GERAL|TOTAL\s+FACTURA|TOTAL\s+ALBAR[AÁ]N|TOTAL\s+H\.T|BASE\s+IMPONIBLE|I\.V\.A|PESO\s+BRUTO|PESO\s+NETO|N[ºO°]\s+DE\s+BULTOS|BULTOS|CONTENEDORES|PALETS|PALLETS|CARGADOR|DESTINATARIO|CONDUCTOR|MATR[IÍ]CULA|VALOR\s+TRANSPORTE|OBSERVACIONES|EXPEDICION\s+N)/i.test(trimmed) ||
    /\(KG\)/i.test(trimmed) ||
    /ZONE\s+FRANCHE/i.test(trimmed) ||
    /CONDICIONES\s+DE\s+PAGO/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Parses an EPP Natur / OEM delivery PDF invoice with 100% precision.
 * 
 * Strict Accuracy Rules (as specified by user):
 * 1. For STEERING WHEELS delivery invoices:
 *    - ONLY the 23 verified references from STEERING_WHEEL_MESH_MAPPINGS have meshes.
 *    - All non-mesh references (e.g. A026K881A, A028L046A, 34358454B, R002A665A, A023V830B,
 *      A023V834B, A023V842C, R003A514A, R003Y829A) and any other references outside the 23 list
 *      ARE COMPLETELY IGNORED.
 *    - Stock Deduction: Stock 3.
 * 
 * 2. For PRECOSIDO delivery invoices:
 *    - Only verified Precosido references from PRECOSIDO_MESH_MAPPINGS are mapped.
 *    - Stock Deduction: Stock 2.
 */
export async function parseDeliveryPDF(
  file: File,
  catalogReferences: Reference[] = []
): Promise<ParsedDeliveryDocument> {
  const { allLines, fullText } = await extractLinesFromPDF(file);

  // 1. Detect Invoice Number (e.g. MPT2332, MPT2327, MPT-2286, etc.)
  let invoiceNumber = "";
  const invMatch =
    fullText.match(/MPT[\-_]?\s*(\d{3,6}(?:[\-_][A-Za-z0-9]+)?)/i) ||
    fullText.match(/(?:INVOICE|FACTURA|DELIVERY\s*NOTE|ALBAR[AÁ]N|BL|EXPEDICI[OÓ]N)\s*(?:N[ºO°]|NO|NUMBER|#)?\s*[:\s]?\s*([A-Z0-9\-_]+)/i);

  if (invMatch) {
    invoiceNumber = invMatch[1] ? invMatch[1].trim() : invMatch[0].trim();
  } else {
    invoiceNumber = `MPT-${Date.now().toString().slice(-6)}`;
  }

  // 2. Detect Invoice Date
  let invoiceDate: string | undefined;
  const dateMatch =
    fullText.match(/\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/) ||
    fullText.match(/\b(\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})\b/);
  if (dateMatch) {
    invoiceDate = dateMatch[1];
  }

  // Build catalog fast-lookup map for mesh available stocks
  const catalogMap = new Map<string, Reference>();
  catalogReferences.forEach((r) => {
    if (r.code) catalogMap.set(r.code.toUpperCase().trim(), r);
    if (r.id) catalogMap.set(r.id.toUpperCase().trim(), r);
  });

  const parsedItems: ParsedDeliveryLineItem[] = [];

  // Determine overall document intent:
  // Is this a Precosido invoice or a Steering Wheels invoice?
  const isExplicitPrecosidoDoc = /TOTAL\s+PLANTILLAS|PLANTILLAS\s+PRECOSIDAS|PLANTILLAS/i.test(fullText) && 
    !/TOTAL\s+VOLANTES|VOLANTES/i.test(fullText);

  // Process line by line
  for (const line of allLines) {
    if (isHeaderOrTrailerLine(line)) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Compact representation for substring matching (removes spaces and hyphens)
    const compactLine = trimmed.toUpperCase().replace(/[\s\-_.]/g, "");

    // Rule 1: STRICT NON-MESH FILTER
    // If the line contains any reference known to NOT have meshes, IGNORE IT COMPLETELY.
    let isNonMesh = false;
    for (const nonMeshRef of NON_MESH_STEERING_WHEEL_REFERENCES) {
      const cleanNonMesh = nonMeshRef.replace(/[\s\-_.]/g, "");
      if (compactLine.includes(cleanNonMesh)) {
        isNonMesh = true;
        break;
      }
    }
    if (isNonMesh) {
      // Ignored per user explicit instruction: "if u see any reference outside this list just ignore it okey"
      continue;
    }

    // Rule 2: Check Steering Wheel BOM (23 Verified References with Meshes)
    let matchedSW: SteeringWheelMeshMapping | undefined;
    for (const sw of STEERING_WHEEL_MESH_MAPPINGS) {
      const cleanSW = sw.steeringWheelRef.toUpperCase().replace(/[\s\-_.]/g, "");
      if (compactLine.includes(cleanSW)) {
        matchedSW = sw;
        break;
      }
    }

    // Rule 3: Check Precosido BOM (Verified Plantillas with Meshes)
    let matchedPrec: PrecosidoMeshMapping | undefined;
    if (!matchedSW) {
      for (const prec of PRECOSIDO_MESH_MAPPINGS) {
        const cleanPrec = prec.plantillaRef.toUpperCase().replace(/[\s\-_.]/g, "");
        if (compactLine.includes(cleanPrec)) {
          matchedPrec = prec;
          break;
        }
      }
    }

    // If the line contains NEITHER a verified SW nor Precosido reference:
    // IGNORE IT COMPLETELY!
    if (!matchedSW && !matchedPrec) {
      continue;
    }

    // We have a verified match! Extract details
    const matchedRefCode = matchedSW ? matchedSW.steeringWheelRef : matchedPrec!.plantillaRef;
    const meshRef = matchedSW ? matchedSW.meshRef : matchedPrec!.meshRef;
    const targetStock: "Stock 2" | "Stock 3" = matchedSW ? "Stock 3" : "Stock 2";
    const defaultDesc = matchedSW ? matchedSW.description : matchedPrec!.description;

    const { quantity, orderNumber, unitPrice, totalPrice, cleanDescription } =
      extractQuantityAndDetails(trimmed, matchedRefCode);

    // If no valid positive quantity was detected, skip this malformed line
    if (quantity <= 0) {
      continue;
    }

    // Resolve available stock in catalog for the associated mesh
    const catMesh = catalogMap.get(meshRef.toUpperCase().trim());
    const catalogFound = !!catMesh;
    const availableStock = catMesh
      ? (targetStock === "Stock 3" ? (catMesh.stock3 || 0) : (catMesh.stock2 || 0))
      : 0;

    let status: ParsedDeliveryLineItem["status"] = "ready";
    if (!catalogFound) {
      status = "not_in_catalog";
    } else if (availableStock < quantity) {
      status = "insufficient_stock";
    }

    const customer = resolveOEMCustomer(matchedRefCode, cleanDescription || defaultDesc, meshRef, catalogReferences);

    parsedItems.push({
      id: `item-${parsedItems.length + 1}-${matchedRefCode}`,
      orderNumber,
      invoiceRef: matchedRefCode,
      description: cleanDescription || defaultDesc,
      customer,
      quantity,
      unitPrice,
      totalPrice,
      associatedMeshRef: meshRef,
      targetStock,
      isMeshDeduction: true,
      currentAvailableStock: availableStock,
      catalogFound,
      status,
      included: true
    });
  }

  // 3. Document-Level Delivery Type detection
  const swCount = parsedItems.filter((i) => i.targetStock === "Stock 3").length;
  const precCount = parsedItems.filter((i) => i.targetStock === "Stock 2").length;

  let deliveryType: "STEERING WHEELS" | "PRECOSIDO" = "STEERING WHEELS";
  if (precCount > swCount || isExplicitPrecosidoDoc) {
    deliveryType = "PRECOSIDO";
  } else {
    deliveryType = "STEERING WHEELS";
  }

  const defaultTargetStock: "Stock 2" | "Stock 3" = deliveryType === "PRECOSIDO" ? "Stock 2" : "Stock 3";
  const totalQuantity = parsedItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = parsedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  return {
    invoiceNumber,
    invoiceDate,
    deliveryType,
    targetStock: defaultTargetStock,
    rawCategoryText: deliveryType === "PRECOSIDO" 
      ? "TOTAL PLANTILLAS (Precosido)" 
      : "TOTAL VOLANTES (Steering Wheels)",
    items: parsedItems,
    totalQuantity,
    totalAmount: totalAmount > 0 ? totalAmount : undefined
  };
}
