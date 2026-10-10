import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import {
  BezelReference,
  BezelOperation,
  BezelInvoice,
  User
} from "../types";
import { normalizeDocTimestamps } from "../utils/timeUtils";
import {
  seedBezelReferencesIfEmpty,
  INITIAL_BEZEL_SEEDS
} from "../services/bezelService";
import { 
  ArrowLeft, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  ClipboardCheck,
  Layers, 
  History, 
  RefreshCw 
} from "lucide-react";
import BezelMetrics from "./bezel/BezelMetrics";
import BezelActionButtons, { BezelActiveModal } from "./bezel/BezelActionButtons";
import BezelStockTable from "./bezel/BezelStockTable";
import BezelHistoryTable from "./bezel/BezelHistoryTable";
import BezelOperationsModals from "./bezel/BezelOperationsModals";
import BezelSidebar from "./bezel/BezelSidebar";
import BezelInventoryWorkspace from "./bezel/BezelInventoryWorkspace";
import BezelInvoicesWorkspace from "./bezel/BezelInvoicesWorkspace";
import BezelDeliveriesWorkspace from "./bezel/BezelDeliveriesWorkspace";

interface BezelWorkspaceProps {
  currentUser: User;
  onBackToModules: () => void;
  onLogout: () => void;
}

export default function BezelWorkspace({
  currentUser,
  onBackToModules,
  onLogout
}: BezelWorkspaceProps) {
  const [references, setReferences] = useState<BezelReference[]>([]);
  const [operations, setOperations] = useState<BezelOperation[]>([]);
  const [invoices, setInvoices] = useState<BezelInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("invoices");
  const [activeTab, setActiveTab] = useState<"stock" | "history">("stock");
  const [activeModal, setActiveModal] = useState<BezelActiveModal>(null);
  const [selectedReferenceCode, setSelectedReferenceCode] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Show Toast with auto-dismiss
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Real-time Firestore Subscriptions for Bezel
  useEffect(() => {
    let isMounted = true;

    // Auto-seed if collection is completely empty
    seedBezelReferencesIfEmpty().then((seeded) => {
      if (seeded && isMounted) {
        showToast("Initial Bezel references loaded into catalog.", "success");
      }
    });

    // 1. Subscribe to bezel_references
    const unsubReferences = onSnapshot(
      collection(db, "bezel_references"),
      (snapshot) => {
        const refList: BezelReference[] = [];
        snapshot.forEach((docSnap) => {
          refList.push({
            id: docSnap.id,
            ...normalizeDocTimestamps(docSnap.data())
          } as BezelReference);
        });
        refList.sort((a, b) => a.code.localeCompare(b.code));
        setReferences(refList);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error subscribing to bezel_references:", error);
        setIsLoading(false);
      }
    );

    // 2. Subscribe to bezel_operations
    const unsubOperations = onSnapshot(
      collection(db, "bezel_operations"),
      (snapshot) => {
        const opList: BezelOperation[] = [];
        snapshot.forEach((docSnap) => {
          opList.push({
            id: docSnap.id,
            ...normalizeDocTimestamps(docSnap.data())
          } as BezelOperation);
        });
        // Sort descending by timestamp / date
        opList.sort((a, b) => {
          const timeA = new Date(a.timestamp || 0).getTime();
          const timeB = new Date(b.timestamp || 0).getTime();
          return timeB - timeA;
        });
        setOperations(opList);
      },
      (error) => {
        console.error("Error subscribing to bezel_operations:", error);
      }
    );

    // 3. Subscribe to bezel_invoices
    const unsubInvoices = onSnapshot(
      collection(db, "bezel_invoices"),
      (snapshot) => {
        const invList: BezelInvoice[] = [];
        snapshot.forEach((docSnap) => {
          invList.push({
            id: docSnap.id,
            ...normalizeDocTimestamps(docSnap.data())
          } as BezelInvoice);
        });
        invList.sort((a, b) => {
          const timeA = new Date(a.timestamp || a.date).getTime();
          const timeB = new Date(b.timestamp || b.date).getTime();
          return timeB - timeA;
        });
        setInvoices(invList);
      },
      (error) => {
        console.error("Error subscribing to bezel_invoices:", error);
      }
    );

    return () => {
      isMounted = false;
      unsubReferences();
      unsubOperations();
      unsubInvoices();
    };
  }, []);

  // Compute live aggregates
  const totalStock1 = references.reduce((sum, r) => sum + (r.stock1 || 0), 0);
  const totalStock2 = references.reduce((sum, r) => sum + (r.stock2 || 0), 0);
  const totalStock = totalStock1 + totalStock2;

  const handleOpenModal = (modal: BezelActiveModal, referenceCode?: string) => {
    setSelectedReferenceCode(referenceCode);
    setActiveModal(modal);
  };

  const handleManualSeed = async () => {
    setIsSeeding(true);
    try {
      await seedBezelReferencesIfEmpty();
      showToast("Bezel reference catalog initialized.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to initialize references.", "error");
    } finally {
      setIsSeeding(false);
    }
  };

  const lowStockRefs = references.filter(r => (r.stock1 || 0) < 20);

  const getHeaderTitle = () => {
    switch (activeSection) {
      case "deliveries":
        return "Bezel Deliveries & Dispatches (SW → S2)";
      case "invoices":
        return "Stock 1 Incoming Invoices & Verification";
      case "operations":
        return "Operations & Live Stock Management";
      case "inventory":
        return "Stock Inventory — Physical Count & Reconciliation";
      default:
        return "Bezel Management Workspace";
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f1f5f9] flex flex-col md:flex-row text-slate-800 font-sans"
      id="bezel-workspace-root"
    >
      {/* Full-Height Vertical Sidebar Matching Meshes Design */}
      <BezelSidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        userRole={currentUser.role}
        currentUser={currentUser}
        onBackToModules={onBackToModules}
        onLogout={onLogout}
        referencesCount={references.length}
        operationsCount={operations.length}
        invoicesCount={invoices.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header Bar Matching Meshes Design */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={onBackToModules}
              id="bezel-header-back-to-modules-btn"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-semibold tracking-wide transition-all cursor-pointer active:scale-95 shrink-0"
              title="Return to module selection (MESHES / BEZEL)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Modules</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-800 font-display">
              {getHeaderTitle()}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Low Stock Real-Time Alert Pill */}
            {lowStockRefs.length > 0 && (
              <div 
                id="bezel-header-low-stock-alert"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold font-mono tracking-wide shadow-2xs"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>LOW STOCK: {lowStockRefs.length} REFS</span>
              </div>
            )}

            {/* Stock Inventory Quick Access for Managers */}
            {(currentUser.role === "admin" || currentUser.role === "supervisor") && activeSection !== "inventory" && (
              <button
                onClick={() => setActiveSection("inventory")}
                id="bezel-header-stock-inventory-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs shadow-md shadow-indigo-200 transition-all cursor-pointer active:scale-95"
                title="Physical stock reconciliation (System Stock → Physical Count → Difference → Confirm)"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>STOCK INVENTORY</span>
              </button>
            )}

            {/* Live Firestore pill indicator */}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE FIRESTORE</span>
            </span>
          </div>
        </header>

        {/* Section Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {/* Toast Notification */}
          {toast && (
            <div
              id="bezel-notification-toast"
              className={`mb-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs animate-in slide-in-from-top-2 duration-150 ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : "bg-rose-50 text-rose-900 border-rose-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{toast.message}</span>
              </div>
              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>
          )}

          {/* Section 1: DELIVERIES (SW -> S2) */}
          {activeSection === "deliveries" ? (
            <BezelDeliveriesWorkspace
              invoices={invoices}
              operations={operations}
              references={references}
              currentUser={currentUser}
              onSuccess={(msg) => showToast(msg, "success")}
              onError={(err) => showToast(err, "error")}
            />
          ) : activeSection === "invoices" ? (
            <BezelInvoicesWorkspace
              invoices={invoices}
              references={references}
              currentUser={currentUser}
              onOpenNewTruckModal={() => handleOpenModal("new_truck")}
              onSuccess={(msg) => showToast(msg, "success")}
              onError={(err) => showToast(err, "error")}
            />
          ) : activeSection === "inventory" ? (
            <BezelInventoryWorkspace
              references={references}
              currentUser={currentUser}
              onSuccess={(msg) => showToast(msg, "success")}
              onError={(err) => showToast(err, "error")}
            />
          ) : (
            /* Section 3: OPERATIONS & OVERVIEW */
            <div className="space-y-6">
              {/* 1. Live Aggregate Inventory Metrics */}
              <BezelMetrics
                references={references}
                totalStock1={totalStock1}
                totalStock2={totalStock2}
                totalStock={totalStock}
              />

              {/* 2. The 5 Main Operation Action Buttons */}
              <BezelActionButtons
                onOpenModal={handleOpenModal}
                userRole={currentUser.role}
                isSeeding={isSeeding}
                onSeed={handleManualSeed}
                hasReferences={references.length > 0}
              />

              {/* 3. Sub-Navigation Tabs */}
              <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setActiveTab("stock")}
                  id="bezel-tab-stock"
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "stock"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Live Stock Overview ({references.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab("history")}
                  id="bezel-tab-history"
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "history"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Operations Log ({operations.length})</span>
                </button>
              </div>

              {/* 4. Tab Content */}
              {activeTab === "stock" ? (
                <BezelStockTable
                  references={references}
                  onOpenModal={handleOpenModal}
                />
              ) : (
                <BezelHistoryTable
                  operations={operations}
                  userRole={currentUser.role}
                  operatorName={currentUser.fullName}
                  onSuccess={(msg) => showToast(msg, "success")}
                  onError={(err) => showToast(err, "error")}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* 5. Operation Modals */}
      <BezelOperationsModals
        activeModal={activeModal}
        onClose={() => {
          setActiveModal(null);
          setSelectedReferenceCode(undefined);
        }}
        references={references}
        currentUser={currentUser}
        onSuccess={(msg) => showToast(msg, "success")}
        onError={(err) => showToast(err, "error")}
        selectedReferenceCode={selectedReferenceCode}
      />
    </div>
  );
}
