import React, { useState } from "react";
import { Search, Cpu, Send, RotateCcw, Trash2, ArrowUpDown } from "lucide-react";
import { BezelReference } from "../../types";
import { BezelActiveModal } from "./BezelActionButtons";

interface BezelStockTableProps {
  references: BezelReference[];
  onOpenModal: (modal: BezelActiveModal, referenceCode?: string) => void;
}

export default function BezelStockTable({
  references,
  onOpenModal,
}: BezelStockTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"code" | "description" | "client" | "stock1" | "stock2" | "totalStock">("code");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = references.filter(
    (r) =>
      r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.client && r.client.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortField === "code" || sortField === "description" || sortField === "client") {
      const valA = (a[sortField] || "").toString();
      const valB = (b[sortField] || "").toString();
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const valA = (a as any)[sortField] || 0;
    const valB = (b as any)[sortField] || 0;
    return sortAsc ? valA - valB : valB - valA;
  });

  const toggleSort = (field: "code" | "description" | "client" | "stock1" | "stock2" | "totalStock") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* Table Header & Search */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Bezel Stock Inventory
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-semibold font-mono">
            {sorted.length} of {references.length}
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reference, description, client..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <th
                onClick={() => toggleSort("code")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Reference</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("description")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none hidden sm:table-cell"
              >
                <div className="flex items-center gap-1">
                  <span>Description</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("client")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Client</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("stock1")}
                className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none"
              >
                <div className="flex items-center justify-end gap-1 text-amber-900">
                  <span>Stock 1 (Raw)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("stock2")}
                className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none"
              >
                <div className="flex items-center justify-end gap-1 text-emerald-900">
                  <span>Stock 2 (Ready)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("totalStock")}
                className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Total</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 text-center">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-400">
                  {references.length === 0
                    ? "No Bezel references registered yet."
                    : "No matching references found."}
                </td>
              </tr>
            ) : (
              sorted.map((ref) => {
                const total = (ref.stock1 || 0) + (ref.stock2 || 0);
                return (
                  <tr
                    key={ref.code}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{ref.code}</span>
                      </div>
                      <div className="sm:hidden text-[10px] font-normal text-slate-500 truncate max-w-[140px]">
                        {ref.description}
                      </div>
                    </td>

                    <td className="py-3 px-4 hidden sm:table-cell text-slate-600 max-w-xs truncate">
                      {ref.description}
                    </td>

                    <td className="py-3 px-4">
                      {ref.client ? (
                        <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                          {ref.client}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-900">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200">
                        {ref.stock1 || 0}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-900">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
                        {ref.stock2 || 0}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                      {total}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Quick Assemblage */}
                        <button
                          onClick={() => onOpenModal("assemblage", ref.code)}
                          disabled={(ref.stock1 || 0) <= 0}
                          className="p-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Assemble (Stock 1 → Stock 2)"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                        </button>

                        {/* Quick Delivery */}
                        <button
                          onClick={() => onOpenModal("delivery", ref.code)}
                          disabled={(ref.stock2 || 0) <= 0}
                          className="p-1.5 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Deliver (Stock 2 → OUT)"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>

                        {/* Quick Return */}
                        <button
                          onClick={() => onOpenModal("return", ref.code)}
                          disabled={(ref.stock2 || 0) <= 0}
                          className="p-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Return (Stock 2 → Stock 1)"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        {/* Quick Scrap */}
                        <button
                          onClick={() => onOpenModal("scrap", ref.code)}
                          disabled={total <= 0}
                          className="p-1.5 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Scrap / NOK"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
