import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Settings as SettingsIcon, 
  CheckCircle2, 
  AlertCircle,
  X,
  Layers,
  ArrowUpRight
} from "lucide-react";
import { User, BlueMaterialSettings, BlueMaterialMovement } from "../types";
import { 
  subscribeToBlueMaterialSettings,
  subscribeToBlueMaterialMovements,
  seedBlueMaterialIfEmpty,
  addBlueMaterialReceipt,
  updateCoveragePerRoll,
  DEFAULT_BLUE_MATERIAL_SETTINGS
} from "../services/blueMaterialService";
import { getMoroccoTodayDateString } from "../utils/timeUtils";

interface BlueMaterialWorkspaceProps {
  currentUser: User;
  onBackToStock?: () => void;
}

export default function BlueMaterialWorkspace({
  currentUser,
}: BlueMaterialWorkspaceProps) {
  const [settings, setSettings] = useState<BlueMaterialSettings>(DEFAULT_BLUE_MATERIAL_SETTINGS);
  const [movements, setMovements] = useState<BlueMaterialMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [rollsInput, setRollsInput] = useState<string>("1");
  const [receivedDateInput, setReceivedDateInput] = useState<string>(getMoroccoTodayDateString());
  const [coverageInput, setCoverageInput] = useState<string>("5000");

  // Notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const isManager = currentUser.role === "admin" || currentUser.role === "supervisor";

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    // Seed initial demo/reference data if Firestore is empty
    seedBlueMaterialIfEmpty();

    // Subscribe to settings
    const unsubSettings = subscribeToBlueMaterialSettings((loadedSettings) => {
      setSettings(loadedSettings);
      setCoverageInput(String(loadedSettings.coveragePerRoll || 5000));
      setIsLoading(false);
    });

    // Subscribe to movements history
    const unsubMovements = subscribeToBlueMaterialMovements((loadedMovements) => {
      setMovements(loadedMovements);
    });

    return () => {
      unsubSettings();
      unsubMovements();
    };
  }, []);

  // Live calculation: Available Rolls × Coverage Per Roll
  const availableRolls = settings.totalAvailableRolls || 0;
  const coveragePerRoll = settings.coveragePerRoll || 5000;
  const estimatedCoverage = availableRolls * coveragePerRoll;

  // Handle Add Material submission
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(rollsInput, 10);
    if (isNaN(count) || count <= 0) {
      showToast("Enter a valid number of rolls", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const opId = await addBlueMaterialReceipt({
        rolls: count,
        receivedDate: receivedDateInput || getMoroccoTodayDateString(),
        currentUser,
      });
      showToast(`+ ${count} Rolls added successfully (#${opId})`, "success");
      setIsAddModalOpen(false);
      setRollsInput("1");
    } catch (err: any) {
      showToast(err.message || "Failed to add material", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Coverage Setting update (Managers only)
  const handleUpdateCoverage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) {
      showToast("Only managers can change coverage settings", "error");
      return;
    }

    const newCov = parseInt(coverageInput, 10);
    if (isNaN(newCov) || newCov <= 0) {
      showToast("Enter a valid coverage quantity", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateCoveragePerRoll(newCov, currentUser);
      showToast(`Coverage set to ${newCov.toLocaleString()} pcs / roll`, "success");
      setIsSettingsModalOpen(false);
    } catch (err: any) {
      showToast(err.message || "Failed to update coverage", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format date helper: DD/MM/YYYY HH:mm
  const formatDateTime = (timestamp: any, receivedDate?: string) => {
    if (!timestamp && !receivedDate) return "—";
    try {
      const dateObj = timestamp ? new Date(timestamp) : new Date(receivedDate + "T00:00:00");
      if (isNaN(dateObj.getTime())) return receivedDate || "—";
      
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const year = dateObj.getFullYear();
      const hours = String(dateObj.getHours()).padStart(2, "0");
      const mins = String(dateObj.getMinutes()).padStart(2, "0");

      if (timestamp) {
        return `${day}/${month}/${year} ${hours}:${mins}`;
      }
      return `${day}/${month}/${year}`;
    } catch {
      return receivedDate || "—";
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto" id="blue-material-workspace">
      {/* Toast Notification */}
      {toast && (
        <div
          id="blue-material-toast"
          className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-display flex items-center gap-2.5">
          <Layers className="w-6 h-6 text-blue-600 shrink-0" />
          <span>BLUE MATERIAL</span>
        </h2>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Available Rolls */}
        <div 
          id="card-available-rolls"
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Available Rolls
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-blue-600 font-mono tracking-tight">
              {availableRolls}
            </span>
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              {availableRolls === 1 ? "Roll" : "Rolls"}
            </span>
          </div>
        </div>

        {/* Estimated Coverage */}
        <div 
          id="card-estimated-coverage"
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Estimated Coverage
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-slate-800 font-mono tracking-tight">
              {estimatedCoverage.toLocaleString()}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              pcs
            </span>
          </div>
        </div>
      </div>

      {/* Action Bar: [+ ADD MATERIAL] & [ ⚙ ] */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => {
            setRollsInput("1");
            setReceivedDateInput(getMoroccoTodayDateString());
            setIsAddModalOpen(true);
          }}
          id="btn-add-blue-material"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>+ ADD MATERIAL</span>
        </button>

        {isManager && (
          <button
            onClick={() => {
              setCoverageInput(String(coveragePerRoll));
              setIsSettingsModalOpen(true);
            }}
            id="btn-blue-material-settings"
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Coverage Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Recent Movements Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            RECENT MOVEMENTS
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {movements.length} records
          </span>
        </div>

        {movements.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium">
            No movements recorded yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" id="table-blue-material-movements">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-5">Movement</th>
                  <th className="py-2.5 px-5">Date</th>
                  <th className="py-2.5 px-5">Operator</th>
                  <th className="py-2.5 px-5 text-right">Operation ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-5 font-bold font-mono text-blue-700">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>+ {m.rolls} {m.rolls === 1 ? "Roll" : "Rolls"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-slate-600 font-mono">
                      {formatDateTime(m.timestamp, m.receivedDate)}
                    </td>
                    <td className="py-3 px-5 font-medium text-slate-800">
                      {m.operatorName || "—"}
                    </td>
                    <td className="py-3 px-5 text-right font-mono text-slate-400 text-[11px]">
                      {m.operationId || m.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: + ADD MATERIAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Add Material
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMaterial} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Number of Rolls
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  autoFocus
                  value={rollsInput}
                  onChange={(e) => setRollsInput(e.target.value)}
                  id="input-add-rolls"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 4"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Received Date
                </label>
                <input
                  type="date"
                  required
                  value={receivedDateInput}
                  onChange={(e) => setReceivedDateInput(e.target.value)}
                  id="input-received-date"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  id="btn-submit-add-material"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: ⚙ SETTINGS (Coverage Per Roll) */}
      {isSettingsModalOpen && isManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Coverage Setting
              </h3>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCoverage} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  COVERAGE PER ROLL
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    autoFocus
                    value={coverageInput}
                    onChange={(e) => setCoverageInput(e.target.value)}
                    id="input-coverage-per-roll"
                    className="w-full pl-3 pr-12 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="5000"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    pcs
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  id="btn-submit-coverage-settings"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
