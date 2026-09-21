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
  User
} from "../types";
import { normalizeDocTimestamps } from "../utils/timeUtils";
import {
  seedBezelReferencesIfEmpty,
  INITIAL_BEZEL_SEEDS
} from "../services/bezelService";
import { ArrowLeft, LogOut, CheckCircle2, AlertCircle, Layers, History, RefreshCw } from "lucide-react";
import BezelMetrics from "./bezel/BezelMetrics";
import BezelActionButtons, { BezelActiveModal } from "./bezel/BezelActionButtons";
import BezelStockTable from "./bezel/BezelStockTable";
import BezelHistoryTable from "./bezel/BezelHistoryTable";
import BezelOperationsModals from "./bezel/BezelOperationsModals";

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
  const [isLoading, setIsLoading] = useState(true);
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

    return () => {
      isMounted = false;
      unsubReferences();
      unsubOperations();
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

  return (
    <div
      className="min-h-screen bg-[#f8fafc] flex flex-col text-slate-800 font-sans"
      id="bezel-workspace-root"
    >
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          {/* Back to Modules Navigation */}
          <button
            onClick={onBackToModules}
            id="bezel-back-to-modules-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 text-xs font-semibold tracking-wide transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Return to module selection"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Modules</span>
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <h1
              id="bezel-header-title"
              className="text-base sm:text-lg font-bold text-slate-900 tracking-tight"
            >
              BEZEL
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE FIRESTORE
            </span>
          </div>
        </div>

        {/* User Badge & Session Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0a1322] text-white font-bold text-xs rounded-full flex items-center justify-center uppercase font-mono shadow-2xs">
              {currentUser.fullName.slice(0, 2)}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold text-slate-800 leading-tight">
                {currentUser.fullName}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                {currentUser.role === "admin"
                  ? "Manager"
                  : currentUser.role === "supervisor"
                  ? "Supervisor"
                  : "Operator"}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            id="bezel-logout-btn"
            className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition-all cursor-pointer"
            title="Exit Session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
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
            <span>Stock Inventory ({references.length})</span>
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
      </main>

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
