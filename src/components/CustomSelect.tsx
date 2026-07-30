import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options = [],
  value,
  onChange,
  placeholder = "Select option...",
  className = "",
  disabled = false,
  required = false,
  size = "md",
  icon
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isSmall = size === "sm";

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
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
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          {selectedOption ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {selectedOption.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              <span className="font-sans font-bold text-slate-900 truncate">
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-md shrink-0">
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-sans font-medium">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-blue-600" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[220px] max-w-[92vw] bg-white border border-slate-200 rounded-2xl shadow-2xl z-[999] overflow-hidden max-h-64 overflow-y-auto p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/90 text-blue-900 font-bold border border-blue-200 shadow-2xs"
                    : "hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold truncate">{opt.label}</p>
                    {opt.description && (
                      <p className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5 font-sans font-normal">
                        {opt.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {opt.badge && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded-md">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
