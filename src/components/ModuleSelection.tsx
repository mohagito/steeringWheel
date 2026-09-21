import { User } from "../types";
import { LogOut } from "lucide-react";
import { motion } from "motion/react";

interface ModuleSelectionProps {
  onSelectModule: (module: "meshes" | "bezel") => void;
  currentUser: User;
  onLogout: () => void;
}

export default function ModuleSelection({
  onSelectModule,
  currentUser,
  onLogout,
}: ModuleSelectionProps) {
  return (
    <div
      className="min-h-screen bg-[#070e18] text-slate-100 flex flex-col items-center justify-between p-6 select-none relative overflow-y-auto"
      id="module-selection-screen"
    >
      {/* Background Subtle Industrial Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-[#0a1424]/60 via-transparent to-[#050b14] opacity-80" />

      {/* Top Bar / Branding */}
      <header className="w-full max-w-md pt-4 sm:pt-8 flex flex-col items-center z-10">
        <img
          src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp"
          alt="EPP NATUR Logo"
          className="h-9 sm:h-10 object-contain filter brightness-110 mb-4"
          referrerPolicy="no-referrer"
        />
        <h1
          id="module-selection-title"
          className="text-lg sm:text-xl font-bold tracking-[0.25em] text-slate-200 uppercase font-mono text-center"
        >
          EPP MANAGEMENT
        </h1>
      </header>

      {/* Main Module Selection Area */}
      <main className="w-full max-w-sm py-12 flex flex-col items-stretch gap-4 z-10">
        {/* MESHES Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectModule("meshes")}
          id="btn-select-module-meshes"
          className="w-full h-20 sm:h-24 bg-[#0d223a] hover:bg-[#122e4e] text-white border-2 border-blue-500/60 hover:border-blue-400 rounded-xl flex items-center justify-center font-bold tracking-widest text-xl sm:text-2xl uppercase transition-all shadow-xl shadow-blue-950/40 cursor-pointer active:scale-98"
        >
          MESHES
        </motion.button>

        {/* BEZEL Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectModule("bezel")}
          id="btn-select-module-bezel"
          className="w-full h-20 sm:h-24 bg-[#0c1624] hover:bg-[#121f33] text-slate-200 hover:text-white border-2 border-slate-700/80 hover:border-slate-500 rounded-xl flex items-center justify-center font-bold tracking-widest text-xl sm:text-2xl uppercase transition-all shadow-xl cursor-pointer active:scale-98"
        >
          BEZEL
        </motion.button>
      </main>

      {/* Footer / User Session */}
      <footer className="w-full max-w-md pb-4 sm:pb-8 flex items-center justify-between z-10 border-t border-slate-800/80 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center uppercase font-mono border border-slate-700">
            {currentUser.fullName.slice(0, 2)}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 leading-tight">
              {currentUser.fullName}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
              {currentUser.role === "admin"
                ? "Manager"
                : currentUser.role === "supervisor"
                ? "Supervisor"
                : "Operator"}
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          id="btn-module-selection-logout"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-900/50 text-xs font-semibold transition-all cursor-pointer"
          title="Exit Session"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </footer>
    </div>
  );
}
