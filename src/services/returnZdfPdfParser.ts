import * as pdfjsLib from "pdfjs-dist";
import { 
  resolveMeshDeduction, 
  STEERING_WHEEL_MESH_MAPPINGS, 
  PRECOSIDO_MESH_MAPPINGS 
} from "../data/meshBOMMapping";
import { resolveOEMCustomer } from "./deliveryPdfParser";
import { Reference } from "../types";

// Configure worker URL for client environment
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

export interface ParsedZdfReturnItem {
  id: string;
  client?: string; // NISSAN, FORD, OPEL, VOLVO, RENAULT, STELLANTIS, PEUGEOT, etc.
  docReference: string; // The reference printed on the document (e.g. A025P546A, 34340681C, R002A665A)
  description: string;
  meshReference: string; // The resolved mesh reference to add into stock (e.g. A026K122B, 34340679A, 34316011B)
  quantity: number;
  targetStock: "Stock 2" | "Stock 3";
  isMeshDirect: boolean;
  bomResolved: boolean;
  included: boolean;
}

export interface ParsedZdfReturnDocument {
  documentType: "ZF_EXPEDICAO_RETORNO" | "ZF_PROFORMA_INVOICE" | "GENERAL_RETURN";
  containerOrInvoiceNumber: string;
  documentDate?: string;
  totalPcs: number;
  items: ParsedZdfReturnItem[];
  ignoredSetCount?: number;
}

/**
 * Known set of mesh reference codes defined across BOM tables.
 */
export const KNOWN_BOM_MESH_CODES = new Set<string>([
  ...STEERING_WHEEL_MESH_MAPPINGS.map((m) => m.meshRef.toUpperCase().trim()),
  ...PRECOSIDO_MESH_MAPPINGS.map((m) => m.meshRef.toUpperCase().trim())
]);

/**
 * Known set of plantilla / assembly / set reference codes defined in BOM tables.
 */
export const KNOWN_PLANTILLA_CODES = new Set<string>(
  PRECOSIDO_MESH_MAPPINGS.map((p) => p.plantillaRef.toUpperCase().trim())
);

/**
 * Determines whether a given reference and description represent an actual mesh
 * versus an assembly, plantilla, or set reference.
 * 
 * For PRECOSIDO returns:
 * SET references (e.g. CJTO PLANT S/PREC, SET PLANT S/PREC, SET MATERIAL) must be IGNORED,
 * and ONLY actual mesh references (e.g. REDE RETALHO, A026K122B, 34340681C, 34340679A)
 * are selected for Stock 2.
 */
export function isMeshReference(
  ref: string,
  desc: string = "",
  catalogCodes?: Set<string>
): boolean {
  const upperRef = ref.trim().toUpperCase();
  const upperDesc = (desc || "").trim().toUpperCase();

  // 1. Explicit set / assembly / plantilla markers in description
  const isSetDescription = /\b(?:CJTO|CONJ|CONJUNTO|SET|PLANTILLA|PLANTILLAS|PLANT|ASSEMBLY|S\/PREC|S\/PRECOSER)\b/i.test(upperDesc);
  const isMeshDescription = /\b(?:REDE|MALLA|MALLAS|MESH|MESHES|RETALHO|MALHA|HEATING MAT|HEATING|HES|SOFT)\b/i.test(upperDesc);

  // If description indicates a set / assembly and does not clearly specify a mesh
  if (isSetDescription && !isMeshDescription) {
    return false;
  }

  // 2. Known plantilla codes that are not mesh codes
  if (KNOWN_PLANTILLA_CODES.has(upperRef) && !KNOWN_BOM_MESH_CODES.has(upperRef)) {
    return false;
  }

  // 3. Known mesh codes from BOM
  if (KNOWN_BOM_MESH_CODES.has(upperRef)) {
    return true;
  }

  // 4. Catalog references in the app inventory
  if (catalogCodes && catalogCodes.has(upperRef)) {
    return true;
  }

  // 5. Mesh description keywords (REDE, MALLA, MESH, RETALHO)
  if (isMeshDescription) {
    return true;
  }

  return false;
}

