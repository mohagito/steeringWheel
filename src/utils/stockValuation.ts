import { Reference } from "../types";

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
