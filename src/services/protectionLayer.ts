import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  Transaction,
  getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ProtectionLog,
  ProtectionEventType,
  InventoryTransaction,
  Delivery,
  Production,
  ScrapEntry,
  Adjustment,
  ReceivingInvoice,
  Box,
  Reference
} from "../types";

// In-Memory Idempotency / Duplicate Prevention Cache (Window: 4 seconds)
const duplicateGuardCache = new Map<string, { timestamp: number; result: any }>();

// Periodic cleanup of stale cache keys
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of duplicateGuardCache.entries()) {
    if (now - val.timestamp > 30000) {
      duplicateGuardCache.delete(key);
    }
  }
}, 60000);

/**
 * Helper to clean undefined values before saving to Firestore
 */
export const cleanDocData = <T extends Record<string, any>>(obj: T): T => {
  const clean: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  });
  return clean as T;
};

/**
 * Silently logs database protection incidents to the internal Firestore collection `protection_logs`.
 * This never throws or interferes with normal client-side operation.
 */
export async function logProtectionIncident(incident: Omit<ProtectionLog, "id">): Promise<void> {
  try {
    const logId = `prot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const logRef = doc(db, "protection_logs", logId);
    const fullLog: ProtectionLog = {
      id: logId,
      ...incident,
      timestamp: incident.timestamp || new Date().toISOString()
    };
    // Non-blocking fire-and-forget write
    setDoc(logRef, cleanDocData(fullLog)).catch((err) => {
      console.warn("[ProtectionLayer] Failed to write protection incident log:", err);
    });
  } catch (err) {
    console.warn("[ProtectionLayer] Error preparing incident log:", err);
  }
}

/**
 * Validates whether a quantity is a valid, finite positive number.
 */
export function validateQuantity(
  qty: any,
  fieldName = "quantity",
  options?: { allowZero?: boolean; allowNegative?: boolean }
): { valid: boolean; error?: string; value: number } {
  const num = Number(qty);
  if (qty === null || qty === undefined || typeof qty === "boolean" || isNaN(num) || !isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a valid finite number`, value: 0 };
  }
  if (!options?.allowNegative && num < 0) {
    return { valid: false, error: `${fieldName} cannot be negative (${num})`, value: num };
  }
  if (!options?.allowZero && num === 0) {
    return { valid: false, error: `${fieldName} must be greater than zero`, value: num };
  }
  return { valid: true, value: num };
}

export interface ProtectedStockDelta {
  reference: string;
  delta1?: number;
  delta2?: number;
  delta3?: number;
  // If direct override is desired (e.g. physical count adjustment)
  isDirectOverride?: boolean;
  targetStock1?: number;
  targetStock2?: number;
  targetStock3?: number;
}

export interface ProtectedOperationParams {
  operationType: string;
  deltas?: ProtectedStockDelta[];
  operatorName: string;
  notes?: string;
  reason?: string;
  referenceCode?: string;
  idempotencyKey?: string;
  source?: string;
  // Transactions to log inside the same atomic commit
  transactions?: Omit<InventoryTransaction, "stock1Before" | "stock1After" | "stock2Before" | "stock2After" | "stock3Before" | "stock3After">[];
  // Additional entity writes to commit inside the same atomic transaction
  additionalWrites?: (transaction: Transaction, timestamp: string) => Promise<void> | void;
  // Direct callback execution mode (e.g., used by Dashboard quick actions and OperatorWorkspace)
  execute?: (
    refData: Reference,
    transaction: Transaction
  ) => Promise<{
    stockChanges?: {
      referenceCode: string;
      newStock1: number;
      newStock2: number;
      newStock3: number;
      newTotal?: number;
    }[];
  } | void>;
}

/**
 * Core Atomic Execution Engine for Protected Stock Operations:
 * 1. Checks duplicate cache
 * 2. Pre-validates all deltas and quantities
 * 3. Runs an atomic Firestore transaction (`runTransaction`)
 * 4. Reads authoritative reference documents directly from Firestore inside the transaction
 * 5. Computes resulting stock levels strictly from the fresh read
 * 6. Enforces Non-Negative Stock guard on stock1, stock2, and stock3
 * 7. Commits reference stock changes, transaction logs, and entity writes atomically
 * 8. Silently logs any blocked attempt to `protection_logs`
 */
