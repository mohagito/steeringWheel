import React, { useState, useMemo } from "react";
import { Box, Adjustment, User } from "../types";
import { motion } from "motion/react";
import { 
  Check, X, FileText, Search, TrendingDown, TrendingUp, Calendar, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, AlertCircle, Activity, Clock
} from "lucide-react";

interface SupervisorWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  currentUser: User;
  onApproveAdjustment: (adjustmentId: string) => Promise<void>;
  onRejectAdjustment: (adjustmentId: string) => Promise<void>;
}

export default function SupervisorWorkspace({
  boxes,
  adjustments,
  currentUser,
  onApproveAdjustment,
  onRejectAdjustment
}: SupervisorWorkspaceProps) {
  const [activeSubTab, setActiveSubTab] = useState<"pending" | "logs" | "reports">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 1. Filtered Adjustments
  const filteredAdjustments = useMemo(() => {
    return adjustments.filter((adj) => {
      const matchesSearch = 
        adj.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adj.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adj.operatorName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || adj.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [adjustments, searchQuery, statusFilter]);

  // 2. Pending Validation List
  const pendingAdjustments = useMemo(() => {
    return adjustments.filter(adj => adj.status === "pending");
  }, [adjustments]);

  // 3. Supervisor Metrics & Analytics
  const reportsData = useMemo(() => {
    // Operator Activity Analysis
    const operatorStats: { [name: string]: { total: number; approved: number; rejected: number; diffSum: number } } = {};
    // Reference Discrepancy Analysis
    const referenceStats: { [ref: string]: { counts: number; totalDiff: number; absoluteDiff: number } } = {};
    // Daily Summary
    const dailyStats: { [date: string]: { counts: number; diffSum: number; correct: number } } = {};

    adjustments.forEach((adj) => {
      // 1. Operator
      const op = adj.operatorName;
      if (!operatorStats[op]) {
        operatorStats[op] = { total: 0, approved: 0, rejected: 0, diffSum: 0 };
      }
      operatorStats[op].total++;
      if (adj.status === "approved") {
        operatorStats[op].approved++;
        operatorStats[op].diffSum += adj.difference;
      } else if (adj.status === "rejected") {
        operatorStats[op].rejected++;
      }

      // 2. Reference
      const ref = adj.reference;
      if (!referenceStats[ref]) {
        referenceStats[ref] = { counts: 0, totalDiff: 0, absoluteDiff: 0 };
      }
      referenceStats[ref].counts++;
      if (adj.status === "approved") {
        referenceStats[ref].totalDiff += adj.difference;
        referenceStats[ref].absoluteDiff += Math.abs(adj.difference);
      }

      // 3. Daily
      const date = adj.timestamp.split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { counts: 0, diffSum: 0, correct: 0 };
      }
      dailyStats[date].counts++;
      if (adj.status === "approved") {
        dailyStats[date].diffSum += adj.difference;
        if (adj.difference === 0) dailyStats[date].correct++;
      }
    });

    const formattedOperators = Object.entries(operatorStats).map(([name, stat]) => ({
      name,
      total: stat.total,
      approved: stat.approved,
      rejected: stat.rejected,
      netDifference: stat.diffSum,
      accuracy: stat.approved > 0 ? Math.round((stat.approved / stat.total) * 100) : 0
    }));

    const formattedReferences = Object.entries(referenceStats).map(([ref, stat]) => ({
      reference: ref,
      counts: stat.counts,
      totalDifference: stat.totalDiff,
      absoluteDifference: stat.absoluteDiff
    })).sort((a, b) => b.absoluteDifference - a.absoluteDifference);

    const formattedDaily = Object.entries(dailyStats).map(([date, stat]) => {
      const dateObj = new Date(date);
      return {
        date,
        label: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        counts: stat.counts,
        netDifference: stat.diffSum,
        accuracy: stat.counts > 0 ? Math.round((stat.correct / stat.counts) * 100) : 100
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    return {
      operators: formattedOperators,
      references: formattedReferences,
      daily: formattedDaily
    };
  }, [adjustments]);

  // Handle Approve/Reject action
  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await onApproveAdjustment(id);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await onRejectAdjustment(id);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6" id="supervisor-workspace-tab">
      
      {/* Header Profile Indicator */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
            SV
          </div>
          <div>
            <h3 className="font-display font-bold text-brand-950 text-base">Supervisor Portal</h3>
            <p className="text-xs text-brand-500">
              Validating counts, analyzing shopfloor discrepancies, and auditing reports.
            </p>
          </div>
        </div>

        {/* Workspace Tab Switcher */}
        <div className="flex bg-brand-50 p-1 rounded-xl border border-brand-100 self-start md:self-auto" id="supervisor-subtab-switcher">
          <button
            onClick={() => setActiveSubTab("pending")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeSubTab === "pending"
                ? "bg-white text-brand-950 shadow-xs"
                : "text-brand-500 hover:text-brand-800"
            }`}
            id="subtab-pending-btn"
          >
            Pending Sign-offs ({pendingAdjustments.length})
          </button>
          <button
            onClick={() => setActiveSubTab("logs")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeSubTab === "logs"
                ? "bg-white text-brand-950 shadow-xs"
                : "text-brand-500 hover:text-brand-800"
            }`}
            id="subtab-logs-btn"
          >
            Audit Trail Logs
          </button>
          <button
            onClick={() => setActiveSubTab("reports")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeSubTab === "reports"
                ? "bg-white text-brand-950 shadow-xs"
                : "text-brand-500 hover:text-brand-800"
            }`}
            id="subtab-reports-btn"
          >
            Performance Reports
          </button>
        </div>
      </div>

      {/* Tab 1: Pending Validations */}
      {activeSubTab === "pending" && (
        <div className="space-y-4" id="pending-validations-view">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-bold text-brand-950 text-sm">Awaiting Carton Verification</h4>
            <span className="text-[10px] text-brand-500 font-mono">
              Total pending reviews: {pendingAdjustments.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="pending-adjustments-grid">
            {pendingAdjustments.map((adj) => {
              const diffColor = adj.difference === 0 
                ? "text-emerald-600 bg-emerald-50 border-emerald-100" 
                : adj.difference > 0 
                  ? "text-blue-600 bg-blue-50 border-blue-100" 
                  : "text-red-500 bg-red-50 border-red-100";
              
              const isProcessing = processingId === adj.id;

              return (
                <motion.div
                  key={adj.id}
                  id={`pending-card-${adj.id}`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-brand-100 p-5 space-y-4 shadow-xs relative overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between pb-3 border-b border-brand-50">
                    <div>
                      <span className="font-mono text-sm font-bold text-brand-950 block">{adj.barcode}</span>
                      <div className="flex flex-wrap gap-1.5 items-center mt-0.5">
                        <span className="text-[10px] text-brand-400 font-mono">Ref: {adj.reference}</span>
                        {adj.materialType && (
                          <span className="text-[9px] font-semibold bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded">
                            {adj.materialType}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${diffColor}`}>
                      {adj.difference > 0 ? `+${adj.difference}` : adj.difference} pcs
                    </span>
                  </div>

                  {/* Card Info Details */}
                  <div className="grid grid-cols-2 gap-3 text-xs bg-brand-50/40 p-3 rounded-xl border border-brand-50">
                    <div>
                      <span className="text-[9px] text-brand-400 uppercase tracking-widest block">System Expected</span>
                      <span className="font-mono font-semibold text-brand-900 block mt-0.5">{adj.expectedQty} pcs</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-brand-400 uppercase tracking-widest block">Physical Count</span>
                      <span className="font-mono font-semibold text-brand-900 block mt-0.5">{adj.actualQty} pcs</span>
                    </div>
                    <div className="col-span-2 pt-1">
                      <span className="text-[9px] text-brand-400 uppercase tracking-widest block">Comments/Reason</span>
                      <p className="text-brand-700 italic block mt-0.5">"{adj.comment}"</p>
                    </div>
                  </div>

                  {/* Operator metadata */}
                  <div className="flex items-center justify-between text-[11px] text-brand-500 pt-1">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400"></span>
                      Op: {adj.operatorName}
                    </span>
                    <span className="flex items-center gap-1 text-brand-400">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(adj.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Validation Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => handleReject(adj.id)}
                      disabled={isProcessing}
                      id={`reject-btn-${adj.id}`}
                      className="py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject Correction
                    </button>
                    <button
                      onClick={() => handleApprove(adj.id)}
                      disabled={isProcessing}
                      id={`approve-btn-${adj.id}`}
                      className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer disabled:opacity-50 shadow-xs shadow-emerald-600/10"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve Stock Update
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {pendingAdjustments.length === 0 && (
              <div className="col-span-2 py-16 bg-white rounded-2xl border border-brand-100 border-dashed flex flex-col items-center justify-center text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                <h4 className="font-display font-semibold text-brand-950">All Clear</h4>
                <p className="text-xs text-brand-500 max-w-sm mt-1">
                  There are currently no pending carton adjustments requiring sign-off.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Audit Logs */}
      {activeSubTab === "logs" && (
        <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs space-y-4" id="audit-logs-view">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-brand-50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-brand-400" />
              <input
                type="text"
                placeholder="Search by carton barcode, reference, operator..."
                value={searchQuery}
                id="logs-search-input"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-xs focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Status:</span>
              <select
                value={statusFilter}
                id="logs-status-filter"
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-brand-50 border border-brand-200 text-xs px-3 py-2 rounded-xl text-brand-900 focus:outline-none focus:border-brand-500 font-medium"
              >
                <option value="all">All Records</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" id="audit-trail-logs-table">
              <thead>
                <tr className="border-b border-brand-100 text-brand-400 font-medium">
                  <th className="py-2.5 font-normal uppercase">Timestamp</th>
                  <th className="py-2.5 font-normal uppercase">Carton ID</th>
                  <th className="py-2.5 font-normal uppercase">Reference</th>
                  <th className="py-2.5 font-normal uppercase">Operator</th>
                  <th className="py-2.5 font-normal uppercase text-right">System expected</th>
                  <th className="py-2.5 font-normal uppercase text-right">Operator count</th>
                  <th className="py-2.5 font-normal uppercase text-right">Discrepancy</th>
                  <th className="py-2.5 font-normal uppercase text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {filteredAdjustments.map((adj) => {
                  const diffColor = adj.difference === 0 
                    ? "text-brand-400" 
                    : adj.difference > 0 
                      ? "text-blue-600 font-semibold" 
                      : "text-red-500 font-semibold";
                  
                  const statusColors = {
                    approved: "bg-emerald-50 text-emerald-700 border-emerald-100",
                    pending: "bg-amber-50 text-amber-700 border-amber-100",
                    rejected: "bg-rose-50 text-rose-700 border-rose-100"
                  };

                  return (
                    <tr key={adj.id} className="hover:bg-brand-50/30">
                      <td className="py-3 font-mono text-brand-500 text-[11px]">
                        {new Date(adj.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 font-mono text-brand-950">{adj.barcode}</td>
                      <td className="py-3 font-mono text-brand-600 flex items-center gap-1.5 flex-wrap">
                        <span>{adj.reference}</span>
                        {adj.materialType && (
                          <span className="text-[9px] font-semibold bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.2 rounded">
                            {adj.materialType}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-brand-700">{adj.operatorName}</td>
                      <td className="py-3 text-right font-mono text-brand-500">{adj.expectedQty}</td>
                      <td className="py-3 text-right font-mono text-brand-900">{adj.actualQty}</td>
                      <td className={`py-3 text-right font-mono ${diffColor}`}>
                        {adj.difference > 0 ? `+${adj.difference}` : adj.difference}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColors[adj.status]}`}>
                          {adj.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filteredAdjustments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-brand-400">
                      No matching trace logs found for the selected filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Reports */}
      {activeSubTab === "reports" && (
        <div className="space-y-6" id="performance-reports-view">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Operator Activity Report */}
            <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs lg:col-span-7 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-brand-600" />
                <div>
                  <h4 className="font-display font-semibold text-brand-950 text-sm">Operator Activity Report</h4>
                  <p className="text-[11px] text-brand-400">Inventory counts throughput and accuracy metrics by staff member</p>
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs" id="operator-activity-table">
                  <thead>
                    <tr className="border-b border-brand-100 text-brand-400 font-medium">
                      <th className="py-2 font-normal uppercase">Operator</th>
                      <th className="py-2 font-normal uppercase text-center">Total Checks</th>
                      <th className="py-2 font-normal uppercase text-center">Approved Checks</th>
                      <th className="py-2 font-normal uppercase text-center">Rejected Checks</th>
                      <th className="py-2 font-normal uppercase text-right">Net Reconciled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-50">
                    {reportsData.operators.map((op) => (
                      <tr key={op.name} className="hover:bg-brand-50/20">
                        <td className="py-3 font-semibold text-brand-950">{op.name}</td>
                        <td className="py-3 text-center font-mono text-brand-600">{op.total}</td>
                        <td className="py-3 text-center font-mono text-emerald-600 font-medium">{op.approved}</td>
                        <td className="py-3 text-center font-mono text-rose-500 font-medium">{op.rejected}</td>
                        <td className={`py-3 text-right font-mono ${op.netDifference === 0 ? "text-brand-500" : op.netDifference > 0 ? "text-blue-600" : "text-red-500"}`}>
                          {op.netDifference > 0 ? `+${op.netDifference}` : op.netDifference} pcs
                        </td>
                      </tr>
                    ))}
                    
                    {reportsData.operators.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-brand-400">No operator trace data logged.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Most Problematic References */}
            <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs lg:col-span-5 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <div>
                  <h4 className="font-display font-semibold text-brand-950 text-sm">Most Problematic References</h4>
                  <p className="text-[11px] text-brand-400">Parts with the highest absolute counted deviation</p>
                </div>
              </div>

              <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[250px] pr-1">
                {reportsData.references.map((item) => (
                  <div key={item.reference} className="flex items-center justify-between p-3 bg-brand-50/30 rounded-xl border border-brand-100">
                    <div>
                      <span className="font-mono text-xs font-bold text-brand-900 block">{item.reference}</span>
                      <span className="text-[10px] text-brand-400 block mt-0.5">Checked {item.counts} times</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-brand-950 block">Abs Dev: {item.absoluteDifference} pcs</span>
                      <span className={`text-[10px] block mt-0.5 font-mono ${item.totalDifference >= 0 ? "text-blue-500" : "text-red-500"}`}>
                        Net: {item.totalDifference > 0 ? `+${item.totalDifference}` : item.totalDifference} pcs
                      </span>
                    </div>
                  </div>
                ))}

                {reportsData.references.length === 0 && (
                  <p className="text-xs text-brand-400 text-center py-8">No references check history found.</p>
                )}
              </div>
            </div>

          </div>

          {/* Daily Summaries timeline list */}
          <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
            <h4 className="font-display font-semibold text-brand-950 text-sm mb-4">Stock Reconciliation Summary Timeline</h4>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {reportsData.daily.map((day) => (
                <div key={day.date} className="p-3.5 bg-brand-50/50 rounded-xl border border-brand-100 text-center space-y-1">
                  <span className="text-[10px] text-brand-400 block font-mono font-medium">{day.label}</span>
                  <span className="text-lg font-bold font-display text-brand-950 block">{day.counts} <span className="text-[10px] font-normal text-brand-500">checks</span></span>
                  <span className={`text-[11px] font-mono font-semibold block ${day.netDifference === 0 ? "text-emerald-600" : day.netDifference > 0 ? "text-blue-600" : "text-red-500"}`}>
                    {day.netDifference > 0 ? `+${day.netDifference}` : day.netDifference} pcs
                  </span>
                  <span className="text-[9px] text-emerald-600 font-semibold bg-white border border-brand-50 px-1.5 py-0.5 rounded-md inline-block mt-1">
                    {day.accuracy}% Acc
                  </span>
                </div>
              ))}

              {reportsData.daily.length === 0 && (
                <div className="col-span-7 py-8 text-center text-brand-400 text-xs">
                  No historical summaries available yet.
                </div>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
