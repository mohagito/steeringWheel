import React, { useState, useMemo } from "react";
import { ScrapEntry, Reference } from "../types";
import { MESHES_PRICE_LIST, isConColaScrap } from "../utils/stockValuation";
import { getISOWeekCode, getISOWeekNumber } from "../utils/timeUtils";
import { TrendingUp, BarChart2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

interface ScrapConColaCostDiagramProps {
  scraps: ScrapEntry[];
  references?: Reference[];
}

interface WeekDataPoint {
  weekKey: string;      // e.g. "W37"
  weekNum: number;      // e.g. 37
  year: number;         // e.g. 2026
  conColaCost: number;  // Cost in € for Con Cola
  conColaPcs: number;   // Quantity in PCS
  refBreakdown: Record<string, { qty: number; cost: number }>;
}

export default function ScrapConColaCostDiagram({
  scraps
}: ScrapConColaCostDiagramProps) {
  const [activeRange, setActiveRange] = useState<"8_WEEKS" | "12_WEEKS" | "ALL">("ALL");
  const [hoveredPoint, setHoveredPoint] = useState<{
    weekKey: string;
    cost: number;
    pcs: number;
    refBreakdown: Record<string, { qty: number; cost: number }>;
  } | null>(null);

  // 1. Group authoritative scrap entries by week — Strictly CON COLA only
  const weeklyData = useMemo(() => {
    const map: Record<string, WeekDataPoint> = {};

    scraps.forEach((s) => {
      // Keep strictly CON COLA entries
      if (!isConColaScrap(s)) return;

      let rawWeek = s.date?.startsWith("W") ? s.date.toUpperCase() : "";
      let weekNum = 0;
      let year = 2026;

      if (rawWeek && /^W\d+$/i.test(rawWeek)) {
        weekNum = parseInt(rawWeek.replace(/\D/g, ""), 10);
      } else {
        const dStr = s.date || s.timestamp;
        rawWeek = getISOWeekCode(dStr);
        weekNum = getISOWeekNumber(dStr);
        if (typeof s.date === "string" && /^\d{4}/.test(s.date)) {
          year = parseInt(s.date.slice(0, 4), 10);
        }
      }

      const weekKey = rawWeek || `W${weekNum}`;

      if (!map[weekKey]) {
        map[weekKey] = {
          weekKey,
          weekNum,
          year,
          conColaCost: 0,
          conColaPcs: 0,
          refBreakdown: {}
        };
      }

      const refCode = (s.reference || "").trim().toUpperCase();
      const unitPrice = MESHES_PRICE_LIST[refCode] || 0;
      const qty = s.quantity || 0;
      const itemCost = qty * unitPrice;

      if (!map[weekKey].refBreakdown[refCode]) {
        map[weekKey].refBreakdown[refCode] = { qty: 0, cost: 0 };
      }

      map[weekKey].conColaCost += itemCost;
      map[weekKey].conColaPcs += qty;
      map[weekKey].refBreakdown[refCode].qty += qty;
      map[weekKey].refBreakdown[refCode].cost += itemCost;
    });

    // Provide continuous timeline across weeks for consistent bar presentation
    const existingPoints = Object.values(map);
    if (existingPoints.length === 0) {
      const currentW = getISOWeekNumber();
      const list: WeekDataPoint[] = [];
      for (let i = Math.max(1, currentW - 5); i <= currentW; i++) {
        list.push({
          weekKey: `W${i}`,
          weekNum: i,
          year: 2026,
          conColaCost: 0,
          conColaPcs: 0,
          refBreakdown: {}
        });
      }
      return list;
    }

    existingPoints.sort((a, b) => a.weekNum - b.weekNum);

    const minWeek = Math.max(1, existingPoints[0].weekNum - 1);
    const maxWeek = Math.min(53, existingPoints[existingPoints.length - 1].weekNum + 1);

    const fullTimeline: WeekDataPoint[] = [];
    for (let w = minWeek; w <= maxWeek; w++) {
      const key = `W${w}`;
      if (map[key]) {
        fullTimeline.push(map[key]);
      } else {
        fullTimeline.push({
          weekKey: key,
          weekNum: w,
          year: 2026,
          conColaCost: 0,
          conColaPcs: 0,
          refBreakdown: {}
        });
      }
    }

    return fullTimeline;
  }, [scraps]);

  // Apply range filter
  const displayedPoints = useMemo(() => {
    if (activeRange === "8_WEEKS") {
      return weeklyData.slice(-8);
    }
    if (activeRange === "12_WEEKS") {
      return weeklyData.slice(-12);
    }
    return weeklyData;
  }, [weeklyData, activeRange]);

  // KPI calculations for Con Cola only
  const kpis = useMemo(() => {
    let totalConColaCost = 0;
    let totalConColaPcs = 0;
    let peakConColaCost = 0;
    let peakWeek = "—";
    let activeWeeksCount = 0;

    displayedPoints.forEach((p) => {
      totalConColaCost += p.conColaCost;
      totalConColaPcs += p.conColaPcs;
      if (p.conColaCost > peakConColaCost) {
        peakConColaCost = p.conColaCost;
        peakWeek = p.weekKey;
      }
      if (p.conColaCost > 0) activeWeeksCount++;
    });

    const avgWeeklyCost = activeWeeksCount > 0 ? totalConColaCost / activeWeeksCount : 0;

    return {
      totalConColaCost,
      totalConColaPcs,
      peakConColaCost,
      peakWeek,
      avgWeeklyCost,
      activeWeeksCount
    };
  }, [displayedPoints]);

  // Recharts Chart Data (Thin vertical lines / bars only, matching Stock Stage Distribution)
  const chartData = useMemo(() => {
    return displayedPoints.map((p) => ({
      name: p.weekKey,
      weekKey: p.weekKey,
      cost: Math.round(p.conColaCost * 100) / 100,
      pcs: p.conColaPcs,
      refBreakdown: p.refBreakdown
    }));
  }, [displayedPoints]);

  return (
    <div
      id="scrap-con-cola-cost-diagram"
      className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm relative overflow-hidden space-y-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-mono text-[11px] font-bold tracking-wider uppercase">
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Weekly Cost Valuation</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 font-sans">
            Cost Scrap Con Cola per Weeks
          </h3>
        </div>

        {/* Range Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl text-xs font-mono font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setActiveRange("8_WEEKS")}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeRange === "8_WEEKS"
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "hover:text-slate-900"
              }`}
            >
              8W
            </button>
            <button
              type="button"
              onClick={() => setActiveRange("12_WEEKS")}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeRange === "12_WEEKS"
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "hover:text-slate-900"
              }`}
            >
              12W
            </button>
            <button
              type="button"
              onClick={() => setActiveRange("ALL")}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeRange === "ALL"
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "hover:text-slate-900"
              }`}
            >
              All Weeks
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-blue-50/70 border border-blue-100/90 p-4 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-blue-600 uppercase tracking-wider">
            Total Con Cola Cost
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-900 font-mono mt-0.5">
            € {kpis.totalConColaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-blue-700/80 font-mono mt-0.5">
            {kpis.totalConColaPcs} PCS rejected
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            Weekly Average
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
            € {kpis.avgWeeklyCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Across {kpis.activeWeeksCount} active weeks
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            Peak Week Cost
          </div>
          <div className="text-xl sm:text-2xl font-black text-[#131111] font-mono mt-0.5">
            € {kpis.peakConColaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Recorded in {kpis.peakWeek}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            Timeline Scope
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 font-mono mt-0.5">
            {displayedPoints.length} Weeks
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            {displayedPoints[0]?.weekKey || "—"} to {displayedPoints[displayedPoints.length - 1]?.weekKey || "—"}
          </div>
        </div>
      </div>

      {/* The Diagram Visual Card (Vertical lines only, matches Stock Stage Distribution) */}
      <div className="bg-white border border-slate-100 shadow-xl shadow-slate-200/40 rounded-3xl p-6 select-none overflow-hidden">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
              Cost Scrap Con Cola per Weeks
            </h4>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Weekly scrap cost valuation (€) across active weeks
            </p>
          </div>
          {hoveredPoint && (
            <div className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200 shrink-0">
              {hoveredPoint.weekKey}: €{hoveredPoint.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({hoveredPoint.pcs} PCS)
            </div>
          )}
        </div>

        {/* Recharts BarChart with thin vertical lines / bars */}
        <div className="h-[260px] sm:h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 15, right: 15, left: -10, bottom: 0 }}
              onMouseMove={(state: any) => {
                if (state && state.activePayload && state.activePayload.length > 0) {
                  setHoveredPoint(state.activePayload[0].payload);
                }
              }}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1", strokeWidth: 1.5 }}
                fontFamily="monospace"
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1", strokeWidth: 1.5 }}
                fontFamily="monospace"
                tickFormatter={(val) => (val >= 1000 ? `€${(val / 1000).toFixed(1)}k` : `€${val}`)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderRadius: "16px",
                  border: "none",
                  color: "#fff",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  padding: "12px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
                }}
                itemStyle={{ color: "#fff" }}
                formatter={(val: any) => [
                  `€ ${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  "Cost Con Cola"
                ]}
                labelFormatter={(label) => `Week ${label}`}
              />
              <Bar
                dataKey="cost"
                name="Cost Con Cola (€)"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={14}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed Week Breakdown on Hover */}
        {hoveredPoint && (
          <div className="mt-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-mono font-extrabold text-sm shadow-2xs">
                {hoveredPoint.weekKey}
              </div>
              <div>
                <div className="text-xs text-slate-500 font-mono font-medium">Con Cola Scrap Valuation</div>
                <div className="text-base font-black text-slate-900 font-mono">
                  € {hoveredPoint.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xs font-normal text-slate-500 ml-2 font-mono">({hoveredPoint.pcs} PCS)</span>
                </div>
              </div>
            </div>

            {/* Reference Breakdown */}
            <div className="flex flex-wrap items-center gap-1.5 max-w-lg">
              {hoveredPoint.refBreakdown && (Object.entries(hoveredPoint.refBreakdown) as [string, { qty: number; cost: number }][]).map(([ref, data]) => {
                if (data.qty === 0 && data.cost === 0) return null;
                return (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-slate-800 text-xs font-mono font-semibold border border-slate-200 shadow-2xs"
                  >
                    <span>{ref}:</span>
                    <span className="font-black text-blue-600">{data.qty} pcs</span>
                    <span className="text-slate-400 text-[10px]">(€{data.cost.toFixed(1)})</span>
                  </span>
                );
              })}
              {hoveredPoint.pcs === 0 && (
                <span className="text-xs text-slate-400 font-mono italic">No Con Cola scrap logged in this week.</span>
              )}
            </div>
          </div>
        )}

        {/* Footer info note */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-400 font-mono gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span className="text-slate-600 font-semibold font-mono">Con Cola Scrap (€)</span>
          </div>
          <div>Unit costs derived from official MESHES price catalog.</div>
        </div>
      </div>
    </div>
  );
}
