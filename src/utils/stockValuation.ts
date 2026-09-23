import { Reference, ScrapEntry } from "../types";
import { getMoroccoDateString, getMoroccoTodayDateString } from "./timeUtils";

/**
 * Official Unit Price List for EPP MESHES Materials.
 * Used exclusively for deriving monetary valuation metrics on the Analytics page.
 * Strictly decoupled from stock inventory, operations, deliveries, and auditing logic.
 */
export const MESHES_PRICE_LIST: Record<string, number> = {
  "R000B630A": 23.21,
  "R000B629B": 34.56,
  "34316011B": 7.82,
  "A026K122B": 11.42,
  "R000J600C": 13.81,
  "R000J601B": 34.91,
  "R000J610A": 2.15,
  "A025M750B": 13.81,
  "A025M751B": 34.91,
  "34364719C": 7.70,
  "A026L577A": 8.99,
  "34340679A": 1.72,
  "34340687B": 1.59,
  "34340689D": 8.16,
  "34340681C": 7.59,
  "R002W094A": 13.93,
  "R001L200A": 1.98,
  "R001W189B": 67.88
};

export interface StockValuationResult {
  totalValue: number;
  formattedValue: string; // e.g. "€ 18,450.32"
  missingPriceCount: number;
  missingPriceRefs: string[];
}

/**
 * Calculates total monetary stock value for a given stock stage (Stock 1, Stock 2, or Stock 3).
 * Excludes unknown references from the total and tracks missing references for transparent UI display.
 */
export function calculateStockValuation(
  references: Reference[],
  stockKey: "stock1" | "stock2" | "stock3"
): StockValuationResult {
  let totalValue = 0;
  const missingRefs: string[] = [];

  for (const ref of references) {
    const qty = typeof ref[stockKey] === "number" ? ref[stockKey] : 0;
    // Only evaluate references that actually have positive inventory in this stock
    if (qty > 0) {
      const codeKey = (ref.code || "").trim().toUpperCase();
      const unitPrice = MESHES_PRICE_LIST[codeKey];

      if (unitPrice !== undefined && typeof unitPrice === "number") {
        totalValue += qty * unitPrice;
      } else {
        missingRefs.push(ref.code);
      }
    }
  }

  // Exact 2 decimal places rounding
  const rounded = Math.round((totalValue + Number.EPSILON) * 100) / 100;
  const formattedNumber = rounded.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return {
    totalValue: rounded,
    formattedValue: `€ ${formattedNumber}`,
    missingPriceCount: missingRefs.length,
    missingPriceRefs: missingRefs
  };
}

export interface ScrapReferenceBreakdownItem {
  reference: string;
  totalPcs: number;
  conColaPcs: number;
  sinColaPcs: number;
  unitPrice?: number;
  totalValue: number;
  conColaValue: number;
  sinColaValue: number;
  hasPrice: boolean;
}

export interface ScrapValuationResult {
  conColaPcs: number;
  sinColaPcs: number;
  totalScrapPcs: number;
  totalScrapValue: number;
  formattedTotalValue: string; // e.g. "€ 3,482.50"
  conColaTotalValue: number;
  formattedConColaValue: string;
  sinColaTotalValue: number;
  formattedSinColaValue: string;
  missingPriceCount: number;
  missingPriceRefs: string[];
  breakdown: ScrapReferenceBreakdownItem[];
}

/**
 * Helper to identify if a scrap record is CON COLA
 */
export function isConColaScrap(s: ScrapEntry): boolean {
  if (s.cola === "CON_COLA" || s.colaStatus === "CON_COLA") return true;
  if (s.condition === "CON COLA") return true;
  if (typeof s.notes === "string" && s.notes.includes("[CON COLA]")) return true;
  return false;
}

/**
 * Helper to identify if a scrap record is SIN COLA
 */
export function isSinColaScrap(s: ScrapEntry): boolean {
  if (s.cola === "SIN_COLA" || s.colaStatus === "SIN_COLA") return true;
  if (s.condition === "SIN COLA") return true;
  if (typeof s.notes === "string" && s.notes.includes("[SIN COLA]")) return true;
  return false;
}

/**
 * Calculates SCRAP valuation from authoritative Firestore scrap operations.
 * - Both CON COLA and SIN COLA entries contribute to monetary valuation using official unit prices.
 * - References without configured prices are tracked as missing.
 * - Does not invent prices or assume €0.
 */