export async function executeProtectedStockOperation(
  params: ProtectedOperationParams
): Promise<{ success: boolean; details?: any }> {
  const {
    operationType,
    deltas = [],
    operatorName,
    notes = "",
    reason = "",
    referenceCode,
    idempotencyKey,
    source = "application",
    transactions = [],
    additionalWrites,
    execute
  } = params;

  // 1. Idempotency / Duplicate Check
  if (idempotencyKey) {
    const cached = duplicateGuardCache.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < 4000) {
      console.warn(`[ProtectionLayer] Duplicate operation suppressed for key: ${idempotencyKey}`);
      return { success: true, details: cached.result };
    }
  }

  const timestamp = new Date().toISOString();

  // Functional callback execution branch (e.g. from Dashboard quick actions)
  if (execute) {
    const targetRefCode = (referenceCode || deltas[0]?.reference || "").trim().toUpperCase();
    if (!targetRefCode) {
      throw new Error(`Reference code is required for ${operationType}`);
    }

    try {
      const result = await runTransaction(db, async (transaction) => {
        const refDocRef = doc(db, "references", targetRefCode);
        const refSnap = await transaction.get(refDocRef);

        if (!refSnap.exists()) {
          throw new Error(`Reference "${targetRefCode}" does not exist in master catalog.`);
        }

        const rawData = refSnap.data() as Reference;
        const currentRefData: Reference = {
          ...rawData,
          stock1: typeof rawData.stock1 === "number" ? rawData.stock1 : 0,
          stock2: typeof rawData.stock2 === "number" ? rawData.stock2 : 0,
          stock3: typeof rawData.stock3 === "number" ? rawData.stock3 : 0
        };

        const execResult = await execute(currentRefData, transaction);

        if (execResult && execResult.stockChanges) {
          for (const change of execResult.stockChanges) {
            const code = change.referenceCode.trim().toUpperCase();
            if (change.newStock1 < 0 || change.newStock2 < 0 || change.newStock3 < 0) {
              const negStockDetails = [];
              if (change.newStock1 < 0) negStockDetails.push(`Stock 1 would be ${change.newStock1}`);
              if (change.newStock2 < 0) negStockDetails.push(`Stock 2 would be ${change.newStock2}`);
              if (change.newStock3 < 0) negStockDetails.push(`Stock 3 would be ${change.newStock3}`);
              throw new Error(`PROTECTION_NEGATIVE_STOCK:Insufficient stock for Reference "${code}". ${negStockDetails.join(", ")}.`);
            }

            const targetDoc = doc(db, "references", code);
            const total = change.newStock1 + change.newStock2 + change.newStock3;
            transaction.set(
              targetDoc,
              cleanDocData({
                stock1: change.newStock1,
                stock2: change.newStock2,
                stock3: change.newStock3,
                currentStock: total,
                lastUpdate: timestamp
              }),
              { merge: true }
            );
          }
        }

        return execResult;
      });

      if (idempotencyKey) {
        duplicateGuardCache.set(idempotencyKey, { timestamp: Date.now(), result });
      }

      return { success: true, details: result };
    } catch (err: any) {
      const rawMsg = err?.message || String(err);
      if (rawMsg.startsWith("PROTECTION_NEGATIVE_STOCK:")) {
        const cleanReason = rawMsg.replace("PROTECTION_NEGATIVE_STOCK:", "");
        await logProtectionIncident({
          eventType: "NEGATIVE_STOCK_BLOCKED",
          attemptedOperation: operationType,
          reason: cleanReason,
          timestamp,
          operator: operatorName,
          source,
          payloadSummary: JSON.stringify({ referenceCode: targetRefCode, reason })
        });
        throw new Error(cleanReason);
      }
      throw err;
    }
  }

  // Declarative deltas branch
  for (const d of deltas) {
    if (!d.reference || typeof d.reference !== "string" || d.reference.trim() === "") {
      const errStr = `Invalid or missing reference code in operation ${operationType}.`;
      await logProtectionIncident({
        eventType: "INVALID_QUANTITY_BLOCKED",
        attemptedOperation: operationType,
        reason: errStr,
        timestamp: new Date().toISOString(),
        operator: operatorName,
        source
      });
      throw new Error(errStr);
    }

    if (!d.isDirectOverride) {
      if (d.delta1 !== undefined && (!isFinite(d.delta1) || isNaN(d.delta1))) {
        throw new Error(`Invalid stock1 delta for ${d.reference}`);
      }
      if (d.delta2 !== undefined && (!isFinite(d.delta2) || isNaN(d.delta2))) {
        throw new Error(`Invalid stock2 delta for ${d.reference}`);
      }
      if (d.delta3 !== undefined && (!isFinite(d.delta3) || isNaN(d.delta3))) {
        throw new Error(`Invalid stock3 delta for ${d.reference}`);
      }
    }
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      // Gather all unique reference document paths
      const uniqueRefCodes = Array.from(new Set(deltas.map((d) => d.reference.trim().toUpperCase())));

      // Step A: Read authoritative reference documents
      const refSnapMap: Record<string, { refDocRef: any; data: Reference; code: string }> = {};

      for (const code of uniqueRefCodes) {
        const refDocRef = doc(db, "references", code);
        const refSnap = await transaction.get(refDocRef);

        if (!refSnap.exists()) {
          const errMsg = `Reference "${code}" does not exist in master catalog. Operation rejected.`;
          throw new Error(errMsg);
        }

        const data = refSnap.data() as Reference;
        refSnapMap[code] = {
          refDocRef,
          data: {
            ...data,
            stock1: typeof data.stock1 === "number" ? data.stock1 : 0,
            stock2: typeof data.stock2 === "number" ? data.stock2 : 0,
            stock3: typeof data.stock3 === "number" ? data.stock3 : 0
          },
          code
        };
      }

      // Step B: Calculate new stock values per reference
      const accumulatedChanges: Record<
        string,
        {
          s1Before: number;
          s2Before: number;
          s3Before: number;
          s1After: number;
          s2After: number;
          s3After: number;
        }
      > = {};

      for (const code of uniqueRefCodes) {
        const refInfo = refSnapMap[code];
        accumulatedChanges[code] = {
          s1Before: refInfo.data.stock1,
          s2Before: refInfo.data.stock2,
          s3Before: refInfo.data.stock3,
          s1After: refInfo.data.stock1,
          s2After: refInfo.data.stock2,
          s3After: refInfo.data.stock3
        };
      }

      for (const d of deltas) {
        const code = d.reference.trim().toUpperCase();
        const cur = accumulatedChanges[code];

        if (d.isDirectOverride) {
          if (d.targetStock1 !== undefined) cur.s1After = d.targetStock1;
          if (d.targetStock2 !== undefined) cur.s2After = d.targetStock2;
          if (d.targetStock3 !== undefined) cur.s3After = d.targetStock3;
        } else {
          if (d.delta1 !== undefined) cur.s1After += d.delta1;
          if (d.delta2 !== undefined) cur.s2After += d.delta2;
          if (d.delta3 !== undefined) cur.s3After += d.delta3;
        }
      }

      // Step C: Strict Non-Negative Stock Validation
      for (const code of uniqueRefCodes) {
        const cur = accumulatedChanges[code];
        if (cur.s1After < 0 || cur.s2After < 0 || cur.s3After < 0) {
          const negStockDetails = [];
          if (cur.s1After < 0) negStockDetails.push(`Stock 1 would be ${cur.s1After} (available: ${cur.s1Before})`);
          if (cur.s2After < 0) negStockDetails.push(`Stock 2 would be ${cur.s2After} (available: ${cur.s2Before})`);
          if (cur.s3After < 0) negStockDetails.push(`Stock 3 would be ${cur.s3After} (available: ${cur.s3Before})`);

          const rejectionReason = `Insufficient stock for Reference "${code}". ${negStockDetails.join(", ")}.`;
          throw new Error(`PROTECTION_NEGATIVE_STOCK:${rejectionReason}`);
        }
      }

      // Step D: Apply Reference Updates inside Transaction
      for (const code of uniqueRefCodes) {
        const cur = accumulatedChanges[code];
        const refInfo = refSnapMap[code];
        const newTotal = cur.s1After + cur.s2After + cur.s3After;

        transaction.set(
          refInfo.refDocRef,
          cleanDocData({
            stock1: cur.s1After,
            stock2: cur.s2After,
            stock3: cur.s3After,
            currentStock: newTotal,
            lastUpdate: timestamp
          }),
          { merge: true }
        );
      }

      // Step E: Write Transaction Audit Records inside Transaction
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const code = (tx.reference || "").trim().toUpperCase();
        const cur = accumulatedChanges[code] || {
          s1Before: 0,
          s1After: 0,
          s2Before: 0,
          s2After: 0,
          s3Before: 0,
          s3After: 0
        };

        const txId = tx.id || `trans-${operationType.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now()}-${i}`;
        const transDocRef = doc(db, "transactions", txId);

        const fullTxRecord: InventoryTransaction = {
          ...tx,
          id: txId,
          reference: tx.reference || code,
          timestamp: tx.timestamp || timestamp,
          operatorName: tx.operatorName || operatorName,
          stock1Before: cur.s1Before,
          stock1After: cur.s1After,
          stock2Before: cur.s2Before,
          stock2After: cur.s2After,
          stock3Before: cur.s3Before,
          stock3After: cur.s3After
        };

        transaction.set(transDocRef, cleanDocData(fullTxRecord));
      }

      // Step F: Execute any additional entity writes inside the atomic transaction
      if (additionalWrites) {
        await additionalWrites(transaction, timestamp);
      }

      return {
        timestamp,
        updatedReferences: uniqueRefCodes,
        accumulatedChanges
      };
    });

    // Record in idempotency cache
    if (idempotencyKey) {
      duplicateGuardCache.set(idempotencyKey, { timestamp: Date.now(), result });
    }

    return { success: true, details: result };
  } catch (err: any) {
    const rawMsg = err?.message || String(err);

    if (rawMsg.startsWith("PROTECTION_NEGATIVE_STOCK:")) {
      const cleanReason = rawMsg.replace("PROTECTION_NEGATIVE_STOCK:", "");
      await logProtectionIncident({
        eventType: "NEGATIVE_STOCK_BLOCKED",
        attemptedOperation: operationType,
        reason: cleanReason,
        timestamp,
        operator: operatorName,
        source,
        payloadSummary: JSON.stringify({ deltas, notes })
      });
      throw new Error(cleanReason);
    }

    if (rawMsg.includes("does not exist in master catalog")) {
      await logProtectionIncident({
        eventType: "UNKNOWN_REFERENCE_BLOCKED",
        attemptedOperation: operationType,
        reason: rawMsg,
        timestamp,
        operator: operatorName,
        source
      });
    }

    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIFIC PROTECTED OPERATION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Deliveries / Dispatches (Deducts Stock 2 for Precosido or Stock 3 for Villanova)
 */
export async function executeProtectedDeliveries(
  deliveriesData: Omit<Delivery, "id" | "timestamp" | "operatorName">[],
  operatorName: string
) {
  if (!deliveriesData || deliveriesData.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const deliveryDocs: { id: string; doc: Delivery }[] = [];

  deliveriesData.forEach((d, idx) => {
    const qtyCheck = validateQuantity(d.quantity, `Delivery quantity for ${d.reference}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);

    const isPrecosido = d.deliveryType === "PRECOSIDO";
    const refCode = d.reference.trim().toUpperCase();
    const qty = qtyCheck.value;

    if (isPrecosido) {
      deltas.push({ reference: refCode, delta2: -qty });
    } else {
      deltas.push({ reference: refCode, delta3: -qty });
    }

    const delId = `del-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    deliveryDocs.push({
      id: delId,
      doc: {
        ...d,
        id: delId,
        reference: refCode,
        quantity: qty,
        operatorName,
        timestamp
      }
    });

    const transId = `trans-del-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: isPrecosido ? "STOCK 2 OUT" : "STOCK 3 OUT",
      stock: isPrecosido ? "Stock 2" : "Stock 3",
      quantity: qty,
      operatorName,
      timestamp,
      notes: `Delivery (${d.deliveryType || "Villanova"}): Invoice ${d.invoiceNumber} - Note: ${d.notes || "None"}`,
      deliveryType: d.deliveryType || "Villanova",
      invoiceNumber: d.invoiceNumber
    });
  });

  const idempotencyKey = `deliveries-${operatorName}-${deliveriesData.map((d) => `${d.reference}_${d.quantity}`).join(";")}`;

  await executeProtectedStockOperation({
    operationType: "DELIVERY",
    deltas,
    operatorName,
    idempotencyKey,
    transactions,
    additionalWrites: (transaction) => {
      for (const item of deliveryDocs) {
        transaction.set(doc(db, "deliveries", item.id), cleanDocData(item.doc));
      }
    }
  });
}

/**
 * 2. Transfer from Stock 1 (Untouched Mesh) to Stock 2 (Pegadas / Gluing)
 */
export async function executeProtectedTransfer(
  transfers: { reference: string; quantity: number; notes?: string }[],
  operatorName: string
) {
  if (!transfers || transfers.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];

  transfers.forEach((t, idx) => {
    const qtyCheck = validateQuantity(t.quantity, `Transfer quantity for ${t.reference}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);

    const refCode = t.reference.trim().toUpperCase();
    const qty = qtyCheck.value;

    deltas.push({
      reference: refCode,
      delta1: -qty,
      delta2: qty
    });

    const transId = `trans-trf-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "TRANSFER S1->S2",
      stock: "Stock 1 -> Stock 2",
      quantity: qty,
      operatorName,
      timestamp,
      notes: `Mallas Pegadas / Gluing Transfer: ${t.notes || "None"}`
    });
  });

  const idempotencyKey = `transfer-${operatorName}-${transfers.map((t) => `${t.reference}_${t.quantity}`).join(";")}`;

  await executeProtectedStockOperation({
    operationType: "TRANSFER_S1_TO_S2",
    deltas,
    operatorName,
    idempotencyKey,
    transactions
  });
}

/**
 * 3. Return from Stock 2 to Stock 1
 */
export async function executeProtectedReturnS2toS1(
  refCode: string,
  quantity: number,
  operatorName: string,
  notes?: string
) {
  const qtyCheck = validateQuantity(quantity, `Return quantity for ${refCode}`);
  if (!qtyCheck.valid) throw new Error(qtyCheck.error);

  const cleanRef = refCode.trim().toUpperCase();
  const qty = qtyCheck.value;
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = [
    {
      reference: cleanRef,
      delta1: qty,
      delta2: -qty
    }
  ];

  const transId = `trans-ret-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: cleanRef,
      movementType: "RETURN S2->S1",
      stock: "Stock 2 -> Stock 1",
      quantity: qty,
      expectedQty: qty,
      actualQty: qty,
      difference: 0,
      operatorName,
      timestamp,
      notes: `Return from Stock 2 to Stock 1 (Not Touched). Qty: ${qty}. ${notes || ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "RETURN_S2_TO_S1",
    deltas,
    operatorName,
    transactions
  });
}

/**
 * 4. Production Output (Moves quantity from Stock 2 WIP to Stock 3 Finished Goods)
 */
export async function executeProtectedProduction(
  productionEntries: { date: string; reference: string; quantity: number; notes?: string }[],
  operatorName: string
) {
  if (!productionEntries || productionEntries.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const prodDocs: { id: string; doc: Production }[] = [];

  productionEntries.forEach((p, idx) => {
    const qtyCheck = validateQuantity(p.quantity, `Production quantity for ${p.reference}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);

    const refCode = p.reference.trim().toUpperCase();
    const qty = qtyCheck.value;

    deltas.push({
      reference: refCode,
      delta2: -qty,
      delta3: qty
    });

    const prodId = `prod-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    prodDocs.push({
      id: prodId,
      doc: {
        ...p,
        id: prodId,
        reference: refCode,
        quantity: qty,
        operatorName,
        timestamp
      }
    });

    const transId = `trans-prod-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 2 OUT / STOCK 3 IN",
      stock: "Stock 2 -> Stock 3",
      quantity: qty,
      operatorName,
      timestamp,
      notes: `Production Output (${p.date}): ${p.notes || "None"}`
    });
  });

  const idempotencyKey = `prod-${operatorName}-${productionEntries.map((p) => `${p.reference}_${p.quantity}_${p.date}`).join(";")}`;

  await executeProtectedStockOperation({
    operationType: "PRODUCTION",
    deltas,
    operatorName,
    idempotencyKey,
    transactions,
    additionalWrites: (transaction) => {
      for (const item of prodDocs) {
        transaction.set(doc(db, "productions", item.id), cleanDocData(item.doc));
      }
    }
  });
}

