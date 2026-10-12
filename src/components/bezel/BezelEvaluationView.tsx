import React, { useState, useMemo } from "react";
import { 
  Euro, 
  TrendingUp, 
  Download, 
  Warehouse, 
  Factory, 
  Search,
  ArrowUpDown
} from "lucide-react";
import { BezelReference } from "../../types";
import { getBezelPrice } from "../../services/bezelService";

interface BezelEvaluationViewProps {
  references: BezelReference[];
}

export default function BezelEvaluationView({ references }: BezelEvaluationViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<"code" | "client" | "price" | "stock1Val" | "stock2Val" | "totalVal">("totalVal");
  const [sortAsc, setSortAsc] = useState(false);

  // Computed Evaluation per Reference
  const evaluatedList = useMemo(() => {
    return references.map((ref) => {
      const price = getBezelPrice(ref);
      const s1 = ref.stock1 || 0;
      const s2 = ref.stock2 || 0;
      const totalPcs = s1 + s2;
      const stock1Val = s1 * price;
      const stock2Val = s2 * price;
      const totalVal = totalPcs * price;

      return {
        ...ref,
        unitPrice: price,
        stock1Pcs: s1,
        stock2Pcs: s2,
        totalPcs,
        stock1Val,
        stock2Val,
        totalVal,
        clientName: (ref.client || "OTHER").toUpperCase().trim()
      };
    });
  }, [references]);

  // Global Evaluation Aggregates
  const aggregates = useMemo(() => {
    let totalVal = 0;
    let s1Val = 0;
    let s2Val = 0;
    let totalPcs = 0;
    let s1Pcs = 0;
    let s2Pcs = 0;

    let psaVal = 0;
    let opelVal = 0;
    let otherVal = 0;

    evaluatedList.forEach((item) => {
      totalVal += item.totalVal;
      s1Val += item.stock1Val;
      s2Val += item.stock2Val;
      totalPcs += item.totalPcs;
      s1Pcs += item.stock1Pcs;
      s2Pcs += item.stock2Pcs;

      if (item.clientName.includes("PSA")) {
        psaVal += item.totalVal;
      } else if (item.clientName.includes("OPEL")) {
        opelVal += item.totalVal;
      } else {
        otherVal += item.totalVal;
      }
    });

    const s1Share = totalVal > 0 ? (s1Val / totalVal) * 100 : 0;
    const s2Share = totalVal > 0 ? (s2Val / totalVal) * 100 : 0;
    const psaShare = totalVal > 0 ? (psaVal / totalVal) * 100 : 0;
    const opelShare = totalVal > 0 ? (opelVal / totalVal) * 100 : 0;

    return {
      totalVal,
      s1Val,
      s2Val,
      totalPcs,
      s1Pcs,
      s2Pcs,
      s1Share,
      s2Share,
      psaVal,
      opelVal,
      otherVal,
      psaShare,
      opelShare
    };
  }, [evaluatedList]);

  // Filtering
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return evaluatedList.filter((item) => {
      const matchSearch =
        !q ||
        item.code.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.clientName.toLowerCase().includes(q);

      const matchClient =
        clientFilter === "ALL" ||
        (clientFilter === "PSA" && item.clientName.includes("PSA")) ||
        (clientFilter === "OPEL" && item.clientName.includes("OPEL")) ||
        (clientFilter === "OTHER" && !item.clientName.includes("PSA") && !item.clientName.includes("OPEL"));

      return matchSearch && matchClient;
    });
  }, [evaluatedList, searchQuery, clientFilter]);

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortField === "code" || sortField === "client") {
        const valA = (a[sortField === "client" ? "clientName" : "code"] || "").toString();
        const valB = (b[sortField === "client" ? "clientName" : "code"] || "").toString();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const valA = a[sortField] || 0;
      const valB = b[sortField] || 0;
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [filtered, sortField, sortAsc]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // Highest value first by default
    }
  };

  const formatEuro = (amount: number) => {
    return `€ ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  // CSV Export Function
  const handleExportCSV = () => {
    const headers = [
      "Reference",
      "Description",
      "Client",
      "Unit Price (€)",
      "Stock 1 Qty",
      "Stock 1 Value (€)",
      "Stock 2 Qty",
      "Stock 2 Value (€)",
      "Total Qty",
      "Total Value (€)",
      "Share (%)"
    ];

    const rows = sorted.map((item) => {
      const share = aggregates.totalVal > 0 ? ((item.totalVal / aggregates.totalVal) * 100).toFixed(1) : "0.0";
      return [
        `"${item.code}"`,
        `"${item.description || ""}"`,
        `"${item.clientName}"`,
        item.unitPrice.toFixed(2),
        item.stock1Pcs,
        item.stock1Val.toFixed(2),
        item.stock2Pcs,
        item.stock2Val.toFixed(2),
        item.totalPcs,
        item.totalVal.toFixed(2),
        `"${share}%"`
      ].join(",");
    });

    // Summary row
    rows.push([
      `"TOTAL"`,
      `""`,
      `""`,
      `""`,
      aggregates.s1Pcs,
      aggregates.s1Val.toFixed(2),
      aggregates.s2Pcs,
      aggregates.s2Val.toFixed(2),
      aggregates.totalPcs,
      aggregates.totalVal.toFixed(2),
      `"100.0%"`
    ].join(","));

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bezel_stock_evaluation_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5" id="bezel-evaluation-view-root">
      {/* 1. KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Bezel Inventory Value */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              TOTAL INVENTORY VALUE
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Euro className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {formatEuro(aggregates.totalVal)}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{aggregates.totalPcs.toLocaleString()} PCS TOTAL</span>
            <span className="font-semibold text-slate-700">{references.length} REFS</span>
          </div>
        </div>

        {/* Stock 1 Value */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 font-mono">
              STOCK 1 VALUE (RAW)
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Warehouse className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-amber-900">
            {formatEuro(aggregates.s1Val)}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{aggregates.s1Pcs.toLocaleString()} PCS</span>
            <span className="font-bold text-amber-800">{aggregates.s1Share.toFixed(1)}% SHARE</span>
          </div>
        </div>

        {/* Stock 2 Value */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 font-mono">
              STOCK 2 VALUE (READY)
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-900">
            {formatEuro(aggregates.s2Val)}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{aggregates.s2Pcs.toLocaleString()} PCS</span>
            <span className="font-bold text-emerald-800">{aggregates.s2Share.toFixed(1)}% SHARE</span>
          </div>
        </div>
      </div>

      {/* 2. Controls & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Client Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs font-mono font-bold">
            {["ALL", "PSA", "OPEL"].map((c) => (
              <button
                key={c}
                onClick={() => setClientFilter(c)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  clientFilter === c
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code or description..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          id="bezel-export-evaluation-csv-btn"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold font-mono tracking-wide transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>EXPORT CSV</span>
        </button>
      </div>

      {/* 3. Evaluation Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
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
                <th className="py-3 px-4 hidden md:table-cell">Description</th>
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
                  onClick={() => toggleSort("price")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Price</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("stock1Val")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none text-amber-900"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Stock 1 (Raw)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("stock2Val")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none text-emerald-900"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Stock 2 (Ready)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("totalVal")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 select-none text-slate-900"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Value</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No references match your filter.
                  </td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const share =
                    aggregates.totalVal > 0 ? (item.totalVal / aggregates.totalVal) * 100 : 0;
                  return (
                    <tr
                      key={item.code}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                        {item.code}
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell text-slate-600 font-sans truncate max-w-xs">
                        {item.description}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded font-bold text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                          {item.clientName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        € {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-amber-900">
                          {formatEuro(item.stock1Val)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.stock1Pcs.toLocaleString()} pcs
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-emerald-900">
                          {formatEuro(item.stock2Val)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.stock2Pcs.toLocaleString()} pcs
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-extrabold text-slate-900">
                          {formatEuro(item.totalVal)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold">
                          {item.totalPcs.toLocaleString()} pcs
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-500">
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer with Totals */}
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                <td className="py-3 px-4 uppercase tracking-wider">TOTAL</td>
                <td className="py-3 px-4 hidden md:table-cell text-slate-500 font-normal">
                  {references.length} References
                </td>
                <td className="py-3 px-4"></td>
                <td className="py-3 px-4 text-right text-slate-500">—</td>
                <td className="py-3 px-4 text-right text-amber-950">
                  <div>{formatEuro(aggregates.s1Val)}</div>
                  <div className="text-[10px] font-normal text-slate-500">
                    {aggregates.s1Pcs.toLocaleString()} pcs
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-emerald-950">
                  <div>{formatEuro(aggregates.s2Val)}</div>
                  <div className="text-[10px] font-normal text-slate-500">
                    {aggregates.s2Pcs.toLocaleString()} pcs
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-slate-950 font-black">
                  <div>{formatEuro(aggregates.totalVal)}</div>
                  <div className="text-[10px] font-normal text-slate-500">
                    {aggregates.totalPcs.toLocaleString()} pcs
                  </div>
                </td>
                <td className="py-3 px-4 text-right">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
