import { useState, useMemo } from "react";
import { Box, Adjustment, ReferenceSummary, Reference } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area 
} from "recharts";
import { 
  Package, CheckCircle2, AlertTriangle, RefreshCw, Layers, TrendingUp, HelpCircle, Search, Filter
} from "lucide-react";

interface DashboardOverviewProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  onTriggerScan?: () => void;
}

export default function DashboardOverview({ boxes, adjustments, references = [], onTriggerScan }: DashboardOverviewProps) {
  const [refSearchQuery, setRefSearchQuery] = useState("");
  const [refFilterType, setRefFilterType] = useState<"All" | "Mesh" | "Soft">("All");

  // 1. Calculate General Metrics
  const metrics = useMemo(() => {
    const totalBoxes = boxes.length;
    const totalExpectedParts = boxes.reduce((sum, b) => sum + b.expectedQty, 0);
    
    // Approved adjustments
    const approvedAdjustments = adjustments.filter(a => a.status === "approved");
    const pendingAdjustments = adjustments.filter(a => a.status === "pending");
    
    const totalDifferences = approvedAdjustments.reduce((sum, a) => sum + a.difference, 0);
    const absoluteDifferences = approvedAdjustments.reduce((sum, a) => sum + Math.abs(a.difference), 0);
    
    // Accuracy Rate = (Approved Counts with exactly 0 Difference) / (Total Approved Counts)
    const totalApprovedCounts = approvedAdjustments.length;
    const correctApprovedCounts = approvedAdjustments.filter(a => a.difference === 0).length;
    const accuracyRate = totalApprovedCounts > 0 
      ? Math.round((correctApprovedCounts / totalApprovedCounts) * 100) 
      : 100;

    return {
      totalBoxes,
      totalExpectedParts,
      totalDifferences,
      absoluteDifferences,
      pendingCount: pendingAdjustments.length,
      accuracyRate
    };
  }, [boxes, adjustments]);

  // 2. References discrepancy analysis
  const referenceData = useMemo(() => {
    const summaries: { [ref: string]: { expected: number; actual: number; diff: number; counts: number } } = {};
    
    // Compile data from boxes
    boxes.forEach(b => {
      if (!summaries[b.reference]) {
        summaries[b.reference] = { expected: 0, actual: 0, diff: 0, counts: 0 };
      }
      summaries[b.reference].expected += b.expectedQty;
    });

    // Compile approved adjustments to calculate differences
    adjustments.filter(a => a.status === "approved").forEach(a => {
      if (summaries[a.reference]) {
        summaries[a.reference].diff += a.difference;
      }
    });

    return Object.entries(summaries).map(([ref, data]) => ({
      reference: ref,
      discrepancy: data.diff,
      absDiscrepancy: Math.abs(data.diff),
      expected: data.expected,
      name: ref
    })).sort((a, b) => b.absDiscrepancy - a.absDiscrepancy);
  }, [boxes, adjustments]);

  // 3. Time Series Data for charts (Last 7 days of adjustments)
  const chartTimelineData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    }).reverse();

    return last7Days.map(dateStr => {
      const dayAdjustments = adjustments.filter(
        a => a.timestamp.startsWith(dateStr) && a.status === "approved"
      );
      
      const partsCounted = dayAdjustments.reduce((sum, a) => sum + a.actualQty, 0);
      const totalDiff = dayAdjustments.reduce((sum, a) => sum + a.difference, 0);
      const absoluteDiff = dayAdjustments.reduce((sum, a) => sum + Math.abs(a.difference), 0);

      const dateObj = new Date(dateStr);
      const label = dateObj.toLocaleDateString("en-US", { weekday: 'short', month: 'numeric', day: 'numeric' });

      return {
        date: label,
        counted: partsCounted,
        difference: totalDiff,
        errorMagnitude: absoluteDiff
      };
    });
  }, [adjustments]);

  // Color constants
  const COLORS = ["#557968", "#789988", "#a5beb0", "#cbdad0", "#416051"];

  return (
    <div className="space-y-4" id="dashboard-overview-tab">
      


      {/* Grid of Key Performance Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="kpi-grid">
        
        {/* KPI 1: Active Cartons */}
        <div className="bg-[#0f1e36] p-4 rounded-sm border border-[#1e293b] flex items-center gap-4">
          <div className="p-3 bg-[#0a1322] border border-[#1e293b] rounded-sm text-brand-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Cartons</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{metrics.totalBoxes}</span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {metrics.totalExpectedParts} expected parts
            </span>
          </div>
        </div>

        {/* KPI 2: Inventory Accuracy Rate */}
        <div className="bg-[#0f1e36] p-4 rounded-sm border border-[#1e293b] flex items-center gap-4">
          <div className="p-3 bg-[#0c2e21] border border-emerald-900 rounded-sm text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Count Accuracy</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 block">{metrics.accuracyRate}%</span>
          </div>
        </div>

        {/* KPI 3: Net Parts Discrepancy */}
        <div className="bg-[#0f1e36] p-4 rounded-sm border border-[#1e293b] flex items-center gap-4">
          <div className={`p-3 border rounded-sm ${metrics.totalDifferences === 0 ? "bg-[#0a1322] border-[#1e293b] text-slate-400" : metrics.totalDifferences > 0 ? "bg-[#092642] border-blue-900 text-blue-400" : "bg-[#2d1110] border-red-900 text-red-400"}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Adjustment</span>
            <span className={`text-xl font-bold mt-0.5 block ${metrics.totalDifferences === 0 ? "text-white" : metrics.totalDifferences > 0 ? "text-blue-400" : "text-red-400"}`}>
              {metrics.totalDifferences > 0 ? `+${metrics.totalDifferences}` : metrics.totalDifferences} pcs
            </span>
          </div>
        </div>

        {/* KPI 4: Pending Supervisor Sign-offs */}
        <div className="bg-[#0f1e36] p-4 rounded-sm border border-[#1e293b] flex items-center gap-4">
          <div className={`p-3 border rounded-sm ${metrics.pendingCount > 0 ? "bg-[#2d210c] border-amber-900 text-amber-400" : "bg-[#0a1322] border-[#1e293b] text-slate-500"}`}>
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Actions</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{metrics.pendingCount}</span>
          </div>
        </div>

      </div>

      {/* 17 Predefined References Master Stock Board */}
      <div className="bg-white p-4 rounded-sm border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">MASTER STOCK BOARD (17 PREDEFINED REFERENCES)</h3>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search code/desc..."
                value={refSearchQuery}
                onChange={(e) => setRefSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-sm text-xs font-mono focus:outline-none focus:border-brand-500 focus:bg-white w-full sm:w-48"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex bg-slate-100 p-0.5 rounded-sm shrink-0">
              {(["All", "Mesh", "Soft"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setRefFilterType(type)}
                  className={`px-2.5 py-0.5 text-[10px] font-bold rounded-none uppercase tracking-wider transition-colors cursor-pointer ${
                    refFilterType === type
                      ? "bg-slate-700 text-white font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* References Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-none">
          <table className="w-full text-left text-xs industrial-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Reference Code</th>
                <th className="py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Description</th>
                <th className="py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Material Type</th>
                <th className="py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Leather Companion</th>
                <th className="py-2 px-3 font-bold uppercase tracking-wider text-[10px] text-right">Current Stock</th>
                <th className="py-2 px-3 font-bold uppercase tracking-wider text-[10px] text-right">Last Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {references
                .filter((ref) => {
                  // Type filter
                  if (refFilterType !== "All" && ref.materialType !== refFilterType) return false;
                  // Search query
                  const q = refSearchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return ref.code.toLowerCase().includes(q) || ref.description.toLowerCase().includes(q);
                })
                .map((ref) => {
                  const dateObj = new Date(ref.lastUpdate);
                  const formattedTime = isNaN(dateObj.getTime()) 
                    ? "Never" 
                    : dateObj.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      });

                  return (
                    <tr key={ref.code} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{ref.code}</td>
                      <td className="py-2 px-3 font-normal text-slate-600">{ref.description}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded-none text-[9px] font-bold uppercase tracking-wider border ${
                          ref.materialType === "Mesh" 
                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                            : "bg-teal-50 text-teal-700 border-teal-200"
                        }`}>
                          {ref.materialType}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500">{ref.associatedLeather}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {ref.currentStock === 0 ? (
                          <span className="text-slate-400">0 pcs</span>
                        ) : (
                          <span className="text-brand-600 font-extrabold">{ref.currentStock} pcs</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono">{formattedTime}</td>
                    </tr>
                  );
                })}

              {references.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No predefined references found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Charts & Discrepancies Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" id="charts-layout-grid">
        
        {/* Daily Adjustment Timeline Chart */}
        <div className="bg-white p-4 rounded-sm border border-slate-200 lg:col-span-8 flex flex-col h-[320px]">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Operator Count Activity Log</h3>
            </div>
            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600">
              STOCK HISTORY
            </span>
          </div>
          
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartTimelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCounted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f1e36", border: "1px solid #1e293b", borderRadius: "2px" }}
                  labelStyle={{ color: "#ffffff", fontWeight: "bold", fontSize: "11px" }}
                  itemStyle={{ color: "#94a3b8", fontSize: "11px" }}
                />
                <Legend iconType="square" wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" name="Steering Wheels Counted" dataKey="counted" stroke="#2563eb" strokeWidth={1.5} fillOpacity={1} fill="url(#colorCounted)" />
                <Area type="monotone" name="Absolute Deviation (pcs)" dataKey="errorMagnitude" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={1} fill="url(#colorError)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* References with Highest Discrepancy Chart */}
        <div className="bg-white p-4 rounded-sm border border-slate-200 lg:col-span-4 flex flex-col h-[320px]">
          <div className="border-b border-slate-100 pb-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Inventory Deviation Check</h3>
          </div>

          <div className="flex-1 flex flex-col justify-between min-h-0">
            {referenceData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <HelpCircle className="w-8 h-8 text-slate-300" />
                <p className="text-xs text-slate-400 mt-2">No references registered yet</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={referenceData.slice(0, 5)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0f1e36", border: "1px solid #1e293b", borderRadius: "2px" }}
                      itemStyle={{ color: "#ffffff", fontSize: "11px" }}
                    />
                    <Bar name="Discrepancy (pcs)" dataKey="discrepancy" fill="#2563eb">
                      {referenceData.slice(0, 5).map((entry, index) => {
                        const isNegative = entry.discrepancy < 0;
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.discrepancy === 0 ? "#cbd5e1" : isNegative ? "#ef4444" : "#2563eb"} 
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            <div className="text-[10px] text-slate-500 font-mono bg-slate-50 p-2 border border-slate-100 flex justify-between rounded-none mt-2">
              <span>🔵 Positive: Overages</span>
              <span>🔴 Negative: Deficits</span>
            </div>
          </div>
        </div>

      </div>

      {/* Discrepancy warning board & Recent log */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4" id="discrepancy-board-layout">
        
        {/* Most problematic references */}
        <div className="bg-white p-4 rounded-sm border border-slate-200 md:col-span-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 border-b border-slate-100 pb-2">Active Deviation Warnings</h3>

          <div className="space-y-2" id="problematic-references-list">
            {referenceData.slice(0, 4).map((entry, i) => {
              const accuracyColor = entry.discrepancy === 0 
                ? "text-slate-600 bg-slate-50 border-slate-200" 
                : entry.discrepancy < 0 
                  ? "text-red-600 bg-red-50 border-red-200" 
                  : "text-blue-600 bg-blue-50 border-blue-200";

              return (
                <div key={entry.reference} className="flex items-center justify-between p-2.5 rounded-none border border-slate-100 bg-slate-50">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-900">{entry.reference}</span>
                    <p className="text-[10px] text-slate-400">Target Inventory: {entry.expected} pcs</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-none border text-xs font-mono font-bold ${accuracyColor}`}>
                    {entry.discrepancy > 0 ? `+${entry.discrepancy}` : entry.discrepancy} pcs
                  </span>
                </div>
              );
            })}
            
            {referenceData.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No discrepancies recorded yet.</p>
            )}
          </div>
        </div>

        {/* Recent stock counts list */}
        <div className="bg-white p-4 rounded-sm border border-slate-200 md:col-span-7">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Recent Shopfloor Counts</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs industrial-table" id="recent-counts-table">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2 px-2 font-bold uppercase text-[10px]">Carton ID</th>
                  <th className="py-2 px-2 font-bold uppercase text-[10px]">Reference</th>
                  <th className="py-2 px-2 font-bold uppercase text-[10px] text-right">Target</th>
                  <th className="py-2 px-2 font-bold uppercase text-[10px] text-right">Actual</th>
                  <th className="py-2 px-2 font-bold uppercase text-[10px] text-right">Diff</th>
                  <th className="py-2 px-2 font-bold uppercase text-[10px] text-right">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {adjustments.slice(0, 5).map((adj) => {
                  const diffColor = adj.difference === 0 
                    ? "text-slate-400" 
                    : adj.difference > 0 
                      ? "text-blue-600 font-bold" 
                      : "text-red-500 font-bold";
                  
                  const statusColors = {
                    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    pending: "bg-amber-50 text-amber-700 border-amber-200",
                    rejected: "bg-red-50 text-red-700 border-red-200"
                  };

                  return (
                    <tr key={adj.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono text-slate-900">{adj.barcode}</td>
                      <td className="py-2 px-2 font-mono text-slate-600">{adj.reference}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-500">{adj.expectedQty}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-800">{adj.actualQty}</td>
                      <td className={`py-2 px-2 text-right font-mono ${diffColor}`}>
                        {adj.difference > 0 ? `+${adj.difference}` : adj.difference}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`inline-block px-1.5 py-0.5 rounded-none text-[9px] font-bold border uppercase ${statusColors[adj.status]}`}>
                          {adj.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {adjustments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No stock checks recorded yet. Scan a carton to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
