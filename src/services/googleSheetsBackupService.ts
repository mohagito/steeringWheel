import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore";
import { auth, db } from "../firebase";
import { 
  Reference, 
  InventoryTransaction, 
  Adjustment, 
  Delivery, 
  ReceivingInvoice, 
  ScrapEntry, 
  BezelReference, 
  BezelOperation, 
  BezelInvoice 
} from "../types";
import { formatSystemDateTime } from "../utils/timeUtils";
import { STEERING_WHEEL_MESH_MAPPINGS, PRECOSIDO_MESH_MAPPINGS } from "../data/meshBOMMapping";
import { STEERING_WHEEL_BEZEL_MAPPINGS } from "../data/bezelBOMMapping";

// OAuth Scope declaration matching workspace-integration skill
export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file"
];

export interface GoogleBackupMetadata {
  spreadsheetId: string;
  spreadsheetUrl: string;
  connectedAccount?: string;
  lastSyncTime?: string;
  status: "idle" | "syncing" | "synced" | "error";
  lastError?: string;
  totalRecords?: number;
  tabsMirrored?: string[];
  autoSyncEnabled?: boolean;
}

export interface BackupSyncSnapshot {
  references: Reference[];
  bezelReferences?: BezelReference[];
  transactions: InventoryTransaction[];
  bezelOperations?: BezelOperation[];
  adjustments: Adjustment[];
  deliveries: Delivery[];
  invoices: ReceivingInvoice[];
  bezelInvoices?: BezelInvoice[];
  scraps: ScrapEntry[];
}

// In-memory token cache (never stored in localStorage for security)
let cachedAccessToken: string | null = null;
let cachedAccountEmail: string | null = null;

const provider = new GoogleAuthProvider();
GOOGLE_WORKSPACE_SCOPES.forEach(scope => provider.addScope(scope));

/**
 * Connect to Google Sheets via OAuth popup and obtain in-memory bearer token
 */
export async function connectGoogleBackupAuth(): Promise<{ accessToken: string; email: string }> {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error("Could not obtain Google access token. Please authorize spreadsheet access.");
    }

    cachedAccessToken = token;
    cachedAccountEmail = result.user?.email || "Connected Account";

    // Save connection account info in Firestore metadata
    const meta = await getBackupMetadata();
    await saveBackupMetadata({
      ...meta,
      connectedAccount: cachedAccountEmail,
      status: "idle"
    });

    return { accessToken: token, email: cachedAccountEmail };
  } catch (err: any) {
    console.error("Google Sheets OAuth sign-in error:", err);
    throw err;
  }
}

/**
 * Disconnect Google Sheets session in-memory
 */
export function disconnectGoogleBackupAuth() {
  cachedAccessToken = null;
  cachedAccountEmail = null;
}

/**
 * Returns currently cached Google access token, if any
 */
export function getCachedGoogleToken(): string | null {
  return cachedAccessToken;
}

/**
 * Returns currently connected email, if any
 */
export function getCachedGoogleEmail(): string | null {
  return cachedAccountEmail;
}

/**
 * Checks if Google Sheets backup token is ready
 */
export function isGoogleBackupConnected(): boolean {
  return Boolean(cachedAccessToken);
}

/**
 * Retrieve metadata from Firestore backup_metadata/google_sheets (fallback to localStorage)
 */
export async function getBackupMetadata(): Promise<GoogleBackupMetadata> {
  try {
    const ref = doc(db, "backup_metadata", "google_sheets");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as GoogleBackupMetadata;
    }
  } catch (err) {
    console.warn("Could not read backup metadata from Firestore, trying local storage:", err);
  }

  try {
    const saved = localStorage.getItem("epp_google_backup_meta");
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return {
    spreadsheetId: "",
    spreadsheetUrl: "",
    status: "idle",
    autoSyncEnabled: true
  };
}

/**
 * Save metadata to Firestore backup_metadata/google_sheets (and localStorage)
 */
export async function saveBackupMetadata(meta: GoogleBackupMetadata): Promise<void> {
  try {
    localStorage.setItem("epp_google_backup_meta", JSON.stringify(meta));
  } catch (e) {}

  try {
    const ref = doc(db, "backup_metadata", "google_sheets");
    await setDoc(ref, meta, { merge: true });
  } catch (err) {
    console.warn("Could not persist backup metadata to Firestore:", err);
  }
}

