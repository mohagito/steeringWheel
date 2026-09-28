import React, { useState, useMemo } from "react";
import { ScrapEntry, Reference } from "../types";
import { MESHES_PRICE_LIST, isConColaScrap } from "../utils/stockValuation";
import { getISOWeekCode, getISOWeekNumber } from "../utils/timeUtils";
import { TrendingUp, Calendar, AlertCircle } from "lucide-react";

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
  const [hoveredPoint, setHoveredPoint] = useState<WeekDataPoint | null>(null);

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

    // Provide continuous timeline across weeks for smooth curve visualization
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

  // SVG Chart Geometry
  const chartWidth = 840;
  const chartHeight = 310;
  const paddingLeft = 70;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 45;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Maximum cost for Y-axis scale (Pure Con Cola)
  const maxDataCost = useMemo(() => {
    let max = 100;
    displayedPoints.forEach((p) => {
      if (p.conColaCost > max) max = p.conColaCost;
    });
    // Add 25% head room for aesthetic bezier curve peaks
    const padded = max * 1.25;
    const magnitude = Math.pow(10, Math.floor(Math.log10(padded || 1)));
    const cleanMax = Math.ceil(padded / (magnitude / 2)) * (magnitude / 2);
    return Math.max(cleanMax, 100);
  }, [displayedPoints]);

  // Y-axis ticks (5 steps)
  const yTicks = useMemo(() => {
    const ticks = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = (maxDataCost / steps) * i;
      const y = paddingTop + innerHeight - (val / maxDataCost) * innerHeight;
      ticks.push({ val: Math.round(val), y });
    }
    return ticks;
  }, [maxDataCost, innerHeight, paddingTop]);

  // Compute pixel positions for each week data point
  const pointCoords = useMemo(() => {
    const n = displayedPoints.length;
    if (n === 0) return [];

    return displayedPoints.map((p, idx) => {
      const x = n === 1 ? paddingLeft + innerWidth / 2 : paddingLeft + (idx / (n - 1)) * innerWidth;
      const y = paddingTop + innerHeight - (p.conColaCost / maxDataCost) * innerHeight;
      return {
        ...p,
        x,
        y
      };
    });
  }, [displayedPoints, innerWidth, innerHeight, paddingLeft, paddingTop, maxDataCost]);

  // Build Smooth Bezier Path (Cubic Spline matching the reference diagram)
  const buildSmoothPath = (coords: { x: number; y: number }[]) => {
    if (coords.length === 0) return "";
    if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const cpX = (curr.x + next.x) / 2;
      path += ` C ${cpX} ${curr.y}, ${cpX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const conColaLinePath = useMemo(() => {
    return buildSmoothPath(pointCoords.map((p) => ({ x: p.x, y: p.y })));
  }, [pointCoords]);

  const conColaAreaPath = useMemo(() => {
    if (pointCoords.length === 0) return "";
    const line = buildSmoothPath(pointCoords.map((p) => ({ x: p.x, y: p.y })));
    const baseline = paddingTop + innerHeight;
    const firstX = pointCoords[0].x;
    const lastX = pointCoords[pointCoords.length - 1].x;
    return `${line} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
  }, [pointCoords, paddingTop, innerHeight]);

  return (
    <div
      id="scrap-con-cola-cost-diagram"
      className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm relative overflow-hidden space-y-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2 text-purple-600 font-mono text-[11px] font-bold tracking-wider uppercase">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Weekly Cost Valuation</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 font-sans">
            Cost Scrap Con Cola per Weeks
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Weekly monetary loss (€) strictly evaluating scrap defects with glue (<span className="font-semibold text-purple-700">Con Cola</span>)
          </p>
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
        <div className="bg-purple-50/70 border border-purple-100/90 p-4 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-purple-600 uppercase tracking-wider">
            Total Con Cola Cost
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-900 font-mono mt-0.5">
            € {kpis.totalConColaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-purple-700/80 font-mono mt-0.5">
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
          <div className="text-xl sm:text-2xl font-black text-rose-600 font-mono mt-0.5">
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

      {/* The Diagram Visual Card (Matches Reference Curve & Styling) */}
      <div className="relative bg-slate-50/50 border border-slate-200/80 rounded-3xl p-4 sm:p-6 select-none overflow-hidden">
        
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>COST AXIS (€) &bull; WEEK TIMELINE</span>
          </span>
          {hoveredPoint && (
            <span className="text-xs font-mono font-bold text-purple-700 bg-purple-100/80 px-2.5 py-0.5 rounded-lg border border-purple-200">
              {hoveredPoint.weekKey}: €{hoveredPoint.conColaCost.toFixed(2)} ({hoveredPoint.conColaPcs} PCS)
            </span>
          )}
        </div>

        {/* SVG Drawing Canvas */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[600px]">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible font-sans"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                {/* Purple Area Gradient for Con Cola */}
                <linearGradient id="purpleGradientAreaOnly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9333ea" stopOpacity="0.5" />
                  <stop offset="35%" stopColor="#a855f7" stopOpacity="0.28" />
                  <stop offset="75%" stopColor="#c084fc" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#e9d5ff" stopOpacity="0.0" />
                </linearGradient>

                {/* Drop shadow filter for active point */}
                <filter id="pointShadowPure" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#7e22ce" floodOpacity="0.45" />
                </filter>
              </defs>

              {/* Horizontal Grid lines with Cost Values on Left Y-Axis */}
              {yTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={tick.y}
                    x2={chartWidth - paddingRight}
                    y2={tick.y}
                    stroke="#e2e8f0"
                    strokeDasharray={i === 0 ? "none" : "4 4"}
                    strokeWidth={i === 0 ? "1.5" : "1"}
                  />
                  {/* Left Cost Label */}
                  <text
                    x={paddingLeft - 12}
                    y={tick.y + 4}
                    textAnchor="end"
                    className="text-[11px] font-mono font-semibold fill-slate-400"
                  >
                    {tick.val >= 1000 ? `€${(tick.val / 1000).toFixed(1)}k` : `€${tick.val}`}
                  </text>
                </g>
              ))}

              {/* Baseline Axis Line */}
              <line
                x1={paddingLeft}
                y1={paddingTop + innerHeight}
                x2={chartWidth - paddingRight}
                y2={paddingTop + innerHeight}
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />

              {/* Con Cola Area Fill */}
              {conColaAreaPath && (
                <path d={conColaAreaPath} fill="url(#purpleGradientAreaOnly)" />
              )}

              {/* Con Cola Smooth Line */}
              {conColaLinePath && (
                <path
                  d={conColaLinePath}
                  fill="none"
                  stroke="#9333ea"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Point Markers & X-Axis Week Labels (Bottom) */}
              {pointCoords.map((pt) => {
                const isHovered = hoveredPoint?.weekKey === pt.weekKey;
                const hasConCola = pt.conColaCost > 0;
                const baseline = paddingTop + innerHeight;

                return (
                  <g key={pt.weekKey}>
                    {/* Vertical hover indicator dashed line */}
                    {isHovered && (
                      <line
                        x1={pt.x}
                        y1={paddingTop}
                        x2={pt.x}
                        y2={baseline}
                        stroke="#a855f7"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Con Cola Data Point Circle (Purple) */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 7.5 : (hasConCola ? 5.5 : 3.5)}
                      fill={hasConCola ? "#9333ea" : "#cbd5e1"}
                      stroke="#ffffff"
                      strokeWidth={isHovered ? 3 : 2}
                      filter={isHovered ? "url(#pointShadowPure)" : undefined}
                      className="cursor-pointer transition-all"
                    />

                    {/* Touch area for easy hover */}
                    <rect
                      x={pt.x - 22}
                      y={paddingTop}
                      width={44}
                      height={innerHeight + paddingBottom}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPoint(pt)}
                    />

                    {/* Bottom X-Axis Week Label */}
                    <text
                      x={pt.x}
                      y={baseline + 20}
                      textAnchor="middle"
                      className={`text-xs font-mono transition-all ${
                        isHovered
                          ? "fill-purple-700 font-black text-sm"
                          : hasConCola
                          ? "fill-slate-800 font-bold"
                          : "fill-slate-400 font-medium"
                      }`}
                    >
                      {pt.weekKey}
                    </text>

                    {/* Cost Badge above peak or hovered point */}
                    {(isHovered || (pt.conColaCost > 0 && pt.conColaCost === kpis.peakConColaCost)) && (
                      <g>
                        <rect
                          x={pt.x - 32}
                          y={pt.y - 26}
                          width={64}
                          height={19}
                          rx={5}
                          fill="#7e22ce"
                          className="shadow-md"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 13}
                          textAnchor="middle"
                          className="text-[10px] font-mono font-bold fill-white"
                        >
                          €{pt.conColaCost.toFixed(0)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Detailed Week Breakdown on Hover */}
        {hoveredPoint && (
          <div className="mt-4 p-4 bg-white rounded-2xl border border-purple-200 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-mono font-extrabold text-sm shadow-2xs">
                {hoveredPoint.weekKey}
              </div>
              <div>
                <div className="text-xs text-slate-500 font-mono font-medium">Con Cola Scrap Valuation</div>
                <div className="text-base font-black text-slate-900 font-mono">
                  € {hoveredPoint.conColaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xs font-normal text-slate-500 ml-2 font-mono">({hoveredPoint.conColaPcs} PCS)</span>
                </div>
              </div>
            </div>

            {/* Reference Breakdown */}
            <div className="flex flex-wrap items-center gap-1.5 max-w-lg">
              {(Object.entries(hoveredPoint.refBreakdown) as [string, { qty: number; cost: number }][]).map(([ref, data]) => {
                if (data.qty === 0 && data.cost === 0) return null;
                return (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 text-xs font-mono font-semibold border border-purple-200/60"
                  >
                    <span>{ref}</span>
                    <span className="font-black text-purple-900">{data.qty} pcs</span>
                    <span className="text-purple-600 text-[10px]">(€{data.cost.toFixed(1)})</span>
                  </span>
                );
              })}
              {hoveredPoint.conColaPcs === 0 && (
                <span className="text-xs text-slate-400 font-mono italic">No Con Cola scrap logged in this week.</span>
              )}
            </div>
          </div>
        )}

        {/* Footer info note */}
        <div className="mt-4 pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-400 font-mono gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
            <span className="text-slate-600 font-semibold">Con Cola Scrap (€)</span>
          </div>
          <div>Unit costs derived from official MESHES price catalog.</div>
        </div>
      </div>
    </div>
  );
}
