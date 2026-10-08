import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs,
  onSnapshot 
} from "firebase/firestore";
import { db } from "../firebase";
import { ArchivedInvoice, Delivery, Reference } from "../types";
import { formatSystemDate, getMoroccoTodayDateString } from "../utils/timeUtils";

// IndexedDB configuration for high-capacity local PDF caching
const IDB_NAME = "EPP_INVOICE_ARCHIVE_DB";
const IDB_VERSION = 1;
const IDB_STORE = "invoice_pdfs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "invoiceNumber" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores a PDF data URL into IndexedDB.
 */
export async function storePdfInLocalDb(invoiceNumber: string, dataUrl: string, fileName?: string): Promise<void> {
  try {
    const idb = await openDb();
    const tx = idb.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put({
      invoiceNumber: invoiceNumber.trim().toUpperCase(),
      dataUrl,
      fileName: fileName || `${invoiceNumber}.pdf`,
      savedAt: new Date().toISOString()
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to store PDF in IndexedDB:", err);
  }
}

/**
 * Retrieves a PDF data URL from IndexedDB by invoice number.
 */
export async function getPdfFromLocalDb(invoiceNumber: string): Promise<string | null> {
  try {
    const idb = await openDb();
    const tx = idb.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(invoiceNumber.trim().toUpperCase());
    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result?.dataUrl || null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Normalizes an invoice ID for Firestore document key.
 */
export function getInvoiceDocId(invoiceNumber: string): string {
  const clean = invoiceNumber.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, "_");
  return `INV_${clean}`;
}

/**
 * Converts a File object to base64 Data URL.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Recursively strips undefined fields from an object to ensure
 * strict compliance with Firestore document constraints.
 */
export function removeUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return undefined as any;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) {
      result[k] = removeUndefinedDeep(v);
    }
  }
  return result as T;
}

/**
 * Saves or updates an ArchivedInvoice in Firestore and IndexedDB.
 */
export async function saveArchivedInvoice(
  invoice: Omit<ArchivedInvoice, "id">,
  pdfDataUrl?: string
): Promise<string> {
  const invoiceNumber = invoice.invoiceNumber.trim().toUpperCase();
  const docId = getInvoiceDocId(invoiceNumber);
  const docRef = doc(db, "archived_invoices", docId);

  // Handle PDF: If small enough (< 700KB base64), keep in Firestore.
  // In either case, always also save in IndexedDB for fast access.
  let inlinePdfUrl: string | undefined = undefined;
  const hasPdf = Boolean(pdfDataUrl || invoice.hasPdf);

  if (pdfDataUrl) {
    await storePdfInLocalDb(invoiceNumber, pdfDataUrl, invoice.pdfFileName);
    // 700KB string limit for Firestore safety margin (Firestore max doc size is 1MB)
    if (pdfDataUrl.length < 750000) {
      inlinePdfUrl = pdfDataUrl;
    }
  } else if (invoice.pdfDataUrl) {
    inlinePdfUrl = invoice.pdfDataUrl;
  }

  const rawPayload: Record<string, any> = {
    ...invoice,
    id: docId,
    invoiceNumber,
    hasPdf
  };

  if (inlinePdfUrl) {
    rawPayload.pdfDataUrl = inlinePdfUrl;
  }

  // Ensure no undefined values exist anywhere in payload
  const sanitizedPayload = removeUndefinedDeep(rawPayload);

  await setDoc(docRef, sanitizedPayload, { merge: true });
  return docId;
}

/**
 * Subscribes in real-time to the archived_invoices collection.
 */