/**
 * 5. Scrap Entry (Deducts NOK pieces from Stock 1, Stock 2, or Stock 3)
 */
export async function executeProtectedScrap(
  scrapInput:
    | Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter">
    | Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter">[],
  operatorName: string
) {
  const entries = Array.isArray(scrapInput) ? scrapInput : [scrapInput];
  if (entries.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const scrapDocs: { id: string; doc: any }[] = [];

  entries.forEach((entry, idx) => {
    const qtyCheck = validateQuantity(entry.quantity, `Scrap quantity for ${entry.reference}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);

    const refCode = entry.reference.trim().toUpperCase();
    const qty = qtyCheck.value;
    const stockSource: "Stock 1" | "Stock 2" | "Stock 3" =
      entry.stockDeductedFrom || (entry.condition === "CON COLA" ? "Stock 3" : "Stock 2");

    if (stockSource === "Stock 1") {
      deltas.push({ reference: refCode, delta1: -qty });
    } else if (stockSource === "Stock 2") {
      deltas.push({ reference: refCode, delta2: -qty });
    } else {
      deltas.push({ reference: refCode, delta3: -qty });
    }

    const scrapId = `scrap-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    scrapDocs.push({
      id: scrapId,
      doc: {
        ...entry,
        id: scrapId,
        reference: refCode,
        quantity: qty,
        supervisorName: operatorName,
        timestamp,
        stockDeductedFrom: stockSource
      }
    });

    const transId = `trans-scrap-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "SCRAP",
      stock: stockSource,
      quantity: qty,
      operatorName,
      timestamp,
      notes: `NOK Scrap (${stockSource}): Date ${entry.date}${entry.invoiceNumber ? ` | Scrap Invoice: ${entry.invoiceNumber}` : ""}`
    });
  });

  await executeProtectedStockOperation({
    operationType: "SCRAP",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      for (const item of scrapDocs) {
        transaction.set(doc(db, "scraps", item.id), cleanDocData(item.doc));
      }
    }
  });
}

/**
 * 6. Delete / Revert a Scrap Entry (Restores pieces to Stock 1, 2, or 3)
 */
export async function executeProtectedDeleteScrap(
  scrapIdOrData: string | ScrapEntry,
  operatorName: string,
  scrapsList?: ScrapEntry[],
  reason = ""
) {
  let scrapToDel: ScrapEntry | undefined;

  if (typeof scrapIdOrData === "object" && scrapIdOrData !== null) {
    scrapToDel = scrapIdOrData;
  } else if (scrapsList) {
    scrapToDel = scrapsList.find((s) => s.id === scrapIdOrData);
  }

  if (!scrapToDel) {
    const snap = await getDoc(doc(db, "scraps", typeof scrapIdOrData === "string" ? scrapIdOrData : ""));
    if (snap.exists()) {
      scrapToDel = snap.data() as ScrapEntry;
    }
  }

  if (!scrapToDel) {
    throw new Error("Scrap entry not found.");
  }

  const scrapId = scrapToDel.id;
  const refCode = scrapToDel.reference.trim().toUpperCase();
  const qty = scrapToDel.quantity;
  const isConCola = scrapToDel.condition === "CON COLA";
  const stockToRestore: "Stock 1" | "Stock 2" | "Stock 3" =
    scrapToDel.stockDeductedFrom || (isConCola ? "Stock 3" : "Stock 2");

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];

  if (stockToRestore === "Stock 1") {
    deltas.push({ reference: refCode, delta1: qty });
  } else if (stockToRestore === "Stock 2") {
    deltas.push({ reference: refCode, delta2: qty });
  } else {
    deltas.push({ reference: refCode, delta3: qty });
  }

  const transId = `trans-delscrap-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: refCode,
      movementType: `${stockToRestore.toUpperCase()} IN`,
      stock: stockToRestore,
      quantity: qty,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Reverted scrap entry (${qty} PCS restored to ${stockToRestore}). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "SCRAP_REVERT",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.delete(doc(db, "scraps", scrapId));
    }
  });
}

/**
 * 7. Reconcile / Update a Scrap Entry
 */
export async function executeProtectedUpdateScrap(
  scrapId: string,
  updatedData: {
    reference: string;
    quantity: number;
    stockDeductedFrom?: "Stock 1" | "Stock 2" | "Stock 3";
    condition?: string;
    invoiceNumber?: string;
    date?: string;
  },
  operatorName: string,
  reason = "",
  oldData?: ScrapEntry
) {
  let oldScrap = oldData;
  if (!oldScrap) {
    const snap = await getDoc(doc(db, "scraps", scrapId));
    if (snap.exists()) {
      oldScrap = snap.data() as ScrapEntry;
    }
  }

  if (!oldScrap) {
    throw new Error("Scrap record not found");
  }

  const oldQty = oldScrap.quantity || 0;
  const newQty = updatedData.quantity;
  const oldRefCode = oldScrap.reference.trim().toUpperCase();
  const newRefCode = updatedData.reference.trim().toUpperCase();
  const oldStock: "Stock 1" | "Stock 2" | "Stock 3" =
    oldScrap.stockDeductedFrom || (oldScrap.condition === "CON COLA" ? "Stock 3" : "Stock 2");
  const newStock: "Stock 1" | "Stock 2" | "Stock 3" =
    updatedData.stockDeductedFrom ||
    (updatedData.condition === "CON COLA"
      ? "Stock 3"
      : updatedData.condition === "SIN COLA"
      ? "Stock 2"
      : oldStock);

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];

  if (oldRefCode === newRefCode && oldStock === newStock) {
    const delta = newQty - oldQty; // positive means more scrapped (more deducted)
    if (delta !== 0) {
      if (newStock === "Stock 1") deltas.push({ reference: newRefCode, delta1: -delta });
      else if (newStock === "Stock 2") deltas.push({ reference: newRefCode, delta2: -delta });
      else deltas.push({ reference: newRefCode, delta3: -delta });
    }
  } else {
    // Restore old
    if (oldStock === "Stock 1") deltas.push({ reference: oldRefCode, delta1: oldQty });
    else if (oldStock === "Stock 2") deltas.push({ reference: oldRefCode, delta2: oldQty });
    else deltas.push({ reference: oldRefCode, delta3: oldQty });

    // Deduct new
    if (newStock === "Stock 1") deltas.push({ reference: newRefCode, delta1: -newQty });
    else if (newStock === "Stock 2") deltas.push({ reference: newRefCode, delta2: -newQty });
    else deltas.push({ reference: newRefCode, delta3: -newQty });
  }

  const historyEntry = {
    action: "EDIT",
    oldQty,
    newQty,
    delta: newQty - oldQty,
    modifiedBy: operatorName,
    timestamp: Date.now(),
    reason: reason || "Operator modified scrap entry"
  };

  const existingHistory = oldScrap.changeHistory || [];

  const transId = `trans-editscrap-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: newRefCode,
      movementType: "SCRAP",
      stock: newStock,
      quantity: newQty,
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited scrap entry ${oldRefCode} (${oldQty} PCS) → ${newRefCode} (${newQty} PCS). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "SCRAP_UPDATE",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.update(
        doc(db, "scraps", scrapId),
        cleanDocData({
          reference: newRefCode,
          quantity: newQty,
          condition: updatedData.condition || oldScrap?.condition || "",
          invoiceNumber: updatedData.invoiceNumber || "",
          date: updatedData.date || oldScrap?.date,
          stockDeductedFrom: newStock,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    }
  });
}

/**
 * 8. Delete / Revert a Production Entry (Reverts Stock 3 back to Stock 2)
 */
export async function executeProtectedDeleteProduction(
  prodIdOrData: string | Production,
  operatorName: string,
  productionsList?: Production[],
  reason = ""
) {
  let prodData: Production | undefined;
  if (typeof prodIdOrData === "object" && prodIdOrData !== null) {
    prodData = prodIdOrData;
  } else if (productionsList) {
    prodData = productionsList.find((p) => p.id === prodIdOrData);
  }

  if (!prodData) {
    const snap = await getDoc(doc(db, "productions", typeof prodIdOrData === "string" ? prodIdOrData : ""));
    if (snap.exists()) {
      prodData = snap.data() as Production;
    }
  }

  if (!prodData) {
    throw new Error("Production entry not found.");
  }

  const prodId = prodData.id;
  const refCode = prodData.reference.trim().toUpperCase();
  const qty = prodData.quantity;
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = [
    {
      reference: refCode,
      delta2: qty,
      delta3: -qty
    }
  ];

  const transId = `trans-delprod-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: refCode,
      movementType: "STOCK 3 OUT / STOCK 2 IN",
      stock: "Stock 3 -> Stock 2",
      quantity: qty,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted production entry on ${prodData.date} (${qty} PCS reverted from Stock 3 to Stock 2). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "PRODUCTION_REVERT",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.delete(doc(db, "productions", prodId));
    }
  });
}

