import React, { useState, useMemo } from "react";
import { InventoryTransaction, Reference, User } from "../types";
import { 
  formatSystemTimeOnly,
  formatSystemDate,
  getMoroccoDateString,
  getMoroccoTodayDateString,
  getMoroccoYesterdayDateString,
  parseTimestampMs,
  compareTimestampsDesc
} from "../utils/timeUtils";
import { 
  Layers, Search, Filter, RotateCcw, Edit2, 
  Calendar, Clock, CheckCircle2, AlertCircle, ChevronDown, 
  ChevronUp, Scan, ArrowRight, Shield, User as UserIcon,
  Sparkles, RefreshCw, XCircle
} from "lucide-react";
import Swal from "sweetalert2";

interface PegadasWorkspaceProps {
  transactions: InventoryTransaction[];
  references: Reference[];
  currentUser: User;
  onEditOperation?: (opId: string, category: string, newQty: number, reason: string) => Promise<void>;
  onDeleteOperation?: (opId: string, category: string, reason: string) => Promise<void>;
  onNavigateToTab?: (tab: string) => void;
}

type TimeFilter = "today" | "yesterday" | "week" | "month" | "all";

interface PegadasGroup {
  id: string; // `${dateStr}_${refCode}`
  dateStr: string; // "YYYY-MM-DD"
  formattedDate: string; // "DD/MM/YYYY"
  reference: string;
  referenceData?: Reference;
  totalQty: number; // active sum
  reversedQty: number; // reversed sum
  operations: InventoryTransaction[];
  activeCount: number;
  reversedCount: number;
}

