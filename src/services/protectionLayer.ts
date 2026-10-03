import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  collection,
  Transaction,
  getDocs,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ProtectionLog,
  ProtectionEventType,
  InventoryTransaction,
  Delivery,
  Production,
  DisassemblyEntry,
  ScrapEntry,
  Adjustment,
  ReceivingInvoice,
  Box,
  Reference,
  MeshInventoryAdjustment,
  MeshPhysicalInventoryParams
} from "../types";

// In-Memory Idempotency / Duplicate Prevention Cache (Window: 10 seconds)
const duplicateGuardCache = new Map<string, { timestamp: number; result: any }>();

// Periodic cleanup of stale cache keys
const dedupCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of duplicateGuardCache.entries()) {
    if (now - val.timestamp > 60000) {
      duplicateGuardCache.delete(key);
    }
  }
}, 60000);
if (typeof dedupCleanupInterval.unref === "function") {
  dedupCleanupInterval.unref();
}

/**
 * Defensive Security: Operation ID validation (Blocks forged, script-injected, or malformed IDs)
 */
export function validateOperationId(id: any, fieldName = "operationId"): { valid: boolean; error?: string; cleanId: string } {
  if (typeof id !== "string" || !id.trim()) {
    return { valid: false, error: `${fieldName} must be a non-empty string.`, cleanId: "" };
  }
  const clean = id.trim();
  if (clean.length > 128) {
    return { valid: false, error: `${fieldName} exceeds maximum permitted length (128 characters).`, cleanId: clean };
  }
  // Safe ID pattern: letters, numbers, hyphens, underscores, dots, colons
  if (!/^[a-zA-Z0-9_\-\.:]+$/.test(clean)) {
    return { valid: false, error: `${fieldName} contains illegal or forged characters.`, cleanId: clean };
  }
  return { valid: true, cleanId: clean };
}

/**
 * Defensive Security: Reference code validation (Blocks invalid reference IDs, malformed references)
 */
export function validateReferenceCode(code: any, fieldName = "reference"): { valid: boolean; error?: string; cleanCode: string } {
  if (typeof code !== "string" || !code.trim()) {
    return { valid: false, error: `${fieldName} code must be a non-empty string.`, cleanCode: "" };
  }
  const clean = code.trim().toUpperCase();
  if (clean.length < 2 || clean.length > 60) {
    return { valid: false, error: `${fieldName} code must be between 2 and 60 characters (got: "${clean}").`, cleanCode: clean };
  }
  if (!/^[a-zA-Z0-9_\-\.\/ ]+$/.test(clean)) {
    return { valid: false, error: `${fieldName} code "${clean}" contains invalid characters.`, cleanCode: clean };
  }
  return { valid: true, cleanCode: clean };
}

/**
 * Defensive Security: Timestamp validation (Blocks forged future timestamps or malformed date values)
 */
export function validateTimestamp(ts: any): { valid: boolean; cleanTimestamp: string } {
  if (!ts) {
    return { valid: true, cleanTimestamp: new Date().toISOString() };
  }
  const parsed = Date.parse(ts);
  if (isNaN(parsed)) {
    return { valid: false, cleanTimestamp: new Date().toISOString() };
  }
  // Block timestamps more than 24 hours in the future
  if (parsed > Date.now() + 24 * 60 * 60 * 1000) {
    return { valid: false, cleanTimestamp: new Date().toISOString() };
  }
  return { valid: true, cleanTimestamp: new Date(parsed).toISOString() };
}

/**
 * Defensive Security: Session verification (FAILS CLOSED if session is missing or unauthenticated)
 */
export function assertAuthorizedSession(
  user?: { id?: string; fullName?: string; role?: string } | null
): { id: string; fullName: string; role: "operator" | "supervisor" | "admin" } {
  if (!user || !user.fullName || !user.role) {
    const err = "UNAUTHORIZED_ACCESS: No authenticated user session.";
    logProtectionIncident({
      eventType: "UNAUTHORIZED_ACTION_BLOCKED",
      attemptedOperation: "SESSION_AUTHENTICATION",
      reason: err,
      operator: "Unauthenticated",
      source: "DefensiveSecurityLayer"
    });
    throw new Error(err);
  }
  const cleanRole = user.role.toLowerCase() as "operator" | "supervisor" | "admin";
  if (cleanRole !== "operator" && cleanRole !== "supervisor" && cleanRole !== "admin") {
    const err = `UNAUTHORIZED_ACCESS: Invalid user role "${user.role}".`;
    logProtectionIncident({
      eventType: "UNAUTHORIZED_ACTION_BLOCKED",
      attemptedOperation: "SESSION_AUTHENTICATION",
      reason: err,
      operator: user.fullName,
      source: "DefensiveSecurityLayer"
    });
    throw new Error(err);
  }
  return { id: user.id || user.fullName, fullName: user.fullName, role: cleanRole };
}

/**
 * Defensive Security: Manager/Admin Action Gate (BLOCKS Operators from performing Manager/Admin actions)
 */
export function assertManagerOrAdminAction(
  actionName: string,
  role?: string,
  operatorName?: string
): void {
  const cleanRole = (role || "").toLowerCase();
  if (cleanRole === "operator" || (cleanRole !== "admin" && cleanRole !== "supervisor")) {
    const err = `PERMISSION_DENIED: Operators are not authorized to perform Manager/Admin action "${actionName}". Supervisor or Manager authorization required.`;
    logProtectionIncident({
      eventType: "UNAUTHORIZED_ACTION_BLOCKED",
      attemptedOperation: actionName,
      reason: err,
      operator: operatorName || "Operator",
      source: "DefensiveSecurityLayer"
    });
    throw new Error(err);
  }
}

/**
 * Defensive Security: User Account and Role Protection
 * 1. BLOCKS non-admin users from creating, editing, or deleting accounts
 * 2. BLOCKS users from altering their own role or permissions (self-escalation defense)
 */
export function assertCanManageUser(
  actingUser: { id?: string; role?: string; fullName?: string } | null | undefined,
  targetUserId: string,
  updatedFields?: any
): void {
  if (!actingUser || (actingUser.role !== "admin" && actingUser.role !== "supervisor")) {
    const err = "PERMISSION_DENIED: Only Administrators can create, modify, or delete user accounts.";
    logProtectionIncident({
      eventType: "UNAUTHORIZED_ACTION_BLOCKED",
      attemptedOperation: "USER_MANAGEMENT",
      reason: err,
      operator: actingUser?.fullName || "Anonymous",
      source: "DefensiveSecurityLayer"
    });
    throw new Error(err);
  }

  // Self-role / Self-permission escalation defense
  if (actingUser.id === targetUserId && updatedFields && updatedFields.role && updatedFields.role !== actingUser.role) {
    const err = "SECURITY_VIOLATION: Users are strictly forbidden from altering their own role or permissions.";
    logProtectionIncident({
      eventType: "ROLE_MODIFICATION_BLOCKED",
      attemptedOperation: "SELF_ROLE_MODIFICATION",
      reason: err,
      operator: actingUser.fullName,
      source: "DefensiveSecurityLayer",
      payloadSummary: JSON.stringify({ targetUserId, attemptedRole: updatedFields.role })
    });
    throw new Error(err);
  }
}

/**
 * Defensive Security: Audit Immutability Guard
 * BLOCKS deletion of historical audit logs in transactions, bezel_operations, or protection_logs.
 */
export function assertAuditImmutability(
  collectionName: string,
  docId: string,
  operation: "delete" | "modify",
  operatorName?: string
): void {
  if (collectionName === "transactions" || collectionName === "bezel_operations" || collectionName === "protection_logs") {
    if (operation === "delete") {
      const err = `SECURITY_VIOLATION: Historical audit record ${collectionName}/${docId} is immutable and cannot be deleted.`;
      logProtectionIncident({
        eventType: "AUDIT_MUTATION_BLOCKED",
        attemptedOperation: `DELETE_${collectionName.toUpperCase()}`,
        reason: err,
        operator: operatorName || "System",
        source: "DefensiveSecurityLayer"
      });
      throw new Error(err);
    }
  }
}