interface RawTextItem {
  text: string;
  x: number;
  y: number;
  height?: number;
}

/**
 * Groups PDF text elements into visual rows using adaptive Y-clustering.
 * Prevents adjacent table columns from splitting across separate lines due to minor baseline variances.
 */
function clusterTextItemsIntoLines(items: RawTextItem[], tolerance: number = 4.5): string[] {
  // Sort items primarily by Y descending (top of page first), then X ascending
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

  // Sort each line from left to right (X ascending) and build line strings
  return lineClusters.map((cluster) => {
    cluster.items.sort((a, b) => a.x - b.x);
    return cluster.items
      .map((i) => i.text.trim())
      .filter(Boolean)
      .join(" ");
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
        height: item.height || 9
      });
    }

    const pageLines = clusterTextItemsIntoLines(rawItems, 4.5);
    for (const line of pageLines) {
      if (line.trim()) {
        allLines.push(line.trim());
      }
    }
  }

  return {
    allLines,
    fullText: allLines.join("\n")
  };
}

/**
 * Checks if a string is a genuine automotive part reference.
 * Strictly prevents postal codes (90.000), G Remessa numbers (2484220247),
 * tax codes, phone numbers, and address words (BOUKHALEF) from being parsed as references.
 */
export function isValidPartReference(ref: string, catalogCodes?: Set<string>): boolean {
  if (!ref) return false;
  const upper = ref.trim().toUpperCase();

  // 1. Direct catalog or known mesh match
  if (catalogCodes && catalogCodes.has(upper)) {
    return true;
  }

  // 2. Reject pure letters (e.g. BOUKHALEF, PORTUGAL, CERVEIRA)
  // or pure digits (e.g. 2484220247, 8211067, 4920011)
  if (/^[A-Z]+$/.test(upper) || /^\d+$/.test(upper)) {
    return false;
  }

  // 3. Reject blacklisted metadata words that might contain alphanumeric combinations
  const blacklisted = new Set([
    "SA-1175", "SA1175", "MPT", "NIF", "CIF", "FAX", "TEL", "TELEF", 
    "CEP", "K9", "P64", "P74", "C519", "B479", "OV64", "P33B", "OVCTF",
    "ALTO", "CEREJAS", "INVOICING", "ADRESS", "EXPEDIDO", "DESTINO",
    "FORNECEDOR", "MAROC", "FRANCHE", "EXPORTATION", "EMBALAGENS",
    "CARTAO", "PELES", "BRUTO", "NETO", "PLASTIC", "PALLETS", "VALOR",
    "ESTADISTICO", "ESTADÍSTICO", "ALFANDEGA", "ALFÂNDEGA", "INCOTERM",
    "DARTANGER", "TRANSPORTE", "MATRICULA", "MATRÍCULA", "IMPONIBLE"
  ]);
  if (blacklisted.has(upper)) return false;

  // 4. Pattern A: Standard automotive reference starting with letter
  // Examples: A025P546A, A026K160B, A025P562A, A020M334B, A020M341B, A026K122B, R002A665A, A024J503A
  if (/^[A-Z]\d{3}[A-Z0-9]{3,6}[A-Z]$/.test(upper)) {
    return true;
  }

  // 5. Pattern B: Ford / TRW standard numeric references ending in letters
  // Examples: 34340664A, 34340681C, 34340679A, 34316011B, 34364719C, 34371819B
  if (/^\d{7,8}[A-Z]{1,2}$/.test(upper)) {
    return true;
  }

  // 6. Pattern C: General automotive part reference format (length 8-12, mixed letters and numbers)
  const letters = (upper.match(/[A-Z]/g) || []).length;
  const digits = (upper.match(/\d/g) || []).length;
  if (
    upper.length >= 8 &&
    upper.length <= 12 &&
    letters >= 1 &&
    digits >= 3 &&
    /^[A-Z0-9]+$/.test(upper)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a line marks the end of the line item table.
 */
function isTableTrailerLine(line: string): boolean {
  return /^(?:PAIS DESTINO|VALOR ESTAD|OBS\.|OBSERVA[CÇ]|PESO BRUTO|PESO NETO|N[ºO°] DE BULTOS|PLASTIC Boxes|METAL Pallets|ALF[AÂ]NDEGA|Incoterm|TRANSPORTE|MATR[IÍ]CULA|VALOR TRANSPORTE|Base Imponible|I\.V\.A|Total Factura|TOTAL GERAL|TOTAL VOLANTES|TOTAL PLANTILLAS)/i.test(
    line.trim()
  );
}

/**
 * Checks if a line is a table header row.
 */
function isTableHeaderLine(line: string): boolean {
  const upper = line.toUpperCase();
  return (
    (upper.includes("REFERENCIA") && (upper.includes("QUANT") || upper.includes("PRECO") || upper.includes("PREÇO") || upper.includes("REMESSA"))) ||
    (upper.includes("QUANT.") && upper.includes("REFERENCIA")) ||
    (upper.includes("QUANTIDADE") && upper.includes("REFERENCIA"))
  );
}

/**
 * Parses a Return ZDF document (Red Cage -> Stock 3 or Precosido -> Stock 2).
 * Prioritizes:
 * 1. "Referencia" and "Quantidade" (Proforma Invoice / Dalphimetal / ZF Return)
 * 2. "QUANT.   REFERENCIA" (Expedição de Retorno / Return Container)
 */
export async function parseZdfReturnPDF(
  file: File,
  returnCategory: "RED_CAGE" | "PRECOSIDO",
  catalogReferences: Reference[] = []
): Promise<ParsedZdfReturnDocument> {
  const { allLines, fullText } = await extractLinesFromPDF(file);
  const targetStock: "Stock 2" | "Stock 3" = returnCategory === "RED_CAGE" ? "Stock 3" : "Stock 2";

  // Catalog code lookup set
  const catalogCodes = new Set(
    catalogReferences.map((r) => r.code?.trim().toUpperCase()).filter(Boolean)
  );

  // 1. Identify Document / Container / Invoice Number
  let containerOrInvoiceNumber = "";
  const proformaMatch =
    fullText.match(/Factura\s+Proforma\s*[:\s]?\s*([A-Z0-9\-_]+)/i) ||
    fullText.match(/Proforma\s*[:\s]?\s*([A-Z0-9\-_]+)/i);

  const containerMatch =
    fullText.match(/CONTENTOR\s+REJEITADO\s*N[ºO°]?\s*[:\s]?\s*([0-9\-_]+)/i) ||
    fullText.match(/REJEITADO\s*N[ºO°]?\s*[:\s]?\s*([0-9\-_]+)/i);

  const genericInvMatch =
    fullText.match(/(?:INVOICE|FACTURA|ALBAR[AÁ]N|DEVOLUCI[OÓ]N)\s*(?:N[ºO°]|NUMBER)?\s*[:\s]?\s*([A-Z0-9\-_]+)/i) ||
    fullText.match(/MPT[\-_]?\d{3,6}/i);

  if (proformaMatch) {
    containerOrInvoiceNumber = proformaMatch[1].trim();
  } else if (containerMatch) {
    containerOrInvoiceNumber = containerMatch[1].trim();
  } else if (genericInvMatch) {
    containerOrInvoiceNumber = (genericInvMatch[1] || genericInvMatch[0]).trim();
  } else {
    containerOrInvoiceNumber = `ZDF-${Date.now().toString().slice(-6)}`;
  }

  // 2. Identify Document Date
  let documentDate: string | undefined;
  const dateMatch = fullText.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  if (dateMatch) {
    documentDate = dateMatch[1];
  }

  // 3. Document Type Detection
  let documentType: "ZF_EXPEDICAO_RETORNO" | "ZF_PROFORMA_INVOICE" | "GENERAL_RETURN" = "GENERAL_RETURN";
  if (/CONTENTOR\s+REJEITADO|COMUNICADO\s+DE\s+EXPEDI/i.test(fullText)) {
    documentType = "ZF_EXPEDICAO_RETORNO";
  } else if (/DALPHIMETAL|Factura\s+Proforma|G\s+REMESSA/i.test(fullText)) {
    documentType = "ZF_PROFORMA_INVOICE";
  }

  // 4. Extract Line Items
  const items: ParsedZdfReturnItem[] = [];
  const seenKeys = new Set<string>();
  let hasEncounteredTableHeader = false;
  let hasReachedTableEnd = false;
  let ignoredSetCount = 0;

  for (let lineIdx = 0; lineIdx < allLines.length; lineIdx++) {
    const rawLine = allLines[lineIdx];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check table header marker
    if (isTableHeaderLine(trimmed)) {
      hasEncounteredTableHeader = true;
      continue;
    }

    // Check table trailer marker
    if (isTableTrailerLine(trimmed)) {
      hasReachedTableEnd = true;
      break; // Stop parsing line items once table footer / trailer is reached
    }

    // If we haven't seen table header yet, skip obvious header text lines
    if (!hasEncounteredTableHeader) {
      if (
        /TRW|DALPHIMETAL|DOMICILIO|INVOICING|ADRESS|EPP\s+NATUR|ZONE\s+FRANCHE|TANGER|NIF:|Cod\.\s*Fornecedor/i.test(
          trimmed
        )
      ) {
        continue;
      }
    }

    let parsedCandidate: {
      ref: string;
      qty: number;
      desc: string;
      explicitClient?: string;
    } | null = null;

    // =========================================================================
    // PRIORITY 1: "Referencia" and "Quantidade" (Proforma / Dalphimetal Format)
    // Structure:
    // [RefCode] [optional G_Remessa] [optional Date] [Description] [Quantity] [optional Prices]
    // Handles all currency/price variants strictly:
    // =========================================================================

    // Pattern 1.1: Two prices with currency symbol (€ or EUR) at end:
    // Example: "34340681C 2484220247 14/09/2026 REDE RETALHO TRW BASE 2018 3434068 2 8,24 € 16,48 €"
    const p1CurrencyPair =
      /^([A-Z0-9]{8,12})\s+(?:(\d{8,12})\s+)?(?:\d{2}[\/\-]\d{2}[\/\-]\d{4}\s+)?(.+?)\s+(\d{1,5})\s+(\d+(?:[.,]\d{1,4})?\s*(?:€|EUR))\s+(\d+(?:[.,]\d{1,4})?\s*(?:€|EUR))$/i;
    const m1Curr = trimmed.match(p1CurrencyPair);
    if (m1Curr) {
      parsedCandidate = {
        ref: m1Curr[1].toUpperCase().trim(),
        qty: parseInt(m1Curr[4], 10),
        desc: m1Curr[3].trim()
      };
    }

    // Pattern 1.2: Two decimal prices without currency symbol at end:
    // Example: "34340681C 2484220247 14/09/2026 REDE RETALHO TRW BASE 2018 3434068 2 8,24 16,48"
    if (!parsedCandidate) {
      const p1DecPair =
        /^([A-Z0-9]{8,12})\s+(?:(\d{8,12})\s+)?(?:\d{2}[\/\-]\d{2}[\/\-]\d{4}\s+)?(.+?)\s+(\d{1,5})\s+(\d+[.,]\d{1,4})\s+(\d+[.,]\d{1,4})$/i;
      const m1Dec = trimmed.match(p1DecPair);
      if (m1Dec) {
        parsedCandidate = {
          ref: m1Dec[1].toUpperCase().trim(),
          qty: parseInt(m1Dec[4], 10),
          desc: m1Dec[3].trim()
        };
      }
    }

    // Pattern 1.3: Single price with optional currency at end:
    if (!parsedCandidate) {
      const p1Single =
        /^([A-Z0-9]{8,12})\s+(?:(\d{8,12})\s+)?(?:\d{2}[\/\-]\d{2}[\/\-]\d{4}\s+)?(.+?)\s+(\d{1,5})\s+(\d+(?:[.,]\d{1,4})?\s*(?:€|EUR)?)$/i;
      const m1Single = trimmed.match(p1Single);
      if (m1Single) {
        parsedCandidate = {
          ref: m1Single[1].toUpperCase().trim(),
          qty: parseInt(m1Single[4], 10),
          desc: m1Single[3].trim()
        };
      }
    }

    // Pattern 1.4: Line ending directly with quantity (no prices printed):
    // Example: "A026K122B 2484220247 14/09/2026 REDE RETALHO A026K122B 8"
    if (!parsedCandidate) {
      const p1NoPrice =
        /^([A-Z0-9]{8,12})\s+(?:(\d{8,12})\s+)?(?:\d{2}[\/\-]\d{2}[\/\-]\d{4}\s+)?(.+?)\s+(\d{1,5})$/i;
      const m1NoPrice = trimmed.match(p1NoPrice);
      if (m1NoPrice) {
        parsedCandidate = {
          ref: m1NoPrice[1].toUpperCase().trim(),
          qty: parseInt(m1NoPrice[4], 10),
          desc: m1NoPrice[3].trim()
        };
      }
    }

    // =========================================================================
    // PRIORITY 2: "QUANT.   REFERENCIA" (Expedição de Retorno Format)
    // Structure:
    // [optional Client] [Quantity] [RefCode] [Description]
    // Examples:
    // "NISSAN 25 R002A665A STEERING WHEEL P33B SYNTHETIC WRAPPED R002A665A 1"
    // "8 R002A667A ST WHEEL P33B WRAPPED SYNTETIC TEP HEATE"
    // =========================================================================
    if (!parsedCandidate) {
      const p2Regex =
        /^(?:(NISSAN|FORD|OPEL|VOLVO|RENAULT|STELLANTIS|PEUGEOT|CITROEN|DACIA|ALPINE)\s+)?(\d{1,5})\s+([A-Z0-9]{8,12})\s+(.+)$/i;
      const m2 = trimmed.match(p2Regex);

      if (m2) {
        const candRef = m2[3].toUpperCase().trim();
        let desc = m2[4].trim();
        desc = desc
          .replace(new RegExp(`\\s+${candRef}\\b.*$`, "i"), "")
          .replace(/\s+\d+$/, "")
          .trim();

        parsedCandidate = {
          ref: candRef,
          qty: parseInt(m2[2], 10),
          desc,
          explicitClient: m2[1]?.toUpperCase().trim()
        };
      }
    }

    // =========================================================================
    // FALLBACK: Backward-scanning token parser
    // =========================================================================
    if (!parsedCandidate) {
      const tokens = trimmed.split(/\s+/);
      if (tokens.length >= 2) {
        let foundRefIdx = -1;
        for (let t = 0; t < tokens.length; t++) {
          if (isValidPartReference(tokens[t], catalogCodes)) {
            foundRefIdx = t;
            break;
          }
        }

        if (foundRefIdx !== -1) {
          const candidateRef = tokens[foundRefIdx].toUpperCase().trim();

          if (foundRefIdx === 0) {
            // Scan backwards from end for integer quantity
            for (let q = tokens.length - 1; q > 0; q--) {
              const token = tokens[q].replace(/[€EUR]/gi, "").trim();
              const isPrice =
                /^\d+[.,]\d{1,4}$/.test(token) ||
                tokens[q].includes("€") ||
                tokens[q].toUpperCase().includes("EUR");
              if (isPrice) continue;

              if (/^\d{1,5}$/.test(token)) {
                const qty = parseInt(token, 10);
                if (qty > 0 && qty < 10000) {
                  const descTokens = tokens
                    .slice(1, q)
                    .filter(
                      (tk) =>
                        !/^\d{8,12}$/.test(tk) &&
                        !/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(tk)
                    );
                  parsedCandidate = {
                    ref: candidateRef,
                    qty,
                    desc: descTokens.join(" ")
                  };
                  break;
                }
              }
            }
          } else if (foundRefIdx === 1 || foundRefIdx === 2) {
            const potentialQtyToken = tokens[foundRefIdx - 1];
            if (/^\d{1,5}$/.test(potentialQtyToken)) {
              const qty = parseInt(potentialQtyToken, 10);
              if (qty > 0 && qty < 10000) {
                const desc = tokens.slice(foundRefIdx + 1).join(" ");
                const client =
                  foundRefIdx === 2 ? tokens[0].toUpperCase() : undefined;
                parsedCandidate = {
                  ref: candidateRef,
                  qty,
                  desc,
                  explicitClient: client
                };
              }
            }
          }
        }
      }
    }

    if (parsedCandidate) {
      const { ref, qty, desc, explicitClient } = parsedCandidate;
      if (isValidPartReference(ref, catalogCodes) && qty > 0 && qty < 10000) {
        // Clean description of any stray unit prices
        const cleanDesc = desc.replace(/\s+[\d.,]+\s*€.*$/, "").trim();

        // FOR PRECOSIDO: Strictly ignore SET ("se") references and select ONLY mesh references!
        if (returnCategory === "PRECOSIDO") {
          const isMesh = isMeshReference(ref, cleanDesc, catalogCodes);
          if (!isMesh) {
            ignoredSetCount++;
            continue; // Ignore SET / assembly reference!
          }
        }

        addItem(ref, qty, cleanDesc, explicitClient);
      }
    }
  }

  function addItem(ref: string, qty: number, desc: string, explicitClient?: string) {
    const key = `${ref}-${qty}-${desc.slice(0, 15)}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    // Safeguard: for Precosido, double-check that this is a mesh reference
    if (returnCategory === "PRECOSIDO" && !isMeshReference(ref, desc, catalogCodes)) {
      ignoredSetCount++;
      return;
    }

    // Resolve Mesh Reference and Stock Target
    let meshReference = ref;
    let isMeshDirect = false;
    let bomResolved = false;

    // 1. Direct Catalog Match or Known Mesh Match
    if (catalogCodes.has(ref) || KNOWN_BOM_MESH_CODES.has(ref)) {
      meshReference = ref;
      isMeshDirect = true;
    } else {
      // 2. Resolve via BOM Mapping Table
      const bom = resolveMeshDeduction(
        ref,
        returnCategory === "RED_CAGE" ? "STEERING WHEELS" : "PRECOSIDO"
      );

      if (bom && bom.meshRef) {
        meshReference = bom.meshRef.toUpperCase().trim();
        bomResolved = true;
      } else {
        // 3. Check if any catalog reference code or known mesh is explicitly mentioned in description
        let foundInDesc = false;
        for (const catCode of catalogCodes) {
          if (desc.toUpperCase().includes(catCode)) {
            meshReference = catCode;
            bomResolved = true;
            foundInDesc = true;
            break;
          }
        }
        if (!foundInDesc) {
          for (const meshCode of KNOWN_BOM_MESH_CODES) {
            if (desc.toUpperCase().includes(meshCode)) {
              meshReference = meshCode;
              bomResolved = true;
              break;
            }
          }
        }
      }
    }

    // Resolve OEM customer
    const client =
      explicitClient ||
      resolveOEMCustomer(ref, desc, meshReference, catalogReferences) ||
      "ZF";

    items.push({
      id: `zdf-${Date.now()}-${items.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
      client,
      docReference: ref,
      description: desc || "ZDF Return Component",
      meshReference,
      quantity: qty,
      targetStock,
      isMeshDirect,
      bomResolved,
      included: true
    });
  }

  const totalPcs = items.reduce((sum, it) => sum + (it.included ? it.quantity : 0), 0);

  return {
    documentType,
    containerOrInvoiceNumber,
    documentDate,
    totalPcs,
    items,
    ignoredSetCount
  };
}
