import * as pdfjsLib from "pdfjs-dist";
import { resolveMeshDeduction } from "../data/meshBOMMapping";
import { Reference } from "../types";

// Configure worker URL
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

export interface ParsedDeliveryLineItem {
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
}

/**
 * Automatically infers real automotive OEM customer (RENAULT, STELLANTIS, FORD, VOLVO, OPEL, NISSAN)
 * from reference code, description, and BOM mesh links.
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
 * Parses an EPP Natur delivery PDF invoice.
 * Automatically identifies whether it's a Steering Wheel or Precosido delivery,
 * extracts line items and resolves the associated mesh to deduct.
 */
export async function parseDeliveryPDF(
  file: File,
  catalogReferences: Reference[]
): Promise<ParsedDeliveryDocument> {
  const lines = await extractLinesFromPDF(file);
  const fullText = lines.join("\n");

  // 1. Detect Invoice Number (e.g. MPT2332, MPT2327)
  let invoiceNumber = "";
  const invMatch = fullText.match(/MPT\d{3,6}/i) || 
                   fullText.match(/INVOICE\s*(?:Nº|NO|NUMBER)?\s*[:\s]?\s*([A-Z0-9\-_]+)/i);
  if (invMatch) {
    invoiceNumber = invMatch[1] ? invMatch[1].trim() : invMatch[0].trim();
  } else {
    invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  }

  // 2. Detect Invoice Date
  let invoiceDate: string | undefined;
  const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (dateMatch) {
    invoiceDate = dateMatch[1];
  }

  // 3. Detect Delivery Type: Steering Wheel (SW -> Stock 3) vs Precosido (Plantillas -> Stock 2)
  const isPrecosido = /PLANTILLA|PRECOSID/i.test(fullText) && !/TOTAL\s*VOLANTES/i.test(fullText);
  const deliveryType: "STEERING WHEELS" | "PRECOSIDO" = isPrecosido ? "PRECOSIDO" : "STEERING WHEELS";
  const defaultTargetStock: "Stock 2" | "Stock 3" = isPrecosido ? "Stock 2" : "Stock 3";

  // Catalog lookup map
  const catalogMap = new Map<string, Reference>();
  catalogReferences.forEach((r) => {
    if (r.code) catalogMap.set(r.code.toUpperCase().trim(), r);
    if (r.id) catalogMap.set(r.id.toUpperCase().trim(), r);
  });

  // 4. Extract Line Items
  // An item line typically starts with an Order number (e.g., 5500231897), followed by a Reference code.
  // Example line:
  // "5500231897 A026K881A BJA-PH2 Tep1 78 4,9776 € 388,25"
  // Or standalone lines matching ref and quantity.
  const parsedItems: ParsedDeliveryLineItem[] = [];

  // Regex patterns
  // Matches: [Order optional] [RefCode] [Description] [Quantity] [Unit Price optional]
  const rowRegex = /(?:(\d{8,12})\s+)?([A-Z0-9]{8,12})\s+(.+?)\s+(\d{1,5})(?:\s+[\d.,]+)?(?:\s*€)?(?:\s+[\d.,]+)?$/i;

  // Words that can never be part references (metadata, headers, footers, shipment data)
  const invalidRefWords = new Set([
    "STEERING", "WHEELS", "VOLANTES", "PLANTILLAS", "CONTENEDORES", 
    "TOTAL", "MARRUECOS", "PORTUGAL", "TANGER", "BULTOS", "PESO", 
    "BRUTO", "NETO", "PALETS", "PALLETS", "EXPEDICION", "MATRICULA", 
    "CONDUCTOR", "ALBARAN", "CARGADOR", "DESTINATARIO", "TRANSPORTE",
    "OBSERVACIONES", "CLIENTE", "PROVEEDOR", "FECHA", "HORA"
  ]);

  for (const line of lines) {
    // Skip headers, footers, weight and summary rows
    if (
      /ORDER\s+REF/i.test(line) || 
      /TOTAL\s+H\.T/i.test(line) || 
      /TOTAL\s+VOLANTES/i.test(line) || 
      /TOTAL\s+PLANTILLAS/i.test(line) ||
      /\(KG\)/i.test(line) ||
      /CONTENEDORES/i.test(line) ||
      /BULTOS/i.test(line) ||
      /PESO\s*(?:BRUTO|NETO)?/i.test(line) ||
      /MATRICULA|EXPEDICION|CONDUCTOR/i.test(line)
    ) {
      continue;
    }

    const match = line.match(rowRegex);
    if (match) {
      let orderNumber = match[1];
      let invoiceRef = match[2].toUpperCase().trim();
      let rawDesc = match[3].trim();
      const quantity = parseInt(match[4], 10);

      if (isNaN(quantity) || quantity <= 0) continue;

      // Filter out false positive keyword references
      if (invalidRefWords.has(invoiceRef)) continue;

      // If the 10-digit order number (e.g. 5500231898) was captured as invoiceRef,
      // extract the real part code from the beginning of description
      if (/^55\d{8}$/.test(invoiceRef)) {
        orderNumber = invoiceRef;
        const descParts = rawDesc.split(/\s+/);
        const potentialRef = descParts[0]?.toUpperCase().trim();
        if (potentialRef && /^[A-Z0-9]{8,12}$/i.test(potentialRef) && !invalidRefWords.has(potentialRef)) {
          invoiceRef = potentialRef;
          rawDesc = descParts.slice(1).join(" ");
        } else {
          continue;
        }
      }

      // Filter out false positives (e.g., telephone numbers, weights, or postal codes)
      if (invalidRefWords.has(invoiceRef)) continue;

      // Resolve BOM Mesh
      const bomResolved = resolveMeshDeduction(invoiceRef, deliveryType);

      let associatedMeshRef: string | undefined;
      let targetStock: "Stock 2" | "Stock 3" = defaultTargetStock;
      let isMeshDeduction = false;

      if (bomResolved) {
        associatedMeshRef = bomResolved.meshRef;
        targetStock = bomResolved.targetStock;
        isMeshDeduction = true;
      } else {
        // If the invoice reference itself is already a direct mesh in the catalog
        const directCatRef = catalogMap.get(invoiceRef);
        if (directCatRef && (directCatRef.materialType === "Mesh" || directCatRef.materialType === "Soft")) {
          associatedMeshRef = directCatRef.code;
          targetStock = defaultTargetStock;
          isMeshDeduction = true;
        }
      }

      // Check catalog and available stock
      const refToCheck = associatedMeshRef || invoiceRef;
      const catRef = catalogMap.get(refToCheck.toUpperCase().trim());
      const catalogFound = !!catRef;
      
      const availableStock = catRef 
        ? (targetStock === "Stock 3" ? (catRef.stock3 || 0) : (catRef.stock2 || 0))
        : 0;

      let status: ParsedDeliveryLineItem["status"] = "ready";
      if (!isMeshDeduction) {
        status = "no_mesh_needed";
      } else if (!catalogFound) {
        status = "not_in_catalog";
      } else if (availableStock < quantity) {
        status = "insufficient_stock";
      }

      parsedItems.push({
        orderNumber,
        invoiceRef,
        description: rawDesc,
        quantity,
        associatedMeshRef,
        targetStock,
        isMeshDeduction,
        currentAvailableStock: availableStock,
        catalogFound,
        status
      });
    }
  }

  const totalQuantity = parsedItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    invoiceNumber,
    invoiceDate,
    deliveryType,
    targetStock: defaultTargetStock,
    rawCategoryText: isPrecosido ? "TOTAL PLANTILLAS (Precosido)" : "TOTAL VOLANTES (Steering Wheels)",
    items: parsedItems,
    totalQuantity
  };
}
