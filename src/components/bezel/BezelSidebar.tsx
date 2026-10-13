import React from "react";
import { 
  Database,
  Truck, 
  FileText, 
  ClipboardCheck, 
  History,
  ArrowLeft, 
  LogOut,
  Layers
} from "lucide-react";
import { User, UserRole } from "../../types";

export interface BezelSidebarSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  managerOnly?: boolean;
  isSpecialIndigo?: boolean;
  isSpecialAmber?: boolean;
}

interface BezelSidebarProps {
  activeSection: string;
  onSelectSection: (sectionId: string) => void;
  userRole?: UserRole;
  currentUser: User;
  onBackToModules: () => void;
  onLogout: () => void;
  referencesCount: number;
  operationsCount: number;
  invoicesCount?: number;
}

export default function BezelSidebar({
  activeSection,
  onSelectSection,
  userRole,
  currentUser,
  onBackToModules,
  onLogout,
  referencesCount,
  operationsCount,
  invoicesCount = 0
}: BezelSidebarProps) {
  const role = userRole || currentUser.role;
  const isManager = role === "admin" || role === "supervisor";

  const sections: BezelSidebarSection[] = [
    {
      id: "stock",
      label: "Stock",
      icon: Database
    },
    {
      id: "inventory",
      label: "STOCK INVENTORY",
      icon: ClipboardCheck,
      managerOnly: true,
      isSpecialIndigo: true
    },
    {
      id: "invoices",
      label: "Invoices",
      icon: FileText,
      badge: invoicesCount > 0 ? invoicesCount : undefined
    },
    {
      id: "deliveries",
      label: "Deliveries",
      icon: Truck
    },
    {
      id: "blue-material",
      label: "BLUE MATERIAL",
      icon: Layers
    },
    {
      id: "records",
      label: "RECORDS",
      icon: History,
      isSpecialAmber: true,
      badge: operationsCount > 0 ? operationsCount : undefined
    }
  ];

  return (
    <aside 
      id="bezel-vertical-sidebar"
      className="w-full md:w-64 bg-[#0a1322] text-slate-300 flex flex-col justify-between p-5 md:p-6 shrink-0 border-b md:border-b-0 md:border-r border-[#1e293b]"
    >
      <div className="space-y-6 md:space-y-8">
        {/* EPP Natur Branding */}
        <div className="select-none flex flex-col items-start gap-1 mb-2" id="bezel-sidebar-epp-natur-logo">
          <img 
            src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
            alt="EPP NATUR Logo" 
            className="h-8 object-contain filter brightness-110 mb-1"
            referrerPolicy="no-referrer"
          />
          <div className="text-[8px] text-slate-500 uppercase tracking-[0.2em] font-mono font-bold ml-1">
            STEERING WHEEL STOCK
          </div>
        </div>

        {/* Module Switcher for All Portals */}
        <button
          onClick={onBackToModules}
          id="bezel-sidebar-back-to-modules-btn"
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#0e1d33] hover:bg-[#142845] text-slate-300 hover:text-white text-xs font-semibold tracking-wide border border-blue-900/40 hover:border-blue-500/50 transition-all cursor-pointer shadow-xs active:scale-98"
          title="Return to module selection (MESHES / BEZEL)"
        >
          <div className="flex items-center gap-2">
            <ArrowLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Modules</span>
          </div>
          <span className="text-[10px] text-blue-400 font-mono uppercase bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40">
            BEZEL
          </span>
        </button>

        {/* Navigation Items Matching Meshes Visual System */}
        <nav className="flex md:flex-col flex-row flex-wrap md:space-y-1 gap-1" id="bezel-primary-navigation-tabs">
          {sections.map((section) => {
            if (section.managerOnly && !isManager) return null;
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            const isSpecial = section.isSpecialIndigo;
            const isAmber = section.isSpecialAmber;

            return (
              <button
                key={section.id}
                onClick={() => onSelectSection(section.id)}
                id={`bezel-nav-tab-${section.id}`}
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center justify-between cursor-pointer w-full text-left select-none border-l-2 ${
                  isActive
                    ? isSpecial
                      ? "text-indigo-400 font-bold bg-[#0f1e36] border-indigo-400"
                      : isAmber
                        ? "text-amber-400 font-bold bg-[#0f1e36] border-amber-400"
                        : "text-white font-bold bg-[#0f1e36] border-brand-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isSpecial ? "text-indigo-400" : isAmber && isActive ? "text-amber-400" : ""}`} />
                  <span>{section.label}</span>
                </div>
                {section.badge !== undefined && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#14233c] text-slate-400 border border-[#1e293b]">
                    {section.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Session Footer Matching Meshes Design */}
      <div className="border-t border-slate-800 pt-4 mt-4 md:mt-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-slate-700 text-white font-bold text-sm rounded-full flex items-center justify-center uppercase shrink-0">
              {currentUser.fullName.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate" title={currentUser.fullName}>
                {currentUser.fullName}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                {currentUser.role === "admin" ? "Manager" : currentUser.role === "supervisor" ? "Supervisor" : "Operator"}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            id="bezel-sidebar-signout-btn"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
