import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  getDocs,
  serverTimestamp,
  query,
  orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import {
  BezelReference,
  BezelOperation,
  BezelTruckItem,
  BezelOperationType
} from "../types";

// In-Memory Idempotency & Duplicate Guard (Window: 5 seconds)
const bezelDuplicateGuard = new Map<string, number>();

function checkAndSetIdempotency(key: string): void {
  const now = Date.now();
  const lastTime = bezelDuplicateGuard.get(key);
  if (lastTime && now - lastTime < 5000) {
    throw new Error("Duplicate operation detected. Please wait a moment.");
  }
  bezelDuplicateGuard.set(key, now);
}

// Clean undefined values before writing to Firestore
function cleanData<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Generates a unique, stable business operation ID for Bezel.
 */
export function generateBezelOpId(prefix = "bz-op"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Official Bezel Reference Seed Data (From EPP Natur Specification)
 * 3 Official References:
 * - A015E335A: Rim Badge GT P64-P74 (support + letters) | Client: PSA
 * - A024H181B: BEZEL R8 STW | Client: PSA
 * - A025B907B: BEZEL ASSY OV64 SW 6H SPOKE | Client: OPEL
 */
export const INITIAL_BEZEL_SEEDS: Omit<BezelReference, "createdAt" | "updatedAt">[] = [
  {
    id: "A015E335A",
    code: "A015E335A",
    description: "Rim Badge GT P64-P74 (support + letters)",
    client: "PSA",
    stock1: 0,
    stock2: 0,
    active: true
  },
  {
    id: "A024H181B",
    code: "A024H181B",
    description: "BEZEL R8 STW",
    client: "PSA",
    stock1: 0,
    stock2: 0,
    active: true
  },
  {
    id: "A025B907B",
    code: "A025B907B",
    description: "BEZEL ASSY OV64 SW 6H SPOKE",
    client: "OPEL",
    stock1: 0,
    stock2: 0,
    active: true
  }
];

/**
 * Seeds and synchronizes official Bezel references.
 * Cleans up temporary placeholder seeds if present.
 */
export async function seedBezelReferencesIfEmpty(): Promise<boolean> {
  try {
    const snap = await getDocs(collection(db, "bezel_references"));
    const existingIds = new Set(snap.docs.map((d) => d.id));
    const now = new Date().toISOString();
    let modified = false;

    // Delete temporary dummy seeds if any were seeded previously
    const dummyIds = ["BZ-F150-L", "BZ-F150-R", "BZ-V363-U", "BZ-V363-D"];
    for (const d of snap.docs) {
      if (dummyIds.includes(d.id)) {
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(d.ref);
        modified = true;
      }
    }

    // Ensure all 3 official references exist
    for (const seed of INITIAL_BEZEL_SEEDS) {
      if (!existingIds.has(seed.id)) {
        const refDoc = doc(db, "bezel_references", seed.id);
        await setDoc(
          refDoc,
          cleanData({
            ...seed,
            totalStock: seed.stock1 + seed.stock2,
            createdAt: now,
            updatedAt: now,
            createdBy: "SYSTEM_INIT",
            serverTimestamp: serverTimestamp()
          })
        );
        modified = true;
      } else {
        // Update client and description if missing
        const existingDoc = snap.docs.find((d) => d.id === seed.id);
        if (existingDoc) {
          const data = existingDoc.data();
          if (!data.client || data.description !== seed.description) {
            await setDoc(
              existingDoc.ref,
              cleanData({
                description: seed.description,
                client: seed.client,
                updatedAt: now
              }),
              { merge: true }
            );
            modified = true;
          }
        }
      }
    }
    return modified;
  } catch (err) {
    console.warn("[BezelService] Seeding check error:", err);
    return false;
  }
}

/**
 * 1. NEW TRUCK
 * Receive Bezel material into the factory.
 * Destination choice per item: [ STOCK 1 ] OR [ STOCK 2 ]
 * S1: Stock 1 + qty
 * S2: Stock 2 + qty
 * Atomic execution across all items in the truck.
 */
export async function executeBezelNewTruck(params: {
  invoiceNumber?: string;
  items: BezelTruckItem[];
  operatorName: string;
  operatorId?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; operations: BezelOperation[] }> {
  if (!params.items || params.items.length === 0) {
    throw new Error("Truck must contain at least one item.");
  }

  const key = params.idempotencyKey || `truck-${params.items.map((i) => `${i.reference}:${i.quantity}`).join("-")}`;
  checkAndSetIdempotency(key);

  for (const item of params.items) {
    if (!item.reference || !item.reference.trim()) {
      throw new Error("All truck items must have a valid reference.");
    }
    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Quantity for ${item.reference} must be greater than zero.`);
    }
    if (item.destinationStock !== "STOCK 1" && item.destinationStock !== "STOCK 2") {
      throw new Error(`Destination for ${item.reference} must be STOCK 1 or STOCK 2.`);
    }
  }

  const nowIso = new Date().toISOString();
  const operationsCreated: BezelOperation[] = [];

  await runTransaction(db, async (transaction) => {
    // 1. Group deltas by reference
    const refMap = new Map<string, { delta1: number; delta2: number }>();
    for (const item of params.items) {
      const refCode = item.reference.trim();
      const cur = refMap.get(refCode) || { delta1: 0, delta2: 0 };
      if (item.destinationStock === "STOCK 1") {
        cur.delta1 += Number(item.quantity);
      } else {
        cur.delta2 += Number(item.quantity);
      }
      refMap.set(refCode, cur);
    }

    // 2. Read authoritative state for all affected references
    const refDocs = new Map<string, { docRef: any; data: BezelReference }>();
    for (const refCode of refMap.keys()) {
      const docRef = doc(db, "bezel_references", refCode);
      const snap = await transaction.get(docRef);
      if (!snap.exists()) {
        // Auto-create reference if it doesn't exist yet
        const newRef: BezelReference = {
          id: refCode,
          code: refCode,
          description: `Bezel Component ${refCode}`,
          stock1: 0,
          stock2: 0,
          totalStock: 0,
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: params.operatorName
        };
        refDocs.set(refCode, { docRef, data: newRef });
      } else {
        refDocs.set(refCode, { docRef, data: snap.data() as BezelReference });
      }
    }

    // 3. Compute new stock levels and record operations
    for (const item of params.items) {
      const refCode = item.reference.trim();
      const entry = refDocs.get(refCode)!;
      const curRef = entry.data;

      const qty = Number(item.quantity);
      const opId = generateBezelOpId("bz-truck");

      const s1Before = curRef.stock1 || 0;
      const s2Before = curRef.stock2 || 0;

      let s1After = s1Before;
      let s2After = s2Before;

      if (item.destinationStock === "STOCK 1") {
        s1After += qty;
        curRef.stock1 = s1After;
      } else {
        s2After += qty;
        curRef.stock2 = s2After;
      }
      curRef.totalStock = (curRef.stock1 || 0) + (curRef.stock2 || 0);
      curRef.updatedAt = nowIso;
      curRef.lastOperation = "NEW_TRUCK";

      const opRecord: BezelOperation = {
        id: opId,
        operationType: "NEW_TRUCK",
        reference: refCode,
        quantity: qty,
        destinationStock: item.destinationStock,
        invoiceNumber: params.invoiceNumber || "",
        operatorName: params.operatorName,
        operatorId: params.operatorId || "",
        timestamp: nowIso,
        stock1Before: s1Before,
        stock1After: s1After,
        stock2Before: s2Before,
        stock2After: s2After,
        status: "completed"
      };

      const opDocRef = doc(db, "bezel_operations", opId);
      transaction.set(opDocRef, cleanData({
        ...opRecord,
        serverTimestamp: serverTimestamp()
      }));

      operationsCreated.push(opRecord);
    }

    // 4. Commit all reference updates
    for (const [refCode, entry] of refDocs.entries()) {
      transaction.set(entry.docRef, cleanData({
        ...entry.data,
        updatedAt: nowIso,
        serverTimestamp: serverTimestamp()
      }), { merge: true });
    }
  });

  return { success: true, operations: operationsCreated };
}

/**
 * 2. ASSEMBLAGE
 * Move Bezel material from Stock 1 into Stock 2.
 * Flow: STOCK 1 → STOCK 2
 * Result: Stock 1 - qty, Stock 2 + qty
 * Prevents negative Stock 1 atomically.
 */
export async function executeBezelAssemblage(params: {
  reference: string;
  quantity: number;
  operatorName: string;
  operatorId?: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; operation: BezelOperation }> {
  const refCode = params.reference.trim();
  const qty = Number(params.quantity);

  if (!refCode) throw new Error("Reference code is required.");
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be greater than zero.");

  const key = params.idempotencyKey || `asm-${refCode}-${qty}-${Date.now()}`;
  checkAndSetIdempotency(key);

  const nowIso = new Date().toISOString();
  let createdOp: BezelOperation | null = null;

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, "bezel_references", refCode);
    const snap = await transaction.get(docRef);

    if (!snap.exists()) {
      throw new Error(`Reference ${refCode} does not exist.`);
    }

    const currentData = snap.data() as BezelReference;
    const currentStock1 = currentData.stock1 || 0;
    const currentStock2 = currentData.stock2 || 0;

    if (currentStock1 < qty) {
      throw new Error(
        `Insufficient Stock 1 for ${refCode}. Available: ${currentStock1}, Requested: ${qty}`
      );
    }

    const newStock1 = currentStock1 - qty;
    const newStock2 = currentStock2 + qty;
    const opId = generateBezelOpId("bz-asm");

    const opRecord: BezelOperation = {
      id: opId,
      operationType: "BEZEL_ASSEMBLAGE",
      reference: refCode,
      quantity: qty,
      sourceStock: "STOCK 1",
      destinationStock: "STOCK 2",
      operatorName: params.operatorName,
      operatorId: params.operatorId || "",
      timestamp: nowIso,
      stock1Before: currentStock1,
      stock1After: newStock1,
      stock2Before: currentStock2,
      stock2After: newStock2,
      status: "completed",
      notes: params.notes || ""
    };

    // Update reference
    transaction.update(docRef, cleanData({
      stock1: newStock1,
      stock2: newStock2,
      totalStock: newStock1 + newStock2,
      updatedAt: nowIso,
      lastOperation: "BEZEL_ASSEMBLAGE",
      serverTimestamp: serverTimestamp()
    }));

    // Record operation
    const opDocRef = doc(db, "bezel_operations", opId);
    transaction.set(opDocRef, cleanData({
      ...opRecord,
      serverTimestamp: serverTimestamp()
    }));

    createdOp = opRecord;
  });

  return { success: true, operation: createdOp! };
}

/**
 * 3. DELIVERY
 * Remove finished Bezel material from Stock 2.
 * Flow: STOCK 2 → OUT
 * Result: Stock 2 - qty
 * Prevents negative Stock 2 atomically.
 */
export async function executeBezelDelivery(params: {
  reference: string;
  quantity: number;
  invoiceNumber?: string;
  operatorName: string;
  operatorId?: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; operation: BezelOperation }> {
  const refCode = params.reference.trim();
  const qty = Number(params.quantity);

  if (!refCode) throw new Error("Reference code is required.");
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be greater than zero.");

  const key = params.idempotencyKey || `del-${refCode}-${qty}-${Date.now()}`;
  checkAndSetIdempotency(key);

  const nowIso = new Date().toISOString();
  let createdOp: BezelOperation | null = null;

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, "bezel_references", refCode);
    const snap = await transaction.get(docRef);

    if (!snap.exists()) {
      throw new Error(`Reference ${refCode} does not exist.`);
    }

    const currentData = snap.data() as BezelReference;
    const currentStock1 = currentData.stock1 || 0;
    const currentStock2 = currentData.stock2 || 0;

    if (currentStock2 < qty) {
      throw new Error(
        `Insufficient Stock 2 for delivery of ${refCode}. Available: ${currentStock2}, Requested: ${qty}`
      );
    }

    const newStock2 = currentStock2 - qty;
    const opId = generateBezelOpId("bz-del");

    const opRecord: BezelOperation = {
      id: opId,
      operationType: "BEZEL_DELIVERY",
      reference: refCode,
      quantity: qty,
      sourceStock: "STOCK 2",
      destinationStock: "OUT",
      invoiceNumber: params.invoiceNumber || "",
      operatorName: params.operatorName,
      operatorId: params.operatorId || "",
      timestamp: nowIso,
      stock1Before: currentStock1,
      stock1After: currentStock1,
      stock2Before: currentStock2,
      stock2After: newStock2,
      status: "completed",
      notes: params.notes || ""
    };

    // Update reference
    transaction.update(docRef, cleanData({
      stock2: newStock2,
      totalStock: currentStock1 + newStock2,
      updatedAt: nowIso,
      lastOperation: "BEZEL_DELIVERY",
      serverTimestamp: serverTimestamp()
    }));

    // Record operation
    const opDocRef = doc(db, "bezel_operations", opId);
    transaction.set(opDocRef, cleanData({
      ...opRecord,
      serverTimestamp: serverTimestamp()
    }));

    createdOp = opRecord;
  });

  return { success: true, operation: createdOp! };
}

/**
 * 4. RETURN
 * Return Bezel material from Stock 2 back to Stock 1.
 * Flow: STOCK 2 → STOCK 1
 * Result: Stock 2 - qty, Stock 1 + qty
 * Prevents negative Stock 2 atomically.
 */
export async function executeBezelReturn(params: {
  reference: string;
  quantity: number;
  operatorName: string;
  operatorId?: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; operation: BezelOperation }> {
  const refCode = params.reference.trim();
  const qty = Number(params.quantity);

  if (!refCode) throw new Error("Reference code is required.");
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be greater than zero.");

  const key = params.idempotencyKey || `ret-${refCode}-${qty}-${Date.now()}`;
  checkAndSetIdempotency(key);

  const nowIso = new Date().toISOString();
  let createdOp: BezelOperation | null = null;

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, "bezel_references", refCode);
    const snap = await transaction.get(docRef);

    if (!snap.exists()) {
      throw new Error(`Reference ${refCode} does not exist.`);
    }

    const currentData = snap.data() as BezelReference;
    const currentStock1 = currentData.stock1 || 0;
    const currentStock2 = currentData.stock2 || 0;

    if (currentStock2 < qty) {
      throw new Error(
        `Insufficient Stock 2 to return for ${refCode}. Available: ${currentStock2}, Requested: ${qty}`
      );
    }

    const newStock2 = currentStock2 - qty;
    const newStock1 = currentStock1 + qty;
    const opId = generateBezelOpId("bz-ret");

    const opRecord: BezelOperation = {
      id: opId,
      operationType: "BEZEL_RETURN",
      reference: refCode,
      quantity: qty,
      sourceStock: "STOCK 2",
      destinationStock: "STOCK 1",
      operatorName: params.operatorName,
      operatorId: params.operatorId || "",
      timestamp: nowIso,
      stock1Before: currentStock1,
      stock1After: newStock1,
      stock2Before: currentStock2,
      stock2After: newStock2,
      status: "completed",
      notes: params.notes || ""
    };

    // Update reference
    transaction.update(docRef, cleanData({
      stock1: newStock1,
      stock2: newStock2,
      totalStock: newStock1 + newStock2,
      updatedAt: nowIso,
      lastOperation: "BEZEL_RETURN",
      serverTimestamp: serverTimestamp()
    }));

    // Record operation
    const opDocRef = doc(db, "bezel_operations", opId);
    transaction.set(opDocRef, cleanData({
      ...opRecord,
      serverTimestamp: serverTimestamp()
    }));

    createdOp = opRecord;
  });

  return { success: true, operation: createdOp! };
}

/**
 * 5. SCRAP / NOK
 * Remove defective/NOK Bezel material from explicit source:
 * [ STOCK 1 ] OR [ STOCK 2 ]
 * S1: Stock 1 - qty
 * S2: Stock 2 - qty
 * Never remove from both automatically.
 */
export async function executeBezelScrap(params: {
  reference: string;
  quantity: number;
  sourceStock: "STOCK 1" | "STOCK 2";
  reason?: string;
  operatorName: string;
  operatorId?: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; operation: BezelOperation }> {
  const refCode = params.reference.trim();
  const qty = Number(params.quantity);

  if (!refCode) throw new Error("Reference code is required.");
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be greater than zero.");
  if (params.sourceStock !== "STOCK 1" && params.sourceStock !== "STOCK 2") {
    throw new Error("Must explicitly specify source stock as STOCK 1 or STOCK 2.");
  }

  const key = params.idempotencyKey || `scr-${refCode}-${params.sourceStock}-${qty}-${Date.now()}`;
  checkAndSetIdempotency(key);

  const nowIso = new Date().toISOString();
  let createdOp: BezelOperation | null = null;

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, "bezel_references", refCode);
    const snap = await transaction.get(docRef);

    if (!snap.exists()) {
      throw new Error(`Reference ${refCode} does not exist.`);
    }

    const currentData = snap.data() as BezelReference;
    const currentStock1 = currentData.stock1 || 0;
    const currentStock2 = currentData.stock2 || 0;

    let newStock1 = currentStock1;
    let newStock2 = currentStock2;

    if (params.sourceStock === "STOCK 1") {
      if (currentStock1 < qty) {
        throw new Error(
          `Insufficient Stock 1 for scrap of ${refCode}. Available: ${currentStock1}, Requested: ${qty}`
        );
      }
      newStock1 = currentStock1 - qty;
    } else {
      if (currentStock2 < qty) {
        throw new Error(
          `Insufficient Stock 2 for scrap of ${refCode}. Available: ${currentStock2}, Requested: ${qty}`
        );
      }
      newStock2 = currentStock2 - qty;
    }

    const opId = generateBezelOpId("bz-scr");

    const opRecord: BezelOperation = {
      id: opId,
      operationType: "BEZEL_SCRAP",
      reference: refCode,
      quantity: qty,
      sourceStock: params.sourceStock,
      destinationStock: "SCRAP",
      reason: params.reason || "NOK Defect",
      operatorName: params.operatorName,
      operatorId: params.operatorId || "",
      timestamp: nowIso,
      stock1Before: currentStock1,
      stock1After: newStock1,
      stock2Before: currentStock2,
      stock2After: newStock2,
      status: "completed",
      notes: params.notes || ""
    };

    // Update reference
    transaction.update(docRef, cleanData({
      stock1: newStock1,
      stock2: newStock2,
      totalStock: newStock1 + newStock2,
      updatedAt: nowIso,
      lastOperation: "BEZEL_SCRAP",
      serverTimestamp: serverTimestamp()
    }));

    // Record operation
    const opDocRef = doc(db, "bezel_operations", opId);
    transaction.set(opDocRef, cleanData({
      ...opRecord,
      serverTimestamp: serverTimestamp()
    }));

    createdOp = opRecord;
  });

  return { success: true, operation: createdOp! };
}

/**
 * Creates a new Bezel Reference in `bezel_references`
 */
export async function createBezelReference(params: {
  code: string;
  description: string;
  client?: string;
  initialStock1?: number;
  initialStock2?: number;
  operatorName: string;
}): Promise<BezelReference> {
  const code = params.code.trim().toUpperCase();
  if (!code) throw new Error("Reference code cannot be empty.");

  const s1 = Math.max(0, Number(params.initialStock1) || 0);
  const s2 = Math.max(0, Number(params.initialStock2) || 0);
  const nowIso = new Date().toISOString();

  const docRef = doc(db, "bezel_references", code);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    throw new Error(`Bezel Reference "${code}" already exists.`);
  }

  const newRef: BezelReference = {
    id: code,
    code,
    description: params.description.trim() || `Bezel Reference ${code}`,
    client: params.client ? params.client.trim().toUpperCase() : "",
    stock1: s1,
    stock2: s2,
    totalStock: s1 + s2,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: params.operatorName
  };

  await setDoc(docRef, cleanData({
    ...newRef,
    serverTimestamp: serverTimestamp()
  }));

  // If initial stocks were provided, also record an intake operation for traceability
  if (s1 > 0 || s2 > 0) {
    const opId = generateBezelOpId("bz-init");
    const opDoc = doc(db, "bezel_operations", opId);
    const opRecord: BezelOperation = {
      id: opId,
      operationType: "NEW_TRUCK",
      reference: code,
      quantity: s1 + s2,
      destinationStock: s1 > 0 && s2 > 0 ? "STOCK 1" : s1 > 0 ? "STOCK 1" : "STOCK 2",
      notes: "Initial reference setup stock",
      operatorName: params.operatorName,
      timestamp: nowIso,
      stock1Before: 0,
      stock1After: s1,
      stock2Before: 0,
      stock2After: s2,
      status: "completed"
    };
    await setDoc(opDoc, cleanData({
      ...opRecord,
      serverTimestamp: serverTimestamp()
    }));
  }

  return newRef;
}

/**
 * Reverses a Bezel operation atomically (Manager supervision action)
 */
export async function reverseBezelOperation(params: {
  operationId: string;
  reason: string;
  operatorName: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const opDocRef = doc(db, "bezel_operations", params.operationId);
    const opSnap = await transaction.get(opDocRef);

    if (!opSnap.exists()) {
      throw new Error("Operation not found.");
    }

    const opData = opSnap.data() as BezelOperation;
    if (opData.status === "reversed") {
      throw new Error("This operation has already been reversed.");
    }

    const refDocRef = doc(db, "bezel_references", opData.reference);
    const refSnap = await transaction.get(refDocRef);

    if (!refSnap.exists()) {
      throw new Error(`Associated reference ${opData.reference} not found.`);
    }

    const refData = refSnap.data() as BezelReference;
    let s1 = refData.stock1 || 0;
    let s2 = refData.stock2 || 0;
    const qty = opData.quantity;

    // Undo the stock changes according to original operation type
    switch (opData.operationType) {
      case "NEW_TRUCK":
        if (opData.destinationStock === "STOCK 1") {
          if (s1 < qty) throw new Error(`Cannot reverse: Stock 1 is now ${s1}, less than original ${qty}.`);
          s1 -= qty;
        } else {
          if (s2 < qty) throw new Error(`Cannot reverse: Stock 2 is now ${s2}, less than original ${qty}.`);
          s2 -= qty;
        }
        break;

      case "BEZEL_ASSEMBLAGE":
        // Original was S1 -> S2, so reverse is S2 -> S1
        if (s2 < qty) throw new Error(`Cannot reverse: Stock 2 is now ${s2}, less than assembled ${qty}.`);
        s2 -= qty;
        s1 += qty;
        break;

      case "BEZEL_DELIVERY":
        // Original was S2 -> OUT, so reverse is restore S2
        s2 += qty;
        break;

      case "BEZEL_RETURN":
        // Original was S2 -> S1, so reverse is S1 -> S2
        if (s1 < qty) throw new Error(`Cannot reverse: Stock 1 is now ${s1}, less than returned ${qty}.`);
        s1 -= qty;
        s2 += qty;
        break;

      case "BEZEL_SCRAP":
        // Original removed from sourceStock, so reverse adds back
        if (opData.sourceStock === "STOCK 1") {
          s1 += qty;
        } else {
          s2 += qty;
        }
        break;

      default:
        throw new Error(`Unknown operation type: ${opData.operationType}`);
    }

    // Mark operation as reversed
    transaction.update(opDocRef, {
      status: "reversed",
      reversalReason: params.reason || "Operational correction",
      reversedAt: nowIso,
      reversedBy: params.operatorName
    });

    // Update reference stock levels
    transaction.update(refDocRef, {
      stock1: s1,
      stock2: s2,
      totalStock: s1 + s2,
      updatedAt: nowIso,
      lastOperation: `REVERSAL_${opData.operationType}`,
      serverTimestamp: serverTimestamp()
    });
  });
}