export function subscribeToArchivedInvoices(
  callback: (invoices: ArchivedInvoice[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, "archived_invoices");
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: ArchivedInvoice[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ArchivedInvoice);
      });
      // Sort newest first
      list.sort((a, b) => {
        const tA = new Date(a.uploadedAt || a.invoiceDate || 0).getTime();
        const tB = new Date(b.uploadedAt || b.invoiceDate || 0).getTime();
        return tB - tA;
      });
      callback(list);
    },
    (err) => {
      console.warn("Archived invoices subscription note:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Retrieves the full PDF Data URL for an invoice (checks Firestore doc first, then IndexedDB).
 */
export async function resolveInvoicePdfUrl(invoice: ArchivedInvoice): Promise<string | null> {
  if (invoice.pdfDataUrl) {
    return invoice.pdfDataUrl;
  }
  const localUrl = await getPdfFromLocalDb(invoice.invoiceNumber);
  return localUrl || null;
}

/**
 * Deletes an archived invoice from Firestore and IndexedDB.
 */
export async function deleteArchivedInvoice(invoiceId: string, invoiceNumber: string): Promise<void> {
  const docRef = doc(db, "archived_invoices", invoiceId);
  await deleteDoc(docRef);

  try {
    const idb = await openDb();
    const tx = idb.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.delete(invoiceNumber.trim().toUpperCase());
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Clears all archived invoices from Firestore and IndexedDB.
 * Physical stocks and historical delivery records remain 100% untouched.
 */
export async function clearAllArchivedInvoices(): Promise<void> {
  const colRef = collection(db, "archived_invoices");
  const snapshot = await getDocs(colRef);
  const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  try {
    const idb = await openDb();
    const tx = idb.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.clear();
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Builds synthetic archive records from historical Delivery items
 * that were logged in the past without an explicit PDF archive entry.
 */
export function synthesizeArchivedInvoicesFromDeliveries(
  deliveries: Delivery[],
  existingArchived: ArchivedInvoice[],
  references: Reference[]
): ArchivedInvoice[] {
  const existingSet = new Set(existingArchived.map((a) => a.invoiceNumber.trim().toUpperCase()));
  const grouped: Record<string, Delivery[]> = {};

  deliveries.forEach((d) => {
    const inv = (d.invoiceNumber || "").trim().toUpperCase();
    if (!inv || existingSet.has(inv)) return;
    if (!grouped[inv]) grouped[inv] = [];
    grouped[inv].push(d);
  });

  const refMap = new Map(references.map((r) => [r.code.toUpperCase(), r]));
  const synthesized: ArchivedInvoice[] = [];

  Object.entries(grouped).forEach(([invNum, items]) => {
    const first = items[0];
    const totalQty = items.reduce((acc, i) => acc + (i.quantity || 0), 0);
    const dateStr = first.timestamp 
      ? formatSystemDate(first.timestamp) 
      : getMoroccoTodayDateString();

    const meshItems = items.map((it) => {
      const refObj = refMap.get(it.reference.toUpperCase());
      return {
        associatedMeshRef: it.reference,
        description: refObj?.description || "Mesh Heating Element",
        quantity: it.quantity,
        targetStock: (it.deliveryType === "PRECOSIDO" ? "Stock 2" : "Stock 3") as "Stock 2" | "Stock 3",
        sourceSWRef: it.notes?.includes("->") ? it.notes.split("->")[0].trim() : undefined,
        applied: true
      };
    });

    synthesized.push({
      id: getInvoiceDocId(invNum),
      invoiceNumber: invNum,
      invoiceDate: dateStr,
      deliveryType: first.deliveryType || "STEERING WHEELS",
      targetStock: first.deliveryType === "PRECOSIDO" ? "Stock 2" : "Stock 3",
      customer: first.customer || "Dalphimetal",
      totalQuantity: totalQty,
      totalMeshQuantity: totalQty,
      uploadedAt: typeof first.timestamp === "string" ? first.timestamp : new Date().toISOString(),
      uploadedBy: first.operatorName || "System",
      status: "applied",
      swItems: [], // No SW items recorded in legacy delivery lines
      meshItems,
      hasPdf: false,
      notes: "Auto-synced from historical deliveries ledger"
    });
  });

  return synthesized;
}
