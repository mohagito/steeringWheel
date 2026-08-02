import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, InventoryTransaction, User } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area 
} from "recharts";
import { 
  Package, ArrowRight, Truck, AlertTriangle, Search, 
  Warehouse, Factory, X, Layers, Disc, Send, ArrowLeftRight
} from "lucide-react";
import { doc, writeBatch, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";

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

  // Quick Action Modal State
  const [activeModal, setActiveModal] = useState<"incoming" | "mallas" | "production" | "precosido" | "villanova" | "remove" | null>(null);
  const [removeStockStage, setRemoveStockStage] = useState<"stock1" | "stock2" | "stock3">("stock1");
  const [modalRef, setModalRef] = useState("");
  const [modalQty, setModalQty] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Format today's date prefix
  const todayStr = useMemo(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  // 1. Calculate General Metrics
  const metrics = useMemo(() => {
    const totalWarehouseStock = references.reduce((sum, r) => sum + (r.stock1 || 0), 0);
    const totalProductionStock = references.reduce((sum, r) => sum + (r.stock2 || 0), 0);
    const totalFinishedStock = references.reduce((sum, r) => sum + (r.stock3 || 0), 0);

    const todaysTransfers = transactions
      .filter(t => t.timestamp.startsWith(todayStr) && (t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2"))
      .reduce((sum, t) => sum + t.quantity, 0);

    const todaysDeliveries = transactions
      .filter(t => t.timestamp.startsWith(todayStr) && (t.movementType === "STOCK 3 OUT" || t.movementType === "STOCK 2 OUT / STOCK 3 IN" || t.movementType === "DELIVERY" || t.movementType === "STOCK 2 OUT"))
      .reduce((sum, t) => sum + t.quantity, 0);

    return {
      totalWarehouseStock,
      totalProductionStock,
      totalFinishedStock,
      todaysTransfers,
      todaysDeliveries
    };
  }, [references, transactions, todayStr]);

  // Filter and search references for the main list
  const filteredReferences = useMemo(() => {
    return references.filter(ref => {
      const matchesSearch = ref.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            ref.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMaterial = materialFilter === "All" || ref.materialType === materialFilter;
      
      const isLowStock = (ref.stock1 || 0) < 100 || (ref.stock2 || 0) < 30 || (ref.stock3 || 0) < 30;
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
      return d.toISOString().split("T")[0];
    }).reverse();

    return days.map(day => {
      const dayTransfers = transactions
        .filter(t => t.timestamp.startsWith(day) && (t.movementType === "TRANSFER" || t.movementType === "TRANSFER S1->S2"))
        .reduce((sum, t) => sum + t.quantity, 0);

      const dayDeliveries = transactions
        .filter(t => t.timestamp.startsWith(day) && (t.movementType === "STOCK 3 OUT" || t.movementType === "DELIVERY" || t.movementType === "STOCK 2 OUT"))
        .reduce((sum, t) => sum + t.quantity, 0);

      const label = new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();
      const refDocRef = doc(db, "references", modalRef);
      const refSnap = await getDoc(refDocRef);

      if (!refSnap.exists()) {
        setModalFeedback({ type: "error", message: `Reference code ${modalRef} not found.` });
        setModalSubmitting(false);
        return;
      }

      const refData = refSnap.data();
      const s1 = refData.stock1 || 0;
      const s2 = refData.stock2 || 0;
      const s3 = refData.stock3 || 0;
      const operatorName = currentUser?.fullName || "Operator";

      if (activeModal === "incoming") {
        // INCOMING TRUCK -> Stock 1 IN
        const newS1 = s1 + qty;
        const newTotal = newS1 + s2 + s3;

        batch.update(refDocRef, { stock1: newS1, currentStock: newTotal, lastUpdate: timestamp });
        const transId = `trans-inc-${Date.now()}`;
        batch.set(doc(db, "transactions", transId), {
          id: transId,
          reference: modalRef,
          movementType: "STOCK 1 IN",
          stock: "Stock 1",
          quantity: qty,
          operatorName,
          timestamp,
          notes: `Incoming Truck: ${modalNote || "Standard Receipt"}`
        });
        await batch.commit();
        setModalFeedback({ type: "success", message: `Successfully added ${qty} pcs to Stock 1 (Untouched Mesh).` });
      } else if (activeModal === "mallas") {
        // MALLAS PEGADAS -> Stock 1 OUT -> Stock 2 IN
        if (qty > s1) {
          setModalFeedback({ type: "error", message: `Insufficient Stock 1! Available: ${s1} pcs, requested: ${qty} pcs.` });
          setModalSubmitting(false);
          return;
        }
        const newS1 = Math.max(0, s1 - qty);
        const newS2 = s2 + qty;
        const newTotal = newS1 + newS2 + s3;

        batch.update(refDocRef, { stock1: newS1, stock2: newS2, currentStock: newTotal, lastUpdate: timestamp });
        const transId = `trans-trf-${Date.now()}`;
        batch.set(doc(db, "transactions", transId), {
          id: transId,
          reference: modalRef,
          movementType: "TRANSFER S1->S2",
          stock: "Stock 1 -> Stock 2",
          quantity: qty,
          operatorName,
          timestamp,
          notes: `Sent to Gluing/Processing: ${modalNote || "Mallas Pegadas"}`
        });
        await batch.commit();
        setModalFeedback({ type: "success", message: `Successfully transferred ${qty} pcs to Stock 2 (Glued Mesh).` });
      } else if (activeModal === "production") {
        // DAILY PRODUCTION -> Stock 2 OUT -> Stock 3 IN
        if (qty > s2) {
          setModalFeedback({ type: "error", message: `Insufficient Stock 2! Available: ${s2} pcs, requested: ${qty} pcs.` });
          setModalSubmitting(false);
          return;
        }
        const newS2 = Math.max(0, s2 - qty);
        const newS3 = s3 + qty;
        const newTotal = s1 + newS2 + newS3;

        batch.update(refDocRef, { stock2: newS2, stock3: newS3, currentStock: newTotal, lastUpdate: timestamp });
        const transId = `trans-prod-${Date.now()}`;
        batch.set(doc(db, "transactions", transId), {
          id: transId,
          reference: modalRef,
          movementType: "STOCK 2 OUT / STOCK 3 IN",
          stock: "Stock 2 -> Stock 3",
          quantity: qty,
          operatorName,
          timestamp,
          notes: `Montaje Steering Wheel Assembly: ${modalNote || "Daily Production"}`
        });
        await batch.commit();
        setModalFeedback({ type: "success", message: `Successfully assembled ${qty} Steering Wheels into Stock 3.` });
      } else if (activeModal === "precosido") {
        // PRECOSIDO INVOICE SENT -> Stock 2 OUT
        if (qty > s2) {
          setModalFeedback({ type: "error", message: `Insufficient Stock 2! Available: ${s2} pcs, requested: ${qty} pcs.` });
          setModalSubmitting(false);
          return;
        }
        const newS2 = Math.max(0, s2 - qty);
        const newTotal = s1 + newS2 + s3;

        batch.update(refDocRef, { stock2: newS2, currentStock: newTotal, lastUpdate: timestamp });
        const transId = `trans-pre-${Date.now()}`;
        batch.set(doc(db, "transactions", transId), {
          id: transId,
          reference: modalRef,
          movementType: "STOCK 2 OUT",
          stock: "Stock 2",
          quantity: qty,
          operatorName,
          timestamp,
          notes: `Precosido Invoice Dispatch: ${modalNote || "Precosido Invoice"}`
        });
        await batch.commit();
        setModalFeedback({ type: "success", message: `Successfully dispatched ${qty} pcs Precosido from Stock 2.` });
      } else if (activeModal === "villanova") {
        // VILLANOVA DELIVERY -> Stock 3 OUT
        if (qty > s3) {
          setModalFeedback({ type: "error", message: `Insufficient Stock 3! Available: ${s3} pcs, requested: ${qty} pcs.` });
          setModalSubmitting(false);
          return;
        }
        const newS3 = Math.max(0, s3 - qty);
        const newTotal = s1 + s2 + newS3;

        batch.update(refDocRef, { stock3: newS3, currentStock: newTotal, lastUpdate: timestamp });
        const transId = `trans-del-${Date.now()}`;
        batch.set(doc(db, "transactions", transId), {
          id: transId,
          reference: modalRef,
          movementType: "STOCK 3 OUT",
          stock: "Stock 3",
          quantity: qty,
          operatorName,
          timestamp,
          notes: `Villanova SW Delivery: ${modalNote || "Villanova Dispatch"}`
        });
        await batch.commit();
        setModalFeedback({ type: "success", message: `Successfully shipped ${qty} Steering Wheels to Villanova from Stock 3.` });
      } else if (activeModal === "remove") {
        // REMOVE / DEDUCT STOCK
        let newS1 = s1;
        let newS2 = s2;
        let newS3 = s3;
        let stageName = "Stock 1 (Warehouse)";

        if (removeStockStage === "stock1") {
          newS1 = s1 - qty;
          stageName = "Stock 1 (Warehouse)";
        } else if (removeStockStage === "stock2") {
          newS2 = s2 - qty;
          stageName = "Stock 2 (Gluing WIP)";
        } else if (removeStockStage === "stock3") {
          newS3 = s3 - qty;
          stageName = "Stock 3 (Finished Wheels)";
        }

        const newTotal = newS1 + newS2 + newS3;
        batch.update(refDocRef, { stock1: newS1, stock2: newS2, stock3: newS3, currentStock: newTotal, lastUpdate: timestamp });
        const transId = `trans-rmv-${Date.now()}`;
        batch.set(doc(db, "transactions", transId), {
          id: transId,
          reference: modalRef,
          movementType: "STOCK REMOVED",
          stock: stageName,
          quantity: qty,
          operatorName,
          timestamp,
          notes: `Stock Deduction (${stageName}): ${modalNote || "Removed by user"}`
        });
        await batch.commit();
        setModalFeedback({ type: "success", message: `Successfully removed ${qty} pcs from ${stageName}.` });
      }

      setModalQty("");
      setModalNote("");
      setTimeout(() => {
        setActiveModal(null);
        setModalFeedback(null);
      }, 1500);

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
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-inner">
            <Warehouse className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 1</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{metrics.totalWarehouseStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
          </div>
        </div>

        {/* Card 2: Stock 2 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 shadow-inner">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 2</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{metrics.totalProductionStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
          </div>
        </div>

        {/* Card 3: Stock 3 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
            <Disc className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stock 3</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{metrics.totalFinishedStock.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
          </div>
        </div>

        {/* Card 4: Deliveries */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xl shadow-slate-200/40 relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 shadow-inner">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Deliveries</p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{metrics.todaysDeliveries.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></h3>
          </div>
        </div>

      </div>

      {/* 3-STAGE VISUAL FLOW BAR */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            3-Stage Material Pipeline
          </h3>
          <span className="text-xs font-medium text-slate-400 font-mono">
            {references.length} Active Master References
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

            <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-slate-900">
                {metrics.totalWarehouseStock.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-slate-400">PCS</span>
            </div>
          </div>

          {/* CONNECTOR 1 -> 2 */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
            <div className="hidden md:flex flex-col items-center text-slate-400">
              <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gluing</span>
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

            <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-amber-700">
                {metrics.totalProductionStock.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-slate-400">PCS</span>
            </div>
          </div>

          {/* CONNECTOR 2 -> 3 */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
            <div className="hidden md:flex flex-col items-center text-slate-400">
              <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">Montaje</span>
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
                <Disc className="w-5 h-5 text-emerald-600" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">
                Steering Wheels
              </h4>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-200/60 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-emerald-700">
                {metrics.totalFinishedStock.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-slate-400">PCS</span>
            </div>
          </div>

        </div>
      </div>

      {/* QUICK ACTIONS BAR */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
            Quick Stock Operations
          </h3>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => openModal("incoming")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-blue-100"
          >
            <Truck className="w-4 h-4 text-blue-600" />
            <span>+ Incoming</span>
          </button>

          <button
            onClick={() => openModal("mallas")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-amber-200/60"
          >
            <ArrowLeftRight className="w-4 h-4 text-amber-600" />
            <span>+ Mallas Pegadas</span>
          </button>

          <button
            onClick={() => openModal("production")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-200/60"
          >
            <Factory className="w-4 h-4 text-emerald-600" />
            <span>+ Production</span>
          </button>

          <button
            onClick={() => openModal("precosido")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-rose-200/60"
          >
            <Package className="w-4 h-4 text-rose-600" />
            <span>+ Precosido</span>
          </button>

          <button
            onClick={() => openModal("villanova")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-purple-200/60"
          >
            <Send className="w-4 h-4 text-purple-600" />
            <span>+ SW Delivery</span>
          </button>

          <button
            onClick={() => openModal("remove")}
            className="flex-1 min-w-[150px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-300/80"
          >
            <X className="w-4 h-4 text-slate-700" />
            <span>－ Remove Stock</span>
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
              Material Master Inventory
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
                const isLow = s1 < 100 || s2 < 30 || s3 < 30;

                return (
                  <tr key={ref.id} className="hover:bg-slate-50/70 transition-colors">
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
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                      {total.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3" />
                          LOW
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                      {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}
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
                  {activeModal === "incoming" && "Incoming Truck (Stock 1 IN)"}
                  {activeModal === "mallas" && "Mallas Pegadas (Stock 1 → 2)"}
                  {activeModal === "production" && "Daily Production (Stock 2 → 3)"}
                  {activeModal === "precosido" && "Precosido Invoice (Stock 2 OUT)"}
                  {activeModal === "villanova" && "Villanova Delivery (Stock 3 OUT)"}
                  {activeModal === "remove" && "Remove / Deduct Stock"}
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
                  Reference Code
                </label>
                <CustomReferenceSelect
                  references={references}
                  value={modalRef}
                  onChange={(code) => setModalRef(code)}
                  placeholder="Search and select reference..."
                  required
                />
              </div>

              {activeModal === "remove" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Deduct From Stock Stage
                  </label>
                  <CustomSelect
                    value={removeStockStage}
                    onChange={(val: any) => setRemoveStockStage(val)}
                    options={[
                      { value: "stock1", label: "Stock 1 — Warehouse Raw Material", description: "Direct raw mesh / material" },
                      { value: "stock2", label: "Stock 2 — Production Gluing WIP", description: "Glued mesh / Mallas Pegadas" },
                      { value: "stock3", label: "Stock 3 — Finished Goods Wheels", description: "Completed steering wheel assemblies" }
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
                  placeholder="e.g. 100"
                  value={modalQty}
                  onChange={(e) => setModalQty(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-mono font-bold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Notes / Invoice Ref
                </label>
                <input
                  type="text"
                  placeholder="Optional reference note or invoice #"
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold cursor-pointer transition-all disabled:opacity-50 shadow-md shadow-blue-500/20"
                >
                  {modalSubmitting ? "Executing..." : "Confirm Operation"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