export default function PegadasWorkspace({
  transactions = [],
  references = [],
  currentUser,
  onEditOperation,
  onDeleteOperation,
  onNavigateToTab
}: PegadasWorkspaceProps) {
  // Filters
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [customDate, setCustomDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<string>(
    currentUser.role === "operator" ? currentUser.fullName : "ALL"
  );

  // Accordion state: which groups are expanded
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Helper to normalize operator names for comparison
  const cleanOpName = (name?: string) => 
    (name || "").replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();

  // Reference catalog lookup map
  const refMap = useMemo(() => {
    const map = new Map<string, Reference>();
    references.forEach(r => {
      if (r.code) map.set(r.code.toUpperCase(), r);
      if (r.id) map.set(r.id.toUpperCase(), r);
    });
    return map;
  }, [references]);

  // List of all operators for supervisors/admins
  const availableOperators = useMemo(() => {
    const set = new Set<string>();
    if (currentUser.fullName) set.add(currentUser.fullName);
    transactions.forEach(tx => {
      const isPegadas = 
        tx.movementType === "TRANSFER S1->S2" || 
        tx.movementType === "TRANSFER" || 
        tx.stock === "Stock 1 -> Stock 2" ||
        (tx.notes && (tx.notes.includes("Pegadas") || tx.notes.includes("Stock 1 -> Stock 2")));
      if (isPegadas && tx.operatorName) {
        const clean = tx.operatorName.replace(/\s*\([^)]*\)/g, "").trim();
        if (clean) set.add(clean);
      }
    });
    return Array.from(set).sort();
  }, [transactions, currentUser]);

  // Filter raw transactions to validated PEGADAS operations
  const pegadasTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Must be a Stock 1 -> Stock 2 transfer operation
      const isPegadas = 
        tx.movementType === "TRANSFER S1->S2" || 
        tx.movementType === "TRANSFER" || 
        tx.stock === "Stock 1 -> Stock 2" ||
        (tx.notes && (tx.notes.includes("Pegadas") || tx.notes.includes("Stock 1 -> Stock 2")));

      if (!isPegadas) return false;
      // Reversal audit logs themselves have movementType "REVERSAL"
      if (tx.movementType === "REVERSAL") return false;

      // 2. Operator restriction:
      // Operators see ONLY their own records.
      if (currentUser.role === "operator") {
        if (cleanOpName(tx.operatorName) !== cleanOpName(currentUser.fullName)) {
          return false;
        }
      } else {
        // Supervisor/Admin can filter by operator or see ALL
        if (selectedOperator !== "ALL") {
          if (cleanOpName(tx.operatorName) !== cleanOpName(selectedOperator)) {
            return false;
          }
        }
      }

      // 3. Time filter
      const todayStr = getMoroccoTodayDateString();
      const yesterdayStr = getMoroccoYesterdayDateString();
      const txDateStr = getMoroccoDateString(tx.timestamp);

      if (customDate) {
        if (txDateStr !== customDate) return false;
      } else if (timeFilter === "today") {
        if (txDateStr !== todayStr) return false;
      } else if (timeFilter === "yesterday") {
        if (txDateStr !== yesterdayStr) return false;
      } else if (timeFilter === "week") {
        const nowMs = Date.now();
        const txMs = parseTimestampMs(tx.timestamp) || 0;
        if (txMs < nowMs - 7 * 86400000) return false;
      } else if (timeFilter === "month") {
        const nowMs = Date.now();
        const txMs = parseTimestampMs(tx.timestamp) || 0;
        if (txMs < nowMs - 30 * 86400000) return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refCode = (tx.reference || "").toLowerCase();
        const refObj = refMap.get((tx.reference || "").toUpperCase());
        const desc = (refObj?.description || "").toLowerCase();
        const notes = (tx.notes || "").toLowerCase();
        if (!refCode.includes(q) && !desc.includes(q) && !notes.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, currentUser, selectedOperator, timeFilter, customDate, searchQuery, refMap]);

  // Group by Date + Reference
  const groupedData = useMemo(() => {
    const groupsMap = new Map<string, PegadasGroup>();

    pegadasTransactions.forEach(tx => {
      const dateStr = getMoroccoDateString(tx.timestamp) || "Unknown Date";
      const formattedDate = formatSystemDate(tx.timestamp);
      const refCode = (tx.reference || "").trim().toUpperCase();
      const key = `${dateStr}__${refCode}`;

      let group = groupsMap.get(key);
      if (!group) {
        group = {
          id: key,
          dateStr,
          formattedDate,
          reference: refCode,
          referenceData: refMap.get(refCode),
          totalQty: 0,
          reversedQty: 0,
          operations: [],
          activeCount: 0,
          reversedCount: 0
        };
        groupsMap.set(key, group);
      }

      group.operations.push(tx);
      const isReversed = tx.status === "REVERSED" || tx.notes?.toLowerCase().includes("reversed");

      if (isReversed) {
        group.reversedQty += tx.quantity || 0;
        group.reversedCount += 1;
      } else {
        group.totalQty += tx.quantity || 0;
        group.activeCount += 1;
      }
    });

    // Sort operations inside each group by timestamp descending
    groupsMap.forEach(group => {
      group.operations.sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
    });

    // Convert map to array and sort groups:
    // 1. Date descending (newest date first)
    // 2. Reference code ascending
    const groupsList = Array.from(groupsMap.values());
    groupsList.sort((a, b) => {
      if (a.dateStr !== b.dateStr) {
        return b.dateStr.localeCompare(a.dateStr);
      }
      return a.reference.localeCompare(b.reference);
    });

    return groupsList;
  }, [pegadasTransactions, refMap]);

  // Aggregate stats
  const stats = useMemo(() => {
    const todayStr = getMoroccoTodayDateString();
    let todayPcs = 0;
    let todayOps = 0;
    const todayRefs = new Set<string>();

    let totalFilteredPcs = 0;
    let totalFilteredOps = 0;

    pegadasTransactions.forEach(tx => {
      const isReversed = tx.status === "REVERSED" || tx.notes?.toLowerCase().includes("reversed");
      if (!isReversed) {
        totalFilteredPcs += tx.quantity || 0;
        totalFilteredOps += 1;

        const txDate = getMoroccoDateString(tx.timestamp);
        if (txDate === todayStr) {
          todayPcs += tx.quantity || 0;
          todayOps += 1;
          todayRefs.add(tx.reference.toUpperCase());
        }
      }
    });

    return {
      todayPcs,
      todayOps,
      todayUniqueRefs: todayRefs.size,
      totalFilteredPcs,
      totalFilteredOps
    };
  }, [pegadasTransactions]);

  // Toggle expand/collapse for a specific group
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Expand all / Collapse all
  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    groupedData.forEach(g => { allExpanded[g.id] = true; });
    setExpandedGroups(allExpanded);
  };

  const collapseAll = () => {
    setExpandedGroups({});
  };

  // Safe Operator Modification (Edit Quantity)
  const handleEditPegadasRecord = async (tx: InventoryTransaction) => {
    if (!onEditOperation) return;

    // Verify operator permission
    if (currentUser.role === "operator") {
      if (cleanOpName(tx.operatorName) !== cleanOpName(currentUser.fullName)) {
        await Swal.fire("Unauthorized", "You can only modify your own PEGADAS records.", "error");
        return;
      }
    }

    if (tx.status === "REVERSED") {
      await Swal.fire("Cannot Modify", "This operation has been reversed and cannot be modified.", "warning");
      return;
    }

    const currentQty = tx.quantity || 0;
    const refData = refMap.get((tx.reference || "").toUpperCase());
    const availableStock1 = refData?.stock1 ?? 0;
    const availableStock2 = refData?.stock2 ?? 0;

    const { value: formValues } = await Swal.fire({
      title: "Modify Validated PEGADAS Record",
      html: `
        <div class="text-left text-xs font-sans space-y-3.5">
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div class="flex justify-between items-center mb-1.5">
              <span class="text-slate-500 font-semibold">Reference:</span>
              <span class="font-mono font-bold text-blue-700 text-sm">${tx.reference}</span>
            </div>
            <div class="flex justify-between items-center mb-1">
              <span class="text-slate-500 font-semibold">Current Recorded Qty:</span>
              <span class="font-bold text-slate-800">${currentQty.toLocaleString()} PCS</span>
            </div>
            <div class="flex justify-between items-center mb-1">
              <span class="text-slate-500 font-semibold">Stock 1 (Warehouse Available):</span>
              <span class="font-bold ${availableStock1 <= 0 ? 'text-rose-600' : 'text-emerald-700'}">${availableStock1.toLocaleString()} PCS</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500 font-semibold">Stock 2 (Gluing WIP):</span>
              <span class="font-bold text-slate-700">${availableStock2.toLocaleString()} PCS</span>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">New Transfer Quantity (PCS):</label>
            <input 
              id="swal-edit-qty" 
              type="number" 
              min="1" 
              class="swal2-input !m-0 !w-full !text-sm !h-10" 
              value="${currentQty}"
              placeholder="Enter new quantity"
            >
            <p id="swal-stock-warning" class="text-[11px] text-slate-500 mt-1">
              Decreasing quantity restores pieces to Stock 1. Increasing quantity requires sufficient Stock 1.
            </p>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Reason for Modification: <span class="text-rose-600">*</span></label>
            <input 
              id="swal-edit-reason" 
              type="text" 
              class="swal2-input !m-0 !w-full !text-sm !h-10" 
              placeholder="e.g. Scanned recount, operator correction"
            >
          </div>
        </div>
      `,
      didOpen: () => {
        const qtyInput = document.getElementById("swal-edit-qty") as HTMLInputElement;
        const warningEl = document.getElementById("swal-stock-warning") as HTMLElement;

        qtyInput?.addEventListener("input", () => {
          const val = parseInt(qtyInput.value || "0", 10);
          if (!isNaN(val) && val > currentQty) {
            const diff = val - currentQty;
            if (diff > availableStock1) {
              warningEl.innerHTML = `<span class="text-rose-600 font-bold">⚠️ Warning: Increasing by ${diff} PCS exceeds Stock 1 available (${availableStock1} PCS). This will be blocked.</span>`;
            } else {
              warningEl.innerHTML = `<span class="text-amber-700 font-medium">Increasing by +${diff} PCS: will deduct ${diff} from Stock 1 and add to Stock 2.</span>`;
            }
          } else if (!isNaN(val) && val < currentQty && val > 0) {
            const diff = currentQty - val;
            warningEl.innerHTML = `<span class="text-emerald-700 font-medium">Decreasing by -${diff} PCS: will restore ${diff} PCS back to Stock 1 and deduct from Stock 2.</span>`;
          } else {
            warningEl.innerHTML = `Decreasing quantity restores pieces to Stock 1. Increasing quantity requires sufficient Stock 1.`;
          }
        });
      },
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Save & Adjust Stock",
      confirmButtonColor: "#2563eb",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const qtyEl = document.getElementById("swal-edit-qty") as HTMLInputElement;
        const reasonEl = document.getElementById("swal-edit-reason") as HTMLInputElement;
        const newQty = parseInt(qtyEl?.value || "0", 10);
        const reason = reasonEl?.value?.trim() || "";

        if (isNaN(newQty) || newQty <= 0) {
          Swal.showValidationMessage("Please enter a valid positive quantity.");
          return false;
        }

        if (newQty === currentQty) {
          Swal.showValidationMessage("New quantity is identical to current quantity.");
          return false;
        }

        // Check if Stock 1 has enough if increasing
        if (newQty > currentQty) {
          const diff = newQty - currentQty;
          if (diff > availableStock1) {
            Swal.showValidationMessage(`Insufficient Stock 1! Needs +${diff} PCS, but Stock 1 only has ${availableStock1} PCS.`);
            return false;
          }
        }

        if (!reason) {
          Swal.showValidationMessage("Please enter a reason for the modification.");
          return false;
        }

        return { newQty, reason };
      }
    });

    if (formValues) {
      try {
        await onEditOperation(tx.id, "transfer", formValues.newQty, formValues.reason);
        await Swal.fire({
          icon: "success",
          title: "PEGADAS RECORD UPDATED",
          html: `
            <div class="text-xs text-left p-3 bg-slate-50 border border-slate-200 rounded font-mono">
              <p><strong>Reference:</strong> ${tx.reference}</p>
              <p><strong>Quantity:</strong> ${currentQty} ➔ <strong class="text-blue-600">${formValues.newQty} PCS</strong></p>
              <p><strong>Stock Adjustment:</strong> Atomically synchronized in Stock 1 & Stock 2</p>
            </div>
          `,
          timer: 1800,
          showConfirmButton: false
        });
      } catch (err: any) {
        console.error(err);
        await Swal.fire("Error", err?.message || "Failed to modify record.", "error");
      }
    }
  };

  // Safe Operator Deletion / Reversal
  const handleDeletePegadasRecord = async (tx: InventoryTransaction) => {
    if (!onDeleteOperation) return;

    // Verify operator permission
    if (currentUser.role === "operator") {
      if (cleanOpName(tx.operatorName) !== cleanOpName(currentUser.fullName)) {
        await Swal.fire("Unauthorized", "You can only reverse your own PEGADAS records.", "error");
        return;
      }
    }

    if (tx.status === "REVERSED") {
      await Swal.fire("Already Reversed", "This operation has already been reversed.", "info");
      return;
    }

    const currentQty = tx.quantity || 0;
    const timeFormatted = formatSystemTimeOnly(tx.timestamp);

    const { value: reason } = await Swal.fire({
      title: "Reverse Validated PEGADAS Operation?",
      html: `
        <div class="text-left text-xs font-sans space-y-3">
          <p class="text-slate-600">
            You are about to reverse this PEGADAS transfer operation:
          </p>
          <div class="p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p><strong>Reference:</strong> <span class="font-mono text-rose-700 font-bold">${tx.reference}</span></p>
            <p><strong>Quantity:</strong> <strong class="text-slate-800">${currentQty.toLocaleString()} PCS</strong></p>
            <p><strong>Recorded Time:</strong> ${timeFormatted}</p>
          </div>
          <div class="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] leading-relaxed">
            <strong>Stock Effect:</strong>
            <ul class="list-disc pl-4 mt-1 space-y-0.5">
              <li>Stock 1 will be <strong>increased by +${currentQty} PCS</strong></li>
              <li>Stock 2 will be <strong>reduced by -${currentQty} PCS</strong></li>
              <li>The record will remain traceable with status <strong>REVERSED</strong></li>
            </ul>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Reason for Reversal: <span class="text-rose-600">*</span></label>
            <input 
              id="swal-reversal-reason" 
              type="text" 
              class="swal2-input !m-0 !w-full !text-sm !h-10" 
              placeholder="e.g. Scanned wrong reference, duplicate scan"
            >
          </div>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Reverse & Restore Stock",
      cancelButtonText: "Keep Operation",
      preConfirm: () => {
        const reasonInput = document.getElementById("swal-reversal-reason") as HTMLInputElement;
        const val = reasonInput?.value?.trim() || "";
        if (!val) {
          Swal.showValidationMessage("Please provide a reason for the reversal.");
          return false;
        }
        return val;
      }
    });

    if (reason) {
      try {
        await onDeleteOperation(tx.id, "transfer", reason);
        await Swal.fire({
          icon: "success",
          title: "PEGADAS OPERATION REVERSED",
          html: `
            <div class="text-xs text-left p-3 bg-slate-50 border border-slate-200 rounded font-mono">
              <p><strong>Reference:</strong> ${tx.reference}</p>
              <p><strong>Reversed Quantity:</strong> ${currentQty} PCS</p>
              <p class="text-emerald-700 font-semibold mt-1">✓ Stock 1 +${currentQty} PCS | Stock 2 -${currentQty} PCS</p>
              <p class="text-slate-500 mt-1">Status set to REVERSED for full audit traceability.</p>
            </div>
          `,
          timer: 2000,
          showConfirmButton: false
        });
      } catch (err: any) {
        console.error(err);
        await Swal.fire("Error", err?.message || "Failed to reverse operation.", "error");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-2xs">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                  MALLAS PEGADAS
                </h2>
              </div>
            </div>
          </div>

          {/* Scan button */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab("operator")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Transfer Mesh</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Today's Pegadas</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold font-mono text-teal-700">{stats.todayPcs.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-500">PCS</span>
            </div>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Today's Operations</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold font-mono text-slate-800">{stats.todayOps}</span>
              <span className="text-xs font-semibold text-slate-500">batches</span>
            </div>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Selected View Total</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold font-mono text-slate-900">{stats.totalFilteredPcs.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-500">PCS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Time Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date:
            </span>
            <button
              onClick={() => { setTimeFilter("today"); setCustomDate(""); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                timeFilter === "today" && !customDate
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => { setTimeFilter("yesterday"); setCustomDate(""); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                timeFilter === "yesterday" && !customDate
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => { setTimeFilter("week"); setCustomDate(""); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                timeFilter === "week" && !customDate
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => { setTimeFilter("month"); setCustomDate(""); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                timeFilter === "month" && !customDate
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => { setTimeFilter("all"); setCustomDate(""); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                timeFilter === "all" && !customDate
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              All Time
            </button>

            {/* Custom Date input */}
            <input 
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setTimeFilter("all");
              }}
              title="Filter by specific date"
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
            {customDate && (
              <button
                onClick={() => setCustomDate("")}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Search Box & Expand Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reference code or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grouped Content: Grouped by Date + Reference */}
      <div className="space-y-4">
        {groupedData.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">No Validated PEGADAS Records Found</h3>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab("operator")}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Scan className="w-4 h-4" />
                <span>Go to Operator Scan</span>
              </button>
            )}
          </div>
        ) : (
          groupedData.map((group) => {
            const isExpanded = !!expandedGroups[group.id];
            const refMeta = group.referenceData;

            return (
              <div 
                key={group.id} 
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl overflow-hidden shadow-xs transition-all"
              >
                {/* Group Summary Row / Card Header */}
                <div 
                  onClick={() => toggleGroup(group.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none bg-gradient-to-r from-white via-white to-slate-50/50 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center font-bold shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Reference Code in high contrast bold */}
                        <span className="font-mono font-bold text-base sm:text-lg text-slate-900 tracking-tight">
                          {group.reference}
                        </span>

                        {/* Material badge */}
                        {refMeta?.materialType && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {refMeta.materialType}
                          </span>
                        )}

                        {/* Customer badge */}
                        {refMeta?.customer && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {refMeta.customer}
                          </span>
                        )}

                        {/* Reversal tag if any */}
                        {group.reversedCount > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            {group.reversedCount} reversed
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1 font-medium text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {group.formattedDate}
                        </span>
                        {refMeta?.description && (
                          <span className="truncate max-w-xs text-slate-500 hidden sm:inline">
                            {refMeta.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Daily Total for this Reference */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Validated Total
                      </div>
                      <div className="flex items-baseline sm:justify-end gap-1.5">
                        <span className="font-mono font-black text-xl sm:text-2xl text-teal-700">
                          {group.totalQty.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-slate-600">PCS</span>
                      </div>
                      <span className="text-[11px] text-slate-400 block">
                        {group.activeCount} operation{group.activeCount !== 1 ? "s" : ""}
                        {group.reversedCount > 0 ? ` (${group.reversedQty} pcs reversed)` : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 hover:text-slate-600">
                      <span className="text-xs font-semibold text-slate-500 hidden md:inline">
                        {isExpanded ? "Hide details" : "View operations"}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-teal-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Individual Operations List */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Individual PEGADAS Operations ({group.operations.length})
                      </h4>
                    </div>

                    <div className="space-y-2">
                      {group.operations.map((op) => {
                        const isReversed = op.status === "REVERSED" || op.notes?.toLowerCase().includes("reversed");
                        const isEdited = op.changeHistory && op.changeHistory.length > 0;
                        const timeOnly = formatSystemTimeOnly(op.timestamp);
                        const canModify = currentUser.role !== "operator" || cleanOpName(op.operatorName) === cleanOpName(currentUser.fullName);

                        return (
                          <div 
                            key={op.id}
                            className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isReversed
                                ? "bg-slate-100/80 border-slate-200 opacity-75"
                                : "bg-white border-slate-200 shadow-2xs hover:border-slate-300"
                            }`}
                          >
                            {/* Left details */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                isReversed 
                                  ? "bg-rose-50 text-rose-600 border border-rose-200" 
                                  : "bg-teal-50 text-teal-700 border border-teal-200"
                              }`}>
                                {isReversed ? (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Time */}
                                  <span className="font-mono text-xs font-bold text-slate-700 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {timeOnly}
                                  </span>

                                  {/* Status Badge */}
                                  {isReversed ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wide">
                                      REVERSED
                                    </span>
                                  ) : isEdited ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">
                                      EDITED
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">
                                      VALIDATED
                                    </span>
                                  )}

                                  {/* Operator badge */}
                                  <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                    <UserIcon className="w-3 h-3 text-slate-400" />
                                    {op.operatorName}
                                  </span>
                                </div>

                                {/* Notes & Audit trace */}
                                <div className="text-[11px] text-slate-500 mt-1 truncate max-w-lg">
                                  {isReversed ? (
                                    <span className="text-rose-600 font-medium">
                                      Reversed: {op.reversalReason || "Operator reversal"}
                                    </span>
                                  ) : isEdited && op.originalQuantity ? (
                                    <span className="text-amber-700 font-medium">
                                      Originally {op.originalQuantity} PCS → {op.quantity} PCS
                                      {op.notes ? ` (${op.notes})` : ""}
                                    </span>
                                  ) : (
                                    <span>{op.notes || "Stock 1 → Stock 2 (Pegadas Gluing Transfer)"}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right quantity & action buttons */}
                            <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              <div className="text-left sm:text-right">
                                <div className={`font-mono font-bold text-base ${
                                  isReversed ? "line-through text-slate-400" : "text-slate-900"
                                }`}>
                                  {op.quantity} <span className="text-xs font-semibold text-slate-500">PCS</span>
                                </div>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  ID: {op.id.slice(-8)}
                                </span>
                              </div>

                              {/* Actions for non-reversed records */}
                              {!isReversed && canModify && (
                                <div className="flex items-center gap-1.5">
                                  {onEditOperation && (
                                    <button
                                      onClick={() => handleEditPegadasRecord(op)}
                                      title="Modify quantity of this operation"
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-all cursor-pointer active:scale-95"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                  )}

                                  {onDeleteOperation && (
                                    <button
                                      onClick={() => handleDeletePegadasRecord(op)}
                                      title="Reverse this operation and restore Stock 1"
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-all cursor-pointer active:scale-95"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>Reverse</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
