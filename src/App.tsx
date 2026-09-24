import { useState, useEffect, useMemo } from "react";
import { 
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, setDoc, query, orderBy, getDoc, getDocs, writeBatch, runTransaction, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";
import { seedDatabaseIfNeeded, resetDatabaseToPristineState } from "./seeder";
import { Box, Adjustment, User, Reference, Delivery, Production, InventoryTransaction, ScrapEntry, ReceivingInvoice, ScannedInvoiceBox } from "./types";
import { compareTimestampsDesc, getMoroccoTodayDateString, normalizeDocTimestamps } from "./utils/timeUtils";
import RoleGate from "./components/RoleGate";
import DashboardOverview from "./components/DashboardOverview";
import OperatorWorkspace from "./components/OperatorWorkspace";
import SupervisorWorkspace from "./components/SupervisorWorkspace";
import AdminWorkspace from "./components/AdminWorkspace";
import StockWorkspace from "./components/StockWorkspace";
import DeliveriesWorkspace from "./components/DeliveriesWorkspace";
import ProductionWorkspace from "./components/ProductionWorkspace";
import ScrapWorkspace from "./components/ScrapWorkspace";
import ManageReferencesWorkspace from "./components/ManageReferencesWorkspace";
import InvoicesWorkspace from "./components/InvoicesWorkspace";
import RecordsWorkspace from "./components/RecordsWorkspace";
import PegadasWorkspace from "./components/PegadasWorkspace";
import ModuleSelection from "./components/ModuleSelection";
import BezelWorkspace from "./components/BezelWorkspace";
import { LowStockAlertModal } from "./components/LowStockAlertModal";
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, Scan, ClipboardCheck, Settings, LogOut, 
  RefreshCw, CheckSquare, Shield, HelpCircle, Database, Truck, Factory, Trash2, FolderTree, FileText,
  AlertTriangle, History, Layers, ArrowLeft
} from "lucide-react";
import {
  executeProtectedDeliveries,
  executeProtectedTransfer,
  executeProtectedProduction,
  executeProtectedScrap,
  executeProtectedDeleteScrap,
  executeProtectedUpdateScrap,
  executeProtectedDeleteProduction,
  executeProtectedUpdateProduction,
  executeProtectedDeleteDelivery,
  executeProtectedUpdateDelivery,
  executeProtectedApproveInvoice,
  executeProtectedUpdateInvoice,
  executeProtectedAdjustment,
  executeProtectedEditOperation,
  executeProtectedDeleteOrReverseOperation,
  executeProtectedDeleteBox,
  executeProtectedUpdateBox
} from "./services/protectionLayer";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = sessionStorage.getItem("epp_current_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [scraps, setScraps] = useState<ScrapEntry[]>([]);
  const [invoices, setInvoices] = useState<ReceivingInvoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "stock" | "invoices" | "operator" | "pegadas" | "records" | "supervisor" | "admin" | "deliveries" | "production" | "scrap" | "manage-references">(() => {
    try {
      const savedUser = sessionStorage.getItem("epp_current_user");
      const savedTab = sessionStorage.getItem("epp_active_tab") as any;
      if (savedUser) {
        const u: User = JSON.parse(savedUser);
        if (u.role === "admin" && savedTab === "records") {
          return "dashboard";
        }
        if (savedTab) return savedTab;
        return u.role === "operator" ? "operator" : "dashboard";
      }
      if (savedTab) return savedTab;
    } catch (e) {}
    return "dashboard";
  });
  const [activeModule, setActiveModule] = useState<"meshes" | "bezel" | null>(() => {
    try {
      const savedUser = sessionStorage.getItem("epp_current_user");
      const savedModule = sessionStorage.getItem("epp_active_module");
      if (savedUser) {
        const u: User = JSON.parse(savedUser);
        if (u.role === "operator") {
          return "meshes";
        }
        if (savedModule === "meshes" || savedModule === "bezel") {
          return savedModule;
        }
        return null;
      }
    } catch (e) {}
    return null;
  });
  const [isGlobalLowStockModalOpen, setIsGlobalLowStockModalOpen] = useState(false);

  // Authoritative real-time low stock calculation (Stock 1 + Stock 2 < 100 PCS)
  const lowStockReferences = useMemo(() => {
    return references.filter((r) => {
      const s1PlusS2 = (r.stock1 || 0) + (r.stock2 || 0);
      return s1PlusS2 < 100;
    });
  }, [references]);

  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem("epp_current_user", JSON.stringify(currentUser));
      if (currentUser.role === "admin" && activeTab === "records") {
        setActiveTab("dashboard");
      }
    } else {
      sessionStorage.removeItem("epp_current_user");
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (activeTab) {
      sessionStorage.setItem("epp_active_tab", activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeModule) {
      sessionStorage.setItem("epp_active_module", activeModule);
    } else {
      sessionStorage.removeItem("epp_active_module");
    }
  }, [activeModule]);

  // Sync state with Firestore on mount
  useEffect(() => {
    let unsubBoxes: (() => void) | null = null;
    let unsubAdjustments: (() => void) | null = null;
    let unsubReferences: (() => void) | null = null;
    let unsubUsers: (() => void) | null = null;
    let unsubDeliveries: (() => void) | null = null;
    let unsubProductions: (() => void) | null = null;
    let unsubTransactions: (() => void) | null = null;
    let unsubScraps: (() => void) | null = null;
    let unsubInvoices: (() => void) | null = null;

    async function initApp() {
      try {
        // 1. Seed database with rich sample data if completely empty
        await seedDatabaseIfNeeded();
        // 2. Automatically run self-healing database integrity audit
        await handleAuditDatabase();
      } catch (err) {
        console.error("Initialization / Audit failed", err);
      }

      // 2. Real-time subscriptions to Firestore collections
      unsubBoxes = onSnapshot(
        collection(db, "boxes"), 
        (snapshot) => {
          const boxesList: Box[] = [];
          snapshot.forEach((doc) => {
            boxesList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as Box);
          });
          // Sort boxes alphabetically by barcode
          boxesList.sort((a, b) => a.barcode.localeCompare(b.barcode));
          setBoxes(boxesList);
        },
        (error) => {
          console.error("Error subscribing to boxes:", error);
        }
      );

      // Sort adjustments by timestamp descending
      unsubAdjustments = onSnapshot(
        collection(db, "adjustments"), 
        (snapshot) => {
          const adjList: Adjustment[] = [];
          snapshot.forEach((doc) => {
            adjList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as Adjustment);
          });
          adjList.sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
          setAdjustments(adjList);
        },
        (error) => {
          console.error("Error subscribing to adjustments:", error);
        }
      );

      unsubReferences = onSnapshot(
        collection(db, "references"),
        (snapshot) => {
          const refList: Reference[] = [];
          snapshot.forEach((doc) => {
            refList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as Reference);
          });
          refList.sort((a, b) => a.code.localeCompare(b.code));
          setReferences(refList);
        },
        (error) => {
          console.error("Error subscribing to references:", error);
        }
      );

      // Subscribing to Deliveries collection
      unsubDeliveries = onSnapshot(
        collection(db, "deliveries"),
        (snapshot) => {
          const delList: Delivery[] = [];
          snapshot.forEach((doc) => {
            delList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as Delivery);
          });
          // Sort deliveries descending by timestamp
          delList.sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
          setDeliveries(delList);
        },
        (error) => {
          console.error("Error subscribing to deliveries:", error);
        }
      );

      // Subscribing to Productions collection
      unsubProductions = onSnapshot(
        collection(db, "productions"),
        (snapshot) => {
          const prodList: Production[] = [];
          snapshot.forEach((doc) => {
            prodList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as Production);
          });
          // Sort productions descending by date, then by timestamp
          prodList.sort((a, b) => {
            const dateDiff = compareTimestampsDesc(a.date, b.date);
            if (dateDiff !== 0) return dateDiff;
            return compareTimestampsDesc(a.timestamp, b.timestamp);
          });
          setProductions(prodList);
        },
        (error) => {
          console.error("Error subscribing to productions:", error);
        }
      );

      unsubTransactions = onSnapshot(
        collection(db, "transactions"),
        (snapshot) => {
          const transList: InventoryTransaction[] = [];
          snapshot.forEach((doc) => {
            transList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as InventoryTransaction);
          });
          transList.sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
          setTransactions(transList);
        },
        (error) => {
          console.error("Error subscribing to transactions:", error);
        }
      );

      unsubScraps = onSnapshot(
        collection(db, "scraps"),
        (snapshot) => {
          const scrapList: ScrapEntry[] = [];
          snapshot.forEach((doc) => {
            scrapList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as ScrapEntry);
          });
          scrapList.sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
          setScraps(scrapList);
        },
        (error) => {
          console.error("Error subscribing to scraps:", error);
        }
      );

      unsubInvoices = onSnapshot(
        collection(db, "invoices"),
        (snapshot) => {
          const invList: ReceivingInvoice[] = [];
          snapshot.forEach((doc) => {
            invList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as ReceivingInvoice);
          });
          invList.sort((a, b) => compareTimestampsDesc(a.createdAt, b.createdAt));
          setInvoices(invList);
        },
        (error) => {
          console.error("Error subscribing to invoices:", error);
        }
      );

      unsubUsers = onSnapshot(
        collection(db, "users"), 
        (snapshot) => {
          const usersList: User[] = [];
          snapshot.forEach((doc) => {
            usersList.push({ id: doc.id, ...normalizeDocTimestamps(doc.data()) } as User);
          });
          setUsers(usersList);
          setLoading(false);
        },
        (error) => {
          console.error("Error subscribing to users:", error);
          setLoading(false); // Make sure we stop loading even on error
        }
      );
    }

    initApp();

    return () => {
      if (unsubBoxes) unsubBoxes();
      if (unsubAdjustments) unsubAdjustments();
      if (unsubReferences) unsubReferences();
      if (unsubDeliveries) unsubDeliveries();
      if (unsubProductions) unsubProductions();
      if (unsubTransactions) unsubTransactions();
      if (unsubScraps) unsubScraps();
      if (unsubInvoices) unsubInvoices();
      if (unsubUsers) unsubUsers();
    };
  }, []);

  // Helper to remove undefined values before writing to Firestore
  const cleanUndefined = <T extends Record<string, any>>(obj: T): T => {
    const clean: any = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== undefined) {
        clean[key] = obj[key];
      }
    });
    return clean as T;
  };

  // Action: Operator logs multiple deliveries / dispatches in a batch under one invoice (Protected)
  const handleSubmitDeliveries = async (deliveriesData: Omit<Delivery, "id" | "timestamp" | "operatorName">[]) => {
    if (!currentUser) return;
    await executeProtectedDeliveries(deliveriesData, currentUser.fullName);
  };

  // Action: Operator logs Transfer from Stock 1 (Untouched Mesh) to Stock 2 (Mallas Pegadas) (Protected)
  const handleSubmitTransfer = async (transferEntries: { reference: string; quantity: number; notes?: string }[]) => {
    if (!currentUser) return;
    await executeProtectedTransfer(transferEntries, currentUser.fullName);
  };

  // Action: Operator logs production output (Moves quantity from Stock 2 WIP to Stock 3 Finished Goods) (Protected)
  const handleSubmitProduction = async (productionEntries: { date: string; reference: string; quantity: number; notes?: string }[]) => {
    if (!currentUser) return;
    await executeProtectedProduction(productionEntries, currentUser.fullName);
  };

  // Action: Supervisor logs NOK / Scrap Mesh entry (Single or Batch) (Protected)
  const handleSubmitScrap = async (
    scrapInput:
      | Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter">
      | Omit<ScrapEntry, "id" | "timestamp" | "supervisorName" | "stockBefore" | "stockAfter">[],
    idempotencyKey?: string
  ) => {
    if (!currentUser) return;
    await executeProtectedScrap(scrapInput, currentUser.fullName, idempotencyKey);
  };

  // Action: Supervisor/Operator deletes / reverts a scrap entry (Protected)
  const handleDeleteScrap = async (scrapId: string, reason?: string) => {
    await executeProtectedDeleteScrap(scrapId, currentUser?.fullName || "System", scraps, reason);
  };

  // Action: Modify an existing scrap entry (Protected)
  const handleUpdateScrap = async (
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
    reason?: string
  ) => {
    if (!currentUser) throw new Error("No authenticated user session.");
    await executeProtectedUpdateScrap(scrapId, updatedData, currentUser.fullName, reason);
  };

  // Action: Delete / Revert a production entry (moves quantity back from Stock 3 Finished Goods to Stock 2 WIP) (Protected)
  const handleDeleteProduction = async (productionId: string, reason?: string) => {
    await executeProtectedDeleteProduction(productionId, currentUser?.fullName || "System", productions, reason);
  };

  // Action: Modify an existing production entry (Protected)
  const handleUpdateProduction = async (
    productionId: string,
    updatedData: { date: string; reference: string; quantity: number; notes?: string },
    reason?: string
  ) => {
    if (!currentUser) throw new Error("No authenticated user session.");
    await executeProtectedUpdateProduction(productionId, updatedData, currentUser.fullName, reason);
  };

  // Action: Delete / Revert a delivery entry (Protected)
  const handleDeleteDelivery = async (deliveryId: string, reason?: string) => {
    await executeProtectedDeleteDelivery(deliveryId, currentUser?.fullName || "System", deliveries, reason);
  };

  // Action: Modify an existing delivery entry (Protected)
  const handleUpdateDelivery = async (
    deliveryId: string,
    updatedData: { invoiceNumber: string; reference: string; quantity: number; deliveryType: "PRECOSIDO" | "STEERING WHEELS" },
    reason?: string
  ) => {
    if (!currentUser) throw new Error("No authenticated user session.");
    await executeProtectedUpdateDelivery(deliveryId, updatedData, currentUser.fullName, reason);
  };

  // Action: Save or update a pending receiving invoice session in Firestore
  const handleSavePendingInvoice = async (invoice: ReceivingInvoice) => {
    const invoiceRef = doc(db, "invoices", invoice.id);
    await setDoc(invoiceRef, cleanUndefined(invoice), { merge: true });
  };

  // Action: Atomically approve an entire receiving invoice into Stock 1 (Protected)
  const handleApproveInvoice = async (invoiceId: string) => {
    if (!currentUser) throw new Error("No authenticated user session.");
    await executeProtectedApproveInvoice(invoiceId, currentUser.fullName);
  };

  // Action: Cancel an entire receiving invoice with ZERO stock impact
  const handleCancelInvoice = async (invoiceId: string) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const invoiceRef = doc(db, "invoices", invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);
    if (!invoiceSnap.exists()) return;
    const data = invoiceSnap.data() as ReceivingInvoice;
    if (data.status === "approved") {
      throw new Error("Cannot cancel an already approved invoice.");
    }
    await updateDoc(invoiceRef, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: currentUser.fullName
    });
  };

  // Action: Delete a single receiving invoice record from the register permanently
  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const invoiceRef = doc(db, "invoices", invoiceId);
      const invoiceSnap = await getDoc(invoiceRef);
      let invNum = "";
      if (invoiceSnap.exists()) {
        const invData = invoiceSnap.data() as ReceivingInvoice;
        invNum = (invData.invoiceNumber || "").trim();
      }

      // 1. Delete the invoice document
      await deleteDoc(invoiceRef);

      // 2. Clean up associated physical boxes in the boxes collection
      if (invNum) {
        const boxSnap = await getDocs(collection(db, "boxes"));
        const batch = writeBatch(db);
        let boxCount = 0;
        boxSnap.forEach((d) => {
          const bData = d.data();
          if (bData.invoiceNumber && String(bData.invoiceNumber).trim().toUpperCase() === invNum.toUpperCase()) {
            batch.delete(d.ref);
            boxCount++;
          }
        });
        if (boxCount > 0) {
          await batch.commit();
        }
      }
    } catch (err) {
      console.error("Failed to delete invoice:", err);
      throw err;
    }
  };

  // Action: Modify an existing invoice with automatic Stock 1 reconciliation for approved invoices (Protected)
  const handleUpdateInvoice = async (updatedInvoice: ReceivingInvoice, previousInvoice?: ReceivingInvoice) => {
    if (!currentUser) throw new Error("No authenticated user session.");
    await executeProtectedUpdateInvoice(updatedInvoice, previousInvoice, currentUser.fullName);
  };

  // Action: Clear all invoices from the register (Disabled for data integrity & ledger safety)
  const handleClearAllInvoices = async () => {
    console.warn("Bulk invoice deletion is disabled to guarantee database integrity and traceability.");
  };

  // Action: Operator submits a physical count adjustment (Protected)
  const handleSubmitAdjustment = async (adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">) => {
    await executeProtectedAdjustment(adjustmentData, currentUser?.fullName || adjustmentData.operatorName || "Operator");
  };

  // Action: Supervisor approves count adjustment
  // Crucial logic: Marks as approved and UPDATES the physical expectedQty of the carton!
  const handleApproveAdjustment = async (adjustmentId: string) => {
    if (!currentUser) return;
    const adj = adjustments.find(a => a.id === adjustmentId);
    if (!adj) return;

    // 1. Update adjustment state in Firestore
    const adjRef = doc(db, "adjustments", adjustmentId);
    await updateDoc(adjRef, {
      status: "approved",
      validatedBy: currentUser.fullName,
      validatedAt: new Date().toISOString()
    });

    // 2. Adjust expected quantity in physical carton / box
    const boxRef = doc(db, "boxes", adj.barcode);
    await updateDoc(boxRef, {
      expectedQty: adj.actualQty,
      updatedAt: new Date().toISOString()
    });
  };

  // Action: Supervisor rejects count adjustment
  const handleRejectAdjustment = async (adjustmentId: string) => {
    if (!currentUser) return;
    const adjRef = doc(db, "adjustments", adjustmentId);
    await updateDoc(adjRef, {
      status: "rejected",
      validatedBy: currentUser.fullName,
      validatedAt: new Date().toISOString()
    });
  };

  // Supervisor/Manager/Operator Action: Edit operation quantity & record audit history (Protected)
  const handleEditOperation = async (opId: string, category: string, newQty: number, reason: string) => {
    if (!currentUser) return;
    if (currentUser.role === "operator") {
      const txId = opId.startsWith("tx-") ? opId.replace("tx-", "") : opId.startsWith("batch-trf-") ? opId.replace("batch-trf-", "") : opId;
      const targetTx = transactions.find(t => t.id === txId || t.id === opId);
      if (targetTx) {
        const cleanTxOp = (targetTx.operatorName || "").replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        const cleanUser = currentUser.fullName.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        if (cleanTxOp && cleanUser && cleanTxOp !== cleanUser) {
          throw new Error("Unauthorized: Operators can only modify their own operations.");
        }
      }
    }
    await executeProtectedEditOperation(opId, category, newQty, reason, currentUser.fullName);
  };

  // Supervisor/Manager/Operator Action: Delete / Reverse operation and safely adjust stock (Protected)
  const handleDeleteOrReverseOperation = async (opId: string, category: string, reason: string) => {
    if (!currentUser) return;
    if (currentUser.role !== "supervisor" && currentUser.role !== "admin" && currentUser.role !== "operator") {
      throw new Error("Unauthorized: Insufficient permissions to delete or reverse operations.");
    }
    if (!reason || reason.trim() === "") {
      throw new Error("A reason for deletion or reversal is required.");
    }
    if (currentUser.role === "operator") {
      const txId = opId.startsWith("tx-") ? opId.replace("tx-", "") : opId.startsWith("batch-trf-") ? opId.replace("batch-trf-", "") : opId;
      const targetTx = transactions.find(t => t.id === txId || t.id === opId);
      if (targetTx) {
        const cleanTxOp = (targetTx.operatorName || "").replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        const cleanUser = currentUser.fullName.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        if (cleanTxOp && cleanUser && cleanTxOp !== cleanUser) {
          throw new Error("Unauthorized: Operators can only reverse their own operations.");
        }
      }
    }
    await executeProtectedDeleteOrReverseOperation(opId, category, reason, currentUser.fullName);
  };

  // Action: Admin registers a box
  const handleAddBox = async (boxData: Omit<Box, "createdAt" | "updatedAt">) => {
    const newBox: Box = {
      ...boxData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, "boxes", boxData.id), newBox);
  };

  // Action: Admin or Supervisor deletes a box (Protected)
  const handleDeleteBox = async (boxId: string) => {
    await executeProtectedDeleteBox(boxId, currentUser?.fullName || "System");
  };

  // Action: Admin or Supervisor updates a box (Protected)
  const handleUpdateBox = async (boxId: string, updatedFields: Partial<Box>) => {
    await executeProtectedUpdateBox(boxId, updatedFields, currentUser?.fullName || "System");
  };

  // Action: Create a new Reference (Supervisor & Admin / Manager)
  const handleCreateReference = async (refData: {
    code: string;
    description: string;
    customer: string;
    materialType: "Mesh" | "Soft" | string;
    associatedLeather?: string;
    active?: boolean;
  }) => {
    const rawCode = refData.code.trim();
    if (!rawCode) {
      throw new Error("Reference code cannot be empty.");
    }

    const uppercaseCode = rawCode.toUpperCase();
    const docId = uppercaseCode.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Case-insensitive duplicate check across existing references
    const existingRef = references.find(
      (r) => r.code.toUpperCase() === uppercaseCode || r.id.toUpperCase() === docId.toUpperCase()
    );
    if (existingRef) {
      throw new Error(`Reference code "${uppercaseCode}" already exists in the database.`);
    }

    const timestamp = new Date().toISOString();
    const newRef: Reference = {
      id: docId,
      code: uppercaseCode,
      description: refData.description.trim(),
      customer: refData.customer.trim(),
      materialType: refData.materialType.trim(),
      associatedLeather: refData.associatedLeather ? refData.associatedLeather.trim() : "",
      active: refData.active !== undefined ? refData.active : true,
      createdAt: timestamp,
      createdBy: currentUser?.fullName || "System",
      updatedAt: timestamp,
      updatedBy: currentUser?.fullName || "System",
      stock1: 0,
      stock2: 0,
      stock3: 0,
      currentStock: 0,
      lastUpdate: timestamp
    };

    await setDoc(doc(db, "references", docId), newRef);

    // Audit log transaction
    const transId = `trans-addref-${Date.now()}`;
    await setDoc(doc(db, "transactions", transId), {
      id: transId,
      reference: uppercaseCode,
      movementType: "REFERENCE_CREATED",
      stock: "Reference Master",
      quantity: 0,
      operatorName: currentUser?.fullName || "System",
      timestamp,
      notes: `Created reference ${uppercaseCode} (Customer: ${newRef.customer}, Type: ${newRef.materialType}, Desc: ${newRef.description})`
    });
  };

  // Action: Admin / Supervisor updates a reference directly (metadata, stock, or status)
  const handleUpdateReference = async (refId: string, updatedFields: Partial<Reference>) => {
    const refRef = doc(db, "references", refId);
    const refSnap = await getDoc(refRef);
    if (refSnap.exists()) {
      const currentData = refSnap.data() as Reference;
      const timestamp = new Date().toISOString();

      const s1 = updatedFields.stock1 !== undefined ? updatedFields.stock1 : (currentData.stock1 || 0);
      const s2 = updatedFields.stock2 !== undefined ? updatedFields.stock2 : (currentData.stock2 || 0);
      const s3 = updatedFields.stock3 !== undefined ? updatedFields.stock3 : (currentData.stock3 || 0);
      const newTotal = Math.max(0, s1 + s2 + s3);

      const isStockChange =
        updatedFields.stock1 !== undefined ||
        updatedFields.stock2 !== undefined ||
        updatedFields.stock3 !== undefined;

      const isStatusChange = updatedFields.active !== undefined && updatedFields.active !== currentData.active;

      let movementType = "REFERENCE_UPDATED";
      let notes = `Updated reference ${currentData.code} metadata`;

      if (isStatusChange) {
        movementType = updatedFields.active ? "REFERENCE_ACTIVATED" : "REFERENCE_DEACTIVATED";
        notes = `Changed active status of ${currentData.code} to ${updatedFields.active ? "ACTIVE" : "INACTIVE"}`;
      } else if (isStockChange) {
        movementType = "STOCK ADJUSTMENT";
        notes = `Direct reference stock update for ${currentData.code}: S1=${s1}, S2=${s2}, S3=${s3}`;
      }

      const updatePayload: Record<string, any> = {
        ...updatedFields,
        stock1: Math.max(0, s1),
        stock2: Math.max(0, s2),
        stock3: Math.max(0, s3),
        currentStock: newTotal,
        lastUpdate: timestamp,
        updatedAt: timestamp,
        updatedBy: currentUser?.fullName || "System"
      };

      await updateDoc(refRef, updatePayload);

      const transId = `trans-updref-${Date.now()}`;
      await setDoc(doc(db, "transactions", transId), {
        id: transId,
        reference: currentData.code || refId,
        movementType,
        stock: "Reference Master",
        quantity: isStockChange ? Math.abs(newTotal - (currentData.currentStock || 0)) : 0,
        operatorName: currentUser?.fullName || "System",
        timestamp,
        notes
      });
    }
  };

  // Action: Admin or Supervisor permanently deletes an UNUSED reference (with safety verification)
  const handleDeleteReference = async (refId: string, refCode: string) => {
    const codeUpper = refCode.toUpperCase();
    await deleteDoc(doc(db, "references", refId));

    // Audit log entry
    const timestamp = new Date().toISOString();
    const transId = `trans-delref-${Date.now()}`;
    await setDoc(doc(db, "transactions", transId), {
      id: transId,
      reference: codeUpper,
      movementType: "REFERENCE_DELETED",
      stock: "Reference Master",
      quantity: 0,
      operatorName: currentUser?.fullName || "System",
      timestamp,
      notes: `Permanently deleted unused reference catalog item ${codeUpper}`
    });
  };

  // Action: Admin adds a user profile
  const handleAddUser = async (userData: User) => {
    await setDoc(doc(db, "users", userData.id), userData);
  };

  // Action: Admin updates a user profile (Name, PIN / Password, Role, Username)
  const handleUpdateUser = async (userId: string, updatedFields: Partial<User>) => {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, updatedFields);
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, ...updatedFields } : null);
    }
  };

  // Action: Admin deletes a user profile
  const handleDeleteUser = async (userId: string) => {
    await deleteDoc(doc(db, "users", userId));
  };

  // Action: Clean/Reset Database
  const handleCleanDatabase = async () => {
    await resetDatabaseToPristineState();
  };

  // Action: Audit & Repair Database Integrity for Enterprise Readiness
  const handleAuditDatabase = async (): Promise<{ repairedRefs: number; repairedUsers: number }> => {
    let repairedRefs = 0;
    let repairedUsers = 0;

    const refsSnap = await getDocs(collection(db, "references"));
    const usersSnap = await getDocs(collection(db, "users"));

    const batch = writeBatch(db);

    // 1. Audit & Fix References (Authoritative stock1, stock2, stock3 preserved)
    refsSnap.forEach((d) => {
      const data = d.data();
      const s1 = typeof data.stock1 === "number" ? data.stock1 : 0;
      const s2 = typeof data.stock2 === "number" ? data.stock2 : 0;
      const s3 = typeof data.stock3 === "number" ? data.stock3 : 0;

      const expectedTotal = Math.max(0, s1 + s2 + s3);

      let needsFix = false;
      const patch: any = {};

      if (typeof data.stock1 !== "number") { patch.stock1 = s1; needsFix = true; }
      if (typeof data.stock2 !== "number") { patch.stock2 = s2; needsFix = true; }
      if (typeof data.stock3 !== "number") { patch.stock3 = s3; needsFix = true; }
      if (data.currentStock !== expectedTotal) { patch.currentStock = expectedTotal; needsFix = true; }
      if (!data.code) { patch.code = d.id; needsFix = true; }
      if (!data.description) { patch.description = `Malla Reference ${d.id}`; needsFix = true; }
      if (!data.materialType) { patch.materialType = "Mesh"; needsFix = true; }
      if (!data.lastUpdate) { patch.lastUpdate = new Date().toISOString(); needsFix = true; }

      if (needsFix) {
        batch.set(doc(db, "references", d.id), patch, { merge: true });
        repairedRefs++;
      }
    });

    // 2. Audit & Fix Users
    usersSnap.forEach((u) => {
      if (u.id === "user_soukaina" || u.data()?.username === "soukaina") {
        batch.delete(doc(db, "users", u.id));
        repairedUsers++;
        return;
      }
      const data = u.data();
      let needsFix = false;
      const patch: any = {};

      const cleanUsername = data.username ? String(data.username).trim().toLowerCase() : "";
      if (cleanUsername && data.username !== cleanUsername) { patch.username = cleanUsername; needsFix = true; }
      if (!data.role || !["operator", "supervisor", "admin"].includes(data.role)) { patch.role = "operator"; needsFix = true; }
      if (!data.pin) { patch.pin = "1234"; needsFix = true; }
      if (!data.fullName) { patch.fullName = data.username || "User Profile"; needsFix = true; }

      if (needsFix) {
        batch.set(doc(db, "users", u.id), patch, { merge: true });
        repairedUsers++;
      }
    });

    if (repairedRefs > 0 || repairedUsers > 0) {
      await batch.commit();
    }

    return { repairedRefs, repairedUsers };
  };

  // Change active profile/Logout
  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab("dashboard");
    setActiveModule(null);
    sessionStorage.removeItem("epp_current_user");
    sessionStorage.removeItem("epp_active_tab");
    sessionStorage.removeItem("epp_active_module");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070e18] flex flex-col items-center justify-center p-4">
        <img 
          src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
          alt="Loading EPP Natur" 
          className="h-12 sm:h-14 object-contain animate-pulse filter brightness-110"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // If no user is logged in, show the RoleGate PIN Authenticator!
  if (!currentUser) {
    return (
      <RoleGate 
        onLogin={(user) => {
          setCurrentUser(user);
          // Show the clean module selection screen [ MESHES ] / [ BEZEL ] for all users
          setActiveModule(null);
          sessionStorage.removeItem("epp_active_module");
          if (user.role === "operator") {
            setActiveTab("operator");
          } else {
            setActiveTab("dashboard");
          }
        }} 
      />
    );
  }

  // Module selection screen for ALL roles (Operator, Supervisor, Manager) when no module is active
  if (activeModule === null) {
    return (
      <ModuleSelection
        currentUser={currentUser}
        onSelectModule={(mod) => {
          setActiveModule(mod);
          if (mod === "meshes" && currentUser.role === "operator") {
            setActiveTab("operator");
          }
        }}
        onLogout={handleLogout}
      />
    );
  }

  // BEZEL module entry point
  if (activeModule === "bezel") {
    return (
      <BezelWorkspace
        currentUser={currentUser}
        onBackToModules={() => {
          setActiveModule(null);
          sessionStorage.removeItem("epp_active_module");
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col md:flex-row text-slate-800 font-sans" id="app-root-layout">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-[#0a1322] text-slate-300 flex flex-col justify-between p-5 md:p-6 shrink-0 border-b md:border-b-0 md:border-r border-[#1e293b]">
        <div className="space-y-6 md:space-y-8">
          
          {/* EPP Natur Branding */}
          <div className="select-none flex flex-col items-start gap-1 mb-2" id="sidebar-epp-natur-logo">
            <img 
              src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
              alt="EPP NATUR Logo" 
              className="h-8 object-contain filter brightness-110 mb-1"
              referrerPolicy="no-referrer"
            />
            <div className="text-[8px] text-slate-500 uppercase tracking-[0.2em] font-mono font-bold ml-1">
              STEERING WHEEL STOCK
            </div>
          </div>

          {/* Module Switcher for All Portals (Operator, Supervisor, Manager) */}
          <button
            onClick={() => {
              setActiveModule(null);
              sessionStorage.removeItem("epp_active_module");
            }}
            id="sidebar-back-to-modules-btn"
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#0e1d33] hover:bg-[#142845] text-slate-300 hover:text-white text-xs font-semibold tracking-wide border border-blue-900/40 hover:border-blue-500/50 transition-all cursor-pointer shadow-xs active:scale-98"
            title="Return to module selection (MESHES / BEZEL)"
          >
            <div className="flex items-center gap-2">
              <ArrowLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Modules</span>
            </div>
            <span className="text-[10px] text-blue-400 font-mono uppercase bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40">
              MESHES
            </span>
          </button>

          {/* Navigation Items */}
          <nav className="flex md:flex-col flex-row flex-wrap md:space-y-1 gap-1" id="primary-navigation-tabs">
            
            {/* Dashboard Tab */}
            {currentUser.role !== "operator" && (
              <button
                onClick={() => setActiveTab("dashboard")}
                id="nav-tab-dashboard"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "dashboard"
                    ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>Analytics</span>
                </div>
              </button>
            )}

            {/* Stock Tab */}
            <button
              onClick={() => setActiveTab("stock")}
              id="nav-tab-stock"
              className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                activeTab === "stock"
                  ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                  : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 shrink-0" />
                <span>Stock</span>
              </div>
            </button>

            {/* Invoices Tab */}
            <button
              onClick={() => setActiveTab("invoices")}
              id="nav-tab-invoices"
              className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                activeTab === "invoices"
                  ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                  : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 shrink-0" />
                <span>Invoices</span>
              </div>
            </button>



            {/* Deliveries Tab */}
            <button
              onClick={() => setActiveTab("deliveries")}
              id="nav-tab-deliveries"
              className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                activeTab === "deliveries"
                  ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                  : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Truck className="w-4 h-4 shrink-0" />
                <span>Deliveries</span>
              </div>
            </button>

            {/* Production Tab */}
            <button
              onClick={() => setActiveTab("production")}
              id="nav-tab-production"
              className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                activeTab === "production"
                  ? "text-blue-400 font-bold bg-[#0f1e36] border-blue-400"
                  : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Factory className="w-4 h-4 shrink-0" />
                <span>Production</span>
              </div>
            </button>

            {/* SCRAP Tab */}
            <button
              onClick={() => setActiveTab("scrap")}
              id="nav-tab-scrap"
              className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                activeTab === "scrap"
                  ? "text-rose-400 font-bold bg-[#0f1e36] border-rose-500"
                  : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>SCRAP (NOK)</span>
              </div>
            </button>

            {/* Manage References Tab (Supervisor & Admin ONLY) */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && (
              <button
                onClick={() => setActiveTab("manage-references")}
                id="nav-tab-manage-references"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "manage-references"
                    ? "text-purple-400 font-bold bg-[#0f1e36] border-purple-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <FolderTree className="w-4 h-4 shrink-0" />
                  <span>MANAGE REFERENCES</span>
                </div>
              </button>
            )}

            {/* Operator Tab */}
            {currentUser.role !== "admin" && (
              <button
                onClick={() => setActiveTab("operator")}
                id="nav-tab-operator"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "operator"
                    ? "text-emerald-400 font-bold bg-[#0f1e36] border-emerald-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Scan className="w-4 h-4 shrink-0" />
                  <span>Operator count</span>
                </div>
              </button>
            )}

            {/* PEGADAS Tab (Operator / Supervisor / Admin) */}
            {currentUser.role !== "admin" && (
              <button
                onClick={() => setActiveTab("pegadas")}
                id="nav-tab-pegadas"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "pegadas"
                    ? "text-teal-400 font-bold bg-[#0f1e36] border-teal-400"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-4 h-4 shrink-0 text-teal-400" />
                  <span>PEGADAS</span>
                </div>
              </button>
            )}

            {/* Records Tab (Hidden from Manager portal) */}
            {currentUser.role !== "admin" && (
              <button
                onClick={() => setActiveTab("records")}
                id="nav-tab-records"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "records"
                    ? "text-amber-400 font-bold bg-[#0f1e36] border-amber-400"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <History className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>RECORDS</span>
                </div>
              </button>
            )}

            {/* Supervisor Tab */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && (
              <button
                onClick={() => setActiveTab("supervisor")}
                id="nav-tab-supervisor"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "supervisor"
                    ? "text-amber-400 font-bold bg-[#0f1e36] border-amber-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="w-4 h-4 shrink-0" />
                  <span>Supervisor sign-offs</span>
                </div>
              </button>
            )}

            {/* Admin Tab */}
            {currentUser.role === "admin" && (
              <button
                onClick={() => setActiveTab("admin")}
                id="nav-tab-admin"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "admin"
                    ? "text-blue-400 font-bold bg-[#0f1e36] border-blue-400"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Admin settings</span>
                </div>
              </button>
            )}

          </nav>
        </div>

        {/* User Session Footer at bottom of sidebar */}
        <div className="border-t border-slate-800 pt-4 mt-4 md:mt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-slate-700 text-white font-bold text-sm rounded-full flex items-center justify-center uppercase shrink-0">
                {currentUser.fullName.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate" title={currentUser.fullName}>
                  {currentUser.fullName}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                  {currentUser.role === 'admin' ? 'Manager' : currentUser.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              id="topbar-signout-btn"
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
              title="Exit Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => {
                setActiveModule(null);
                sessionStorage.removeItem("epp_active_module");
              }}
              id="header-back-to-modules-btn"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-semibold tracking-wide transition-all cursor-pointer active:scale-95 shrink-0"
              title="Return to module selection (MESHES / BEZEL)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Modules</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-800 font-display">
              {activeTab === "dashboard" && "Operational Dashboard"}
              {activeTab === "stock" && "Real-time Stock Inventory"}
              {activeTab === "invoices" && "Stock 1 Incoming Invoices & Verification"}
              {activeTab === "deliveries" && "Customer Deliveries & Dispatches"}
              {activeTab === "production" && "Daily Production Consumption"}
              {activeTab === "scrap" && "SCRAP & NOK Mesh Management"}
              {activeTab === "manage-references" && "Manage References Catalog"}
              {activeTab === "operator" && "Inventory Count Workspace"}
              {activeTab === "pegadas" && "MALLAS PEGADAS — Stock 1 → Stock 2 Operations"}
              {activeTab === "records" && "Operator Movement Records & History"}
              {activeTab === "supervisor" && "Supervisor Validation & Sign-offs"}
              {activeTab === "admin" && "Administrative Control Center"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Low Stock Real-Time Alert Indicator for All Portals (Operator, Supervisor & Manager) */}
            {lowStockReferences.length > 0 && (
              <button
                onClick={() => setIsGlobalLowStockModalOpen(true)}
                id="header-low-stock-alert-btn"
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold font-mono transition-all shadow-2xs cursor-pointer active:scale-95 animate-pulse"
                title="Click to view all references with stock below 100 PCS"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>LOW STOCK: {lowStockReferences.length} REF{lowStockReferences.length > 1 ? "S" : ""}</span>
              </button>
            )}

            {activeTab !== "operator" && currentUser.role !== "admin" && (
              <button
                onClick={() => setActiveTab("operator")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xs shadow-md shadow-blue-200 transition-all cursor-pointer active:scale-95"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>NEW COUNT</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {activeTab === "dashboard" && (
                <DashboardOverview 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  references={references}
                  transactions={transactions}
                  scraps={scraps}
                  currentUser={currentUser}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onTriggerScan={currentUser.role !== "admin" ? () => setActiveTab("operator") : undefined}
                />
              )}

              {activeTab === "stock" && (
                <StockWorkspace 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  references={references}
                  transactions={transactions}
                  currentUser={currentUser}
                  onDeleteBox={handleDeleteBox}
                  onUpdateBox={handleUpdateBox}
                  onCreateReference={handleCreateReference}
                  onUpdateReference={handleUpdateReference}
                />
              )}

              {activeTab === "invoices" && (
                <InvoicesWorkspace
                  invoices={invoices}
                  transactions={transactions}
                  references={references}
                  currentUser={currentUser}
                  onDeleteInvoice={handleDeleteInvoice}
                  onClearAllInvoices={handleClearAllInvoices}
                  onUpdateInvoice={handleUpdateInvoice}
                />
              )}



              {activeTab === "deliveries" && (
                <DeliveriesWorkspace
                  deliveries={deliveries}
                  references={references}
                  currentUser={currentUser}
                  onSubmitDeliveries={handleSubmitDeliveries}
                  onUpdateDelivery={handleUpdateDelivery}
                  onDeleteDelivery={handleDeleteDelivery}
                />
              )}

              {activeTab === "production" && (
                <ProductionWorkspace
                  productions={productions}
                  references={references}
                  currentUser={currentUser}
                  onSubmitProduction={handleSubmitProduction}
                  onDeleteProduction={handleDeleteProduction}
                  onUpdateProduction={handleUpdateProduction}
                />
              )}

              {activeTab === "scrap" && (
                <ScrapWorkspace
                  scraps={scraps}
                  references={references}
                  currentUser={currentUser}
                  onSubmitScrap={handleSubmitScrap}
                  onDeleteScrap={handleDeleteScrap}
                  onUpdateScrap={handleUpdateScrap}
                />
              )}

              {activeTab === "manage-references" && (currentUser.role === "supervisor" || currentUser.role === "admin") && (
                <ManageReferencesWorkspace
                  references={references}
                  boxes={boxes}
                  transactions={transactions}
                  deliveries={deliveries}
                  productions={productions}
                  scraps={scraps}
                  adjustments={adjustments}
                  currentUser={currentUser}
                  onCreateReference={handleCreateReference}
                  onUpdateReference={handleUpdateReference}
                  onDeleteReference={handleDeleteReference}
                />
              )}

              {activeTab === "operator" && (
                <OperatorWorkspace 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  references={references}
                  invoices={invoices}
                  currentUser={currentUser} 
                  onSubmitAdjustment={handleSubmitAdjustment}
                  onSavePendingInvoice={handleSavePendingInvoice}
                  onApproveInvoice={handleApproveInvoice}
                  onCancelInvoice={handleCancelInvoice}
                  onOpenLowStockModal={() => setIsGlobalLowStockModalOpen(true)}
                  onNavigateToTab={(tab) => setActiveTab(tab as any)}
                />
              )}

              {activeTab === "pegadas" && (
                <PegadasWorkspace
                  transactions={transactions}
                  references={references}
                  currentUser={currentUser}
                  onEditOperation={handleEditOperation}
                  onDeleteOperation={handleDeleteOrReverseOperation}
                  onNavigateToTab={(tab) => setActiveTab(tab as any)}
                />
              )}

              {activeTab === "records" && currentUser.role !== "admin" && (
                <RecordsWorkspace
                  transactions={transactions}
                  invoices={invoices}
                  references={references}
                  currentUser={currentUser}
                  onNavigateToTab={(tab) => setActiveTab(tab as any)}
                  onEditOperation={handleEditOperation}
                  onDeleteOperation={handleDeleteOrReverseOperation}
                />
              )}

              {activeTab === "supervisor" && (
                <SupervisorWorkspace 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  deliveries={deliveries}
                  productions={productions}
                  transactions={transactions}
                  scraps={scraps}
                  references={references}
                  invoices={invoices}
                  currentUser={currentUser} 
                  onApproveAdjustment={handleApproveAdjustment}
                  onRejectAdjustment={handleRejectAdjustment}
                  onEditOperation={handleEditOperation}
                  onDeleteOperation={handleDeleteOrReverseOperation}
                  onReverseOperation={handleDeleteOrReverseOperation}
                />
              )}

              {activeTab === "admin" && (
                <AdminWorkspace 
                  users={users} 
                  onAddUser={handleAddUser}
                  onUpdateUser={handleUpdateUser}
                  onDeleteUser={handleDeleteUser}
                  onCleanDatabase={handleCleanDatabase}
                  onAuditDatabase={handleAuditDatabase}
                  onClearInvoices={handleClearAllInvoices}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

      {/* Global Low Stock Alert Modal for Header Button */}
      <LowStockAlertModal
        isOpen={isGlobalLowStockModalOpen}
        onClose={() => setIsGlobalLowStockModalOpen(false)}
        references={references}
      />

    </div>
  );
}