/**
 * Defensive Security: Direct Stock Modification Guard
 * BLOCKS direct stock field overwriting outside approved workflows.
 */
export function assertCanDirectlyModifyStock(
  userRole?: string,
  refCode?: string,
  operatorName?: string
): void {
  const cleanRole = (userRole || "").toLowerCase();
  if (cleanRole === "operator") {
    const err = `SECURITY_VIOLATION: Direct stock modification on reference "${refCode || "unknown"}" is blocked for Operators.`;
    logProtectionIncident({
      eventType: "DIRECT_STOCK_MODIFICATION_BLOCKED",
      attemptedOperation: "DIRECT_STOCK_EDIT",
      reason: err,
      operator: operatorName || "Operator",
      source: "DefensiveSecurityLayer"
    });
    throw new Error(err);
  }
}

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
export async function logProtectionIncident(incident: Omit<ProtectionLog, "id" | "timestamp"> & { timestamp?: string }): Promise<void> {
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
  if (Math.abs(num) > 10000000) {
    return { valid: false, error: `${fieldName} exceeds maximum allowable physical threshold (10,000,000)`, value: num };
  }
  return { valid: true, value: num };
}

export interface ProtectedStockDelta {
  reference: string;
  delta1?: number;
  delta2?: number;
  delta2Subtype?: "normal" | "disassembly";
  targetStock2Normal?: number;
  targetStock2Disassembly?: number;
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
  // If true, any resulting negative stock will be floored/clamped to 0 instead of rejecting (used for production reversals when finished goods were partially dispatched)
  clampToZeroOnNegative?: boolean;
  // If true, negative resulting stock is allowed and will NOT throw PROTECTION_NEGATIVE_STOCK (e.g. for customer deliveries)
  allowNegativeStock?: boolean;
  // Direct callback execution mode (e.g., used by Dashboard quick actions and OperatorWorkspace)
  execute?: (
    refData: Reference,
    transaction: Transaction
  ) => Promise<{
    stockChanges?: {
      referenceCode: string;
      newStock1: number;
      newStock2: number;
      newStock2Normal?: number;
      newStock2Disassembly?: number;
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
    execute,
    clampToZeroOnNegative = false,
    allowNegativeStock = false
  } = params;

  // 1. Idempotency / Duplicate & Replay Check
  const effectiveDedupKey = idempotencyKey || (deltas.length > 0
    ? `auto-${operationType}-${(operatorName || "").trim().toLowerCase()}-${deltas.map(d => `${d.reference}:${d.delta1 || 0}:${d.delta2 || 0}:${d.delta3 || 0}`).join(";")}`
    : undefined);

  if (effectiveDedupKey) {
    const cached = duplicateGuardCache.get(effectiveDedupKey);
    if (cached && Date.now() - cached.timestamp < 10000) {
      console.warn(`[ProtectionLayer] Duplicate operation suppressed for key: ${effectiveDedupKey}`);
      logProtectionIncident({
        eventType: "DUPLICATE_OPERATION_BLOCKED",
        attemptedOperation: operationType,
        reason: `Replayed or duplicate operation suppressed (${effectiveDedupKey})`,
        operator: operatorName,
        source
      });
      return { success: true, details: cached.result };
    }
  }

  // Defensive validation: Operator identity must be present
  if (!operatorName || typeof operatorName !== "string" || !operatorName.trim()) {
    const errStr = `Operation ${operationType} rejected: Operator name is required.`;
    await logProtectionIncident({
      eventType: "UNAUTHORIZED_ACTION_BLOCKED",
      attemptedOperation: operationType,
      reason: errStr,
      operator: "Anonymous",
      source
    });
    throw new Error(errStr);
  }

  const timestamp = new Date().toISOString();

  // Functional callback execution branch (e.g. from Dashboard quick actions)
  if (execute) {
    const targetRefCode = (referenceCode || deltas[0]?.reference || "").trim().toUpperCase();
    if (!targetRefCode) {
      throw new Error(`Reference code is required for ${operationType}`);
    }
    const refCodeCheck = validateReferenceCode(targetRefCode, "Target reference");
    if (!refCodeCheck.valid) {
      throw new Error(refCodeCheck.error);
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
              if (allowNegativeStock || operationType === "DELIVERY" || operationType === "DELIVERY_UPDATE") {
                // Negative stock allowed (e.g. customer deliveries)
              } else if (clampToZeroOnNegative) {
                if (change.newStock1 < 0) change.newStock1 = 0;
                if (change.newStock2 < 0) change.newStock2 = 0;
                if (change.newStock3 < 0) change.newStock3 = 0;
              } else {
                const negStockDetails = [];
                if (change.newStock1 < 0) negStockDetails.push(`Stock 1 would be ${change.newStock1}`);
                if (change.newStock2 < 0) negStockDetails.push(`Stock 2 would be ${change.newStock2}`);
                if (change.newStock3 < 0) negStockDetails.push(`Stock 3 would be ${change.newStock3}`);
                throw new Error(`PROTECTION_NEGATIVE_STOCK:Insufficient stock for Reference "${code}". ${negStockDetails.join(", ")}.`);
              }
            }

            const targetDoc = doc(db, "references", code);
            const total = change.newStock1 + change.newStock2 + change.newStock3;
            const patch: Record<string, any> = {
              stock1: change.newStock1,
              stock2: change.newStock2,
              stock3: change.newStock3,
              currentStock: total,
              lastUpdate: timestamp
            };
            if (change.newStock2Normal !== undefined) patch.stock2Normal = change.newStock2Normal;
            if (change.newStock2Disassembly !== undefined) patch.stock2Disassembly = change.newStock2Disassembly;
            transaction.set(targetDoc, cleanDocData(patch), { merge: true });
          }
        }