export function calculateScrapValuation(
  scraps: ScrapEntry[],
  periodFilter: "all" | "today" | "week" | "month" = "all"
): ScrapValuationResult {
  const todayStr = getMoroccoTodayDateString();
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM

  // Compute start of week (last 7 days or current week)
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = getMoroccoDateString(weekAgo.toISOString());

  // Filter out deleted records and apply date period
  const activeScraps = scraps.filter((s) => {
    if (s.status === "deleted") return false;

    if (periodFilter === "all") return true;

    // Use Morocco date representation of record's date or timestamp
    const recordDate = s.date || (s.timestamp ? getMoroccoDateString(s.timestamp) : "");
    if (!recordDate) return true;

    if (periodFilter === "today") {
      return recordDate === todayStr;
    } else if (periodFilter === "week") {
      return recordDate >= weekAgoStr && recordDate <= todayStr;
    } else if (periodFilter === "month") {
      return recordDate.startsWith(currentMonthStr);
    }

    return true;
  });

  let conColaPcs = 0;
  let sinColaPcs = 0;
  const refStats: Record<string, { conCola: number; sinCola: number }> = {};

  for (const s of activeScraps) {
    const qty = typeof s.quantity === "number" && !isNaN(s.quantity) && s.quantity > 0 ? s.quantity : 0;
    if (qty === 0) continue;

    const refCode = (s.reference || "").trim().toUpperCase();
    if (!refCode) continue;

    if (!refStats[refCode]) {
      refStats[refCode] = { conCola: 0, sinCola: 0 };
    }

    if (isConColaScrap(s)) {
      conColaPcs += qty;
      refStats[refCode].conCola += qty;
    } else if (isSinColaScrap(s)) {
      sinColaPcs += qty;
      refStats[refCode].sinCola += qty;
    } else {
      // Default: If legacy or unspecified condition, check if condition has "CON COLA"
      if (s.condition?.toUpperCase().includes("CON")) {
        conColaPcs += qty;
        refStats[refCode].conCola += qty;
      } else {
        sinColaPcs += qty;
        refStats[refCode].sinCola += qty;
      }
    }
  }

  let conColaTotalValue = 0;
  let sinColaTotalValue = 0;
  let totalScrapValue = 0;
  const missingRefs: string[] = [];
  const breakdown: ScrapReferenceBreakdownItem[] = [];

  for (const [refCode, counts] of Object.entries(refStats)) {
    const totalPcs = counts.conCola + counts.sinCola;
    const unitPrice = MESHES_PRICE_LIST[refCode];
    if (unitPrice !== undefined && typeof unitPrice === "number") {
      const conVal = Math.round((counts.conCola * unitPrice + Number.EPSILON) * 100) / 100;
      const sinVal = Math.round((counts.sinCola * unitPrice + Number.EPSILON) * 100) / 100;
      const itemTotalVal = Math.round((totalPcs * unitPrice + Number.EPSILON) * 100) / 100;

      conColaTotalValue += conVal;
      sinColaTotalValue += sinVal;
      totalScrapValue += itemTotalVal;

      breakdown.push({
        reference: refCode,
        totalPcs,
        conColaPcs: counts.conCola,
        sinColaPcs: counts.sinCola,
        unitPrice,
        totalValue: itemTotalVal,
        conColaValue: conVal,
        sinColaValue: sinVal,
        hasPrice: true
      });
    } else {
      missingRefs.push(refCode);
      breakdown.push({
        reference: refCode,
        totalPcs,
        conColaPcs: counts.conCola,
        sinColaPcs: counts.sinCola,
        unitPrice: undefined,
        totalValue: 0,
        conColaValue: 0,
        sinColaValue: 0,
        hasPrice: false
      });
    }
  }

  // Sort breakdown: highest total pcs first, then by reference name
  breakdown.sort((a, b) => b.totalPcs - a.totalPcs || a.reference.localeCompare(b.reference));

  const roundedTotal = Math.round((totalScrapValue + Number.EPSILON) * 100) / 100;
  const roundedConCola = Math.round((conColaTotalValue + Number.EPSILON) * 100) / 100;
  const roundedSinCola = Math.round((sinColaTotalValue + Number.EPSILON) * 100) / 100;

  const formattedTotalValue = `€ ${roundedTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const formattedConColaValue = `€ ${roundedConCola.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const formattedSinColaValue = `€ ${roundedSinCola.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  return {
    conColaPcs,
    sinColaPcs,
    totalScrapPcs: conColaPcs + sinColaPcs,
    totalScrapValue: roundedTotal,
    formattedTotalValue,
    conColaTotalValue: roundedConCola,
    formattedConColaValue,
    sinColaTotalValue: roundedSinCola,
    formattedSinColaValue,
    missingPriceCount: missingRefs.length,
    missingPriceRefs: missingRefs,
    breakdown
  };
}