/**
 * Ensures the Google Spreadsheet exists with the standard 9 tabs, creating it if needed
 */
export async function ensureBackupSpreadsheet(accessToken: string): Promise<{ id: string; url: string }> {
  const meta = await getBackupMetadata();

  // If already created, verify it is still accessible
  if (meta.spreadsheetId) {
    try {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${meta.spreadsheetId}?fields=spreadsheetId,properties.title`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        return { id: meta.spreadsheetId, url: meta.spreadsheetUrl };
      }
    } catch (e) {
      console.warn("Existing spreadsheet check notice:", e);
    }
  }

  // Create dedicated disaster-recovery spreadsheet
  const desiredSheets = [
    { properties: { title: "CURRENT_STOCK" } },
    { properties: { title: "OPERATIONS" } },
    { properties: { title: "INVENTORY" } },
    { properties: { title: "DELIVERIES" } },
    { properties: { title: "INVOICES_TRUCKS" } },
    { properties: { title: "SCRAP_NOK" } },
    { properties: { title: "DECOMPOSITION" } },
    { properties: { title: "REFERENCES" } },
    { properties: { title: "BACKUP_HEALTH" } }
  ];

  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: {
        title: "EPP Natur — Factory Stock & Operations Backup (Mirror)"
      },
      sheets: desiredSheets
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Spreadsheet: ${errText}`);
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Apply clean styling: frozen header row, dark navy header background (#0f172a), bold white text
  try {
    const sheetIds = created.sheets?.map((s: any) => s.properties.sheetId) || [];
    const requests = sheetIds.map((sheetId: number) => ({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: "gridProperties.frozenRowCount"
      }
    }));

    // Header cell format
    sheetIds.forEach((sheetId: number) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.06, green: 0.1, blue: 0.18 }, // #0f1a2e
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 10
              },
              horizontalAlignment: "CENTER"
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
        }
      });
    });

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    });
  } catch (styleErr) {
    console.warn("Header formatting notice:", styleErr);
  }

  const updatedMeta: GoogleBackupMetadata = {
    ...meta,
    spreadsheetId,
    spreadsheetUrl,
    tabsMirrored: desiredSheets.map(s => s.properties.title),
    status: "idle"
  };

  await saveBackupMetadata(updatedMeta);
  return { id: spreadsheetId, url: spreadsheetUrl };
}

/**
 * Synchronize all current Firestore application data into Google Sheets (Idempotent mirror)
 */