/**
 * 8b. Update / Modify a Production Entry
 */
export async function executeProtectedUpdateProduction(
  productionId: string,
  updatedData: { date: string; reference: string; quantity: number; notes?: string },
  operatorName: string,
  reason = "",
  oldData?: Production
) {
  let oldProd = oldData;
  if (!oldProd) {
    const snap = await getDoc(doc(db, "productions", productionId));
    if (snap.exists()) {
      oldProd = snap.data() as Production;
    }
  }

  if (!oldProd) {
    throw new Error("Production record not found");
  }

  const oldQty = oldProd.quantity || 0;
  const newQty = updatedData.quantity;
  const oldRef = oldProd.reference.trim().toUpperCase();
  const newRef = updatedData.reference.trim().toUpperCase();
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = [];

  if (oldRef === newRef) {
    const delta = newQty - oldQty;
    if (delta !== 0) {
      deltas.push({
        reference: newRef,
        delta2: -delta,
        delta3: delta
      });
    }
  } else {
    // Revert old production
    deltas.push({ reference: oldRef, delta2: oldQty, delta3: -oldQty });
    // Apply new production
    deltas.push({ reference: newRef, delta2: -newQty, delta3: newQty });
  }

  const historyEntry = {
    action: "EDIT",
    oldQty,
    newQty,
    delta: newQty - oldQty,
    modifiedBy: operatorName,
    timestamp: Date.now(),
    reason: reason || "Operator modified production entry"
  };

  const existingHistory = oldProd.changeHistory || [];

  const transId = `trans-edit-prod-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: newRef,
      movementType: "STOCK 2 OUT / STOCK 3 IN",
      stock: "Stock 2 -> Stock 3",
      quantity: newQty,
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited Production ${oldRef} (${oldQty} PCS) → ${newRef} (${newQty} PCS). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "PRODUCTION_UPDATE",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.update(
        doc(db, "productions", productionId),
        cleanDocData({
          date: updatedData.date,
          reference: newRef,
          quantity: newQty,
          notes: updatedData.notes || "",
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    }
  });
}

/**
 * 9. Delete / Revert a Delivery Entry (Restores Stock 2 for Precosido or Stock 3 for Villanova)
 */
export async function executeProtectedDeleteDelivery(
  delIdOrData: string | Delivery,
  operatorName: string,
  deliveriesList?: Delivery[],
  reason = ""
) {
  let delData: Delivery | undefined;
  if (typeof delIdOrData === "object" && delIdOrData !== null) {
    delData = delIdOrData;
  } else if (deliveriesList) {
    delData = deliveriesList.find((d) => d.id === delIdOrData);
  }

  if (!delData) {
    const snap = await getDoc(doc(db, "deliveries", typeof delIdOrData === "string" ? delIdOrData : ""));
    if (snap.exists()) {
      delData = snap.data() as Delivery;
    }
  }

  if (!delData) {
    throw new Error("Delivery entry not found.");
  }

  const delId = delData.id;
  const refCode = delData.reference.trim().toUpperCase();
  const qty = delData.quantity;
  const isPrecosido = delData.deliveryType === "PRECOSIDO";
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = [
    {
      reference: refCode,
      delta2: isPrecosido ? qty : 0,
      delta3: isPrecosido ? 0 : qty
    }
  ];

  const transId = `trans-deldel-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: refCode,
      movementType: isPrecosido ? "STOCK 2 IN" : "STOCK 3 IN",
      stock: isPrecosido ? "Stock 2" : "Stock 3",
      quantity: qty,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted delivery entry (${qty} PCS restored to ${isPrecosido ? "Stock 2" : "Stock 3"}). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "DELIVERY_REVERT",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.delete(doc(db, "deliveries", delId));
    }
  });
}

/**
 * 9b. Update / Modify a Delivery Entry
 */
