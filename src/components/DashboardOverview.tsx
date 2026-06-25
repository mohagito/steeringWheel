import { useMemo } from "react";
import { Box, Adjustment, ReferenceSummary } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area 
} from "recharts";
import { 
  Package, CheckCircle2, AlertTriangle, RefreshCw, Layers, TrendingUp, HelpCircle 
} from "lucide-react";

interface DashboardOverviewProps {
  boxes: Box[];
  adjustments: Adjustment[];
  onTriggerScan?: () => void;
}

export default function DashboardOverview({ boxes, adjustments, onTriggerScan }: DashboardOverviewProps) {
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
      name: ref.replace("STR-WH-", "") // shorten name for chart
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
    <div className="space-y-6" id="dashboard-overview-tab">
      
      {/* Top Banner & Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-brand-100 shadow-xs">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-950 tracking-tight">EPP NATUR Production Dashboard</h2>
          <p className="text-sm text-brand-600 mt-1">
            Real-time shopfloor inventory statistics for the Steering Wheels assembly department.
          </p>
        </div>
        
        {onTriggerScan && (
          <button
            onClick={onTriggerScan}
            id="dashboard-scan-shortcut-btn"
            className="self-start sm:self-auto inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-98 text-white font-medium shadow-md shadow-brand-600/10 transition-all text-sm cursor-pointer"
          >
            <Package className="w-4 h-4" />
            Scan New Carton
          </button>
        )}
      </div>

      {/* Grid of Key Performance Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="kpi-grid">
        
        {/* KPI 1: Active Cartons */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3.5 bg-brand-50 rounded-xl text-brand-600">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-brand-400 uppercase tracking-wider block">Tracked Cartons</span>
            <span className="text-2xl font-bold text-brand-950 font-display mt-0.5 block">{metrics.totalBoxes}</span>
            <span className="text-[10px] text-brand-500 font-mono block mt-0.5">
              Total system stock: {metrics.totalExpectedParts} pcs
            </span>
          </div>
        </div>

        {/* KPI 2: Inventory Accuracy Rate */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3.5 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-brand-400 uppercase tracking-wider block">Carton Accuracy</span>
            <span className="text-2xl font-bold text-brand-950 font-display mt-0.5 block">{metrics.accuracyRate}%</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
              Target requirement: &gt;98%
            </span>
          </div>
        </div>

        {/* KPI 3: Net Parts Discrepancy */}
        <div className={`bg-white p-5 rounded-2xl border border-brand-100 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow`}>
          <div className={`p-3.5 rounded-xl ${metrics.totalDifferences === 0 ? "bg-brand-50 text-brand-600" : metrics.totalDifferences > 0 ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-brand-400 uppercase tracking-wider block">Net Adjustment</span>
            <span className={`text-2xl font-bold font-display mt-0.5 block ${metrics.totalDifferences === 0 ? "text-brand-950" : metrics.totalDifferences > 0 ? "text-blue-600" : "text-red-500"}`}>
              {metrics.totalDifferences > 0 ? `+${metrics.totalDifferences}` : metrics.totalDifferences} pcs
            </span>
            <span className="text-[10px] text-brand-500 font-mono block mt-0.5">
              Abs deviation: {metrics.absoluteDifferences} pcs
            </span>
          </div>
        </div>

        {/* KPI 4: Pending Supervisor Sign-offs */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className={`p-3.5 rounded-xl ${metrics.pendingCount > 0 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-brand-50 text-brand-400"}`}>
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-brand-400 uppercase tracking-wider block">Pending Validation</span>
            <span className="text-2xl font-bold text-brand-950 font-display mt-0.5 block">{metrics.pendingCount}</span>
            <span className="text-[10px] text-brand-500 block mt-0.5">
              {metrics.pendingCount > 0 ? "Awaiting supervisor validation" : "All checks fully approved"}
            </span>
          </div>
        </div>

      </div>

      {/* Main Charts & Discrepancies Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="charts-layout-grid">
        
        {/* Daily Adjustment Timeline Chart */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs lg:col-span-8 flex flex-col h-[340px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-brand-950 text-base">Weekly Physical Adjustments History</h3>
              <p className="text-xs text-brand-500">Magnitudes of inventory corrections over the last 7 days</p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-brand-50 border border-brand-100 rounded text-brand-600">
              Validated Stock Checks
            </span>
          </div>
          
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartTimelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCounted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#557968" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#557968" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f3" />
                <XAxis dataKey="date" stroke="#789988" fontSize={11} tickLine={false} />
                <YAxis stroke="#789988" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#141f1a", border: "none", borderRadius: "12px" }}
                  labelStyle={{ color: "#a5beb0", fontWeight: "bold" }}
                  itemStyle={{ color: "#ffffff" }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" name="Steering Wheels Counted" dataKey="counted" stroke="#557968" strokeWidth={2} fillOpacity={1} fill="url(#colorCounted)" />
                <Area type="monotone" name="Absolute Deviation (pcs)" dataKey="errorMagnitude" stroke="#d97706" strokeWidth={1.5} fillOpacity={1} fill="url(#colorError)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* References with Highest Discrepancy Chart */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs lg:col-span-4 flex flex-col h-[340px]">
          <div>
            <h3 className="font-display font-semibold text-brand-950 text-base">Reference Accuracy Check</h3>
            <p className="text-xs text-brand-500">Unreconciled physical discrepancies per reference code</p>
          </div>

          <div className="flex-1 flex flex-col justify-between mt-4 min-h-0">
            {referenceData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <HelpCircle className="w-8 h-8 text-brand-200" />
                <p className="text-xs text-brand-400 mt-2">No references registered yet</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={referenceData.slice(0, 5)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f3" />
                    <XAxis dataKey="name" stroke="#789988" fontSize={11} tickLine={false} />
                    <YAxis stroke="#789988" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#141f1a", border: "none", borderRadius: "12px" }}
                      itemStyle={{ color: "#ffffff" }}
                    />
                    <Bar name="Discrepancy (pcs)" dataKey="discrepancy" radius={[4, 4, 0, 0]}>
                      {referenceData.slice(0, 5).map((entry, index) => {
                        const isNegative = entry.discrepancy < 0;
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.discrepancy === 0 ? "#cbdad0" : isNegative ? "#ef4444" : "#3b82f6"} 
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            <div className="text-[10px] text-brand-500 font-mono bg-brand-50/50 p-2.5 rounded-xl border border-brand-100 flex justify-between">
              <span>🔵 Positive: Overages</span>
              <span>🔴 Negative: Deficits</span>
            </div>
          </div>
        </div>

      </div>

      {/* Discrepancy warning board & Recent log */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="discrepancy-board-layout">
        
        {/* Most problematic references */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs md:col-span-5">
          <h3 className="font-display font-semibold text-brand-950 text-base mb-3">Priority Reference Alert</h3>
          <p className="text-xs text-brand-500 mb-4">References with the highest total variance in counts</p>

          <div className="space-y-3" id="problematic-references-list">
            {referenceData.slice(0, 4).map((entry, i) => {
              const accuracyColor = entry.discrepancy === 0 
                ? "text-emerald-600 bg-emerald-50" 
                : entry.discrepancy < 0 
                  ? "text-red-600 bg-red-50" 
                  : "text-blue-600 bg-blue-50";

              return (
                <div key={entry.reference} className="flex items-center justify-between p-3.5 rounded-xl border border-brand-50 bg-brand-50/20">
                  <div>
                    <span className="font-mono text-sm font-semibold text-brand-900">{entry.reference}</span>
                    <p className="text-[11px] text-brand-400 mt-0.5">Total System Stock: {entry.expected} pcs</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold ${accuracyColor}`}>
                    {entry.discrepancy > 0 ? `+${entry.discrepancy}` : entry.discrepancy} pcs
                  </span>
                </div>
              );
            })}
            
            {referenceData.length === 0 && (
              <p className="text-xs text-brand-400 text-center py-6">No discrepancies recorded yet.</p>
            )}
          </div>
        </div>

        {/* Recent stock counts list */}
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs md:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-brand-950 text-base">Recent Stock Counts</h3>
              <p className="text-xs text-brand-500">Real-time trace log of counted cartons</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" id="recent-counts-table">
              <thead>
                <tr className="border-b border-brand-100 text-brand-400 font-medium">
                  <th className="py-2.5 font-normal uppercase">Carton ID</th>
                  <th className="py-2.5 font-normal uppercase">Reference</th>
                  <th className="py-2.5 font-normal uppercase text-right">Expected</th>
                  <th className="py-2.5 font-normal uppercase text-right">Counted</th>
                  <th className="py-2.5 font-normal uppercase text-right">Diff</th>
                  <th className="py-2.5 font-normal uppercase text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {adjustments.slice(0, 5).map((adj) => {
                  const diffColor = adj.difference === 0 
                    ? "text-brand-400" 
                    : adj.difference > 0 
                      ? "text-blue-600 font-semibold" 
                      : "text-red-500 font-semibold";
                  
                  const statusColors = {
                    approved: "bg-emerald-50 text-emerald-700 border-emerald-100",
                    pending: "bg-amber-50 text-amber-700 border-amber-100 animate-pulse",
                    rejected: "bg-rose-50 text-rose-700 border-rose-100"
                  };

                  return (
                    <tr key={adj.id} className="hover:bg-brand-50/40">
                      <td className="py-3 font-mono font-medium text-brand-950">{adj.barcode}</td>
                      <td className="py-3 font-mono text-brand-600">{adj.reference}</td>
                      <td className="py-3 text-right font-mono text-brand-500">{adj.expectedQty}</td>
                      <td className="py-3 text-right font-mono text-brand-800">{adj.actualQty}</td>
                      <td className={`py-3 text-right font-mono ${diffColor}`}>
                        {adj.difference > 0 ? `+${adj.difference}` : adj.difference}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColors[adj.status]}`}>
                          {adj.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {adjustments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-brand-400">
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