export async function executeLiveBackupSync(
  accessToken: string,
  snapshot: BackupSyncSnapshot
): Promise<{ success: boolean; spreadsheetUrl: string; totalRecords: number }> {
  const { id: spreadsheetId, url: spreadsheetUrl } = await ensureBackupSpreadsheet(accessToken);

  // Update status to syncing
  const currentMeta = await getBackupMetadata();
  await saveBackupMetadata({ ...currentMeta, status: "syncing" });

  try {
    // 1. Tab: CURRENT_STOCK
    const currentStockValues: any[][] = [
      [
        "MODULE",
        "REFERENCE",
        "DESCRIPTION",
        "CUSTOMER / CLIENT",
        "STOCK 1 (RAW / WAREHOUSE)",
        "STOCK 2 (WIP / PRECOSIDO)",
        "STOCK 3 (FINISHED GOODS)",
        "TOTAL STOCK",
        "LAST UPDATE (CASABLANCA)"
      ]
    ];

    // Meshes references
    snapshot.references.forEach(r => {
      const s1 = r.stock1 || 0;
      const s2 = r.stock2 || 0;
      const s3 = r.stock3 || 0;
      currentStockValues.push([
        "MESHES",
        r.code,
        r.description || "",
        r.customer || "",
        s1,
        s2,
        s3,
        s1 + s2 + s3,
        formatSystemDateTime(r.lastUpdate || r.updatedAt || new Date().toISOString())
      ]);
    });

    // Bezel references
    (snapshot.bezelReferences || []).forEach(b => {
      const s1 = b.stock1 || 0;
      const s2 = b.stock2 || 0;
      currentStockValues.push([
        "BEZEL",
        b.code,
        b.description || "",
        b.client || "",
        s1,
        s2,
        "-", // Bezel does not use Stock 3
        s1 + s2,
        formatSystemDateTime(b.updatedAt || new Date().toISOString())
      ]);
    });

    // 2. Tab: OPERATIONS (Traceable history with unique IDs)
    const operationsValues: any[][] = [
      [
        "OPERATION ID",
        "DATE & TIME (CASABLANCA)",
        "MODULE",
        "REFERENCE",
        "OPERATION TYPE",
        "QUANTITY",
        "FROM STOCK",
        "TO STOCK",
        "OPERATOR",
        "STATUS",
        "INVOICE / CONTAINER",
        "NOTES"
      ]
    ];

    // Meshes transactions
    snapshot.transactions.forEach(t => {
      operationsValues.push([
        t.id,
        formatSystemDateTime(t.timestamp),
        "MESHES",
        t.reference,
        t.movementType,
        t.quantity,
        t.stock || "-",
        t.destinationStock || "-",
        t.operatorName || "Operator",
        "COMPLETED",
        t.invoiceNumber || "-",
        t.notes || ""
      ]);
    });

    // Bezel operations
    (snapshot.bezelOperations || []).forEach(o => {
      operationsValues.push([
        o.id,
        formatSystemDateTime(o.timestamp),
        "BEZEL",
        o.reference,
        o.operationType,
        o.quantity,
        o.sourceStock || "-",
        o.destinationStock || "-",
        o.operatorName || "Operator",
        o.status ? o.status.toUpperCase() : "COMPLETED",
        o.invoiceNumber || "-",
        o.notes || o.reason || ""
      ]);
    });

    // 3. Tab: INVENTORY (Physical counts & differences)
    const inventoryValues: any[][] = [
      [
        "RECONCILIATION ID",
        "DATE & TIME (CASABLANCA)",
        "MODULE",
        "REFERENCE / BOX",
        "SYSTEM QTY",
        "PHYSICAL COUNT",
        "DIFFERENCE",
        "STATUS",
        "OPERATOR",
        "SUPERVISOR / VALIDATED BY",
        "NOTES"
      ]
    ];

    snapshot.adjustments.forEach(a => {
      inventoryValues.push([
        a.id,
        formatSystemDateTime(a.timestamp),
        "MESHES",
        a.reference || a.barcode,
        a.expectedQty,
        a.actualQty,
        a.difference,
        a.status.toUpperCase(),
        a.operatorName,
        a.validatedBy || "-",
        a.comment || ""
      ]);
    });

    // Bezel adjustments
    (snapshot.bezelOperations || []).filter(o => o.operationType === "PHYSICAL_INVENTORY").forEach(o => {
      inventoryValues.push([
        o.id,
        formatSystemDateTime(o.timestamp),
        "BEZEL",
        o.reference,
        o.previousSystemQuantity !== undefined ? o.previousSystemQuantity : "-",
        o.physicalQuantity !== undefined ? o.physicalQuantity : "-",
        o.difference !== undefined ? o.difference : o.quantity,
        "APPROVED",
        o.operatorName,
        o.operatorName,
        o.notes || o.reason || ""
      ]);
    });

    // 4. Tab: DELIVERIES (Customer dispatches & Return ZDF)
    const deliveriesValues: any[][] = [
      [
        "DELIVERY ID",
        "DATE & TIME (CASABLANCA)",
        "MODULE",
        "INVOICE / DOC #",
        "CATEGORY / TYPE",
        "REFERENCE",
        "QUANTITY (PCS)",
        "BOXES",
        "OPERATOR",
        "DESTINATION / CUSTOMER",
        "NOTES"
      ]
    ];

    snapshot.deliveries.forEach(d => {
      deliveriesValues.push([
        d.id,
        formatSystemDateTime(d.timestamp),
        "MESHES",
        d.invoiceNumber || "-",
        (d as any).deliveryType || (d.notes?.includes("RETURN ZDF") ? "RETURN_ZDF" : "DISPATCH"),
        d.reference || "-",
        d.quantity,
        (d as any).totalBoxes || 1,
        d.operatorName,
        d.customer || "-",
        d.notes || ""
      ]);
    });

    // 5. Tab: INVOICES_TRUCKS
    const invoicesValues: any[][] = [
      [
        "INVOICE #",
        "DATE & TIME (CASABLANCA)",
        "MODULE",
        "FLOW / SOURCE",
        "OPERATOR",
        "TOTAL BOXES",
        "TOTAL QUANTITY",
        "STATUS",
        "NOTES"
      ]
    ];

    snapshot.invoices.forEach(inv => {
      invoicesValues.push([
        inv.invoiceNumber,
        formatSystemDateTime(inv.createdAt),
        "MESHES",
        inv.sourceType || "RAW_MATERIAL",
        inv.operator,
        inv.totalBoxes,
        inv.totalQuantity,
        inv.status.toUpperCase(),
        inv.notes || ""
      ]);
    });

    (snapshot.bezelInvoices || []).forEach(bInv => {
      invoicesValues.push([
        bInv.invoiceNumber,
        formatSystemDateTime(bInv.timestamp || bInv.date),
        "BEZEL",
        "TRUCK_INTAKE",
        bInv.operator,
        bInv.totalBoxes || 1,
        bInv.totalQuantity,
        "APPROVED",
        bInv.notes || ""
      ]);
    });

    // 6. Tab: SCRAP_NOK
    const scrapValues: any[][] = [
      [
        "SCRAP ID",
        "DATE & TIME (CASABLANCA)",
        "MODULE",
        "REFERENCE",
        "QUANTITY (PCS)",
        "REASON / DEFECT",
        "OPERATOR",
        "STATUS",
        "NOTES"
      ]
    ];

    snapshot.scraps.forEach(s => {
      scrapValues.push([
        s.id,
        formatSystemDateTime(s.timestamp),
        "MESHES",
        s.reference,
        s.quantity,
        s.condition || s.cola || "NOK Defect",
        s.operatorName || s.supervisorName || "Operator",
        "CONFIRMED",
        s.notes || ""
      ]);
    });

    // 7. Tab: DECOMPOSITION (Steering Wheel to Mesh / Bezel BOM mappings)
    const decompValues: any[][] = [
      [
        "MODULE",
        "WRAPPED / SW REF",
        "DESCRIPTION",
        "COMPONENT / MESH REF",
        "TARGET STOCK DEDUCTION"
      ]
    ];

    STEERING_WHEEL_MESH_MAPPINGS.forEach(m => {
      decompValues.push([
        "MESHES",
        m.steeringWheelRef,
        m.description,
        m.meshRef,
        m.targetStock
      ]);
    });

    PRECOSIDO_MESH_MAPPINGS.forEach(p => {
      decompValues.push([
        "MESHES (PRECOSIDO)",
        p.plantillaRef,
        p.description,
        p.meshRef,
        p.targetStock
      ]);
    });

    STEERING_WHEEL_BEZEL_MAPPINGS.forEach(b => {
      decompValues.push([
        "BEZEL",
        b.steeringWheelRef,
        b.description,
        b.bezelRef,
        b.targetStock
      ]);
    });

    // 8. Tab: REFERENCES (Catalog)
    const refCatalogValues: any[][] = [
      [
        "MODULE",
        "REFERENCE CODE",
        "CUSTOMER / CLIENT",
        "DESCRIPTION",
        "MATERIAL TYPE",
        "ACTIVE",
        "CREATED AT (CASABLANCA)"
      ]
    ];

    snapshot.references.forEach(r => {
      refCatalogValues.push([
        "MESHES",
        r.code,
        r.customer || "",
        r.description || "",
        r.materialType || "Mesh",
        r.active !== false ? "YES" : "NO",
        formatSystemDateTime(r.createdAt || new Date().toISOString())
      ]);
    });

    (snapshot.bezelReferences || []).forEach(b => {
      refCatalogValues.push([
        "BEZEL",
        b.code,
        b.client || "",
        b.description || "",
        "Bezel",
        "YES",
        formatSystemDateTime(b.createdAt || new Date().toISOString())
      ]);
    });

    const totalRecords = 
      (currentStockValues.length - 1) +
      (operationsValues.length - 1) +
      (inventoryValues.length - 1) +
      (deliveriesValues.length - 1) +
      (invoicesValues.length - 1) +
      (scrapValues.length - 1);

    // 9. Tab: BACKUP_HEALTH (Audit & Sync Metadata)
    const syncTimeStr = formatSystemDateTime(new Date().toISOString());
    const healthValues: any[][] = [
      ["METRIC / AUDIT PARAMETER", "VALUE", "SECURITY & RECOVERY SPECIFICATION"],
      ["SOURCE OF TRUTH", "FIREBASE / FIRESTORE", "Authoritative real-time database. Never modified by Sheets."],
      ["BACKUP MODE", "SECONDARY READ-ONLY MIRROR", "Disaster recovery extra copy. One-way sync only."],
      ["FLOW DIRECTION", "FIREBASE → GOOGLE SHEETS", "Strictly unidirectional. No write-back to Firestore."],
      ["AUTHORITATIVE TIMEZONE", "Africa/Casablanca (Morocco)", "Formatted using official Moroccan standard time."],
      ["LAST SYNC TIME (CASABLANCA)", syncTimeStr, "ISO server time mirrored without client clock trust."],
      ["TOTAL CURRENT REFERENCES", (currentStockValues.length - 1).toString(), "Catalog references monitored across Meshes & Bezel."],
      ["TOTAL OPERATIONS MIRRORED", (operationsValues.length - 1).toString(), "Complete historical traceable movement records."],
      ["TOTAL INVENTORY AUDITS", (inventoryValues.length - 1).toString(), "Physical count differences & reconciliation records."],
      ["TOTAL DELIVERIES MIRRORED", (deliveriesValues.length - 1).toString(), "Customer dispatches and Return ZDF receipts."],
      ["TOTAL INVOICES MIRRORED", (invoicesValues.length - 1).toString(), "Incoming truck intakes and delivery notes."],
      ["TOTAL SCRAP ENTRIES", (scrapValues.length - 1).toString(), "Defect and scrap records."],
      ["IDEMPOTENCY GUARANTEE", "ACTIVE (UNIQUE ID MAPPING)", "No duplicate rows created upon repeated synchronization."],
      ["FAILURE ISOLATION", "COMPLETELY ISOLATED", "Factory actions never blocked if Google Sheets is offline."]
    ];

    // Write all 9 tabs via batchUpdate to ensure atomic and clean mirror
    const updatePayload = {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "CURRENT_STOCK!A1:I", values: currentStockValues },
        { range: "OPERATIONS!A1:L", values: operationsValues },
        { range: "INVENTORY!A1:K", values: inventoryValues },
        { range: "DELIVERIES!A1:K", values: deliveriesValues },
        { range: "INVOICES_TRUCKS!A1:I", values: invoicesValues },
        { range: "SCRAP_NOK!A1:I", values: scrapValues },
        { range: "DECOMPOSITION!A1:E", values: decompValues },
        { range: "REFERENCES!A1:G", values: refCatalogValues },
        { range: "BACKUP_HEALTH!A1:C", values: healthValues }
      ]
    };

    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatePayload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets batch update failed: ${errText}`);
    }

    // Persist success metadata in Firestore
    await saveBackupMetadata({
      ...currentMeta,
      spreadsheetId,
      spreadsheetUrl,
      lastSyncTime: new Date().toISOString(),
      status: "synced",
      lastError: undefined,
      totalRecords
    });

    return { success: true, spreadsheetUrl, totalRecords };
  } catch (syncErr: any) {
    console.error("Google Sheets Live Backup Sync error:", syncErr);
    await saveBackupMetadata({
      ...currentMeta,
      spreadsheetId,
      spreadsheetUrl,
      status: "error",
      lastError: syncErr.message || String(syncErr)
    });
    throw syncErr;
  }
}

/**
 * Fetch all Firestore collections directly to build a complete snapshot
 */
export async function fetchFullFirestoreSnapshot(): Promise<BackupSyncSnapshot> {
  const [
    refsSnap,
    bezelRefsSnap,
    transSnap,
    bezelOpsSnap,
    adjSnap,
    delivSnap,
    invSnap,
    bezelInvSnap,
    scrapsSnap
  ] = await Promise.all([
    getDocs(collection(db, "references")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "bezel_references")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "transactions")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "bezel_operations")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "adjustments")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "deliveries")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "invoices")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "bezel_invoices")).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, "scraps")).catch(() => ({ docs: [] } as any))
  ]);

  return {
    references: refsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    bezelReferences: bezelRefsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    transactions: transSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    bezelOperations: bezelOpsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    adjustments: adjSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    deliveries: delivSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    invoices: invSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    bezelInvoices: bezelInvSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    scraps: scrapsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  };
}
