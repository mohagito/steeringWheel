import React, { useState, useRef, useEffect } from "react";
import { Reference } from "../types";
import { Search, ChevronDown, Check, X, Package, Layers } from "lucide-react";

interface CustomReferenceSelectProps {
  references: Reference[];
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  showStockBadges?: boolean;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  size?: "sm" | "md" | "lg";
}

export const CustomReferenceSelect: React.FC<CustomReferenceSelectProps> = ({
  references = [],
  value,
  onChange,
  placeholder = "Select reference...",
  showStockBadges = true,
  className = "",
  disabled = false,
  required = false,
  size = "md"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedRef = references.find(
    (r) => r.code.toUpperCase() === value.trim().toUpperCase()
  );

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm("");
    }
  }, [isOpen]);

  const filteredReferences = references.filter((r) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.code.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.customer && r.customer.toLowerCase().includes(q)) ||
      (r.id && r.id.toLowerCase().includes(q))
    );
  });

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
  };

  const isSmall = size === "sm";

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      {/* Hidden native input for form validation if required */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          tabIndex={-1}
          className="sr-only opacity-0 w-0 h-0 absolute"
        />
      )}

      {/* Select Trigger Box */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full text-left bg-slate-50 hover:bg-slate-100/90 border border-slate-200/90 focus:border-blue-500 focus:bg-white rounded-2xl transition-all shadow-2xs flex items-center justify-between gap-2.5 cursor-pointer min-h-[42px] ${
          isSmall ? "px-3 py-2 text-xs" : "px-3.5 py-2.5 text-xs sm:text-sm"
        } ${disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : ""} ${
          isOpen ? "ring-2 ring-blue-500/20 border-blue-500 bg-white shadow-md" : ""
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
            <Package className="w-4 h-4" />
          </div>
          {selectedRef ? (
            <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="font-mono font-black text-slate-900 tracking-tight text-xs sm:text-sm truncate">
                  {selectedRef.code}
                </span>
                {selectedRef.customer && (
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md uppercase shrink-0">
                    {selectedRef.customer}
                  </span>
                )}
              </div>

              {showStockBadges && (
                <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono">
                  <span className="px-1.5 py-0.5 bg-blue-100/80 text-blue-900 rounded-md font-bold" title="Stock 1 Raw">
                    S1: {selectedRef.stock1 || 0}
                  </span>
                  <span className="px-1.5 py-0.5 bg-amber-100/80 text-amber-900 rounded-md font-bold" title="Stock 2 WIP">
                    S2: {selectedRef.stock2 || 0}
                  </span>
                  <span className="px-1.5 py-0.5 bg-emerald-100/80 text-emerald-900 rounded-md font-bold" title="Stock 3 Finished">
                    S3: {selectedRef.stock3 || 0}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-sans font-medium">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && !disabled && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="p-1 hover:text-slate-700 hover:bg-slate-200/70 rounded-full transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? "rotate-180 text-blue-600" : ""
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[320px] sm:min-w-[380px] max-w-[94vw] bg-white border border-slate-200/90 rounded-2xl shadow-2xl z-[999] overflow-hidden flex flex-col max-h-80 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search Header */}
          <div className="p-3 bg-slate-50/90 border-b border-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reference code, description, customer..."
              className="w-full bg-transparent text-xs sm:text-sm font-sans text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Results Info */}
          <div className="px-3.5 py-1.5 bg-slate-100/60 border-b border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>{filteredReferences.length} references found</span>
            <span className="hidden sm:inline">Click to select</span>
          </div>

          {/* Items List */}
          <div className="overflow-y-auto p-1.5 space-y-1">
            {filteredReferences.length > 0 ? (
              filteredReferences.map((r) => {
                const isSelected = r.code.toUpperCase() === value.trim().toUpperCase();
                return (
                  <button
                    key={r.id || r.code}
                    type="button"
                    onClick={() => handleSelect(r.code)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/90 border border-blue-300 text-blue-900 font-medium shadow-2xs"
                        : "hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-transparent"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs sm:text-sm text-slate-900 tracking-tight">
                          {r.code}
                        </span>
                        {r.customer && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md uppercase">
                            {r.customer}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-sans">
                          {r.description}
                        </p>
                      )}
                    </div>

                    {/* Stock levels pills */}
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono self-start sm:self-center">
                      <span className="px-2 py-0.5 bg-blue-100/80 text-blue-900 rounded-md font-bold" title="Stock 1 Raw">
                        S1: {r.stock1 || 0}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-100/80 text-amber-900 rounded-md font-bold" title="Stock 2 WIP">
                        S2: {r.stock2 || 0}
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100/80 text-emerald-900 rounded-md font-bold" title="Stock 3 Finished">
                        S3: {r.stock3 || 0}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600 ml-1 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 font-sans flex flex-col items-center gap-1.5">
                <Layers className="w-7 h-7 text-slate-300 stroke-1" />
                <span className="font-medium">No matching references found</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