export async function executeProtectedUpdateDelivery(
  deliveryId: string,
  updatedData: {
    invoiceNumber: string;
    reference: string;
    quantity: number;
    deliveryType: "PRECOSIDO" | "STEERING WHEELS";
    notes?: string;
  },
  operatorName: string,
  reason = "",
  oldData?: Delivery
) {
  let oldDel = oldData;
  if (!oldDel) {
    const snap = await getDoc(doc(db, "deliveries", deliveryId));
    if (snap.exists()) {
      oldDel = snap.data() as Delivery;
    }
  }

  if (!oldDel) {
    throw new Error("Delivery record not found");
  }

  const oldQty = oldDel.quantity || 0;
  const newQty = updatedData.quantity;
  const oldRef = oldDel.reference.trim().toUpperCase();
  const newRef = updatedData.reference.trim().toUpperCase();
  const oldPrecosido = oldDel.deliveryType === "PRECOSIDO";
  const newPrecosido = updatedData.deliveryType === "PRECOSIDO";
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = [];

  if (oldRef === newRef && oldPrecosido === newPrecosido) {
    const delta = newQty - oldQty;
    if (delta !== 0) {
      if (newPrecosido) {
        deltas.push({ reference: newRef, delta2: -delta });
      } else {
        deltas.push({ reference: newRef, delta3: -delta });
      }
    }
  } else {
    // Revert old
    if (oldPrecosido) {
      deltas.push({ reference: oldRef, delta2: oldQty });
    } else {
      deltas.push({ reference: oldRef, delta3: oldQty });
    }
    // Deduct new
    if (newPrecosido) {
      deltas.push({ reference: newRef, delta2: -newQty });
    } else {
      deltas.push({ reference: newRef, delta3: -newQty });
    }
  }

  const historyEntry = {
    action: "EDIT",
    oldQty,
    newQty,
    delta: newQty - oldQty,
    modifiedBy: operatorName,
    timestamp: Date.now(),
    reason: reason || "Operator modified delivery entry"
  };

  const existingHistory = oldDel.changeHistory || [];

  const transId = `trans-edit-del-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: newRef,
      movementType: "DELIVERY",
      stock: newPrecosido ? "Stock 2" : "Stock 3",
      quantity: newQty,
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited Delivery ${oldRef} (${oldQty} PCS) → ${newRef} (${newQty} PCS). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "DELIVERY_UPDATE",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.update(
        doc(db, "deliveries", deliveryId),
        cleanDocData({
          invoiceNumber: updatedData.invoiceNumber,
          reference: newRef,
          quantity: newQty,
          deliveryType: updatedData.deliveryType,
          notes: updatedData.notes || "",
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    }
  });
}

/**
 * 10. Approve Intake Receiving Invoice (Atomically adds scanned items to Stock 1 or Stock 3)
 */
export async function executeProtectedApproveInvoice(
  invoiceId: string,
  operatorName: string
) {
  const invoiceRef = doc(db, "invoices", invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);

  if (!invoiceSnap.exists()) {
    throw new Error("Receiving invoice session does not exist.");
  }

  const invoiceData = invoiceSnap.data() as ReceivingInvoice;

  if (invoiceData.status === "approved") {
    throw new Error("This invoice has ALREADY been approved. Duplicate stock addition prevented.");
  }
  if (invoiceData.status === "cancelled") {
    throw new Error("This invoice has been cancelled and cannot be approved.");
  }
  if (!invoiceData.items || invoiceData.items.length === 0) {
    throw new Error("Invoice contains no scanned boxes to approve.");
  }

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const boxDocs: { id: string; doc: any }[] = [];

  // Group quantities per reference
  const grouped: Record<string, { s1: number; s2: number; s3: number }> = {};
  invoiceData.items.forEach((item) => {
    const code = item.reference.trim().toUpperCase();
    if (!grouped[code]) grouped[code] = { s1: 0, s2: 0, s3: 0 };
    if (item.destinationStock === "Stock 3") {
      grouped[code].s3 += item.quantity;
    } else if (item.destinationStock === "Stock 2") {
      grouped[code].s2 += item.quantity;
    } else {
      grouped[code].s1 += item.quantity;
    }
  });

  Object.entries(grouped).forEach(([code, vals]) => {
    deltas.push({
      reference: code,
      delta1: vals.s1,
      delta2: vals.s2,
      delta3: vals.s3
    });
  });

  invoiceData.items.forEach((item, i) => {
    const isStock3 = item.destinationStock === "Stock 3";
    const isStock2 = item.destinationStock === "Stock 2";
    const targetStock: "Stock 1" | "Stock 2" | "Stock 3" = isStock3 ? "Stock 3" : isStock2 ? "Stock 2" : "Stock 1";
    const moveType: "STOCK 1 IN" | "STOCK 2 IN" | "STOCK 3 IN" = isStock3 ? "STOCK 3 IN" : isStock2 ? "STOCK 2 IN" : "STOCK 1 IN";
    const targetLabel = isStock3
      ? "Stock 3 (Steering Wheels)"
      : isStock2
      ? "Stock 2 (Production WIP / Precosido)"
      : "Stock 1 (Mallas Not Touched)";
    const diff = item.quantity - item.expectedQty;
    const discNote =
      diff !== 0
        ? `Discrepancy: Label=${item.expectedQty}, Real=${item.quantity} (${diff > 0 ? "+" : ""}${diff} PCS)`
        : "";

    const safeBoxDocId = (item.id || item.boxBarcode || `box-${Date.now()}-${i}`)
      .replace(/[\/\\]/g, "-")
      .replace(/\s+/g, "_");

    boxDocs.push({
      id: safeBoxDocId,
      doc: {
        id: safeBoxDocId,
        barcode: item.boxBarcode,
        reference: item.reference.trim().toUpperCase(),
        expectedQty: item.expectedQty,
        actualQty: item.quantity,
        location: isStock3 ? "Finished Goods" : isStock2 ? "Production Line" : "Warehouse Storeroom",
        createdAt: item.scannedAt || timestamp,
        updatedAt: timestamp,
        materialType: item.materialType || (isStock3 ? "Steering Wheel" : isStock2 ? "Precosido / WIP" : "Mesh"),
        invoiceNumber: invoiceData.invoiceNumber,
        palletQuality: discNote,
        destinationStock: targetStock
      }
    });

    const prefix = isStock3 ? "s3in" : isStock2 ? "s2in" : "s1in";
    const transId = `trans-${prefix}-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      barcode: item.boxBarcode,
      reference: item.reference.trim().toUpperCase(),
      movementType: moveType,
      stock: targetStock,
      quantity: item.quantity,
      expectedQty: item.expectedQty,
      actualQty: item.quantity,
      difference: diff,
      operatorName,
      timestamp,
      notes:
        diff !== 0
          ? `Received via Invoice ${invoiceData.invoiceNumber} -> ${targetLabel} (Label: ${item.expectedQty} | Count: ${item.quantity} | Diff: ${diff > 0 ? "+" : ""}${diff} PCS)`
          : `Received via Invoice ${invoiceData.invoiceNumber} -> ${targetLabel}`,
      invoiceNumber: invoiceData.invoiceNumber,
      palletQuality: discNote,
      destinationStock: targetStock
    });
  });

  await executeProtectedStockOperation({
    operationType: "INVOICE_APPROVE",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      // Save boxes
      for (const b of boxDocs) {
        transaction.set(doc(db, "boxes", b.id), cleanDocData(b.doc));
      }
      // Update invoice status
      transaction.update(
        invoiceRef,
        cleanDocData({
          status: "approved",
          approvedAt: timestamp,
          approvedBy: operatorName
        })
      );
    }
  });
}

/**
 * 11. Physical Count Inventory Adjustment
 */
