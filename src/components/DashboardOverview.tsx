import { useState, useMemo } from "react";
import { Box, Adjustment, Reference, InventoryTransaction } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area 
} from "recharts";
import { 
  Package, ArrowLeftRight, Truck, CheckCircle2, AlertTriangle, Search, Filter, Warehouse, Factory
} from "lucide-react";

interface DashboardOverviewProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  transactions: InventoryTransaction[];
  onTriggerScan?: () => void;
}

export default function DashboardOverview({ 
  boxes, 
  adjustments, 
  references = [], 
  transactions = [],
  onTriggerScan 
}: DashboardOverviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState<"All" | "Mesh" | "Soft">("All");
  const [stockStatusFilter, setStockStatusFilter] = useState<"All" | "Low Stock" | "Normal">("All");

  // Format today's date prefix for comparison
  const todayStr = useMemo(() => {
    return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  }, []);

  // 1. Calculate General Metrics
  const metrics = useMemo(() => {
    // Total Stock 1 (Warehouse) across all references
    const totalWarehouseStock = references.reduce((sum, r) => sum + (r.stock1 || 0), 0);
    
    // Total Stock 2 (Production) across all references
    const totalProductionStock = references.reduce((sum, r) => sum + (r.stock2 || 0), 0);

    // Today's Transfers (Stock 1 -> Stock 2)
    const todaysTransfers = transactions
      .filter(t => t.timestamp.startsWith(todayStr) && t.movementType === "TRANSFER")
      .reduce((sum, t) => sum + t.quantity, 0);

    // Today's Deliveries (Stock 2 OUT)
    const todaysDeliveries = transactions
      .filter(t => t.timestamp.startsWith(todayStr) && t.movementType === "STOCK 2 OUT")
      .reduce((sum, t) => sum + t.quantity, 0);

    return {
      totalWarehouseStock,
      totalProductionStock,
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
      
      const isLowStock = (ref.stock1 || 0) < 150 || (ref.stock2 || 0) < 50;
      const matchesStockStatus = stockStatusFilter === "All" || 
                                 (stockStatusFilter === "Low Stock" && isLowStock) || 
                                 (stockStatusFilter === "Normal" && !isLowStock);

      return matchesSearch && matchesMaterial && matchesStockStatus;
    });
  }, [references, searchQuery, materialFilter, stockStatusFilter]);

  // Chart 1: Stock 1 vs Stock 2 distribution (all references)
  const chartData = useMemo(() => {
    return references.map(ref => ({
      name: ref.code,
      "Warehouse (Stock 1)": ref.stock1 || 0,
      "Production (Stock 2)": ref.stock2 || 0,
    }));
  }, [references]);

  // Chart 2: Material Flow History (last 7 days transfers vs deliveries)
  const timelineChartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    }).reverse();

    return days.map(day => {
      const dayTransfers = transactions
        .filter(t => t.timestamp.startsWith(day) && t.movementType === "TRANSFER")
        .reduce((sum, t) => sum + t.quantity, 0);

      const dayDeliveries = transactions
        .filter(t => t.timestamp.startsWith(day) && t.movementType === "STOCK 2 OUT")
        .reduce((sum, t) => sum + t.quantity, 0);

      const label = new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return {
        date: label,
        "Transfers": dayTransfers,
        "Deliveries": dayDeliveries,
      };
    });
  }, [transactions]);

  return (
    <div className="space-y-6" id="dashboard-container">
      
      {/* 4 Summary Cards - Industrial Style (Compact, High-Contrast, Hardware Readout Vibe) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-summary-cards">
        
        {/* Card 1: Warehouse Stock */}
        <div className="bg-[#0f172a] border border-slate-800 text-slate-100 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              STOCK 1 : Warehouse Inventory
            </div>
            <div className="text-2xl font-bold tracking-tight text-white mt-1 font-mono">
              {metrics.totalWarehouseStock.toLocaleString()} <span className="text-xs font-sans text-slate-400">PCS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Physical material in storeroom
            </div>
          </div>
          <div className="w-12 h-12 bg-slate-800 flex items-center justify-center rounded-sm text-sky-400 border border-slate-700">
            <Warehouse className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Production Stock */}
        <div className="bg-[#0f172a] border border-slate-800 text-slate-100 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              STOCK 2 : Production Stock
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-400 mt-1 font-mono">
              {metrics.totalProductionStock.toLocaleString()} <span className="text-xs font-sans text-emerald-500">PCS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Circulating on assembly lines
            </div>
          </div>
          <div className="w-12 h-12 bg-slate-800 flex items-center justify-center rounded-sm text-emerald-400 border border-slate-700">
            <Factory className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Today's Transfers */}
        <div className="bg-[#0f172a] border border-slate-800 text-slate-100 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              TODAY'S TRANSFERS (1 → 2)
            </div>
            <div className="text-2xl font-bold tracking-tight text-amber-400 mt-1 font-mono">
              {metrics.todaysTransfers.toLocaleString()} <span className="text-xs font-sans text-amber-500">PCS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Sent from Warehouse to Line
            </div>
          </div>
          <div className="w-12 h-12 bg-slate-800 flex items-center justify-center rounded-sm text-amber-400 border border-slate-700">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Today's Deliveries */}
        <div className="bg-[#0f172a] border border-slate-800 text-slate-100 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              TODAY'S DELIVERIES
            </div>
            <div className="text-2xl font-bold tracking-tight text-rose-400 mt-1 font-mono">
              {metrics.todaysDeliveries.toLocaleString()} <span className="text-xs font-sans text-rose-500">PCS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Dispatched/Shipped today
            </div>
          </div>
          <div className="w-12 h-12 bg-slate-800 flex items-center justify-center rounded-sm text-rose-400 border border-slate-700">
            <Truck className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="dashboard-charts-grid">
        
        {/* Chart 1: Stock levels */}
        <div className="bg-white p-4 border border-slate-200 shadow-sm rounded-sm">
          <div className="mb-4">
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-bold font-mono">
              Stock Levels comparison by reference
            </h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Stock 1 (Warehouse) vs Stock 2 (Production lines)
            </p>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", border: "none", color: "#fff", fontFamily: "monospace", fontSize: "11px" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Bar dataKey="Warehouse (Stock 1)" fill="#475569" radius={[1, 1, 0, 0]} />
                <Bar dataKey="Production (Stock 2)" fill="#10b981" radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Material Flow History */}
        <div className="bg-white p-4 border border-slate-200 shadow-sm rounded-sm">
          <div className="mb-4">
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-bold font-mono">
              Material Flow Timeline
            </h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Total quantity transferred and delivered over the last 7 days
            </p>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTransfers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDeliveries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", border: "none", color: "#fff", fontFamily: "monospace", fontSize: "11px" }}
                />
                <Area type="monotone" dataKey="Transfers" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTransfers)" strokeWidth={2} />
                <Area type="monotone" dataKey="Deliveries" stroke="#ef4444" fillOpacity={1} fill="url(#colorDeliveries)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Main Material Master Inventory Grid (Extremely Compact, Ultra Clean Industrial Table) */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-sm" id="reference-inventory-list">
        
        {/* Table Filters Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-1.5 bg-slate-900 rounded-full"></div>
            <h3 className="text-xs uppercase font-bold tracking-wider text-slate-800 font-mono">
              Mesh Material Master & Real-Time Stocks
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded-sm">
              {filteredReferences.length} of {references.length} refs
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reference or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono w-48 sm:w-60"
              />
            </div>

            {/* Material Filter */}
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value as any)}
              className="px-2 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono cursor-pointer"
            >
              <option value="All">All Materials</option>
              <option value="Mesh">Mesh Only</option>
              <option value="Soft">Soft Only</option>
            </select>

            {/* Stock Status Filter */}
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="px-2 py-1 bg-white border border-slate-300 text-xs rounded-sm focus:outline-none focus:border-slate-800 font-mono cursor-pointer"
            >
              <option value="All">All Stocks</option>
              <option value="Low Stock">Low Stock Alerts</option>
              <option value="Normal">Normal Stocks</option>
            </select>
          </div>
        </div>

        {/* Dense Industrial Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-mono font-bold">
                <th className="py-2.5 px-4">Mesh Reference</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4 text-center">Type</th>
                <th className="py-2.5 px-4 text-right bg-slate-50/50 border-x border-slate-200/80">Stock 1 (Warehouse)</th>
                <th className="py-2.5 px-4 text-right bg-emerald-50/10 border-r border-slate-200/80">Stock 2 (Production)</th>
                <th className="py-2.5 px-4 text-right">Total Inventory</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Last Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredReferences.map((ref) => {
                const s1 = ref.stock1 || 0;
                const s2 = ref.stock2 || 0;
                const total = s1 + s2;
                const isLow = s1 < 150 || s2 < 50;

                return (
                  <tr key={ref.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Reference Code */}
                    <td className="py-2 px-4 font-mono font-bold text-slate-950 select-all">
                      {ref.code}
                    </td>

                    {/* Description */}
                    <td className="py-2 px-4 text-slate-600 truncate max-w-xs sm:max-w-md font-sans">
                      {ref.description}
                    </td>

                    {/* Material Type */}
                    <td className="py-2 px-4 text-center">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-medium ${
                        ref.materialType === "Mesh" 
                          ? "bg-slate-100 text-slate-700" 
                          : "bg-blue-50 text-blue-700 border border-blue-100"
                      }`}>
                        {ref.materialType}
                      </span>
                    </td>

                    {/* Stock 1 Quantity */}
                    <td className="py-2 px-4 text-right bg-slate-50/30 border-x border-slate-100/80 font-mono font-bold">
                      <span className={s1 < 150 ? "text-amber-600" : "text-slate-800"}>
                        {s1.toLocaleString()}
                      </span>
                    </td>

                    {/* Stock 2 Quantity */}
                    <td className="py-2 px-4 text-right bg-emerald-50/5 border-r border-slate-100/80 font-mono font-bold text-emerald-600">
                      <span className={s2 < 50 ? "text-red-500" : "text-emerald-600"}>
                        {s2.toLocaleString()}
                      </span>
                    </td>

                    {/* Total Quantity */}
                    <td className="py-2 px-4 text-right font-mono font-bold text-slate-900">
                      {total.toLocaleString()}
                    </td>

                    {/* Alert / Status */}
                    <td className="py-2 px-4 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          LOW
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          OK
                        </span>
                      )}
                    </td>

                    {/* Last Update Date */}
                    <td className="py-2 px-4 text-right text-[10px] text-slate-400 font-mono">
                      {ref.lastUpdate ? new Date(ref.lastUpdate).toLocaleString() : "N/A"}
                    </td>

                  </tr>
                );
              })}

              {filteredReferences.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-mono text-xs">
                    No references found matching search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
