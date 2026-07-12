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
  const [activeSubTab, setActiveSubTab] = useState<"pending" | "logs" | "reports">("logs");
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
    <div className="space-y-4" id="supervisor-workspace-tab">
      
      {/* Header Profile Indicator */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-none border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-none bg-[#0f1e36] text-white flex items-center justify-center font-mono font-bold border border-[#1e293b]">
            SV
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 block tracking-widest">STATION CONTROL</span>
            <h3 className="font-mono font-black text-slate-900 text-sm uppercase">Supervisor Workstation</h3>
          </div>
        </div>

        {/* Workspace Tab Switcher - Now with Pending Reviews Tab! */}
        <div className="flex bg-slate-100 p-0.5 border border-slate-200 rounded-none self-start md:self-auto font-mono" id="supervisor-subtab-switcher">
          <button
            onClick={() => setActiveSubTab("pending")}
            className={`px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "pending"
                ? "bg-[#0f1e36] text-white border border-[#1e293b]"
                : "text-slate-600 hover:text-slate-900"
            }`}
            id="subtab-pending-btn"
          >
            <span>PENDING SIGN-OFF</span>
            {pendingAdjustments.length > 0 && (
              <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-bold">
                {pendingAdjustments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab("logs")}
            className={`px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer ${
              activeSubTab === "logs"
                ? "bg-[#0f1e36] text-white border border-[#1e293b]"
                : "text-slate-600 hover:text-slate-900"
            }`}
            id="subtab-logs-btn"
          >
            AUDIT TRAILS
          </button>
          <button
            onClick={() => setActiveSubTab("reports")}
            className={`px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer ${
              activeSubTab === "reports"
                ? "bg-[#0f1e36] text-white border border-[#1e293b]"
                : "text-slate-600 hover:text-slate-900"
            }`}
            id="subtab-reports-btn"
          >
            METRICS
          </button>
        </div>
      </div>

      {/* Tab 1: Pending Validations */}
      {activeSubTab === "pending" && (
        <div className="space-y-3 font-mono" id="pending-validations-view">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Awaiting Carton Verification</h4>
            <span className="text-[10px] text-slate-500 font-mono font-bold">
              PENDING JOBS: {pendingAdjustments.length}
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
                <div
                  key={adj.id}
                  id={`pending-card-${adj.id}`}
                  className="bg-white rounded-none border border-slate-200 p-4 space-y-3 shadow-2xs relative"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between pb-2 border-b border-slate-100">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{adj.barcode}</span>
                      <div className="flex flex-wrap gap-1.5 items-center mt-0.5">
                        <span className="text-[9px] text-slate-400 font-bold">REF: {adj.reference}</span>
                        {adj.materialType && (
                          <span className="text-[8px] font-bold bg-slate-100 text-slate-700 border border-slate-300 px-1 py-0.2 uppercase">
                            {adj.materialType}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-none text-xs font-bold border ${diffColor}`}>
                      {adj.difference > 0 ? `+${adj.difference}` : adj.difference} PCS
                    </span>
                  </div>

                  {/* Card Info Details */}
                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-2.5 border border-slate-200 font-mono">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">System Expected</span>
                      <span className="font-bold text-slate-900 block mt-0.5">{adj.expectedQty} pcs</span>
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
                  <div className="grid grid-cols-2 gap-2 pt-1.5">
                    <button
                      onClick={() => handleReject(adj.id)}
                      disabled={isProcessing}
                      id={`reject-btn-${adj.id}`}
                      className="py-2 rounded-none border border-red-300 text-red-700 hover:bg-rose-50 hover:border-red-400 font-bold text-[10px] uppercase transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject Correction
                    </button>
                    <button
                      onClick={() => handleApprove(adj.id)}
                      disabled={isProcessing}
                      id={`approve-btn-${adj.id}`}
                      className="py-2 rounded-none bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-bold text-[10px] uppercase transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve Stock
                    </button>
                  </div>
                </div>
              );
            })}

            {pendingAdjustments.length === 0 && (
              <div className="col-span-2 py-12 bg-white rounded-none border border-slate-200 border-dashed flex flex-col items-center justify-center text-center font-mono">
                <CheckCircle className="w-8 h-8 text-emerald-600 mb-2" />
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">ALL CLEAR</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 font-sans font-medium">
                  There are currently no pending carton adjustments requiring sign-off.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Audit Logs */}
      {activeSubTab === "logs" && (
        <div className="bg-white p-4 rounded-none border border-slate-200 shadow-2xs space-y-4" id="audit-logs-view">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search logs (barcode, reference, operator)..."
                value={searchQuery}
                id="logs-search-input"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-none text-xs focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 font-mono">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">STATUS FILTER:</span>
              <select
                value={statusFilter}
                id="logs-status-filter"
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs px-2.5 py-1.5 rounded-none text-slate-900 focus:outline-none focus:border-blue-600 font-bold"
              >
                <option value="all">ALL RECORDS</option>
                <option value="approved">APPROVED</option>
                <option value="pending">PENDING</option>
                <option value="rejected">REJECTED</option>
              </select>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs industrial-table" id="audit-trail-logs-table">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-mono font-bold bg-slate-50">
                  <th className="py-2 px-2 uppercase">Timestamp</th>
                  <th className="py-2 px-2 uppercase">Carton ID</th>
                  <th className="py-2 px-2 uppercase">Reference</th>
                  <th className="py-2 px-2 uppercase">Operator</th>
                  <th className="py-2 px-2 uppercase text-right">Expected</th>
                  <th className="py-2 px-2 uppercase text-right">Physical</th>
                  <th className="py-2 px-2 uppercase text-right">Variance</th>
                  <th className="py-2 px-2 uppercase text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                {filteredAdjustments.map((adj) => {
                  const diffColor = adj.difference === 0 
                    ? "text-slate-500" 
                    : adj.difference > 0 
                      ? "text-blue-600 font-bold" 
                      : "text-red-600 font-bold";
                  
                  const statusColors = {
                    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    pending: "bg-amber-50 text-amber-700 border-amber-200",
                    rejected: "bg-red-50 text-red-700 border-red-200"
                  };

                  return (
                    <tr key={adj.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="py-2 px-2 text-slate-500 text-[10px]">
                        {new Date(adj.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-2 px-2 font-bold text-slate-900">{adj.barcode}</td>
                      <td className="py-2 px-2 text-slate-600 flex items-center gap-1.5 flex-wrap">
                        <span>{adj.reference}</span>
                        {adj.materialType && (
                          <span className="text-[8px] font-bold bg-slate-100 text-slate-700 border border-slate-300 px-1 py-0.2 uppercase">
                            {adj.materialType}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-slate-700 font-sans font-medium">{adj.operatorName}</td>
                      <td className="py-2 px-2 text-right text-slate-500">{adj.expectedQty}</td>
                      <td className="py-2 px-2 text-right text-slate-950 font-bold">{adj.actualQty}</td>
                      <td className={`py-2 px-2 text-right font-bold ${diffColor}`}>
                        {adj.difference > 0 ? `+${adj.difference}` : adj.difference}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded-none text-[9px] font-bold border uppercase ${statusColors[adj.status]}`}>
                          {adj.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filteredAdjustments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
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
        <div className="space-y-4" id="performance-reports-view">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Operator Activity Report */}
            <div className="bg-white p-4 rounded-none border border-slate-200 shadow-2xs lg:col-span-7 flex flex-col">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                <Activity className="w-4 h-4 text-slate-600" />
                <div>
                  <h4 className="font-mono font-bold text-slate-800 text-xs uppercase">Operator throughput summary</h4>
                </div>
              </div>

              <div className="overflow-x-auto flex-1 font-mono">
                <table className="w-full text-left text-xs text-slate-800" id="operator-activity-table">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50">
                      <th className="py-1.5 px-2">Operator</th>
                      <th className="py-1.5 px-2 text-center">Total Checks</th>
                      <th className="py-1.5 px-2 text-center">Approved</th>
                      <th className="py-1.5 px-2 text-center">Rejected</th>
                      <th className="py-1.5 px-2 text-right">Net Reconciled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportsData.operators.map((op) => (
                      <tr key={op.name} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-sans font-bold text-slate-900">{op.name}</td>
                        <td className="py-2 px-2 text-center text-slate-600">{op.total}</td>
                        <td className="py-2 px-2 text-center text-emerald-600 font-bold">{op.approved}</td>
                        <td className="py-2 px-2 text-center text-red-500 font-bold">{op.rejected}</td>
                        <td className={`py-2 px-2 text-right font-bold ${op.netDifference === 0 ? "text-slate-500" : op.netDifference > 0 ? "text-blue-600" : "text-red-500"}`}>
                          {op.netDifference > 0 ? `+${op.netDifference}` : op.netDifference} PCS
                        </td>
                      </tr>
                    ))}
                    
                    {reportsData.operators.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">No operator trace data logged.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Most Problematic References */}
            <div className="bg-white p-4 rounded-none border border-slate-200 shadow-2xs lg:col-span-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <div>
                  <h4 className="font-mono font-bold text-slate-800 text-xs uppercase">Reference Deviations</h4>
                </div>
              </div>

              <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[200px] pr-1 font-mono">
                {reportsData.references.map((item) => (
                  <div key={item.reference} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-none text-xs">
                    <div>
                      <span className="font-bold text-slate-900 block">{item.reference}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Checked {item.counts} times</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-900 block">Abs Dev: {item.absoluteDifference} pcs</span>
                      <span className={`text-[9px] block mt-0.5 font-bold ${item.totalDifference >= 0 ? "text-blue-500" : "text-red-500"}`}>
                        Net: {item.totalDifference > 0 ? `+${item.totalDifference}` : item.totalDifference} pcs
                      </span>
                    </div>
                  </div>
                ))}

                {reportsData.references.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-8 font-sans">No references check history found.</p>
                )}
              </div>
            </div>

          </div>

          {/* Daily Summaries timeline list */}
          <div className="bg-white p-4 rounded-none border border-slate-200 shadow-2xs">
            <h4 className="font-mono font-bold text-slate-800 text-xs uppercase mb-3 border-b border-slate-100 pb-2">Stock Reconciliation History Timeline</h4>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {reportsData.daily.map((day) => (
                <div key={day.date} className="p-2.5 bg-slate-50 border border-slate-200 text-center font-mono space-y-1 rounded-none">
                  <span className="text-[9px] text-slate-400 block font-bold">{day.label}</span>
                  <span className="text-sm font-bold text-slate-900 block">{day.counts} <span className="text-[9px] font-normal text-slate-500">checks</span></span>
                  <span className={`text-[10px] font-bold block ${day.netDifference === 0 ? "text-emerald-600" : day.netDifference > 0 ? "text-blue-600" : "text-red-500"}`}>
                    {day.netDifference > 0 ? `+${day.netDifference}` : day.netDifference} pcs
                  </span>
                  <span className="text-[8px] text-emerald-700 font-bold bg-white border border-slate-200 px-1 py-0.2 inline-block">
                    {day.accuracy}% Acc
                  </span>
                </div>
              ))}

              {reportsData.daily.length === 0 && (
                <div className="col-span-7 py-8 text-center text-slate-400 text-xs font-sans">
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