export async function executeProtectedSubmitAdjustment(
  adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">,
  operatorName: string
) {
  const refCode = adjustmentData.reference.trim().toUpperCase();
  const actualQty = adjustmentData.actualQty;
  const timestamp = new Date().toISOString();

  // In physical inventory adjustment, Stock 1 is explicitly set to actualQty
  const newId = `adj-${Date.now()}`;
  const boxRef = doc(db, "boxes", adjustmentData.barcode);

  const deltas: ProtectedStockDelta[] = [
    {
      reference: refCode,
      isDirectOverride: true,
      targetStock1: actualQty
    }
  ];

  const transId = `trans-adj-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      barcode: adjustmentData.barcode,
      reference: refCode,
      movementType: "STOCK 1 IN",
      stock: "Stock 1",
      quantity: actualQty,
      operatorName: adjustmentData.operatorName || operatorName,
      timestamp,
      notes: `Warehouse adjustment count: Override Stock 1`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "ADJUSTMENT",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      // Save adjustment record
      const newAdjustment: Adjustment = {
        ...adjustmentData,
        reference: refCode,
        id: newId,
        timestamp,
        status: "approved",
        stockBefore: adjustmentData.expectedQty,
        stockAdded: actualQty - adjustmentData.expectedQty,
        stockAfter: actualQty
      };
      transaction.set(doc(db, "adjustments", newId), cleanDocData(newAdjustment));

      // Save/update carton
      transaction.set(
        boxRef,
        cleanDocData({
          id: adjustmentData.barcode,
          barcode: adjustmentData.barcode,
          reference: refCode,
          expectedQty: actualQty,
          location: "Warehouse Storeroom",
          createdAt: timestamp,
          updatedAt: timestamp,
          materialType: adjustmentData.materialType || "Mesh"
        }),
        { merge: true }
      );
    }
  });
}

export const executeProtectedAdjustment = executeProtectedSubmitAdjustment;

/**
 * 12. Modify an existing invoice with automatic Stock 1 / Stock 3 reconciliation
 */
export async function executeProtectedUpdateInvoice(
  updatedInvoice: ReceivingInvoice,
  previousInvoice: ReceivingInvoice | undefined,
  operatorName: string
) {
  const timestamp = new Date().toISOString();
  const totalBoxes = updatedInvoice.items?.length || 0;
  const totalQuantity = (updatedInvoice.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const safeInvoice: ReceivingInvoice = {
    ...updatedInvoice,
    totalBoxes,
    totalQuantity,
    invoiceNumber: updatedInvoice.invoiceNumber.trim().toUpperCase()
  };

  const invoiceRef = doc(db, "invoices", safeInvoice.id);

  if (safeInvoice.status === "approved" && previousInvoice && previousInvoice.status === "approved") {
    // Calculate differences per reference
    const oldMap: Record<string, { s1: number; s2: number; s3: number }> = {};
    (previousInvoice.items || []).forEach((it) => {
      const code = it.reference.trim().toUpperCase();
      if (!oldMap[code]) oldMap[code] = { s1: 0, s2: 0, s3: 0 };
      if (it.destinationStock === "Stock 3") {
        oldMap[code].s3 += Number(it.quantity) || 0;
      } else if (it.destinationStock === "Stock 2") {
        oldMap[code].s2 += Number(it.quantity) || 0;
      } else {
        oldMap[code].s1 += Number(it.quantity) || 0;
      }
    });

    const newMap: Record<string, { s1: number; s2: number; s3: number }> = {};
    (safeInvoice.items || []).forEach((it) => {
      const code = it.reference.trim().toUpperCase();
      if (!newMap[code]) newMap[code] = { s1: 0, s2: 0, s3: 0 };
      if (it.destinationStock === "Stock 3") {
        newMap[code].s3 += Number(it.quantity) || 0;
      } else if (it.destinationStock === "Stock 2") {
        newMap[code].s2 += Number(it.quantity) || 0;
      } else {
        newMap[code].s1 += Number(it.quantity) || 0;
      }
    });

    const allRefs = Array.from(new Set([...Object.keys(oldMap), ...Object.keys(newMap)]));
    const deltas: ProtectedStockDelta[] = [];
    const transactions: any[] = [];

    allRefs.forEach((code) => {
      const deltaS1 = (newMap[code]?.s1 || 0) - (oldMap[code]?.s1 || 0);
      const deltaS2 = (newMap[code]?.s2 || 0) - (oldMap[code]?.s2 || 0);
      const deltaS3 = (newMap[code]?.s3 || 0) - (oldMap[code]?.s3 || 0);

      if (deltaS1 !== 0 || deltaS2 !== 0 || deltaS3 !== 0) {
        deltas.push({
          reference: code,
          delta1: deltaS1,
          delta2: deltaS2,
          delta3: deltaS3
        });

        if (deltaS1 !== 0) {
          const transId = `trans-invmod-s1-${Date.now()}-${code}-${Math.random().toString(36).substring(2, 5)}`;
          transactions.push({
            id: transId,
            reference: code,
            movementType: deltaS1 > 0 ? "STOCK 1 IN" : "STOCK 1 OUT",
            stock: "Stock 1",
            quantity: Math.abs(deltaS1),
            actualQty: Math.abs(deltaS1),
            difference: deltaS1,
            operatorName,
            timestamp,
            notes: `Invoice ${safeInvoice.invoiceNumber} modified: ${deltaS1 > 0 ? `+${deltaS1}` : deltaS1} PCS adjustment on Stock 1`,
            invoiceNumber: safeInvoice.invoiceNumber,
            destinationStock: "Stock 1"
          });
        }

        if (deltaS2 !== 0) {
          const transId = `trans-invmod-s2-${Date.now()}-${code}-${Math.random().toString(36).substring(2, 5)}`;
          transactions.push({
            id: transId,
            reference: code,
            movementType: deltaS2 > 0 ? "STOCK 2 IN" : "STOCK 2 OUT",
            stock: "Stock 2",
            quantity: Math.abs(deltaS2),
            actualQty: Math.abs(deltaS2),
            difference: deltaS2,
            operatorName,
            timestamp,
            notes: `Invoice ${safeInvoice.invoiceNumber} modified: ${deltaS2 > 0 ? `+${deltaS2}` : deltaS2} PCS adjustment on Stock 2`,
            invoiceNumber: safeInvoice.invoiceNumber,
            destinationStock: "Stock 2"
          });
        }

        if (deltaS3 !== 0) {
          const transId = `trans-invmod-s3-${Date.now()}-${code}-${Math.random().toString(36).substring(2, 5)}`;
          transactions.push({
            id: transId,
            reference: code,
            movementType: deltaS3 > 0 ? "STOCK 3 IN" : "STOCK 3 OUT",
            stock: "Stock 3",
            quantity: Math.abs(deltaS3),
            actualQty: Math.abs(deltaS3),
            difference: deltaS3,
            operatorName,
            timestamp,
            notes: `Invoice ${safeInvoice.invoiceNumber} modified: ${deltaS3 > 0 ? `+${deltaS3}` : deltaS3} PCS adjustment on Stock 3`,
            invoiceNumber: safeInvoice.invoiceNumber,
            destinationStock: "Stock 3"
          });
        }
      }
    });

    await executeProtectedStockOperation({
      operationType: "INVOICE_UPDATE_RECONCILE",
      deltas,
      operatorName,
      transactions,
      additionalWrites: (transaction) => {
        transaction.update(
          invoiceRef,
          cleanDocData({
            ...safeInvoice,
            updatedAt: timestamp,
            updatedBy: operatorName
          })
        );
      }
    });
  } else {
    // No stock impact (e.g. pending invoice edit)
    await setDoc(
      invoiceRef,
      cleanDocData({
        ...safeInvoice,
        updatedAt: timestamp,
        updatedBy: operatorName
      }),
      { merge: true }
    );
  }
}

/**
 * 13. Supervisor / Manager Action: Edit operation quantity & record audit history
 */
export async function executeProtectedEditOperation(
  opId: string,
  category: string,
  newQty: number,
  reason: string,
  operatorName: string
) {
  if (!reason || reason.trim() === "") {
    throw new Error("A reason for correction is required.");
  }

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  let additionalWrites: ((transaction: Transaction) => void) | undefined;

  if (category === "adjustment") {
    const adjSnap = await getDoc(doc(db, "adjustments", opId));
    if (!adjSnap.exists()) throw new Error("Adjustment record not found");
    const adjData = adjSnap.data() as Adjustment;
    const oldQty = adjData.actualQty;
    const delta = newQty - oldQty;
    const refCode = adjData.reference.trim().toUpperCase();

    deltas.push({ reference: refCode, delta1: delta });

    const historyEntry = {
      action: "EDIT",
      oldQty,
      newQty,
      delta,
      modifiedBy: operatorName,
      timestamp,
      reason
    };
    const existingHistory = adjData.changeHistory || [];

    const transId = `trans-edit-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 1 IN",
      stock: "Stock 1",
      quantity: Math.abs(delta),
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited physical count ${oldQty} → ${newQty}. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.update(
        doc(db, "adjustments", opId),
        cleanDocData({
          actualQty: newQty,
          difference: newQty - adjData.expectedQty,
          stockAfter: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "delivery") {
    const delSnap = await getDoc(doc(db, "deliveries", opId));
    if (!delSnap.exists()) throw new Error("Delivery record not found");
    const delData = delSnap.data() as Delivery;
    const oldQty = delData.quantity;
    const delta = newQty - oldQty;
    const refCode = delData.reference.trim().toUpperCase();

    if (delData.deliveryType === "PRECOSIDO") {
      deltas.push({ reference: refCode, delta2: -delta });
    } else {
      deltas.push({ reference: refCode, delta3: -delta });
    }

    const historyEntry = {
      action: "EDIT",
      oldQty,
      newQty,
      delta,
      modifiedBy: operatorName,
      timestamp,
      reason
    };
    const existingHistory = delData.changeHistory || [];

    const transId = `trans-edit-del-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "DELIVERY",
      stock: delData.deliveryType === "PRECOSIDO" ? "Stock 2" : "Stock 3",
      quantity: newQty,
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited Delivery ${oldQty} → ${newQty}. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.update(
        doc(db, "deliveries", opId),
        cleanDocData({
          quantity: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "production") {
    const prodSnap = await getDoc(doc(db, "productions", opId));
    if (!prodSnap.exists()) throw new Error("Production record not found");
    const prodData = prodSnap.data() as Production;
    const oldQty = prodData.quantity;
    const delta = newQty - oldQty;
    const refCode = prodData.reference.trim().toUpperCase();

    deltas.push({
      reference: refCode,
      delta2: -delta,
      delta3: delta
    });

    const historyEntry = {
      action: "EDIT",
      oldQty,
      newQty,
      delta,
      modifiedBy: operatorName,
      timestamp,
      reason
    };
    const existingHistory = prodData.changeHistory || [];

    const transId = `trans-edit-prod-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 2 OUT / STOCK 3 IN",
      stock: "Stock 2 -> Stock 3",
      quantity: newQty,
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited Production ${oldQty} → ${newQty}. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.update(
        doc(db, "productions", opId),
        cleanDocData({
          quantity: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "scrap") {
    const scrapSnap = await getDoc(doc(db, "scraps", opId));
    if (!scrapSnap.exists()) throw new Error("Scrap record not found");
    const scrapData = scrapSnap.data() as ScrapEntry;
    const oldQty = scrapData.quantity;
    const delta = newQty - oldQty;
    const refCode = scrapData.reference.trim().toUpperCase();

    if (scrapData.stockDeductedFrom === "Stock 1") {
      deltas.push({ reference: refCode, delta1: -delta });
    } else if (scrapData.stockDeductedFrom === "Stock 2") {
      deltas.push({ reference: refCode, delta2: -delta });
    } else {
      deltas.push({ reference: refCode, delta3: -delta });
    }

    const historyEntry = {
      action: "EDIT",
      oldQty,
      newQty,
      delta,
      modifiedBy: operatorName,
      timestamp,
      reason
    };
    const existingHistory = scrapData.changeHistory || [];

    const transId = `trans-edit-scrap-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: scrapData.condition === "CON COLA" ? "SCRAP (CON COLA)" : "SCRAP (SIN COLA)",
      stock: scrapData.stockDeductedFrom,
      quantity: newQty,
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited Scrap ${oldQty} → ${newQty}. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.update(
        doc(db, "scraps", opId),
        cleanDocData({
          quantity: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "transfer" || category === "return" || category === "transaction") {
    const txId = opId.startsWith("tx-")
      ? opId.replace("tx-", "")
      : opId.startsWith("batch-trf-")
      ? opId.replace("batch-trf-", "")
      : opId;
    const txSnap = await getDoc(doc(db, "transactions", txId));
    if (!txSnap.exists()) throw new Error("Transaction record not found");
    const txData = txSnap.data();

    if (txData.status === "REVERSED") {
      throw new Error("Cannot modify an operation that has been reversed.");
    }

    const oldQty = txData.quantity || 0;
    const delta = newQty - oldQty;
    const refCode = (txData.reference || "").trim().toUpperCase();

    if (txData.movementType === "TRANSFER S1->S2" || txData.movementType === "TRANSFER") {
      deltas.push({ reference: refCode, delta1: -delta, delta2: delta });
    } else if (txData.movementType === "RETURN S2->S1" || txData.movementType?.includes("RETURN")) {
      deltas.push({ reference: refCode, delta1: delta, delta2: -delta });
    } else {
      const isAddition =
        txData.movementType?.includes("IN") ||
        txData.movementType?.includes("ADD") ||
        txData.movementType?.includes("ADJUSTMENT");
      const change = isAddition ? delta : -delta;

      if (txData.stock === "Stock 1") deltas.push({ reference: refCode, delta1: change });
      else if (txData.stock === "Stock 2") deltas.push({ reference: refCode, delta2: change });
      else if (txData.stock === "Stock 3") deltas.push({ reference: refCode, delta3: change });
      else if (txData.stock === "Stock 2 -> Stock 3") deltas.push({ reference: refCode, delta2: -delta, delta3: delta });
    }

    const historyEntry = {
      action: "EDIT",
      oldQty,
      newQty,
      delta,
      modifiedBy: operatorName,
      timestamp,
      reason
    };
    const existingHistory = txData.changeHistory || [];

    const editTransId = `trans-edit-tx-${Date.now()}`;
    transactions.push({
      id: editTransId,
      reference: refCode,
      movementType: `${txData.movementType || "TRANSFER"} (EDIT)`,
      stock: txData.stock || "Stock 1 -> Stock 2",
      quantity: Math.abs(delta),
      operatorName: `${operatorName} (Correction)`,
      timestamp,
      notes: `Edited operation ${oldQty} → ${newQty} (Diff: ${delta > 0 ? `+${delta}` : delta}). Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.update(
        doc(db, "transactions", txId),
        cleanDocData({
          quantity: newQty,
          originalQuantity: txData.originalQuantity !== undefined ? txData.originalQuantity : oldQty,
          lastModifiedAt: timestamp,
          lastModifiedBy: operatorName,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry],
          notes: `${txData.notes || ""} | Corrected from ${oldQty} to ${newQty} on ${timestamp} by ${operatorName}. Reason: ${reason}`
        })
      );
    };
  }

  await executeProtectedStockOperation({
    operationType: "OPERATION_EDIT",
    deltas,
    operatorName,
    transactions,
    additionalWrites
  });
}

/**
 * 14. Delete or Reverse Operation
 */
export async function executeProtectedDeleteOrReverseOperation(
  opId: string,
  category: string,
  reason: string,
  operatorName: string
) {
  if (!reason || reason.trim() === "") {
    throw new Error("A reason for deletion is required.");
  }

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  let additionalWrites: ((transaction: Transaction) => void) | undefined;

  if (category === "adjustment") {
    const adjSnap = await getDoc(doc(db, "adjustments", opId));
    if (!adjSnap.exists()) throw new Error("Adjustment record not found");
    const adjData = adjSnap.data() as Adjustment;
    const refCode = adjData.reference.trim().toUpperCase();
    const stockAdded = adjData.stockAdded || 0;

    deltas.push({ reference: refCode, delta1: -stockAdded });

    const transId = `trans-del-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 1 OUT",
      stock: "Stock 1",
      quantity: Math.abs(stockAdded),
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted operation reversal. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.delete(doc(db, "adjustments", opId));
    };
  } else if (category === "delivery") {
    const delSnap = await getDoc(doc(db, "deliveries", opId));
    if (!delSnap.exists()) throw new Error("Delivery record not found");
    const delData = delSnap.data() as Delivery;
    const refCode = delData.reference.trim().toUpperCase();
    const isPrecosido = delData.deliveryType === "PRECOSIDO";

    deltas.push({
      reference: refCode,
      delta2: isPrecosido ? delData.quantity : 0,
      delta3: isPrecosido ? 0 : delData.quantity
    });

    const transId = `trans-del-del-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: isPrecosido ? "STOCK 2 IN" : "STOCK 3 IN",
      stock: isPrecosido ? "Stock 2" : "Stock 3",
      quantity: delData.quantity,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted delivery reversal. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.delete(doc(db, "deliveries", opId));
    };
  } else if (category === "production") {
    const prodSnap = await getDoc(doc(db, "productions", opId));
    if (!prodSnap.exists()) throw new Error("Production record not found");
    const prodData = prodSnap.data() as Production;
    const refCode = prodData.reference.trim().toUpperCase();

    deltas.push({
      reference: refCode,
      delta2: prodData.quantity,
      delta3: -prodData.quantity
    });

    const transId = `trans-del-prod-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 3 OUT / STOCK 2 IN",
      stock: "Stock 3 -> Stock 2",
      quantity: prodData.quantity,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted production reversal. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.delete(doc(db, "productions", opId));
    };
  } else if (category === "scrap") {
    const scrapSnap = await getDoc(doc(db, "scraps", opId));
    if (!scrapSnap.exists()) throw new Error("Scrap record not found");
    const scrapData = scrapSnap.data() as ScrapEntry;
    const refCode = scrapData.reference.trim().toUpperCase();

    if (scrapData.stockDeductedFrom === "Stock 1") {
      deltas.push({ reference: refCode, delta1: scrapData.quantity });
    } else if (scrapData.stockDeductedFrom === "Stock 2") {
      deltas.push({ reference: refCode, delta2: scrapData.quantity });
    } else {
      deltas.push({ reference: refCode, delta3: scrapData.quantity });
    }

    const transId = `trans-del-scrap-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: scrapData.stockDeductedFrom === "Stock 2" ? "STOCK 2 IN" : "STOCK 3 IN",
      stock: scrapData.stockDeductedFrom,
      quantity: scrapData.quantity,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted scrap reversal. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.delete(doc(db, "scraps", opId));
    };
  } else if (category === "invoice") {
    const invSnap = await getDoc(doc(db, "invoices", opId));
    if (!invSnap.exists()) throw new Error("Invoice record not found");
    const invData = invSnap.data() as ReceivingInvoice;

    if (invData.status === "approved" && invData.items) {
      for (const item of invData.items) {
        const refCode = item.reference.trim().toUpperCase();
        if (item.destinationStock === "Stock 3") {
          deltas.push({ reference: refCode, delta3: -item.quantity });
        } else if (item.destinationStock === "Stock 2") {
          deltas.push({ reference: refCode, delta2: -item.quantity });
        } else {
          deltas.push({ reference: refCode, delta1: -item.quantity });
        }
      }
    }

    const transId = `trans-del-inv-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: invData.invoiceNumber,
      movementType: "STOCK 1 OUT",
      stock: "Stock 1",
      quantity: invData.totalQuantity || 0,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted invoice intake #${invData.invoiceNumber} reversal. Reason: ${reason}`
    });

    additionalWrites = (transaction) => {
      transaction.delete(doc(db, "invoices", opId));
    };
  } else if (category === "transfer" || category === "return" || category === "transaction") {
    const txId = opId.startsWith("tx-")
      ? opId.replace("tx-", "")
      : opId.startsWith("batch-trf-")
      ? opId.replace("batch-trf-", "")
      : opId;
    const txSnap = await getDoc(doc(db, "transactions", txId));
    if (!txSnap.exists()) throw new Error("Transaction record not found");
    const txData = txSnap.data();

    if (txData.status === "REVERSED") {
      throw new Error("This operation has already been reversed.");
    }

    const qty = txData.quantity || 0;
    const refCode = (txData.reference || "").trim().toUpperCase();

    if (txData.movementType === "TRANSFER S1->S2" || txData.movementType === "TRANSFER") {
      deltas.push({ reference: refCode, delta1: qty, delta2: -qty });
    } else if (txData.movementType === "RETURN S2->S1" || txData.movementType?.includes("RETURN")) {
      deltas.push({ reference: refCode, delta1: -qty, delta2: qty });
    } else {
      const isAddition =
        txData.movementType?.includes("IN") ||
        txData.movementType?.includes("ADD") ||
        txData.movementType?.includes("ADJUSTMENT");
      const factor = isAddition ? -1 : 1;
      const change = qty * factor;

      if (txData.stock === "Stock 1") deltas.push({ reference: refCode, delta1: change });
      else if (txData.stock === "Stock 2") deltas.push({ reference: refCode, delta2: change });
      else if (txData.stock === "Stock 3") deltas.push({ reference: refCode, delta3: change });
      else if (txData.stock === "Stock 2 -> Stock 3") deltas.push({ reference: refCode, delta2: qty, delta3: -qty });
    }

    const transId = `trans-del-tx-${Date.now()}`;
    transactions.push({
      id: transId,
      reference: txData.reference || "System",
      movementType: "REVERSAL",
      stock: txData.stock || "Stock Balances",
      quantity: txData.quantity || 0,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted operation (${txData.movementType}) reversal. Reason: ${reason}`
    });

    if (category === "transfer" || txData.movementType === "TRANSFER S1->S2" || txData.movementType === "TRANSFER") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "transactions", txId),
          cleanDocData({
            status: "REVERSED",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason,
            notes: `${txData.notes || ""} | REVERSED on ${timestamp} by ${operatorName}. Reason: ${reason}`
          })
        );
      };
    } else {
      additionalWrites = (transaction) => {
        transaction.delete(doc(db, "transactions", txId));
      };
    }
  }

  await executeProtectedStockOperation({
    operationType: "OPERATION_REVERSE",
    deltas,
    operatorName,
    transactions,
    additionalWrites
  });
}

/**
 * 15. Delete a single Carton Box (Atomically deducts Stock 1)
 */
export async function executeProtectedDeleteBox(
  boxId: string,
  operatorName: string,
  boxData?: Box
) {
  let box = boxData;
  if (!box) {
    const snap = await getDoc(doc(db, "boxes", boxId));
    if (snap.exists()) {
      box = snap.data() as Box;
    }
  }

  const refCode = (box?.reference || "").trim().toUpperCase();
  const boxQty = box?.actualQty !== undefined ? box.actualQty : box?.expectedQty || 0;
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = refCode ? [{ reference: refCode, delta1: -boxQty }] : [];

  const transId = `trans-delbox-${Date.now()}`;
  const transactions: any[] = refCode
    ? [
        {
          id: transId,
          barcode: box?.barcode || boxId,
          reference: refCode,
          movementType: "STOCK 1 REMOVED",
          stock: "Stock 1",
          quantity: boxQty,
          operatorName,
          timestamp,
          notes: `Deleted carton box ${box?.barcode || boxId} (${boxQty} PCS removed from Stock 1)`
        }
      ]
    : [];

  await executeProtectedStockOperation({
    operationType: "BOX_REMOVE",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.delete(doc(db, "boxes", boxId));
    }
  });
}

/**
 * 16. Update a Carton Box (Handles qty change or reference reassignment)
 */
export async function executeProtectedUpdateBox(
  boxId: string,
  updatedFields: Partial<Box>,
  operatorName: string,
  oldBoxData?: Box
) {
  let oldBox = oldBoxData;
  if (!oldBox) {
    const snap = await getDoc(doc(db, "boxes", boxId));
    if (snap.exists()) {
      oldBox = snap.data() as Box;
    }
  }

  const oldQty = oldBox?.actualQty !== undefined ? oldBox.actualQty : oldBox?.expectedQty || 0;
  const newQty =
    updatedFields.actualQty !== undefined
      ? updatedFields.actualQty
      : updatedFields.expectedQty !== undefined
      ? updatedFields.expectedQty
      : oldQty;

  const oldRefCode = (oldBox?.reference || "").trim().toUpperCase();
  const newRefCode = updatedFields.reference ? updatedFields.reference.trim().toUpperCase() : oldRefCode;
  const timestamp = new Date().toISOString();

  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];

  if (oldRefCode && newRefCode && oldRefCode !== newRefCode) {
    // Reassigned
    deltas.push({ reference: oldRefCode, delta1: -oldQty });
    deltas.push({ reference: newRefCode, delta1: newQty });

    const transId = `trans-reassigned-${Date.now()}`;
    transactions.push({
      id: transId,
      barcode: oldBox?.barcode || boxId,
      reference: newRefCode,
      movementType: "BOX REASSIGNED",
      stock: "Stock 1",
      quantity: newQty,
      operatorName,
      timestamp,
      notes: `Reassigned box ${oldBox?.barcode || boxId} from ${oldRefCode} (${oldQty} PCS) to ${newRefCode} (${newQty} PCS)`
    });
  } else if (oldRefCode) {
    const delta = newQty - oldQty;
    if (delta !== 0) {
      deltas.push({ reference: oldRefCode, delta1: delta });

      const transId = `trans-updbox-${Date.now()}`;
      transactions.push({
        id: transId,
        barcode: oldBox?.barcode || boxId,
        reference: oldRefCode,
        movementType: delta > 0 ? "STOCK 1 IN" : "STOCK 1 REMOVED",
        stock: "Stock 1",
        quantity: Math.abs(delta),
        operatorName,
        timestamp,
        notes: `Updated carton box ${oldBox?.barcode || boxId} qty from ${oldQty} to ${newQty} PCS`
      });
    }
  }

  await executeProtectedStockOperation({
    operationType: "BOX_UPDATE",
    deltas,
    operatorName,
    transactions,
    additionalWrites: (transaction) => {
      transaction.set(
        doc(db, "boxes", boxId),
        cleanDocData({
          ...updatedFields,
          expectedQty:
            updatedFields.expectedQty !== undefined ? updatedFields.expectedQty : oldBox?.expectedQty,
          actualQty: newQty,
          updatedAt: timestamp
        }),
        { merge: true }
      );
    }
  });
}
