import React, { useState, useMemo } from "react";
import { InventoryTransaction, ReceivingInvoice, Reference, User } from "../types";
import { 
  History, Search, Filter, ArrowRight, RotateCcw, Truck, 
  Layers, CheckCircle2, Clock, Calendar, Download, Eye, 
  X, Printer, Shield, ArrowUpRight, ArrowDownLeft, AlertCircle,
  Factory, Trash2, Box as BoxIcon, ChevronRight, User as UserIcon,
  Sparkles, RefreshCw, BarChart2
} from "lucide-react";

interface RecordsWorkspaceProps {
  transactions: InventoryTransaction[];
  invoices?: ReceivingInvoice[];
  references: Reference[];
  currentUser: User;
  onNavigateToTab?: (tab: string) => void;
}

type MovementCategoryFilter = "all" | "truck" | "pegadas" | "return" | "delivery" | "production_scrap";
type TimeFilter = "today" | "yesterday" | "week" | "month" | "all";
type ViewMode = "timeline" | "table";

export default function RecordsWorkspace({
  transactions = [],
  invoices = [],
  references = [],
  currentUser,
  onNavigateToTab
}: RecordsWorkspaceProps) {
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<MovementCategoryFilter>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");

  // Selected movement for detailed inspection modal
  const [selectedTx, setSelectedTx] = useState<InventoryTransaction | null>(null);

  // Reference lookup map for instant metadata retrieval (description, materialType, customer, stock)
  const refMap = useMemo(() => {
    const map = new Map<string, Reference>();
    references.forEach(r => {
      map.set(r.code.toUpperCase(), r);
      if (r.id) map.set(r.id.toUpperCase(), r);
    });
    return map;
  }, [references]);

  // Unique list of operators who have logged transactions
  const availableOperators = useMemo(() => {
    const set = new Set<string>();
    // Always include current user and standard shift profiles
    if (currentUser.fullName) set.add(currentUser.fullName);
    set.add("SHIFT A");
    set.add("SHIFT B");
    set.add("MANAGER");
    set.add("GONZALO");
    transactions.forEach(tx => {
      if (tx.operatorName) {
        // Clean out any (Reversal) or (Correction) tags for the dropdown
        const cleanName = tx.operatorName.replace(/\s*\([^)]*\)/g, "").trim();
        if (cleanName) set.add(cleanName);
      }
    });
    return Array.from(set);
  }, [transactions, currentUser]);

  // Helper to categorize transaction movement types
  const getMovementCategory = (tx: InventoryTransaction): "truck" | "pegadas" | "return" | "delivery" | "production_scrap" | "other" => {
    const type = (tx.movementType || "").toUpperCase();
    const stock = (tx.stock || "").toUpperCase();
    const notes = (tx.notes || "").toUpperCase();

    if (type.includes("STOCK 1 IN") || type.includes("INVOICE") || notes.includes("INVOICE") || notes.includes("TRUCK")) {
      return "truck";
    }
    if (type.includes("TRANSFER") || type.includes("S1->S2") || stock.includes("STOCK 1 -> STOCK 2") || notes.includes("PEGADAS")) {
      return "pegadas";
    }
    if (type.includes("RETURN") || type.includes("S2->S1") || stock.includes("STOCK 2 -> STOCK 1") || notes.includes("RETURN")) {
      return "return";
    }
    if (type.includes("DELIVERY") || tx.deliveryType || notes.includes("DELIVERY") || notes.includes("DISPATCH")) {
      return "delivery";
    }
    if (type.includes("STOCK 2 OUT / STOCK 3 IN") || type.includes("SCRAP") || notes.includes("PRODUCTION") || notes.includes("NOK")) {
      return "production_scrap";
    }
    return "other";
  };

  // Filtered transactions calculation
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

    const weekAgoDate = new Date(now);
    weekAgoDate.setDate(weekAgoDate.getDate() - 7);

    const monthAgoDate = new Date(now);
    monthAgoDate.setDate(monthAgoDate.getDate() - 30);

    return transactions.filter(tx => {
      // 1. Time filter
      if (timeFilter !== "all") {
        const txDate = new Date(tx.timestamp);
        const txDateStr = tx.timestamp ? tx.timestamp.split("T")[0] : "";

        if (timeFilter === "today" && txDateStr !== todayStr) return false;
        if (timeFilter === "yesterday" && txDateStr !== yesterdayStr) return false;
        if (timeFilter === "week" && txDate < weekAgoDate) return false;
        if (timeFilter === "month" && txDate < monthAgoDate) return false;
      }

      // 2. Operator filter
      if (operatorFilter !== "ALL") {
        const opName = (tx.operatorName || "").toUpperCase();
        const filterName = operatorFilter.toUpperCase();
        // Allow matching if operator starts with or equals filterName
        if (!opName.includes(filterName) && filterName !== "ALL") {
          // Special case for Gonzalo / Manager
          if (filterName === "MANAGER" && opName.includes("GONZALO")) {
            // matches
          } else if (filterName === "GONZALO" && opName.includes("MANAGER")) {
            // matches
          } else {
            return false;
          }
        }
      }

      // 3. Category filter
      if (categoryFilter !== "all") {
        const cat = getMovementCategory(tx);
        if (cat !== categoryFilter) return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refObj = refMap.get((tx.reference || "").toUpperCase());
        const matchRef = (tx.reference || "").toLowerCase().includes(q);
        const matchDesc = refObj?.description?.toLowerCase().includes(q) || false;
        const matchNotes = (tx.notes || "").toLowerCase().includes(q);
        const matchOp = (tx.operatorName || "").toLowerCase().includes(q);
        const matchType = (tx.movementType || "").toLowerCase().includes(q);
        const matchBarcode = (tx.barcode || "").toLowerCase().includes(q);
        const matchInv = (tx.invoiceNumber || "").toLowerCase().includes(q);

        if (!matchRef && !matchDesc && !matchNotes && !matchOp && !matchType && !matchBarcode && !matchInv) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, categoryFilter, operatorFilter, timeFilter, searchQuery, refMap]);

  // High-level KPI aggregates based on current operator & time filter (ignoring category tab so tabs reflect real volume)
  const stats = useMemo(() => {
    let totalTruckPcs = 0;
    let totalTruckCount = 0;
    let totalPegadasPcs = 0;
    let totalPegadasCount = 0;
    let totalReturnPcs = 0;
    let totalReturnCount = 0;
    let totalDeliveryPcs = 0;
    let totalDeliveryCount = 0;
    let totalProdScrapPcs = 0;
    let totalProdScrapCount = 0;

    // Filter by time & operator for KPIs
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];
    const weekAgoDate = new Date(now);
    weekAgoDate.setDate(weekAgoDate.getDate() - 7);
    const monthAgoDate = new Date(now);
    monthAgoDate.setDate(monthAgoDate.getDate() - 30);

    transactions.forEach(tx => {
      // Time check
      if (timeFilter !== "all") {
        const txDate = new Date(tx.timestamp);
        const txDateStr = tx.timestamp ? tx.timestamp.split("T")[0] : "";
        if (timeFilter === "today" && txDateStr !== todayStr) return;
        if (timeFilter === "yesterday" && txDateStr !== yesterdayStr) return;
        if (timeFilter === "week" && txDate < weekAgoDate) return;
        if (timeFilter === "month" && txDate < monthAgoDate) return;
      }

      // Operator check
      if (operatorFilter !== "ALL") {
        const opName = (tx.operatorName || "").toUpperCase();
        const filterName = operatorFilter.toUpperCase();
        if (!opName.includes(filterName) && filterName !== "ALL") {
          if (filterName === "MANAGER" && opName.includes("GONZALO")) {
            // match
          } else if (filterName === "GONZALO" && opName.includes("MANAGER")) {
            // match
          } else {
            return;
          }
        }
      }

      const cat = getMovementCategory(tx);
      const qty = Math.abs(tx.quantity || 0);

      if (cat === "truck") {
        totalTruckCount++;
        totalTruckPcs += qty;
      } else if (cat === "pegadas") {
        totalPegadasCount++;
        totalPegadasPcs += qty;
      } else if (cat === "return") {
        totalReturnCount++;
        totalReturnPcs += qty;
      } else if (cat === "delivery") {
        totalDeliveryCount++;
        totalDeliveryPcs += qty;
      } else if (cat === "production_scrap") {
        totalProdScrapCount++;
        totalProdScrapPcs += qty;
      }
    });

    const totalMovements = totalTruckCount + totalPegadasCount + totalReturnCount + totalDeliveryCount + totalProdScrapCount;

    return {
      totalMovements,
      totalTruckCount,
      totalTruckPcs,
      totalPegadasCount,
      totalPegadasPcs,
      totalReturnCount,
      totalReturnPcs,
      totalDeliveryCount,
      totalDeliveryPcs,
      totalProdScrapCount,
      totalProdScrapPcs
    };
  }, [transactions, timeFilter, operatorFilter]);

  // Format date helper
  const formatTime = (ts: string) => {
    if (!ts) return "--:--";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (e) {
      return ts;
    }
  };

  const formatDate = (ts: string) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return ts;
    }
  };

  const getRelativeTime = (ts: string) => {
    if (!ts) return "";
    try {
      const diff = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    } catch (e) {
      return "";
    }
  };

  // Style badge helper
  const getBadgeConfig = (category: string, tx: InventoryTransaction) => {
    switch (category) {
      case "truck":
        return {
          badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-300",
          icon: <Truck className="w-4 h-4 text-emerald-600 shrink-0" />,
          label: "NEW TRUCK (STOCK 1 IN)",
          accentColor: "border-l-emerald-500",
          qtyColor: "text-emerald-700",
          prefix: "+"
        };
      case "pegadas":
        return {
          badgeBg: "bg-sky-50 text-sky-700 border-sky-300",
          icon: <ArrowRight className="w-4 h-4 text-sky-600 shrink-0" />,
          label: "PEGADAS TRANSFER (S1 ➔ S2)",
          accentColor: "border-l-sky-500",
          qtyColor: "text-sky-700",
          prefix: "→"
        };
      case "return":
        return {
          badgeBg: "bg-amber-50 text-amber-700 border-amber-300",
          icon: <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />,
          label: "STOCK RETURN (S2 ➔ S1)",
          accentColor: "border-l-amber-500",
          qtyColor: "text-amber-700",
          prefix: "↩"
        };
      case "delivery":
        return {
          badgeBg: "bg-purple-50 text-purple-700 border-purple-300",
          icon: <ArrowUpRight className="w-4 h-4 text-purple-600 shrink-0" />,
          label: "CUSTOMER DISPATCH",
          accentColor: "border-l-purple-500",
          qtyColor: "text-purple-700",
          prefix: "📤"
        };
      case "production_scrap":
        if ((tx.movementType || "").includes("SCRAP")) {
          return {
            badgeBg: "bg-rose-50 text-rose-700 border-rose-300",
            icon: <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />,
            label: "SCRAP / NOK MESH",
            accentColor: "border-l-rose-500",
            qtyColor: "text-rose-700",
            prefix: "✕"
          };
        }
        return {
          badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-300",
          icon: <Factory className="w-4 h-4 text-indigo-600 shrink-0" />,
          label: "DAILY PRODUCTION",
          accentColor: "border-l-indigo-500",
          qtyColor: "text-indigo-700",
          prefix: "⚙"
        };
      default:
        return {
          badgeBg: "bg-slate-100 text-slate-700 border-slate-300",
          icon: <BoxIcon className="w-4 h-4 text-slate-600 shrink-0" />,
          label: tx.movementType || "TRANSACTION",
          accentColor: "border-l-slate-400",
          qtyColor: "text-slate-800",
          prefix: "•"
        };
    }
  };

  // Print shift report
  const handlePrint = () => {
    window.print();
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ["Timestamp", "Date", "Time", "Movement Type", "Stock Flow", "Reference", "Description", "Quantity", "Operator", "Invoice / Barcode", "Notes"];
    const rows = filteredTransactions.map(tx => {
      const ref = refMap.get((tx.reference || "").toUpperCase());
      return [
        `"${tx.timestamp}"`,
        `"${formatDate(tx.timestamp)}"`,
        `"${formatTime(tx.timestamp)}"`,
        `"${tx.movementType || ""}"`,
        `"${tx.stock || ""}"`,
        `"${tx.reference || ""}"`,
        `"${(ref?.description || "").replace(/"/g, '""')}"`,
        tx.quantity || 0,
        `"${tx.operatorName || ""}"`,
        `"${tx.invoiceNumber || tx.barcode || ""}"`,
        `"${(tx.notes || "").replace(/"/g, '""')}"`
      ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Operator_Records_${operatorFilter.replace(/\s+/g, "_")}_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" id="records-workspace-root">
      
      {/* ---------------------------------------------------- */}
      {/* 1. KPI SUMMARY METRICS FOR SELECTED OPERATOR & TIME */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" id="records-kpi-grid">
        {/* KPI 1: New Stock / Truck Intake */}
        <div 
          onClick={() => setCategoryFilter(categoryFilter === "truck" ? "all" : "truck")}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-sm ${
            categoryFilter === "truck" ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10" : "border-slate-200"
          }`}
          id="kpi-card-truck"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <Truck className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">New Truck</span>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 tracking-tight">
            +{stats.totalTruckPcs.toLocaleString()}
          </div>
        </div>

        {/* KPI 2: Pegadas Transfers (S1 -> S2) */}
        <div 
          onClick={() => setCategoryFilter(categoryFilter === "pegadas" ? "all" : "pegadas")}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-sm ${
            categoryFilter === "pegadas" ? "border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/10" : "border-slate-200"
          }`}
          id="kpi-card-pegadas"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
              <ArrowRight className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Pegadas (S1➔S2)</span>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 tracking-tight">
            {stats.totalPegadasPcs.toLocaleString()}
          </div>
        </div>

        {/* KPI 3: Stock Returns (S2 -> S1) */}
        <div 
          onClick={() => setCategoryFilter(categoryFilter === "return" ? "all" : "return")}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-sm ${
            categoryFilter === "return" ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/10" : "border-slate-200"
          }`}
          id="kpi-card-return"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <RotateCcw className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Returns (S2➔S1)</span>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 tracking-tight">
            {stats.totalReturnPcs.toLocaleString()}
          </div>
        </div>

        {/* KPI 4: Total Activity */}
        <div 
          onClick={() => setCategoryFilter("all")}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-sm ${
            categoryFilter === "all" ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/10" : "border-slate-200"
          }`}
          id="kpi-card-total"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Total Movements</span>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 tracking-tight">
            {filteredTransactions.length}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. CONTROLS: SHIFT & VIEW TOGGLES */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Shift Filter Pills */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs font-mono font-bold">
            <span className="text-[11px] text-slate-500 px-1.5 flex items-center gap-1">
              <Shield className="w-3 h-3 text-slate-400" />
              Shift:
            </span>
            {(["ALL", "SHIFT A", "SHIFT B"] as string[]).map(op => (
              <button
                key={op}
                onClick={() => setOperatorFilter(op)}
                id={`records-op-btn-${op.toLowerCase().replace(/\s+/g, "-")}`}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  operatorFilter.toUpperCase() === op
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {op === "ALL" ? "All" : op.replace("SHIFT ", "")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. MAIN RECORDS FEED: TIMELINE OR TABLE */}
      {/* ---------------------------------------------------- */}
      {filteredTransactions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <h3 className="font-display font-bold text-slate-800 text-sm">No Movement Records Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No stock transactions recorded for <span className="font-bold text-slate-600">{operatorFilter}</span> within the <span className="font-bold text-slate-600">{timeFilter}</span> time window.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => { setTimeFilter("all"); setCategoryFilter("all"); setOperatorFilter("ALL"); setSearchQuery(""); }}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Clear All Filters
            </button>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab("operator")}
                className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <BoxIcon className="w-3.5 h-3.5" />
                Go to Operator count
              </button>
            )}
          </div>
        </div>
      ) : viewMode === "timeline" ? (
        /* TIMELINE STREAM VIEW */
        <div className="space-y-3" id="records-timeline-container">
          {filteredTransactions.map((tx, idx) => {
            const cat = getMovementCategory(tx);
            const cfg = getBadgeConfig(cat, tx);
            const refObj = refMap.get((tx.reference || "").toUpperCase());

            return (
              <div
                key={tx.id || idx}
                onClick={() => setSelectedTx(tx)}
                id={`record-card-${tx.id || idx}`}
                className={`bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all cursor-pointer border-l-4 ${cfg.accentColor} group`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  
                  {/* Left: Type Badge, Reference Code, Description & Flow */}
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 group-hover:bg-slate-100 transition-colors shrink-0 mt-0.5">
                      {cfg.icon}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Type Tag */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border ${cfg.badgeBg}`}>
                          {cfg.label}
                        </span>

                        {/* Reference Code */}
                        <span className="font-mono font-black text-sm text-slate-900 group-hover:text-brand-600 transition-colors">
                          {tx.reference || "N/A"}
                        </span>

                        {/* Customer / Material Badge if available */}
                        {refObj?.customer && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono font-bold">
                            {refObj.customer}
                          </span>
                        )}
                        {refObj?.materialType && (
                          <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded text-[10px] font-sans">
                            {refObj.materialType}
                          </span>
                        )}
                      </div>

                      {/* Reference Description or Notes */}
                      <p className="text-xs text-slate-600 font-medium">
                        {refObj?.description || tx.notes || "Master Catalog Component"}
                      </p>

                      {/* Stock Route Visualizer Pill */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-0.5 font-mono">
                        {tx.stock && (
                          <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-600">
                            Flow: {tx.stock}
                          </span>
                        )}

                        {tx.invoiceNumber && (
                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-700">
                            Invoice #{tx.invoiceNumber}
                          </span>
                        )}

                        {tx.barcode && (
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500">
                            Barcode: {tx.barcode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quantity & Timestamps */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 shrink-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xl font-black font-mono tracking-tight ${cfg.qtyColor}`}>
                        {cfg.prefix} {Math.abs(tx.quantity || 0).toLocaleString()}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-slate-500">PCS</span>
                    </div>

                    <div className="text-right flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0.5 mt-0.5">
                      <span className="text-xs font-mono font-bold text-slate-700 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatTime(tx.timestamp)}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-sans">
                        <span>{formatDate(tx.timestamp)}</span>
                        <span>•</span>
                        <span className="font-medium text-slate-500">{getRelativeTime(tx.timestamp)}</span>
                      </div>
                    </div>

                    {/* Operator Stamp */}
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-sm">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                      <span>{tx.operatorName || "Shopfloor Operator"}</span>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DENSE INDUSTRIAL DATA TABLE VIEW */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden" id="records-table-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Time & Date</th>
                  <th className="py-3 px-4">Movement Type</th>
                  <th className="py-3 px-4">Stock Flow</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Invoice / Audit</th>
                  <th className="py-3 px-4 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((tx, idx) => {
                  const cat = getMovementCategory(tx);
                  const cfg = getBadgeConfig(cat, tx);
                  const refObj = refMap.get((tx.reference || "").toUpperCase());

                  return (
                    <tr 
                      key={tx.id || idx}
                      onClick={() => setSelectedTx(tx)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{formatTime(tx.timestamp)}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{formatDate(tx.timestamp)}</div>
                      </td>

                      {/* Movement Type Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${cfg.badgeBg}`}>
                          {cfg.label}
                        </span>
                      </td>

                      {/* Stock Flow */}
                      <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-600">
                        {tx.stock || "Stock Balances"}
                      </td>

                      {/* Reference */}
                      <td className="py-3 px-4 whitespace-nowrap font-black text-slate-900 group-hover:text-brand-600">
                        {tx.reference}
                      </td>

                      {/* Description */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-600 font-sans">
                        {refObj?.description || tx.notes || "—"}
                      </td>

                      {/* Quantity */}
                      <td className={`py-3 px-4 text-right font-black whitespace-nowrap ${cfg.qtyColor}`}>
                        {cfg.prefix} {Math.abs(tx.quantity || 0).toLocaleString()} PCS
                      </td>

                      {/* Operator */}
                      <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-700">
                        {tx.operatorName || "Operator"}
                      </td>

                      {/* Invoice / Audit */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500 font-sans text-[11px]">
                        {tx.invoiceNumber ? (
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            #{tx.invoiceNumber}
                          </span>
                        ) : tx.notes ? (
                          <span>{tx.notes}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedTx(tx); }}
                          className="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 transition-colors"
                          title="Inspect Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. MOVEMENT DETAIL INSPECTION MODAL */}
      {/* ---------------------------------------------------- */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            {(() => {
              const cat = getMovementCategory(selectedTx);
              const cfg = getBadgeConfig(cat, selectedTx);
              const refObj = refMap.get((selectedTx.reference || "").toUpperCase());

              return (
                <>
                  <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-brand-400">
                        {cfg.icon}
                      </div>
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${cfg.badgeBg}`}>
                          {cfg.label}
                        </span>
                        <h3 className="font-mono font-black text-base text-white tracking-wide mt-1">
                          REF: {selectedTx.reference}
                        </h3>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTx(null)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono bg-slate-50/50 flex-1">
                    
                    {/* Quantity & Flow Card */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Quantity Moved</span>
                        <div className={`text-2xl font-black ${cfg.qtyColor} mt-0.5`}>
                          {cfg.prefix} {Math.abs(selectedTx.quantity || 0).toLocaleString()} <span className="text-xs text-slate-500 font-normal">PCS</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Stock Flow Direction</span>
                        <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 inline-block mt-1">
                          {selectedTx.stock || "Standard Movement"}
                        </span>
                      </div>
                    </div>

                    {/* Catalog Details */}
                    {refObj && (
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b border-slate-100 pb-1">
                          Catalog Reference Information
                        </span>
                        <div className="grid grid-cols-2 gap-3 text-slate-800">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Description</span>
                            <span className="font-sans font-bold text-xs">{refObj.description}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Customer</span>
                            <span className="font-bold text-xs">{refObj.customer || "General"}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Material Type</span>
                            <span className="font-bold text-xs">{refObj.materialType || "Mesh"}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Associated Leather</span>
                            <span className="font-bold text-xs">{refObj.associatedLeather || "None"}</span>
                          </div>
                        </div>

                        {/* Current Reference Stock Summary */}
                        <div className="mt-3 pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div className="p-2 bg-slate-50 rounded-lg">
                            <span className="text-slate-400 block">Stock 1 (Raw)</span>
                            <span className="font-bold text-slate-800 text-xs">{refObj.stock1 || 0}</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg">
                            <span className="text-slate-400 block">Stock 2 (WIP)</span>
                            <span className="font-bold text-slate-800 text-xs">{refObj.stock2 || 0}</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg">
                            <span className="text-slate-400 block">Stock 3 (FG)</span>
                            <span className="font-bold text-slate-800 text-xs">{refObj.stock3 || 0}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Transaction Audit Metadata */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b border-slate-100 pb-1">
                        Audit & Verification Metadata
                      </span>
                      <div className="space-y-2 text-slate-700 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-50">
                          <span className="text-slate-400">Timestamp:</span>
                          <span className="font-bold">{formatDate(selectedTx.timestamp)} at {formatTime(selectedTx.timestamp)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-50">
                          <span className="text-slate-400">Logged By:</span>
                          <span className="font-bold text-brand-700">{selectedTx.operatorName || "Shift Operator"}</span>
                        </div>
                        {selectedTx.invoiceNumber && (
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span className="text-slate-400">Invoice Number:</span>
                            <span className="font-bold text-blue-600">#{selectedTx.invoiceNumber}</span>
                          </div>
                        )}
                        {selectedTx.barcode && (
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span className="text-slate-400">Box Barcode:</span>
                            <span className="font-bold">{selectedTx.barcode}</span>
                          </div>
                        )}
                        {selectedTx.notes && (
                          <div className="pt-1">
                            <span className="text-slate-400 block text-[10px]">Operation Notes:</span>
                            <p className="font-sans text-xs text-slate-700 mt-0.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                              {selectedTx.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Modal Footer */}
                  <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {selectedTx.id}
                    </span>
                    <button
                      onClick={() => setSelectedTx(null)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer"
                    >
                      Close Details
                    </button>
                  </div>
                </>
              );
            })()}

          </div>
        </div>
      )}

    </div>
  );
}
