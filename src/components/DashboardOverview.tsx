import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, InventoryTransaction, User } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area 
} from "recharts";
import { 
  Package, ArrowRight, Truck, AlertTriangle, Search, 
  Warehouse, Factory, X, Layers, Send, ArrowLeftRight, ShieldAlert, Eye
} from "lucide-react";
import { formatSystemTime, getMoroccoTodayDateString, getMoroccoDateString } from "../utils/timeUtils";

// Lucide-styled 3-spoke automotive Steering Wheel Icon
export function SteeringWheelIcon({ className = "w-6 h-6", size }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size || 24}
      height={size || 24}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
      <line x1="12" y1="15" x2="12" y2="21" />
    </svg>
  );
}
import { doc, writeBatch, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";
import { LowStockAlertModal } from "./LowStockAlertModal";
import Swal from "sweetalert2";
import { executeProtectedStockOperation } from "../services/protectionLayer";
import { calculateStockValuation } from "../utils/stockValuation";

interface DashboardOverviewProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  transactions: InventoryTransaction[];
  currentUser?: User | null;
  onNavigateTab?: (tab: string) => void;
  onTriggerScan?: () => void;
}

export default function DashboardOverview({ 
  boxes, 
  adjustments, 
  references = [], 
  transactions = [],
  currentUser,
  onNavigateTab,
  onTriggerScan 
}: DashboardOverviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState<"All" | "Mesh" | "Soft">("All");
  const [stockStatusFilter, setStockStatusFilter] = useState<"All" | "Low Stock" | "Normal">("All");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  // Quick Action Modal State
  const [activeModal, setActiveModal] = useState<"incoming" | "mallas" | "production" | "precosido" | "villanova" | "remove" | null>(null);
  const [removeStockStage, setRemoveStockStage] = useState<"stock1" | "stock2" | "stock3">("stock1");
  const [modalRef, setModalRef] = useState("");
  const [modalQty, setModalQty] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Format today's date prefix in Morocco (Africa/Casablanca)
  const todayStr = useMemo(() => {
    return getMoroccoTodayDateString();
  }, []);

  // 1. Calculate General Metrics & Low Stock Count (Stock 1 + Stock 2 < 100 PCS)
  const metrics = useMemo(() => {
    const totalWarehouseStock = references.reduce((sum, r) => sum + (r.stock1 || 0), 0);
    const totalProductionStock = references.reduce((sum, r) => sum + (r.stock2 || 0), 0);
    const totalFinishedStock = references.reduce((sum, r) => sum + (r.stock3 || 0), 0);

    const lowStockRefs = references.filter(r => {
      const s1PlusS2 = (r.stock1 || 0) + (r.stock2 || 0);
      return s1PlusS2 < 100;
    });

    const todaysTransfers = transactions
      .filter(t => {
        const tDay = getMoroccoDateString(t.timestamp);
        return tDay === todayStr && (t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2");
      })
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    const todaysDeliveries = transactions
      .filter(t => {
        const tDay = getMoroccoDateString(t.timestamp);
        return tDay === todayStr && (t.movementType === "STOCK 3 OUT" || t.movementType === "STOCK 2 OUT / STOCK 3 IN" || t.movementType === "DELIVERY" || t.movementType === "STOCK 2 OUT");
      })
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    return {
      totalWarehouseStock,
      totalProductionStock,
      totalFinishedStock,
      lowStockCount: lowStockRefs.length,
      todaysTransfers,
      todaysDeliveries
    };
  }, [references, transactions, todayStr]);

  // Derived Monetary Stock Valuations from authoritative Firestore quantities
  const stock1Valuation = useMemo(() => calculateStockValuation(references, "stock1"), [references]);
  const stock2Valuation = useMemo(() => calculateStockValuation(references, "stock2"), [references]);
  const stock3Valuation = useMemo(() => calculateStockValuation(references, "stock3"), [references]);

  // Filter and search references for the main list
  const filteredReferences = useMemo(() => {
    return references.filter(ref => {
      const matchesSearch = ref.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            ref.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMaterial = materialFilter === "All" || ref.materialType === materialFilter;
      
      const s1PlusS2 = (ref.stock1 || 0) + (ref.stock2 || 0);
      const isLowStock = s1PlusS2 < 100;
      const matchesStockStatus = stockStatusFilter === "All" || 
                                 (stockStatusFilter === "Low Stock" && isLowStock) || 
                                 (stockStatusFilter === "Normal" && !isLowStock);

      return matchesSearch && matchesMaterial && matchesStockStatus;
    });
  }, [references, searchQuery, materialFilter, stockStatusFilter]);

  // Chart 1: Stock distribution across 3 stages
  const chartData = useMemo(() => {
    return references.map(ref => ({
      name: ref.code,
      "Stock 1 (Raw)": ref.stock1 || 0,
      "Stock 2 (Glued)": ref.stock2 || 0,
      "Stock 3 (Wheels)": ref.stock3 || 0,
    }));
  }, [references]);

  // Chart 2: Material Flow History
  const timelineChartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return getMoroccoDateString(d.toISOString());
    }).reverse();

    return days.map(day => {
      const dayTransfers = transactions
        .filter(t => {
          const tDay = getMoroccoDateString(t.timestamp);
          return tDay === day && (t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2");
        })
        .reduce((sum, t) => sum + t.quantity, 0);

      const dayDeliveries = transactions
        .filter(t => {
          const tDay = getMoroccoDateString(t.timestamp);
          return tDay === day && (t.movementType === "STOCK 3 OUT" || t.movementType === "DELIVERY" || t.movementType === "STOCK 2 OUT");
        })
        .reduce((sum, t) => sum + t.quantity, 0);

      const label = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Africa/Casablanca" });
      return {
        date: label,
        "Transfers": dayTransfers,
        "Deliveries": dayDeliveries,
      };
    });
  }, [transactions]);

  // Quick Action Handler
  const handleExecuteQuickAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRef || !modalQty) return;
    const qty = parseInt(modalQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setModalFeedback({ type: "error", message: "Please enter a valid positive quantity." });
      return;
    }

    setModalSubmitting(true);
    setModalFeedback(null);

    try {
      const operatorName = currentUser?.fullName || "Operator";
      let successMsg = "";

      if (activeModal === "incoming") {
        await executeProtectedStockOperation({
          operationType: "INCOMING_RECEIPT",
          referenceCode: modalRef,
          operatorName,
          reason: `Incoming Truck: ${modalNote || "Standard Receipt"}`,
          execute: async (refData, transaction) => {
            const s1 = refData.stock1 || 0;
            const newS1 = s1 + qty;
            const newTotal = newS1 + (refData.stock2 || 0) + (refData.stock3 || 0);
            const transId = `trans-inc-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 1 IN",
              stock: "Stock 1",
              quantity: qty,
              operatorName,
              timestamp: now,
              notes: `Incoming Truck: ${modalNote || "Standard Receipt"}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: newS1, newStock2: refData.stock2 || 0, newStock3: refData.stock3 || 0, newTotal }]
            };
          }
        });
        successMsg = `Successfully added ${qty} pcs to Stock 1 (Warehouse Raw Material).`;
      } else if (activeModal === "mallas") {
        await executeProtectedStockOperation({
          operationType: "TRANSFER_S1_S2",
          referenceCode: modalRef,
          operatorName,
          reason: `Sent to Gluing/Processing: ${modalNote || "Mallas Pegadas"}`,
          execute: async (refData, transaction) => {
            const s1 = refData.stock1 || 0;
            if (qty > s1) {
              throw new Error(`Insufficient Stock 1! Available: ${s1} pcs, requested: ${qty} pcs.`);
            }
            const newS1 = s1 - qty;
            const newS2 = (refData.stock2 || 0) + qty;
            const newTotal = newS1 + newS2 + (refData.stock3 || 0);
            const transId = `trans-trf-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "TRANSFER S1->S2",
              stock: "Stock 1 -> Stock 2",
              quantity: qty,
              operatorName,
              timestamp: now,
              notes: `Sent to Gluing/Processing: ${modalNote || "Mallas Pegadas"}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: newS1, newStock2: newS2, newStock3: refData.stock3 || 0, newTotal }]
            };
          }
        });
        successMsg = `Successfully transferred ${qty} pcs to Stock 2 (Mallas Pegadas).`;
      } else if (activeModal === "production") {
        await executeProtectedStockOperation({
          operationType: "PRODUCTION_OUT",
          referenceCode: modalRef,
          operatorName,
          reason: `Montaje Steering Wheel Assembly: ${modalNote || "Daily Production"}`,
          execute: async (refData, transaction) => {
            const s2 = refData.stock2 || 0;
            if (qty > s2) {
              throw new Error(`Insufficient Stock 2! Available: ${s2} pcs, requested: ${qty} pcs.`);
            }
            const newS2 = s2 - qty;
            const newS3 = (refData.stock3 || 0) + qty;
            const newTotal = (refData.stock1 || 0) + newS2 + newS3;
            const transId = `trans-prod-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 2 OUT / STOCK 3 IN",
              stock: "Stock 2 -> Stock 3",
              quantity: qty,
              operatorName,
              timestamp: now,
              notes: `Montaje Steering Wheel Assembly: ${modalNote || "Daily Production"}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: refData.stock1 || 0, newStock2: newS2, newStock3: newS3, newTotal }]
            };
          }
        });
        successMsg = `Successfully assembled ${qty} Steering Wheels into Stock 3.`;
      } else if (activeModal === "precosido") {
        await executeProtectedStockOperation({
          operationType: "DELIVERY_OUT",
          referenceCode: modalRef,
          operatorName,
          reason: `Precosido Invoice Dispatch: ${modalNote || "Precosido Invoice"}`,
          execute: async (refData, transaction) => {
            const s2 = refData.stock2 || 0;
            if (qty > s2) {
              throw new Error(`Insufficient Stock 2! Available: ${s2} pcs, requested: ${qty} pcs.`);
            }
            const newS2 = s2 - qty;
            const newTotal = (refData.stock1 || 0) + newS2 + (refData.stock3 || 0);
            const transId = `trans-pre-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 2 OUT",
              stock: "Stock 2",
              quantity: qty,
              operatorName,
              timestamp: now,
              notes: `Precosido Invoice Dispatch: ${modalNote || "Precosido Invoice"}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: refData.stock1 || 0, newStock2: newS2, newStock3: refData.stock3 || 0, newTotal }]
            };
          }
        });
        successMsg = `Successfully dispatched ${qty} pcs Precosido from Stock 2.`;
      } else if (activeModal === "villanova") {
        await executeProtectedStockOperation({
          operationType: "DELIVERY_OUT",
          referenceCode: modalRef,
          operatorName,
          reason: `Villanova SW Delivery: ${modalNote || "Villanova Dispatch"}`,
          execute: async (refData, transaction) => {
            const s3 = refData.stock3 || 0;
            if (qty > s3) {
              throw new Error(`Insufficient Stock 3! Available: ${s3} pcs, requested: ${qty} pcs.`);
            }
            const newS3 = s3 - qty;
            const newTotal = (refData.stock1 || 0) + (refData.stock2 || 0) + newS3;
            const transId = `trans-del-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK 3 OUT",
              stock: "Stock 3",
              quantity: qty,
              operatorName,
              timestamp: now,
              notes: `Villanova SW Delivery: ${modalNote || "Villanova Dispatch"}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: refData.stock1 || 0, newStock2: refData.stock2 || 0, newStock3: newS3, newTotal }]
            };
          }
        });
        successMsg = `Successfully shipped ${qty} Steering Wheels to Villanova from Stock 3.`;
      } else if (activeModal === "remove") {
        let stageName = "Stock 1 (Warehouse)";
        await executeProtectedStockOperation({
          operationType: "STOCK_ADJUSTMENT",
          referenceCode: modalRef,
          operatorName,
          reason: `Stock Deduction: ${modalNote || "Removed by user"}`,
          execute: async (refData, transaction) => {
            let s1 = refData.stock1 || 0;
            let s2 = refData.stock2 || 0;
            let s3 = refData.stock3 || 0;

            if (removeStockStage === "stock1") {
              if (qty > s1) throw new Error(`Insufficient Stock 1! Available: ${s1} pcs, requested: ${qty} pcs.`);
              s1 = s1 - qty;
              stageName = "Stock 1 (Warehouse)";
            } else if (removeStockStage === "stock2") {
              if (qty > s2) throw new Error(`Insufficient Stock 2! Available: ${s2} pcs, requested: ${qty} pcs.`);
              s2 = s2 - qty;
              stageName = "Stock 2 (Gluing WIP)";
            } else if (removeStockStage === "stock3") {
              if (qty > s3) throw new Error(`Insufficient Stock 3! Available: ${s3} pcs, requested: ${qty} pcs.`);
              s3 = s3 - qty;
              stageName = "Stock 3 (Finished Wheels)";
            }

            const newTotal = s1 + s2 + s3;
            const transId = `trans-rmv-${Date.now()}`;
            const now = new Date().toISOString();

            transaction.set(doc(db, "transactions", transId), {
              id: transId,
              reference: modalRef,
              movementType: "STOCK REMOVED",
              stock: stageName,
              quantity: qty,
              operatorName,
              timestamp: now,
              notes: `Stock Deduction (${stageName}): ${modalNote || "Removed by user"}`
            });

            return {
              stockChanges: [{ referenceCode: modalRef, newStock1: s1, newStock2: s2, newStock3: s3, newTotal }]
            };
          }
        });
        successMsg = `Successfully removed ${qty} pcs from ${stageName}.`;
      }

      setModalQty("");
      setModalNote("");
      setActiveModal(null);
      setModalFeedback(null);

      Swal.fire({
        title: "Good job!",
        text: successMsg || "Operation completed successfully!",
        icon: "success",
        confirmButtonText: "OK",
        confirmButtonColor: "#2563eb",
      });

    } catch (err: any) {
      console.error("Quick action error:", err);
      setModalFeedback({ type: "error", message: err.message || "Failed to process transaction." });
    } finally {
      setModalSubmitting(false);
    }
  };

  const openModal = (type: "incoming" | "mallas" | "production" | "precosido" | "villanova" | "remove") => {
    setActiveModal(type);
    setModalFeedback(null);
    setModalQty("");
    setModalNote("");
    if (references.length > 0 && !modalRef) {
      setModalRef(references[0].code);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" id="dashboard-container">
      
      {/* Top KPI Summary Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Stock 1 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4 min-h-[104px]">
          <div className="w-12 h-12 min-w-12 min-h-12 rounded-2xl bg-blue-50/90 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
            <Warehouse className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 1</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">
              {metrics.totalWarehouseStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs font-semibold font-mono text-slate-600">
                {stock1Valuation.formattedValue}
              </span>
              {stock1Valuation.missingPriceCount > 0 && (
                <span 
                  className="text-[10px] text-amber-600 font-medium"
                  title={`Missing price for: ${stock1Valuation.missingPriceRefs.join(", ")}`}
                >
                  +{stock1Valuation.missingPriceCount} {stock1Valuation.missingPriceCount === 1 ? "reference" : "references"} without price
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Stock 2 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4 min-h-[104px]">
          <div className="w-12 h-12 min-w-12 min-h-12 rounded-2xl bg-amber-50/90 border border-amber-100/80 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <Factory className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 2</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">
              {metrics.totalProductionStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs font-semibold font-mono text-slate-600">
                {stock2Valuation.formattedValue}
              </span>
              {stock2Valuation.missingPriceCount > 0 && (
                <span 
                  className="text-[10px] text-amber-600 font-medium"
                  title={`Missing price for: ${stock2Valuation.missingPriceRefs.join(", ")}`}
                >
                  +{stock2Valuation.missingPriceCount} {stock2Valuation.missingPriceCount === 1 ? "reference" : "references"} without price
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Stock 3 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4 min-h-[104px]">
          <div className="w-12 h-12 min-w-12 min-h-12 rounded-2xl bg-emerald-50/90 border border-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
            <SteeringWheelIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 3</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">
              {metrics.totalFinishedStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs font-semibold font-mono text-slate-600">
                {stock3Valuation.formattedValue}
              </span>
              {stock3Valuation.missingPriceCount > 0 && (
                <span 
                  className="text-[10px] text-amber-600 font-medium"
                  title={`Missing price for: ${stock3Valuation.missingPriceRefs.join(", ")}`}
                >
                  +{stock3Valuation.missingPriceCount} {stock3Valuation.missingPriceCount === 1 ? "reference" : "references"} without price
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Low Stock Alerts */}
        <div 
          onClick={() => setIsAlertModalOpen(true)}
          className={`border rounded-3xl p-5 shadow-xl transition-all cursor-pointer relative overflow-hidden flex items-center justify-between gap-4 min-h-[96px] ${
            metrics.lowStockCount > 0 
              ? "bg-gradient-to-br from-rose-50/90 to-white border-rose-200 shadow-rose-500/10 hover:border-rose-300" 
              : "bg-white border-slate-100 shadow-slate-200/40"
          }`}
          id="dashboard-low-stock-kpi-card"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
              metrics.lowStockCount > 0 
                ? "bg-rose-600 text-white shadow-rose-500/30 animate-pulse" 
                : "bg-emerald-50 text-emerald-600"
            }`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <span>Low Stock Alert</span>
                {metrics.lowStockCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block"></span>
                )}
              </p>
              <h3 className={`text-xl font-extrabold mt-0.5 truncate ${metrics.lowStockCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
                {metrics.lowStockCount} <span className="text-xs font-medium text-slate-400">Refs &lt; 100 PCS</span>
              </h3>
            </div>
          </div>
          <button 
            type="button"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors shrink-0"
            title="View Low Stock References"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* 3-STAGE VISUAL FLOW BAR */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Pipeline
          </h3>
          <span className="text-xs font-medium text-slate-400 font-mono">
            {references.length} References
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-stretch">
          
          {/* STAGE 1: STOCK 1 */}
          <div className="md:col-span-3 bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                  Stock 1
                </span>
                <Warehouse className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Mallas Not Touched
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-slate-900">
                  {metrics.totalWarehouseStock.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">PCS</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold font-mono text-slate-500">
                  {stock1Valuation.formattedValue}
                </span>
                {stock1Valuation.missingPriceCount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium" title={`Missing price for: ${stock1Valuation.missingPriceRefs.join(", ")}`}>
                    +{stock1Valuation.missingPriceCount} without price
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR 1 -> 2 */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
            <div className="hidden md:flex flex-col items-center text-slate-400">
              <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 font-mono tracking-wider">GLUING</span>
              <div className="p-2 bg-slate-100 rounded-full border border-slate-200 shadow-xs">
                <ArrowRight className="w-4 h-4 text-slate-600" />
              </div>
            </div>
            <div className="flex md:hidden items-center text-slate-400 gap-1">
              <ArrowRight className="w-4 h-4 rotate-90" />
              <span className="text-xs font-medium">Gluing Line</span>
            </div>
          </div>

          {/* STAGE 2: STOCK 2 */}
          <div className="md:col-span-3 bg-amber-50/50 border border-amber-100 p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                  Stock 2
                </span>
                <Factory className="w-5 h-5 text-amber-500" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Mallas Pegadas
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-amber-700">
                  {metrics.totalProductionStock.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">PCS</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold font-mono text-slate-500">
                  {stock2Valuation.formattedValue}
                </span>
                {stock2Valuation.missingPriceCount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium" title={`Missing price for: ${stock2Valuation.missingPriceRefs.join(", ")}`}>
                    +{stock2Valuation.missingPriceCount} without price
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR 2 -> 3 */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
            <div className="hidden md:flex flex-col items-center text-slate-400">
              <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 font-mono tracking-wider">MONTAJE</span>
              <div className="p-2 bg-amber-100 rounded-full border border-amber-200 shadow-xs">
                <ArrowRight className="w-4 h-4 text-amber-700" />
              </div>
            </div>
            <div className="flex md:hidden items-center text-slate-400 gap-1">
              <ArrowRight className="w-4 h-4 rotate-90" />
              <span className="text-xs font-medium">Montaje Assembly</span>
            </div>
          </div>

          {/* STAGE 3: STOCK 3 */}
          <div className="md:col-span-3 bg-emerald-50/50 border border-emerald-100 p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  Stock 3
                </span>
                <SteeringWheelIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Steering Wheels
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-emerald-700">
                  {metrics.totalFinishedStock.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">PCS</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold font-mono text-slate-500">
                  {stock3Valuation.formattedValue}
                </span>
                {stock3Valuation.missingPriceCount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium" title={`Missing price for: ${stock3Valuation.missingPriceRefs.join(", ")}`}>
                    +{stock3Valuation.missingPriceCount} without price
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* QUICK ACTIONS BAR */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
            Quick Actions
          </h3>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => openModal("incoming")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-blue-100 font-mono"
          >
            <Truck className="w-4 h-4 text-blue-600" />
            <span>+ Incoming</span>
          </button>

          <button
            onClick={() => openModal("mallas")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-amber-200/60 font-mono"
          >
            <ArrowLeftRight className="w-4 h-4 text-amber-600" />
            <span>+ Stock 2</span>
          </button>

          <button
            onClick={() => openModal("production")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-200/60 font-mono"
          >
            <Factory className="w-4 h-4 text-emerald-600" />
            <span>+ Production</span>
          </button>

          <button
            onClick={() => openModal("precosido")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-rose-200/60 font-mono"
          >
            <Package className="w-4 h-4 text-rose-600" />
            <span>+ Precosido</span>
          </button>

          <button
            onClick={() => openModal("villanova")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-purple-200/60 font-mono"
          >
            <Send className="w-4 h-4 text-purple-600" />
            <span>+ Delivery</span>
          </button>

          <button
            onClick={() => openModal("remove")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-300/80 font-mono"
          >
            <X className="w-4 h-4 text-slate-700" />
            <span>－ Remove</span>
          </button>
        </div>
      </div>

      {/* MASTER INVENTORY TABLE */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/40 p-6 overflow-hidden" id="reference-inventory-list">
        
        {/* Table Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-800" />
              Inventory
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-xs rounded-2xl font-mono focus:outline-none transition-all w-48"
              />
            </div>

            <CustomSelect
              value={materialFilter}
              onChange={(val) => setMaterialFilter(val as any)}
              options={[
                { value: "All", label: "All Types" },
                { value: "Mesh", label: "Mesh Only" },
                { value: "Soft", label: "Soft Only" }
              ]}
              className="w-36"
              size="sm"
            />

            <CustomSelect
              value={stockStatusFilter}
              onChange={(val) => setStockStatusFilter(val as any)}
              options={[
                { value: "All", label: "All Levels" },
                { value: "Low Stock", label: "Low Warnings", badge: "Warning" },
                { value: "Normal", label: "Normal Levels" }
              ]}
              className="w-36"
              size="sm"
            />
          </div>
        </div>

        {/* Clean Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px] uppercase font-mono font-bold tracking-wider">
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-3 text-center">Type</th>
                <th className="py-3 px-4 text-right">Stock 1</th>
                <th className="py-3 px-4 text-right">Stock 2</th>
                <th className="py-3 px-4 text-right">Stock 3</th>
                <th className="py-3 px-4 text-right font-bold text-slate-900">Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredReferences.map((ref) => {
                const s1 = ref.stock1 || 0;
                const s2 = ref.stock2 || 0;
                const s3 = ref.stock3 || 0;
                const total = s1 + s2 + s3;
                const s1PlusS2 = s1 + s2;
                const isLow = s1PlusS2 < 100;

                return (
                  <tr key={ref.id} className={`hover:bg-slate-50/70 transition-colors ${isLow ? "bg-rose-50/20" : ""}`}>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{ref.code}</td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{ref.description}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                        {ref.materialType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-600">
                      {s1.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-amber-600">
                      {s2.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-600">
                      {s3.toLocaleString()}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono font-black ${isLow ? "text-rose-600 text-sm" : "text-slate-900"}`}>
                      {total.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isLow ? (
                        <span 
                          onClick={() => setIsAlertModalOpen(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer hover:bg-rose-100 transition-colors font-mono uppercase"
                          title="Click to view alert details"
                        >
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono uppercase">
                          NORMAL
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                      {ref.lastUpdate ? formatSystemTime(ref.lastUpdate) : "N/A"}
                    </td>
                  </tr>
                );
              })}

              {filteredReferences.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-mono text-xs">
                    No references found matching "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="dashboard-charts-grid">
        
        {/* Chart 1 */}
        <div className="bg-white p-6 border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
              Stock Stage Distribution
            </h3>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "16px", border: "none", color: "#fff", fontFamily: "monospace", fontSize: "11px", padding: "12px" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Bar dataKey="Stock 1 (Raw)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Stock 2 (Glued)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Stock 3 (Wheels)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2 */}
        <div className="bg-white p-6 border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
              7-Day Activity Flow
            </h3>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTransfers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDeliveries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "16px", border: "none", color: "#fff", fontFamily: "monospace", fontSize: "11px", padding: "12px" }}
                />
                <Area type="monotone" dataKey="Transfers" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTransfers)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="Deliveries" stroke="#9333ea" fillOpacity={1} fill="url(#colorDeliveries)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* QUICK ACTION MODAL DIALOG */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-fadeIn">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">
                  {activeModal === "incoming" && "🚛"}
                  {activeModal === "mallas" && "🔵"}
                  {activeModal === "production" && "🟢"}
                  {activeModal === "precosido" && "📦"}
                  {activeModal === "villanova" && "🚚"}
                  {activeModal === "remove" && "🗑️"}
                </span>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {activeModal === "incoming" && "Incoming (Stock 1 IN)"}
                  {activeModal === "mallas" && "Transfer (Stock 1 → 2)"}
                  {activeModal === "production" && "Production (Stock 2 → 3)"}
                  {activeModal === "precosido" && "Precosido (Stock 2 OUT)"}
                  {activeModal === "villanova" && "Delivery (Stock 3 OUT)"}
                  {activeModal === "remove" && "Remove Stock"}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div className={`p-3 text-xs font-semibold rounded-2xl mb-4 ${
                modalFeedback.type === "success" 
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200" 
                  : "bg-rose-50 text-rose-900 border border-rose-200"
              }`}>
                {modalFeedback.message}
              </div>
            )}

            <form onSubmit={handleExecuteQuickAction} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Reference
                </label>
                <CustomReferenceSelect
                  references={references}
                  value={modalRef}
                  onChange={(code) => setModalRef(code)}
                  placeholder="Select reference..."
                  required
                />
              </div>

              {activeModal === "remove" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Stock Stage
                  </label>
                  <CustomSelect
                    value={removeStockStage}
                    onChange={(val: any) => setRemoveStockStage(val)}
                    options={[
                      { value: "stock1", label: "Stock 1" },
                      { value: "stock2", label: "Stock 2" },
                      { value: "stock3", label: "Stock 3" }
                    ]}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Quantity (PCS)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Qty..."
                  value={modalQty}
                  onChange={(e) => setModalQty(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-mono font-bold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Notes..."
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold cursor-pointer transition-all disabled:opacity-50 shadow-md shadow-blue-500/20 font-mono"
                >
                  {modalSubmitting ? "Processing..." : "Confirm"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Global Low Stock Alert Modal */}
      <LowStockAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        references={references}
      />

    </div>
  );
}
