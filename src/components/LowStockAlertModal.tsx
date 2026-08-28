import React, { useState, useMemo } from "react";
import { Reference } from "../types";
import { AlertTriangle, Search, X, Download, ShieldAlert, Layers } from "lucide-react";

interface LowStockAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  references: Reference[];
}

export function LowStockAlertModal({ isOpen, onClose, references }: LowStockAlertModalProps) {
  const [search, setSearch] = useState("");

  // Strictly filter references where TOTAL STOCK (Stock 1 + Stock 2 + Stock 3) < 100
  const lowStockList = useMemo(() => {
    return references
      .filter((r) => {
        const s1 = r.stock1 || 0;
        const s2 = r.stock2 || 0;
        const s3 = r.stock3 || 0;
        const total = s1 + s2 + s3;
        return total < 100;
      })
      .sort((a, b) => {
        const totalA = (a.stock1 || 0) + (a.stock2 || 0) + (a.stock3 || 0);
        const totalB = (b.stock1 || 0) + (b.stock2 || 0) + (b.stock3 || 0);
        return totalA - totalB; // Lowest stock first
      });
  }, [references]);

  const filteredList = useMemo(() => {
    if (!search.trim()) return lowStockList;
    const q = search.toLowerCase();
    return lowStockList.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.customer && r.customer.toLowerCase().includes(q))
    );
  }, [lowStockList, search]);

  if (!isOpen) return null;

  const handleExportCSV = () => {
    if (lowStockList.length === 0) return;
    const headers = [
      "Reference Code",
      "Customer",
      "Description",
      "Material Type",
      "Stock 1 (Warehouse)",
      "Stock 2 (Production WIP)",
      "Stock 3 (Finished Goods)",
      "TOTAL STOCK",
      "Status",
      "Last Update"
    ];

    const rows = lowStockList.map((r) => {
      const s1 = r.stock1 || 0;
      const s2 = r.stock2 || 0;
      const s3 = r.stock3 || 0;
      const total = s1 + s2 + s3;
      return [
        r.code,
        `"${(r.customer || "").replace(/"/g, '""')}"`,
        `"${(r.description || "").replace(/"/g, '""')}"`,
        r.materialType || "Mesh",
        s1.toString(),
        s2.toString(),
        s3.toString(),
        total.toString(),
        "LOW STOCK (< 100 PCS)",
        r.lastUpdate ? new Date(r.lastUpdate).toLocaleString() : "N/A"
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `LOW_STOCK_ALERTS_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div 
        id="low-stock-alert-modal-container"
        className="bg-white border border-rose-200 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-rose-50 via-white to-amber-50/50 border-b border-rose-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-500/20 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight font-display">
                  Stock Low-Level Alerts
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-rose-100 text-rose-800 border border-rose-200">
                  {lowStockList.length} {lowStockList.length === 1 ? "Reference" : "References"} Below 100 PCS
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative real-time alert trigger: Total Stock (Stock 1 + Stock 2 + Stock 3) &lt; 100 PCS
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-800 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close Alert Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search low-stock reference, customer, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={lowStockList.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs font-mono"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Alerts List Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {lowStockList.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
                <ShieldAlert className="w-6 h-6 text-emerald-600" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">All Stock Levels Healthy</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No references are currently below the 100 PCS safety threshold. Real-time monitoring is active.
              </p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              No low-stock references match "{search}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 text-[11px] uppercase font-mono font-bold tracking-wider">
                    <th className="py-3 px-3">Reference</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Description</th>
                    <th className="py-3 px-3 text-right">Stock 1</th>
                    <th className="py-3 px-3 text-right">Stock 2</th>
                    <th className="py-3 px-3 text-right">Stock 3</th>
                    <th className="py-3 px-3 text-right font-black text-rose-900">TOTAL</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredList.map((ref) => {
                    const s1 = ref.stock1 || 0;
                    const s2 = ref.stock2 || 0;
                    const s3 = ref.stock3 || 0;
                    const total = s1 + s2 + s3;

                    return (
                      <tr 
                        key={ref.id} 
                        className="hover:bg-rose-50/40 transition-colors"
                        id={`low-stock-alert-row-${ref.code}`}
                      >
                        <td className="py-3 px-3 font-mono font-extrabold text-slate-900">
                          {ref.code}
                        </td>
                        <td className="py-3 px-3">
                          {ref.customer ? (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-800 text-[10px] font-bold rounded uppercase font-mono border border-purple-200">
                              {ref.customer}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 truncate max-w-xs" title={ref.description}>
                          {ref.description}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-blue-600">
                          {s1.toLocaleString()} <span className="text-[10px] text-slate-400">PCS</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-600">
                          {s2.toLocaleString()} <span className="text-[10px] text-slate-400">PCS</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                          {s3.toLocaleString()} <span className="text-[10px] text-slate-400">PCS</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-rose-600 text-sm">
                          {total.toLocaleString()} <span className="text-[10px] text-rose-500 font-bold">PCS</span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 font-mono uppercase shadow-2xs">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            LOW STOCK
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="font-mono text-[11px]">
            Safety Threshold: &lt; 100 PCS Total Across All 3 Stock Tiers
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