        return execResult;
      });

      if (effectiveDedupKey) {
        duplicateGuardCache.set(effectiveDedupKey, { timestamp: Date.now(), result });
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

  // Declarative deltas branch - rigorous defensive pre-validation
  for (const d of deltas) {
    const refCheck = validateReferenceCode(d.reference, `Reference in operation ${operationType}`);
    if (!refCheck.valid) {
      await logProtectionIncident({
        eventType: "UNKNOWN_REFERENCE_BLOCKED",
        attemptedOperation: operationType,
        reason: refCheck.error || "Invalid reference code",
        operator: operatorName,
        source
      });
      throw new Error(refCheck.error);
    }

    if (!d.isDirectOverride) {
      if (d.delta1 !== undefined) {
        const q1 = validateQuantity(d.delta1, `Stock 1 delta for ${d.reference}`, { allowNegative: true, allowZero: true });
        if (!q1.valid) throw new Error(q1.error);
      }
      if (d.delta2 !== undefined) {
        const q2 = validateQuantity(d.delta2, `Stock 2 delta for ${d.reference}`, { allowNegative: true, allowZero: true });
        if (!q2.valid) throw new Error(q2.error);
      }
      if (d.delta3 !== undefined) {
        const q3 = validateQuantity(d.delta3, `Stock 3 delta for ${d.reference}`, { allowNegative: true, allowZero: true });
        if (!q3.valid) throw new Error(q3.error);
      }
    }
  }

  // Validate incoming transactions
  for (const tx of transactions) {
    if (tx.id) {
      const idCheck = validateOperationId(tx.id, "Transaction ID");
      if (!idCheck.valid) {
        await logProtectionIncident({
          eventType: "FORGED_OPERATION_BLOCKED",
          attemptedOperation: operationType,
          reason: idCheck.error || "Forged transaction ID",
          operator: operatorName,
          source
        });
        throw new Error(idCheck.error);
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
          s2NormalBefore: number;
          s2DisassemblyBefore: number;
          s3Before: number;
          s1After: number;
          s2After: number;
          s2NormalAfter: number;
          s2DisassemblyAfter: number;
          s3After: number;
        }
      > = {};

      for (const code of uniqueRefCodes) {
        const refInfo = refSnapMap[code];
        const disBefore = typeof refInfo.data.stock2Disassembly === "number" ? refInfo.data.stock2Disassembly : 0;
        const normBefore = typeof refInfo.data.stock2Normal === "number" ? refInfo.data.stock2Normal : (refInfo.data.stock2 || 0) - disBefore;

        accumulatedChanges[code] = {
          s1Before: refInfo.data.stock1,
          s2Before: refInfo.data.stock2,
          s2NormalBefore: Math.max(0, normBefore),
          s2DisassemblyBefore: Math.max(0, disBefore),
          s3Before: refInfo.data.stock3,
          s1After: refInfo.data.stock1,
          s2After: refInfo.data.stock2,
          s2NormalAfter: Math.max(0, normBefore),
          s2DisassemblyAfter: Math.max(0, disBefore),
          s3After: refInfo.data.stock3
        };
      }

      for (const d of deltas) {
        const code = d.reference.trim().toUpperCase();
        const cur = accumulatedChanges[code];

        if (d.isDirectOverride) {
          if (d.targetStock1 !== undefined) cur.s1After = d.targetStock1;
          if (d.targetStock2 !== undefined) {
            cur.s2After = d.targetStock2;
            if (d.targetStock2Normal !== undefined) cur.s2NormalAfter = d.targetStock2Normal;
            if (d.targetStock2Disassembly !== undefined) cur.s2DisassemblyAfter = d.targetStock2Disassembly;
          }
          if (d.targetStock3 !== undefined) cur.s3After = d.targetStock3;
        } else {
          if (d.delta1 !== undefined) cur.s1After += d.delta1;
          if (d.delta2 !== undefined) {
            if (d.delta2Subtype === "disassembly") {
              cur.s2DisassemblyAfter += d.delta2;
              if (cur.s2DisassemblyAfter < 0 && !allowNegativeStock && !clampToZeroOnNegative) {
                throw new Error(`PROTECTION_NEGATIVE_STOCK:Insufficient Disassembly Stock 2 for Reference "${code}". Available: ${cur.s2DisassemblyBefore} pcs, requested: ${Math.abs(d.delta2)} pcs.`);
              }
              if (cur.s2DisassemblyAfter < 0 && clampToZeroOnNegative) cur.s2DisassemblyAfter = 0;
            } else {
              cur.s2NormalAfter += d.delta2;
              if (cur.s2NormalAfter < 0 && !allowNegativeStock && !clampToZeroOnNegative) {
                throw new Error(`PROTECTION_NEGATIVE_STOCK:Insufficient Normal Stock 2 for Reference "${code}". Available: ${cur.s2NormalBefore} pcs, requested: ${Math.abs(d.delta2)} pcs.`);
              }
              if (cur.s2NormalAfter < 0 && clampToZeroOnNegative) cur.s2NormalAfter = 0;
            }
            cur.s2After = cur.s2NormalAfter + cur.s2DisassemblyAfter;
          }
          if (d.delta3 !== undefined) cur.s3After += d.delta3;
        }
      }

      // Step C: Strict Non-Negative Stock Validation (Bypassed for Deliveries to allow negative stock)
      if (!allowNegativeStock && operationType !== "DELIVERY" && operationType !== "DELIVERY_UPDATE") {
        for (const code of uniqueRefCodes) {
          const cur = accumulatedChanges[code];
          if (cur.s1After < 0 || cur.s2After < 0 || cur.s3After < 0) {
            if (clampToZeroOnNegative) {
              if (cur.s1After < 0) cur.s1After = 0;
              if (cur.s2After < 0) cur.s2After = 0;
              if (cur.s3After < 0) cur.s3After = 0;
            } else {
              const negStockDetails = [];
              if (cur.s1After < 0) negStockDetails.push(`Stock 1 would be ${cur.s1After} (available: ${cur.s1Before})`);
              if (cur.s2After < 0) negStockDetails.push(`Stock 2 would be ${cur.s2After} (available: ${cur.s2Before})`);
              if (cur.s3After < 0) negStockDetails.push(`Stock 3 would be ${cur.s3After} (available: ${cur.s3Before})`);

              const rejectionReason = `Insufficient stock for Reference "${code}". ${negStockDetails.join(", ")}.`;
              throw new Error(`PROTECTION_NEGATIVE_STOCK:${rejectionReason}`);
            }
          }
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
            stock2Normal: cur.s2NormalAfter,
            stock2Disassembly: cur.s2DisassemblyAfter,
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
    allowNegativeStock: true,
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

    const destSubtype = (t as any).destStock2Subtype || (t as any).stock2Subtype || "normal";
    deltas.push({
      reference: refCode,
      delta1: -qty,
      delta2: qty,
      delta2Subtype: destSubtype
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

    const subtype = (p as any).stock2Subtype || (p as any).sourceStock2Subtype || "normal";
    deltas.push({
      reference: refCode,
      delta2: -qty,
      delta2Subtype: subtype,
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
 * 4b. Daily Production Sheet Validation: Adds validated quantities directly to Stock 3 Finished Goods
 */
export async function executeProtectedValidateToStock3(
  entries: { 
    date: string; 
    reference: string; 
    quantity: number; 
    description?: string; 
    notes?: string; 
  }[],
  operatorName: string,
  mode: "DIRECT_STOCK_3" | "TRANSFER_S2_TO_S3" = "TRANSFER_S2_TO_S3",
  targetCollection: "productions" | "daily_productions" = "daily_productions"
) {
  if (!entries || entries.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const prodDocs: { id: string; doc: Production }[] = [];

  // 1. Ensure any missing reference documents exist in the catalog before the transaction
  for (const p of entries) {
    const refCode = p.reference.trim().toUpperCase();
    const refDocRef = doc(db, "references", refCode);
    const snap = await getDoc(refDocRef);
    if (!snap.exists()) {
      await setDoc(refDocRef, cleanDocData({
        id: refCode,
        code: refCode,
        description: p.description?.trim() || "Imported Daily Production Reference",
        materialType: "Mesh",
        currentStock: 0,
        stock1: 0,
        stock2: 0,
        stock3: 0,
        active: true,
        createdAt: timestamp,
        createdBy: operatorName,
        lastUpdate: timestamp
      }));
    }
  }

  // 2. Prepare deltas, production logs, and transactions
  const batchId = `drag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  entries.forEach((p, idx) => {
    const qtyCheck = validateQuantity(p.quantity, `Stock 3 quantity for ${p.reference}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);

    const refCode = p.reference.trim().toUpperCase();
    const qty = qtyCheck.value;

    if (mode === "DIRECT_STOCK_3") {
      deltas.push({
        reference: refCode,
        delta3: qty
      });
    } else {
      // Standard: Deduct from Stock 2 (WIP) and Add to Stock 3 (Finished Goods)
      const s2Subtype = (p as any).stock2Subtype || (p as any).sourceStock2Subtype || "normal";
      deltas.push({
        reference: refCode,
        delta2: -qty,
        delta2Subtype: s2Subtype,
        delta3: qty
      });
    }

    const prodId = `prod-val-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    prodDocs.push({
      id: prodId,
      doc: {
        id: prodId,
        batchId,
        reference: refCode,
        quantity: qty,
        date: p.date,
        operatorName,
        timestamp,
        notes: p.notes || (mode === "DIRECT_STOCK_3" ? `Validated Daily Production: +${qty} PCS to Stock 3` : `Validated Daily Production: ${qty} PCS (Stock 2 -> Stock 3)`)
      }
    });

    const transId = `trans-val3-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: mode === "DIRECT_STOCK_3" ? "STOCK 3 IN" : "STOCK 2 OUT / STOCK 3 IN",
      stock: mode === "DIRECT_STOCK_3" ? "Stock 3" : "Stock 2 -> Stock 3",
      quantity: qty,
      operatorName,
      timestamp,
      notes: `Daily Production (${p.date}): ${mode === "DIRECT_STOCK_3" ? "+Stock 3" : "Stock 2 -> Stock 3"} (${qty} PCS). ${p.notes || ""}`
    });
  });

  const idempotencyKey = `daily-val-stock3-${operatorName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  await executeProtectedStockOperation({
    operationType: "DAILY_PRODUCTION_STOCK_3",
    deltas,
    operatorName,
    clampToZeroOnNegative: true,
    idempotencyKey,
    transactions,
    additionalWrites: (transaction) => {
      for (const item of prodDocs) {
        transaction.set(doc(db, targetCollection, item.id), cleanDocData(item.doc));
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
  operatorName: string,
  idempotencyKey?: string
) {
  const entries = Array.isArray(scrapInput) ? scrapInput : [scrapInput];
  if (entries.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const scrapDocs: { id: string; doc: any }[] = [];

  entries.forEach((entry, idx) => {
    const refCode = (entry.reference || "").trim().toUpperCase();
    if (!refCode) {
      throw new Error(`Scrap entry #${idx + 1}: Reference is required.`);
    }

    const cleanInvoice = (entry.invoiceNumber || "").trim().toUpperCase();
    if (!cleanInvoice) {
      throw new Error(`Scrap entry for ${refCode}: Invoice Number is required.`);
    }

    const rawCola = entry.cola || entry.colaStatus || (entry.condition === "CON COLA" ? "CON_COLA" : entry.condition === "SIN COLA" ? "SIN_COLA" : undefined);
    if (!rawCola || (rawCola !== "CON_COLA" && rawCola !== "SIN_COLA")) {
      throw new Error(`Scrap entry for ${refCode}: COLA status is required. Choose CON COLA or SIN COLA.`);
    }
    const colaStatus: "CON_COLA" | "SIN_COLA" = rawCola;

    const qtyCheck = validateQuantity(entry.quantity, `Scrap quantity for ${refCode}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);
    const qty = qtyCheck.value;

    const stockSource: "Stock 1" | "Stock 2" | "Stock 3" =
      entry.stockDeductedFrom || (entry.condition === "CON COLA" ? "Stock 3" : "Stock 2");

    if (stockSource === "Stock 1") {
      deltas.push({ reference: refCode, delta1: -qty });
    } else if (stockSource === "Stock 2") {
      const s2Subtype = (entry as any).stock2Subtype || (entry as any).sourceStock2Subtype || "normal";
      deltas.push({ reference: refCode, delta2: -qty, delta2Subtype: s2Subtype });
    } else {
      deltas.push({ reference: refCode, delta3: -qty });
    }

    const scrapId = (entry as any).id || `scrap-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    scrapDocs.push({
      id: scrapId,
      doc: {
        ...entry,
        id: scrapId,
        operationId: scrapId,
        operationType: "SCRAP / NOK",
        reference: refCode,
        quantity: qty,
        sourceStock: stockSource,
        stockDeductedFrom: stockSource,
        invoiceNumber: cleanInvoice,
        cola: colaStatus,
        colaStatus: colaStatus,
        condition: colaStatus === "CON_COLA" ? "CON COLA" : "SIN COLA",
        operator: operatorName,
        operatorName,
        supervisorName: operatorName,
        timestamp,
        serverTimestamp: serverTimestamp(),
        status: entry.status || "completed"
      }
    });

    const transId = `trans-scrap-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: colaStatus === "CON_COLA" ? "SCRAP (CON COLA)" : "SCRAP (SIN COLA)",
      stock: stockSource,
      quantity: qty,
      operatorName,
      timestamp,
      invoiceNumber: cleanInvoice,
      cola: colaStatus,
      colaStatus: colaStatus,
      notes: `SCRAP / NOK (${stockSource}) [${colaStatus === "CON_COLA" ? "CON COLA" : "SIN COLA"}]: Date ${entry.date || ""} | Invoice: ${cleanInvoice}`
    });
  });

  await executeProtectedStockOperation({
    operationType: "SCRAP",
    idempotencyKey,
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
    cola?: "CON_COLA" | "SIN_COLA";
    colaStatus?: "CON_COLA" | "SIN_COLA";
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
      const updatedCola = updatedData.cola || updatedData.colaStatus || (updatedData.condition === "CON COLA" ? "CON_COLA" : updatedData.condition === "SIN COLA" ? "SIN_COLA" : oldScrap?.cola || oldScrap?.colaStatus);
      transaction.update(
        doc(db, "scraps", scrapId),
        cleanDocData({
          reference: newRefCode,
          quantity: newQty,
          condition: updatedCola === "CON_COLA" ? "CON COLA" : updatedCola === "SIN_COLA" ? "SIN COLA" : updatedData.condition || oldScrap?.condition || "",
          cola: updatedCola,
          colaStatus: updatedCola,
          invoiceNumber: updatedData.invoiceNumber !== undefined ? updatedData.invoiceNumber : (oldScrap?.invoiceNumber || ""),
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

  const isDirectStock3 = Boolean(
    (prodData.notes?.includes("DIRECT_STOCK_3") || prodData.notes?.includes("+Stock 3")) &&
    !prodData.notes?.includes("Stock 2") &&
    !prodData.notes?.includes("S2")
  );

  const deltas: ProtectedStockDelta[] = isDirectStock3
    ? [{ reference: refCode, delta3: -qty }]
    : [{ reference: refCode, delta2: qty, delta3: -qty }];

  const transId = `trans-delprod-${Date.now()}`;
  const transactions: any[] = [
    {
      id: transId,
      reference: refCode,
      movementType: isDirectStock3 ? "STOCK 3 OUT" : "STOCK 3 OUT / STOCK 2 IN",
      stock: isDirectStock3 ? "Stock 3" : "Stock 3 -> Stock 2",
      quantity: qty,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Deleted production entry on ${prodData.date} (${qty} PCS removed from Stock 3${isDirectStock3 ? "" : ", restored to Stock 2"}). ${reason ? `Reason: ${reason}` : ""}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "PRODUCTION_REVERT",
    deltas,
    operatorName,
    clampToZeroOnNegative: true,
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

  const isDirectStock3 = oldProd.notes?.includes("Stock 3") || oldProd.id.startsWith("prod-val-") || oldProd.id.startsWith("prod-sheet-");
  const deltas: ProtectedStockDelta[] = [];

  if (oldRef === newRef) {
    const delta = newQty - oldQty;
    if (delta !== 0) {
      deltas.push(
        isDirectStock3
          ? { reference: newRef, delta3: delta }
          : { reference: newRef, delta2: -delta, delta3: delta }
      );
    }
  } else {
    // Revert old production
    deltas.push(
      isDirectStock3
        ? { reference: oldRef, delta3: -oldQty }
        : { reference: oldRef, delta2: oldQty, delta3: -oldQty }
    );
    // Apply new production
    deltas.push(
      isDirectStock3
        ? { reference: newRef, delta3: newQty }
        : { reference: newRef, delta2: -newQty, delta3: newQty }
    );
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
    clampToZeroOnNegative: true,
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
 * 8c. Delete an Entire Batch of Production Entries (e.g. from a Daily Drag Intake)
 */
export async function executeProtectedDeleteBatch(
  productionsToRevert: Production[],
  operatorName: string,
  reason = ""
) {
  if (!productionsToRevert || productionsToRevert.length === 0) return;

  // If there are many records (e.g. bulk reset), process in chunks of 40 to stay well within Firestore limits
  const CHUNK_SIZE = 40;
  if (productionsToRevert.length > CHUNK_SIZE) {
    for (let i = 0; i < productionsToRevert.length; i += CHUNK_SIZE) {
      const chunk = productionsToRevert.slice(i, i + CHUNK_SIZE);
      await executeProtectedDeleteBatch(chunk, operatorName, `${reason} (Part ${Math.floor(i / CHUNK_SIZE) + 1})`);
    }
    return;
  }

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const idsToDelete: string[] = [];

  for (let idx = 0; idx < productionsToRevert.length; idx++) {
    const p = productionsToRevert[idx];
    const refCode = p.reference.trim().toUpperCase();
    const qty = p.quantity;
    const isDirectStock3 = Boolean(
      (p.notes?.includes("DIRECT_STOCK_3") || p.notes?.includes("+Stock 3")) &&
      !p.notes?.includes("Stock 2") &&
      !p.notes?.includes("S2")
    );

    if (isDirectStock3) {
      deltas.push({ reference: refCode, delta3: -qty });
    } else {
      deltas.push({ reference: refCode, delta2: qty, delta3: -qty });
    }

    idsToDelete.push(p.id);

    const transId = `trans-delbatch-${Date.now()}-${idx}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: isDirectStock3 ? "STOCK 3 OUT" : "STOCK 3 OUT / STOCK 2 IN",
      stock: isDirectStock3 ? "Stock 3" : "Stock 3 -> Stock 2",
      quantity: qty,
      operatorName: `${operatorName} (Batch Reversal)`,
      timestamp,
      notes: `Batch Reversal for ${p.date} (${qty} PCS removed from Stock 3). ${reason || ""}`
    });
  }

  const idempotencyKey = `del-batch-${operatorName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  await executeProtectedStockOperation({
    operationType: "PRODUCTION_BATCH_REVERT",
    deltas,
    operatorName,
    idempotencyKey,
    clampToZeroOnNegative: true,
    transactions,
    additionalWrites: (transaction) => {
      for (const id of idsToDelete) {
        transaction.delete(doc(db, "productions", id));
      }
    }
  });
}

/**
 * 8d. Delete / Revert an Entire Batch of Daily Production Entries (Isolated to daily_productions collection)
 */
export async function executeProtectedDeleteDailyProductionBatch(
  productionsToRevert: Production[],
  operatorName: string,
  reason = "",
  revertStock = false
) {
  if (!productionsToRevert || productionsToRevert.length === 0) return;

  const CHUNK_SIZE = 40;
  if (productionsToRevert.length > CHUNK_SIZE) {
    for (let i = 0; i < productionsToRevert.length; i += CHUNK_SIZE) {
      const chunk = productionsToRevert.slice(i, i + CHUNK_SIZE);
      await executeProtectedDeleteDailyProductionBatch(chunk, operatorName, `${reason} (Part ${Math.floor(i / CHUNK_SIZE) + 1})`, revertStock);
    }
    return;
  }

  const idsToDelete = productionsToRevert.map(p => p.id);

  if (revertStock) {
    const timestamp = new Date().toISOString();
    const deltas: ProtectedStockDelta[] = [];
    const transactions: any[] = [];

    for (let idx = 0; idx < productionsToRevert.length; idx++) {
      const p = productionsToRevert[idx];
      const refCode = p.reference.trim().toUpperCase();
      const qty = p.quantity;
      deltas.push({ reference: refCode, delta2: qty, delta3: -qty });

      const transId = `trans-deldailybatch-${Date.now()}-${idx}`;
      transactions.push({
        id: transId,
        reference: refCode,
        movementType: "DAILY PRODUCTION REVERT",
        stock: "Stock 3 -> Stock 2",
        quantity: qty,
        operatorName: `${operatorName} (Daily Reversal)`,
        timestamp,
        notes: `Daily Intake Reversal for ${p.date} (${qty} PCS reverted). ${reason || ""}`
      });
    }

    await executeProtectedStockOperation({
      operationType: "DAILY_PRODUCTION_BATCH_REVERT",
      deltas,
      operatorName,
      clampToZeroOnNegative: true,
      transactions,
      additionalWrites: (transaction) => {
        for (const id of idsToDelete) {
          transaction.delete(doc(db, "daily_productions", id));
        }
      }
    });
  } else {
    // Pure removal of daily intake records without altering official stock or main production entries
    const batch = writeBatch(db);
    for (const id of idsToDelete) {
      batch.delete(doc(db, "daily_productions", id));
    }
    await batch.commit();
  }
}

/**
 * 8e. Delete a Single Daily Production Entry (Isolated to daily_productions collection)
 */
export async function executeProtectedDeleteDailyProduction(
  productionId: string,
  operatorName: string,
  reason = "",
  revertStock = false
) {
  if (!productionId) return;
  if (revertStock) {
    const docRef = doc(db, "daily_productions", productionId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const p = snap.data() as Production;
    const refCode = p.reference.trim().toUpperCase();
    await executeProtectedStockOperation({
      operationType: "DAILY_PRODUCTION_REVERT",
      deltas: [{ reference: refCode, delta2: p.quantity, delta3: -p.quantity }],
      operatorName,
      clampToZeroOnNegative: true,
      additionalWrites: (transaction) => {
        transaction.delete(doc(db, "daily_productions", productionId));
      }
    });
  } else {
    await deleteDoc(doc(db, "daily_productions", productionId));
  }
}

/**
 * 8f. Modify an existing Daily Production Entry (Isolated to daily_productions collection)
 */
export async function executeProtectedUpdateDailyProduction(
  productionId: string,
  updatedData: { date: string; reference: string; quantity: number; notes?: string },
  operatorName: string,
  reason = ""
) {
  const docRef = doc(db, "daily_productions", productionId);
  await updateDoc(docRef, {
    date: updatedData.date,
    reference: updatedData.reference.trim().toUpperCase(),
    quantity: updatedData.quantity,
    notes: updatedData.notes || "",
    status: "edited",
    updatedAt: new Date().toISOString(),
    updatedBy: operatorName
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
    allowNegativeStock: true,
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
  const grouped: Record<string, { s1: number; s2Normal: number; s2Disassembly: number; s3: number }> = {};
  invoiceData.items.forEach((item) => {
    const code = item.reference.trim().toUpperCase();
    if (!grouped[code]) grouped[code] = { s1: 0, s2Normal: 0, s2Disassembly: 0, s3: 0 };
    if (item.destinationStock === "Stock 3") {
      grouped[code].s3 += item.quantity;
    } else if (item.destinationStock === "Stock 2") {
      if ((item as any).destStock2Subtype === "disassembly") {
        grouped[code].s2Disassembly += item.quantity;
      } else {
        grouped[code].s2Normal += item.quantity;
      }
    } else {
      grouped[code].s1 += item.quantity;
    }
  });

  Object.entries(grouped).forEach(([code, vals]) => {
    if (vals.s1 > 0) deltas.push({ reference: code, delta1: vals.s1 });
    if (vals.s2Normal > 0) deltas.push({ reference: code, delta2: vals.s2Normal, delta2Subtype: "normal" });
    if (vals.s2Disassembly > 0) deltas.push({ reference: code, delta2: vals.s2Disassembly, delta2Subtype: "disassembly" });
    if (vals.s3 > 0) deltas.push({ reference: code, delta3: vals.s3 });
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
 * Resiliently finds a document in a collection across various ID prefix formats
 */
async function findFirestoreDoc(collectionName: string, id: string) {
  if (!id) return null;
  const candidates = new Set<string>();
  candidates.add(id);

  const prefixes = ["prod-", "del-", "scrap-", "inv-", "adj-", "tx-", "trans-", "batch-trf-"];
  for (const p of prefixes) {
    if (id.startsWith(p + p)) {
      candidates.add(id.slice(p.length));
      candidates.add(id.slice(p.length * 2));
    } else if (id.startsWith(p)) {
      candidates.add(id.slice(p.length));
      candidates.add(p + id);
    }
  }

  for (const cand of candidates) {
    if (!cand) continue;
    try {
      const snap = await getDoc(doc(db, collectionName, cand));
      if (snap.exists()) {
        return snap;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
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

  const cleanOpId = opId.startsWith("prod-prod-")
    ? opId.replace("prod-", "")
    : opId.startsWith("del-del-")
    ? opId.replace("del-", "")
    : opId.startsWith("scrap-scrap-")
    ? opId.replace("scrap-", "")
    : opId.startsWith("inv-inv-")
    ? opId.replace("inv-", "")
    : opId.startsWith("adj-adj-")
    ? opId.replace("adj-", "")
    : opId;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  let additionalWrites: ((transaction: Transaction) => void) | undefined;

  if (category === "adjustment") {
    const adjSnap = await findFirestoreDoc("adjustments", opId);
    if (!adjSnap || !adjSnap.exists()) throw new Error("Adjustment record not found");
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
        doc(db, "adjustments", adjSnap.id),
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
    const delSnap = await findFirestoreDoc("deliveries", opId);
    if (!delSnap || !delSnap.exists()) throw new Error("Delivery record not found");
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
        doc(db, "deliveries", delSnap.id),
        cleanDocData({
          quantity: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "production") {
    let targetColl = "productions";
    let prodSnap = await findFirestoreDoc("productions", opId);
    if (!prodSnap || !prodSnap.exists()) {
      prodSnap = await findFirestoreDoc("daily_productions", opId);
      if (prodSnap && prodSnap.exists()) {
        targetColl = "daily_productions";
      }
    }
    if (!prodSnap || !prodSnap.exists()) {
      throw new Error("Production record not found");
    }
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
        doc(db, targetColl, prodSnap.id),
        cleanDocData({
          quantity: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "scrap") {
    const scrapSnap = await findFirestoreDoc("scraps", opId);
    if (!scrapSnap || !scrapSnap.exists()) throw new Error("Scrap record not found");
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
        doc(db, "scraps", scrapSnap.id),
        cleanDocData({
          quantity: newQty,
          status: "edited",
          changeHistory: [...existingHistory, historyEntry]
        })
      );
    };
  } else if (category === "invoice") {
    const invSnap = await findFirestoreDoc("invoices", opId);
    if (!invSnap || !invSnap.exists()) throw new Error("Invoice record not found");
    const invData = invSnap.data() as ReceivingInvoice;
    const oldQty = invData.totalQuantity || 0;
    const delta = newQty - oldQty;

    if (invData.items && invData.items.length === 1) {
      const item = invData.items[0];
      const refCode = item.reference.trim().toUpperCase();
      if (item.destinationStock === "Stock 3") {
        deltas.push({ reference: refCode, delta3: delta });
      } else if (item.destinationStock === "Stock 2") {
        deltas.push({ reference: refCode, delta2: delta });
      } else {
        deltas.push({ reference: refCode, delta1: delta });
      }

      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "invoices", invSnap.id),
          cleanDocData({
            totalQuantity: newQty,
            status: "edited",
            items: [{ ...item, quantity: newQty }]
          })
        );
      };
    } else {
      throw new Error("Multi-item invoices must be edited directly in the Invoices workspace.");
    }
  } else if (category === "transfer" || category === "return" || category === "transaction") {
    const txSnap = await findFirestoreDoc("transactions", opId);
    if (!txSnap || !txSnap.exists()) throw new Error("Transaction record not found");
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
        doc(db, "transactions", txSnap.id),
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
    additionalWrites,
    clampToZeroOnNegative: true
  });
}

/**
 * 14. Delete or Reverse Operation
 */
export async function executeProtectedDeleteOrReverseOperation(
  opId: string,
  category: string,
  reason: string,
  operatorName: string,
  mode: "delete" | "reverse" = "delete"
) {
  if (!reason || reason.trim() === "") {
    throw new Error("A reason for deletion or reversal is required.");
  }

  const cleanOpId = opId.startsWith("prod-prod-")
    ? opId.replace("prod-", "")
    : opId.startsWith("del-del-")
    ? opId.replace("del-", "")
    : opId.startsWith("scrap-scrap-")
    ? opId.replace("scrap-", "")
    : opId.startsWith("inv-inv-")
    ? opId.replace("inv-", "")
    : opId.startsWith("adj-adj-")
    ? opId.replace("adj-", "")
    : opId;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  let additionalWrites: ((transaction: Transaction) => void) | undefined;

  if (category === "adjustment") {
    const adjSnap = await findFirestoreDoc("adjustments", opId);
    if (!adjSnap || !adjSnap.exists()) throw new Error("Adjustment record not found");
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
      notes: `${mode === "delete" ? "Deleted" : "Reversed"} operation. Reason: ${reason}`
    });

    if (mode === "reverse") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "adjustments", adjSnap.id),
          cleanDocData({
            status: "reversed",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason
          })
        );
      };
    } else {
      additionalWrites = (transaction) => {
        transaction.delete(doc(db, "adjustments", adjSnap.id));
      };
    }
  } else if (category === "delivery") {
    const delSnap = await findFirestoreDoc("deliveries", opId);
    if (!delSnap || !delSnap.exists()) throw new Error("Delivery record not found");
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
      notes: `${mode === "delete" ? "Deleted" : "Reversed"} delivery. Reason: ${reason}`
    });

    if (mode === "reverse") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "deliveries", delSnap.id),
          cleanDocData({
            status: "reversed",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason,
            notes: `${delData.notes || ""} | REVERSED on ${timestamp} by ${operatorName}. Reason: ${reason}`
          })
        );
      };
    } else {
      additionalWrites = (transaction) => {
        transaction.delete(doc(db, "deliveries", delSnap.id));
      };
    }
  } else if (category === "production") {
    let targetColl = "productions";
    let prodSnap = await findFirestoreDoc("productions", opId);
    if (!prodSnap || !prodSnap.exists()) {
      prodSnap = await findFirestoreDoc("daily_productions", opId);
      if (prodSnap && prodSnap.exists()) {
        targetColl = "daily_productions";
      }
    }
    if (!prodSnap || !prodSnap.exists()) {
      throw new Error("Production record not found");
    }
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
      notes: `${mode === "delete" ? "Deleted" : "Reversed"} production. Reason: ${reason}`
    });

    if (mode === "reverse") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, targetColl, prodSnap.id),
          cleanDocData({
            status: "reversed",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason,
            notes: `${prodData.notes || ""} | REVERSED on ${timestamp} by ${operatorName}. Reason: ${reason}`
          })
        );
      };
    } else {
      additionalWrites = (transaction) => {
        transaction.delete(doc(db, targetColl, prodSnap.id));
      };
    }
  } else if (category === "scrap") {
    const scrapSnap = await findFirestoreDoc("scraps", opId);
    if (!scrapSnap || !scrapSnap.exists()) throw new Error("Scrap record not found");
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
      notes: `${mode === "delete" ? "Deleted" : "Reversed"} scrap. Reason: ${reason}`
    });

    if (mode === "reverse") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "scraps", scrapSnap.id),
          cleanDocData({
            status: "reversed",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason,
            notes: `${scrapData.notes || ""} | REVERSED on ${timestamp} by ${operatorName}. Reason: ${reason}`
          })
        );
      };
    } else {
      additionalWrites = (transaction) => {
        transaction.delete(doc(db, "scraps", scrapSnap.id));
      };
    }
  } else if (category === "invoice") {
    const invSnap = await findFirestoreDoc("invoices", opId);
    if (!invSnap || !invSnap.exists()) throw new Error("Invoice record not found");
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
      notes: `${mode === "delete" ? "Deleted" : "Reversed"} invoice intake #${invData.invoiceNumber}. Reason: ${reason}`
    });

    if (mode === "reverse") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "invoices", invSnap.id),
          cleanDocData({
            status: "reversed",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason
          })
        );
      };
    } else {
      additionalWrites = (transaction) => {
        transaction.delete(doc(db, "invoices", invSnap.id));
      };
    }
  } else if (category === "transfer" || category === "return" || category === "transaction") {
    const txSnap = await findFirestoreDoc("transactions", opId);
    if (!txSnap || !txSnap.exists()) throw new Error("Transaction record not found");
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
      notes: `${mode === "delete" ? "Deleted" : "Reversed"} operation (${txData.movementType}). Reason: ${reason}`
    });

    if (mode === "reverse" || category === "transfer" || txData.movementType === "TRANSFER S1->S2" || txData.movementType === "TRANSFER") {
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "transactions", txSnap.id),
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
      // Historical audit records are immutable: mark as REVERSED with audit reason instead of deleting
      additionalWrites = (transaction) => {
        transaction.update(
          doc(db, "transactions", txSnap.id),
          cleanDocData({
            status: "REVERSED",
            reversedAt: timestamp,
            reversedBy: operatorName,
            reversalReason: reason,
            notes: `${txData.notes || ""} | REVERSED on ${timestamp} by ${operatorName}. Reason: ${reason}`
          })
        );
      };
    }
  }

  await executeProtectedStockOperation({
    operationType: "OPERATION_REVERSE",
    deltas,
    operatorName,
    transactions,
    additionalWrites,
    clampToZeroOnNegative: true
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

/**
 * 17. Disassembly Sheet Validation: Deducts from Stock 3 (Finished Goods) and Adds to Stock 2 (Disassembly Stock)
 */
export async function executeProtectedDisassemblyIntake(
  entries: { 
    date: string; 
    reference: string; 
    quantity: number; 
    description?: string; 
    notes?: string; 
  }[],
  operatorName: string
) {
  if (!entries || entries.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];
  const disassemblyDocs: { id: string; doc: DisassemblyEntry }[] = [];

  // 1. Ensure any missing reference documents exist in the catalog before the transaction
  for (const p of entries) {
    const refCode = p.reference.trim().toUpperCase();
    const refDocRef = doc(db, "references", refCode);
    const snap = await getDoc(refDocRef);
    if (!snap.exists()) {
      await setDoc(refDocRef, cleanDocData({
        id: refCode,
        code: refCode,
        description: p.description?.trim() || "Imported Disassembly Reference",
        materialType: "Mesh",
        currentStock: 0,
        stock1: 0,
        stock2: 0,
        stock2Normal: 0,
        stock2Disassembly: 0,
        stock3: 0,
        active: true,
        createdAt: timestamp,
        createdBy: operatorName,
        lastUpdate: timestamp
      }));
    }
  }

  // 2. Prepare deltas: deduct from Stock 3, add to Stock 2 (Disassembly)
  const batchId = `disasm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  entries.forEach((p, idx) => {
    const qtyCheck = validateQuantity(p.quantity, `Disassembly quantity for ${p.reference}`);
    if (!qtyCheck.valid) throw new Error(qtyCheck.error);

    const refCode = p.reference.trim().toUpperCase();
    const qty = qtyCheck.value;

    deltas.push({
      reference: refCode,
      delta3: -qty, // remove from s3
      delta2: qty,  // add to s2
      delta2Subtype: "disassembly" // specifically disassembly stock 2
    });

    const disasmId = `disasm-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    disassemblyDocs.push({
      id: disasmId,
      doc: {
        id: disasmId,
        batchId,
        reference: refCode,
        quantity: qty,
        description: p.description || "",
        date: p.date,
        operatorName,
        timestamp,
        notes: p.notes || `Disassembly S3 -> S2 (Recovered ${qty} pcs to Stock 2 Disassembly)`
      }
    });

    const transId = `trans-disasm-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 3 OUT / STOCK 2 IN (DISASSEMBLY)",
      stock: "Stock 3 -> Stock 2 (Disassembly)",
      quantity: qty,
      operatorName,
      timestamp,
      notes: `Disassembly (${p.date}): -Stock 3, +Stock 2 Disassembly (${qty} PCS). ${p.notes || ""}`
    });
  });

  const idempotencyKey = `disasm-batch-${operatorName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  await executeProtectedStockOperation({
    operationType: "DISASSEMBLY_INTAKE",
    deltas,
    operatorName,
    reason: `Disassembly Batch: S3 -> S2 Disassembly (${entries.length} items)`,
    idempotencyKey,
    source: "Desassemblage Workspace",
    transactions,
    additionalWrites: (transaction) => {
      for (const item of disassemblyDocs) {
        transaction.set(doc(db, "disassemblies", item.id), cleanDocData(item.doc));
      }
    }
  });

  return { batchId, count: entries.length };
}

/**
 * 18. Delete / Revert an Entire Batch of Disassembly Entries
 */
export async function executeProtectedDeleteDisassemblyBatch(
  batchRecords: DisassemblyEntry[],
  operatorName: string,
  reason: string = "Reverted disassembly batch"
) {
  if (!batchRecords || batchRecords.length === 0) return;

  const timestamp = new Date().toISOString();
  const deltas: ProtectedStockDelta[] = [];
  const transactions: any[] = [];

  // Group by reference to invert deltas: deduct from Stock 2 Disassembly, restore to Stock 3
  const refQtyMap = new Map<string, number>();
  batchRecords.forEach((r) => {
    const code = r.reference.trim().toUpperCase();
    refQtyMap.set(code, (refQtyMap.get(code) || 0) + (r.quantity || 0));
  });

  refQtyMap.forEach((qty, refCode) => {
    deltas.push({
      reference: refCode,
      delta2: -qty, // deduct from S2 Disassembly
      delta2Subtype: "disassembly",
      delta3: qty  // restore to S3
    });

    const transId = `trans-rev-disasm-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    transactions.push({
      id: transId,
      reference: refCode,
      movementType: "STOCK 2 OUT / STOCK 3 IN (DISASSEMBLY REVERSAL)",
      stock: "Stock 2 (Disassembly) -> Stock 3",
      quantity: qty,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Reverted Disassembly batch. Reason: ${reason}`
    });
  });

  await executeProtectedStockOperation({
    operationType: "DISASSEMBLY_BATCH_REVERSAL",
    deltas,
    operatorName,
    reason: `Revert Disassembly Batch (${batchRecords.length} records): ${reason}`,
    source: "Desassemblage Workspace",
    transactions,
    additionalWrites: (transaction) => {
      for (const rec of batchRecords) {
        transaction.delete(doc(db, "disassemblies", rec.id));
      }
    }
  });
}

/**
 * 19. Delete a Single Disassembly Entry
 */
export async function executeProtectedDeleteDisassembly(
  disassemblyId: string,
  operatorName: string,
  currentList: DisassemblyEntry[],
  reason: string = "Deleted disassembly entry"
) {
  const item = currentList.find((p) => p.id === disassemblyId);
  if (!item) throw new Error("Disassembly entry not found in active state");

  const timestamp = new Date().toISOString();
  const refCode = item.reference.trim().toUpperCase();
  const qty = item.quantity || 0;

  const deltas: ProtectedStockDelta[] = [
    {
      reference: refCode,
      delta2: -qty, // deduct from S2 Disassembly
      delta2Subtype: "disassembly",
      delta3: qty  // restore to S3
    }
  ];

  const transId = `trans-rev-disasm-single-${Date.now()}`;
  const transactions = [
    {
      id: transId,
      reference: refCode,
      movementType: "STOCK 2 OUT / STOCK 3 IN (DISASSEMBLY REVERSAL)",
      stock: "Stock 2 (Disassembly) -> Stock 3",
      quantity: qty,
      operatorName: `${operatorName} (Reversal)`,
      timestamp,
      notes: `Reverted Disassembly entry ${item.id}. Reason: ${reason}`
    }
  ];

  await executeProtectedStockOperation({
    operationType: "DISASSEMBLY_REVERSAL",
    deltas,
    operatorName,
    reason: `Revert Disassembly #${disassemblyId}: ${reason}`,
    source: "Desassemblage Workspace",
    transactions,
    additionalWrites: (transaction) => {
      transaction.delete(doc(db, "disassemblies", disassemblyId));
    }
  });
}

/**
 * 20. Mesh Physical Inventory Reconciliation (STOCK INVENTORY)
 * Creates traceable PHYSICAL_INVENTORY audit operations for every adjusted stock.
 * Stock update + inventory transaction executed in ONE atomic Firestore transaction.
 */
export async function executeMeshPhysicalInventory(
  params: MeshPhysicalInventoryParams
): Promise<{ success: boolean; operations: InventoryTransaction[] }> {
  // 1. Role validation: Managers only
  if (params.managerRole === "operator") {
    throw new Error("PERMISSION_DENIED: Operators are not authorized to perform Stock Inventory reconciliation.");
  }
  if (!params.adjustments || params.adjustments.length === 0) {
    throw new Error("No inventory adjustments provided.");
  }

  // 2. Validate parameters
  for (const item of params.adjustments) {
    if (!item.reference || !item.reference.trim()) {
      throw new Error("All adjustment items must have a valid reference.");
    }
    if (item.stockType !== "STOCK 1" && item.stockType !== "STOCK 2" && item.stockType !== "STOCK 3") {
      throw new Error(`Stock type for ${item.reference} must be STOCK 1, STOCK 2, or STOCK 3.`);
    }
    const counted = Number(item.physicalQuantity);
    if (isNaN(counted) || counted < 0) {
      throw new Error(`Physical count for ${item.reference} (${item.stockType}) must be a valid non-negative number.`);
    }
  }

  // 3. Idempotency guard to prevent duplicate rapid submissions
  const key =
    params.idempotencyKey ||
    `inv-mesh-${params.managerName}-${params.adjustments.map((a) => `${a.reference}:${a.stockType}:${a.physicalQuantity}`).join("-")}`;
  
  const cached = duplicateGuardCache.get(key);
  if (cached && Date.now() - cached.timestamp < 10000) {
    console.warn(`[ProtectionLayer] Duplicate Mesh Stock Inventory suppressed for key: ${key}`);
    return cached.result;
  }

  const nowIso = new Date().toISOString();
  const operationsCreated: InventoryTransaction[] = [];

  await runTransaction(db, async (transaction) => {
    // 1. Gather all unique reference codes
    const refCodes = Array.from(new Set(params.adjustments.map((a) => a.reference.trim().toUpperCase())));

    // 2. Read authoritative state for all affected references inside transaction
    const refDocs = new Map<string, { docRef: any; data: Reference }>();
    for (const refCode of refCodes) {
      let docRef = doc(db, "references", refCode);
      let snap = await transaction.get(docRef);
      if (!snap.exists()) {
        const sanitizedId = refCode.replace(/[^a-zA-Z0-9_-]/g, "_");
        if (sanitizedId !== refCode) {
          docRef = doc(db, "references", sanitizedId);
          snap = await transaction.get(docRef);
        }
      }
      if (!snap.exists()) {
        throw new Error(`Reference "${refCode}" does not exist in the master catalog.`);
      }
      refDocs.set(refCode, { docRef, data: snap.data() as Reference });
    }

    // 3. Process each adjustment and verify against concurrent modifications
    for (let idx = 0; idx < params.adjustments.length; idx++) {
      const item = params.adjustments[idx];
      const refCode = item.reference.trim().toUpperCase();
      const entry = refDocs.get(refCode)!;
      const curRef = entry.data;

      const s1Before = curRef.stock1 || 0;
      const s2Before = curRef.stock2 || 0;
      const s3Before = curRef.stock3 || 0;

      let currentSystemStock = 0;
      if (item.stockType === "STOCK 1") currentSystemStock = s1Before;
      else if (item.stockType === "STOCK 2") currentSystemStock = s2Before;
      else if (item.stockType === "STOCK 3") currentSystemStock = s3Before;

      if (currentSystemStock !== item.previousSystemQuantity) {
        throw new Error(
          `Concurrent modification detected for ${refCode} (${item.stockType}). System stock changed from ${item.previousSystemQuantity} to ${currentSystemStock}. Please refresh and re-verify.`
        );
      }

      const countedQty = Number(item.physicalQuantity);
      const difference = countedQty - currentSystemStock;

      let s1After = s1Before;
      let s2After = s2Before;
      let s3After = s3Before;
      let s2NormAfter = curRef.stock2Normal !== undefined ? curRef.stock2Normal : Math.max(0, s2Before - (curRef.stock2Disassembly || 0));
      let s2DisAfter = curRef.stock2Disassembly || 0;

      if (item.stockType === "STOCK 1") {
        s1After = countedQty;
        curRef.stock1 = s1After;
      } else if (item.stockType === "STOCK 2") {
        s2After = countedQty;
        curRef.stock2 = s2After;
        // Proportionally adjust normal vs disassembly if non-zero
        if (s2Before > 0 && s2DisAfter > 0) {
          const disRatio = s2DisAfter / s2Before;
          s2DisAfter = Math.round(countedQty * disRatio);
          s2NormAfter = countedQty - s2DisAfter;
        } else {
          s2NormAfter = countedQty;
          s2DisAfter = 0;
        }
        curRef.stock2Normal = s2NormAfter;
        curRef.stock2Disassembly = s2DisAfter;
      } else {
        s3After = countedQty;
        curRef.stock3 = s3After;
      }

      const newTotal = s1After + s2After + s3After;
      curRef.currentStock = newTotal;
      curRef.lastUpdate = nowIso;
      curRef.updatedAt = nowIso;
      curRef.updatedBy = params.managerName;

      // Update reference in transaction
      transaction.set(
        entry.docRef,
        cleanDocData({
          code: curRef.code || refCode,
          stock1: s1After,
          stock2: s2After,
          stock2Normal: s2NormAfter,
          stock2Disassembly: s2DisAfter,
          stock3: s3After,
          currentStock: newTotal,
          lastUpdate: nowIso,
          updatedAt: nowIso,
          updatedBy: params.managerName
        }),
        { merge: true }
      );

      // Create traceable PHYSICAL_INVENTORY transaction audit record
      const transId = `trans-inv-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
      const opRecord: InventoryTransaction = {
        id: transId,
        reference: refCode,
        movementType: "PHYSICAL_INVENTORY",
        operationType: "PHYSICAL_INVENTORY",
        stock: item.stockType === "STOCK 1" ? "Stock 1" : item.stockType === "STOCK 2" ? "Stock 2" : "Stock 3",
        quantity: Math.abs(difference),
        previousQuantity: currentSystemStock,
        physicalQuantity: countedQty,
        difference: difference,
        stock1Before: s1Before,
        stock1After: s1After,
        stock2Before: s2Before,
        stock2After: s2After,
        stock3Before: s3Before,
        stock3After: s3After,
        operatorName: params.managerName,
        timestamp: nowIso,
        serverTimestamp: serverTimestamp(),
        status: "completed",
        notes: `Physical Stock Inventory Reconciliation (${item.stockType}): ${currentSystemStock} ➔ ${countedQty} PCS (Diff: ${difference > 0 ? `+${difference}` : difference}). ${params.notes || ""}`
      };

      transaction.set(doc(db, "transactions", transId), cleanDocData(opRecord));
      operationsCreated.push(opRecord);
    }
  });

  const finalResult = { success: true, operations: operationsCreated };
  duplicateGuardCache.set(key, { timestamp: Date.now(), result: finalResult });
  return finalResult;
}
