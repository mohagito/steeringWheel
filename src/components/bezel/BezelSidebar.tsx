import React from "react";
import { ClipboardCheck, Layers, ChevronRight, FileText } from "lucide-react";
import { UserRole } from "../../types";

export interface BezelSidebarSection {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  managerOnly?: boolean;
}

interface BezelSidebarProps {
  activeSection: string;
  onSelectSection: (sectionId: string) => void;
  userRole: UserRole;
  referencesCount: number;
  operationsCount: number;
  invoicesCount?: number;
}

export default function BezelSidebar({
  activeSection,
  onSelectSection,
  userRole,
  referencesCount,
  operationsCount,
  invoicesCount = 0
}: BezelSidebarProps) {
  const isManager = userRole === "admin" || userRole === "supervisor";

  // Extensible section configuration designed so more Bezel sections can be plugged in seamlessly
  const sections: BezelSidebarSection[] = [
    {
      id: "invoices",
      label: "INCOMING INVOICES",
      subtitle: "Truck receipts & records",
      icon: FileText,
      badge: `${invoicesCount} inv`
    },
    {
      id: "operations",
      label: "OPERATIONS & STOCK",
      subtitle: "Live stock & movements log",
      icon: Layers,
      badge: `${operationsCount} ops`
    },
    {
      id: "inventory",
      label: "STOCK INVENTORY",
      subtitle: "Physical count & reconciliation",
      icon: ClipboardCheck,
      badge: `${referencesCount} refs`,
      managerOnly: true
    }
  ];

  return (
    <aside
      id="bezel-vertical-sidebar"
      className="w-full md:w-64 bg-[#0a1322] text-slate-300 border-b md:border-b-0 md:border-r border-[#1e293b] shrink-0 p-3 sm:p-4 flex flex-col justify-between"
    >
      <div>
        {/* Sidebar Header Title */}
        <div className="px-3 py-2.5 mb-3 border-b border-[#1e293b]">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">
            Bezel Sections
          </span>
          <div className="text-xs font-bold text-white">Workspace Navigation</div>
        </div>

        {/* Vertical Section Buttons */}
        <nav className="space-y-1.5" id="bezel-sidebar-nav">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                id={`bezel-sidebar-btn-${section.id}`}
                onClick={() => onSelectSection(section.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                  isActive
                    ? "bg-[#0f1e36] text-white border-blue-500/60 shadow-md shadow-black/20"
                    : "bg-[#0e192c]/50 hover:bg-[#0f1e36]/70 text-slate-300 hover:text-white border-[#1e293b]/70 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-[#14233c] text-slate-400 group-hover:text-slate-200 group-hover:bg-[#1a2e4e]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold tracking-tight font-mono truncate">
                        {section.label}
                      </span>
                    </div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? "text-slate-300" : "text-slate-500 group-hover:text-slate-400"
                      }`}
                    >
                      {section.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {section.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isActive
                          ? "bg-blue-950/80 text-blue-300 border border-blue-800/60"
                          : "bg-[#14233c] text-slate-400 border border-[#1e293b]"
                      }`}
                    >
                      {section.badge}
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      isActive ? "text-blue-400 translate-x-0.5" : "text-slate-500 group-hover:text-slate-300"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer info */}
      <div className="mt-4 pt-3 border-t border-[#1e293b] px-3 hidden md:block">
        <div className="text-[10px] font-mono text-slate-400 leading-tight">
          Module: <strong className="text-slate-200">BEZEL</strong>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Atomic Firestore Engine
        </div>
      </div>
    </aside>
  );
}
