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

  for (const line of lines) {
    // Skip headers and summary rows
    if (/ORDER\s+REF/i.test(line) || /TOTAL\s+H\.T/i.test(line) || /TOTAL\s+VOLANTES/i.test(line) || /TOTAL\s+PLANTILLAS/i.test(line)) {
      continue;
    }

    const match = line.match(rowRegex);
    if (match) {
      const orderNumber = match[1];
      const invoiceRef = match[2].toUpperCase().trim();
      const rawDesc = match[3].trim();
      const quantity = parseInt(match[4], 10);

      if (isNaN(quantity) || quantity <= 0) continue;

      // Filter out false positives (e.g., telephone numbers or postal codes)
      if (invoiceRef === "TANGER" || invoiceRef === "MARRUECOS" || invoiceRef === "PORTUGAL") continue;

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
