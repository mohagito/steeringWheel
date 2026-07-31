import React, { useState, useEffect } from "react";
import { Reference, User } from "../types";
import { X, Plus, Edit3, Layers, CheckCircle2, AlertCircle } from "lucide-react";
import Swal from "sweetalert2";

interface AddEditReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingRef?: Reference | null; // If provided, edit mode
  currentUser: User;
  onCreateReference: (refData: {
    code: string;
    description: string;
    customer: string;
    materialType: string;
    associatedLeather?: string;
    active?: boolean;
  }) => Promise<void>;
  onUpdateReference: (refId: string, updatedFields: Partial<Reference>) => Promise<void>;
}

export const AddEditReferenceModal: React.FC<AddEditReferenceModalProps> = ({
  isOpen,
  onClose,
  existingRef = null,
  currentUser,
  onCreateReference,
  onUpdateReference,
}) => {
  const isEditMode = !!existingRef;

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [customer, setCustomer] = useState("");
  const [materialType, setMaterialType] = useState<string>("Mesh");
  const [associatedLeather, setAssociatedLeather] = useState("");
  const [active, setActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (existingRef) {
      setCode(existingRef.code || "");
      setDescription(existingRef.description || "");
      setCustomer(existingRef.customer || "");
      setMaterialType(existingRef.materialType || "Mesh");
      setAssociatedLeather(existingRef.associatedLeather || "");
      setActive(existingRef.active !== false);
    } else {
      setCode("");
      setDescription("");
      setCustomer("");
      setMaterialType("Mesh");
      setAssociatedLeather("");
      setActive(true);
    }
    setErrorMsg(null);
  }, [existingRef, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedDesc = description.trim();
    const trimmedCustomer = customer.trim().toUpperCase();

    if (!trimmedCode) {
      setErrorMsg("Reference code is required.");
      return;
    }

    if (!trimmedDesc) {
      setErrorMsg("Description is required.");
      return;
    }

    if (!trimmedCustomer) {
      setErrorMsg("Customer name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && existingRef) {
        await onUpdateReference(existingRef.id, {
          description: trimmedDesc,
          customer: trimmedCustomer,
          materialType: materialType.trim(),
          associatedLeather: associatedLeather.trim(),
          active,
        });

        await Swal.fire({
          title: "Reference Updated!",
          text: `Master reference ${trimmedCode} was successfully updated.`,
          icon: "success",
          timer: 1800,
          showConfirmButton: false,
        });
      } else {
        await onCreateReference({
          code: trimmedCode,
          description: trimmedDesc,
          customer: trimmedCustomer,
          materialType: materialType.trim(),
          associatedLeather: associatedLeather.trim(),
          active,
        });

        await Swal.fire({
          title: "Reference Created!",
          text: `New reference ${trimmedCode} added with 0 initial stock across all locations.`,
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      }

      onClose();
    } catch (err: any) {
      console.error("Reference save error:", err);
      setErrorMsg(err.message || "Failed to save reference.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              {isEditMode ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">
                {isEditMode ? `Edit Reference: ${existingRef.code}` : "Add New Reference"}
              </h3>
              <p className="text-xs text-slate-300">
                {isEditMode
                  ? "Update master metadata & activation status"
                  : "Create a new product reference in master inventory"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Reference Code */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Reference Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isEditMode}
              placeholder="e.g. 34340681C or MESH-A250"
              required
              className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-mono font-bold text-slate-900 uppercase focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${
                isEditMode ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
            />
            {isEditMode && (
              <p className="text-[11px] text-slate-400 mt-1">
                Reference codes cannot be renamed once created to protect historical records.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Description <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. MALLA CALEFACTADA CUERO SINTETICO C519"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          {/* Customer & Material Type Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Customer / Project <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="e.g. FORD, NISSAN, OPEL"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-bold text-slate-900 uppercase focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>

            {/* Material Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Material Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              >
                <option value="Mesh">Mesh</option>
                <option value="Soft">Soft</option>
              </select>
            </div>
          </div>

          {/* Associated Leather */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Associated Leather Reference(s)
            </label>
            <input
              type="text"
              value={associatedLeather}
              onChange={(e) => setAssociatedLeather(e.target.value)}
              placeholder="e.g. 34340664A or R000E487A, R000G739A"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-mono text-slate-800 uppercase focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          {/* Active Status Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Reference Status
              </label>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                active ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  active ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : isEditMode ? (
                <>
                  <Edit3 className="w-4 h-4" />
                  <span>Update Reference</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Reference</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
