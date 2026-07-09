import React, { useState, useMemo } from "react";
import { Box, Adjustment, Reference, User, ProductAssembly } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Search, CheckCircle2, AlertTriangle, Check, Boxes, Truck } from "lucide-react";

interface AssembliesWorkspaceProps {
  boxes: Box[];
  adjustments: Adjustment[];
  references: Reference[];
  currentUser: User;
  onLogProduction?: (ref: string, qty: number, notes?: string) => Promise<void>;
  onLogDelivery?: (ref: string, qty: number, customer: string, invoice: string) => Promise<void>;
}

export const PRODUCT_ASSEMBLIES: ProductAssembly[] = [
  {
    meshRef: "",
    gaineRef: "34358622A",
    finalRef: "34358621A",
    designation: "Conjunto cuero precosido P33 SW"
  },
  {
    meshRef: "",
    gaineRef: "A020M319B",
    finalRef: "A015E189B",
    designation: "PLANTILLA PRECOSID SPLIT LEATHER P64-P74"
  },
  {
    meshRef: "",
    gaineRef: "A020M334B",
    finalRef: "A020M330C",
    designation: "PLANTILLA PRECOSIDA TOP LEATHER P64-P74"
  },
  {
    meshRef: "",
    gaineRef: "A020M341B",
    finalRef: "A020M340C",
    designation: "PLANTILLA PRECO TOP LEATH PERF P64-P74"
  },
  {
    meshRef: "",
    gaineRef: "A022H262A",
    finalRef: "A022H261A",
    designation: "V316 MOM TEP PRESEWED"
  },
  {
    meshRef: "A026L577A",
    gaineRef: "A026F717A",
    finalRef: "A024J017A",
    designation: "PLANTILLA PRECOSIDA CALEFACT BJA RS LINE"
  },
  {
    meshRef: "",
    gaineRef: "A025N293A",
    finalRef: "A025N291A",
    designation: "PLANTILLA PRECOSIDA PCF SW OV64_OV85"
  },
  {
    meshRef: "",
    gaineRef: "A025P546A",
    finalRef: "A025P545A",
    designation: "PLANTILLA PRECOSIDA SPLIT K9 MCM PEUGEOT"
  },
  {
    meshRef: "",
    gaineRef: "A026F719A",
    finalRef: "A026F705A",
    designation: "PLANT_PREC Mainstream HJB PH2"
  },
  {
    meshRef: "",
    gaineRef: "A026F720A",
    finalRef: "A026F706A",
    designation: "PLANT_PREC Mainstream PD HJB PH2"
  },
  {
    meshRef: "A026K122B",
    gaineRef: "A026K160B",
    finalRef: "A026K152B",
    designation: "PLANTILLA PREC+MALLA SPLIT K9 MCM OVCTF"
  },
  {
    meshRef: "A026L577A",
    gaineRef: "A026F718A",
    finalRef: "A026K608A",
    designation: "PANEL-UNIT: Alpine_Heated PADDLE"
  },
  {
    meshRef: "34364719C",
    gaineRef: "A026L137A",
    finalRef: "A026L136A",
    designation: "PANEL-UNIT: Mainstream HEATED"
  },
  {
    meshRef: "34364719C",
    gaineRef: "A026L148A",
    finalRef: "A026L147A",
    designation: "PLANT_PREC+MALLA MAINSTREAM PAD HJB PH2"
  },
  {
    meshRef: "A025M750B",
    gaineRef: "A028J493A",
    finalRef: "A029H198A",
    designation: "PLANTILLA PREC+MALLA OV64 SW synthetic"
  },
  {
    meshRef: "R001E456B",
    gaineRef: "R001E455A",
    finalRef: "R001E399A",
    designation: "PLANT_PREC+MALLA P13A MC TEP"
  },
  {
    meshRef: "",
    gaineRef: "R001E454A",
    finalRef: "R001E452A",
    designation: "PLANTILLA PRECOSIDA TEP P13A MC"
  },
  {
    meshRef: "A025M750B",
    gaineRef: "R001F923A",
    finalRef: "R001F925A",
    designation: "PLANT PRECOSIDA+ MALLA PCF C/DIMPLE OV64"
  }
];

export default function AssembliesWorkspace({
  boxes,
  adjustments,
  references,
  currentUser,
  onLogProduction,
  onLogDelivery
}: AssembliesWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [meshFilter, setMeshFilter] = useState<"All" | "WithMesh" | "WithoutMesh">("All");
  const [selectedAssembly, setSelectedAssembly] = useState<ProductAssembly | null>(null);
  const [logQty, setLogQty] = useState<number>(300);
  const [logNotes, setLogNotes] = useState("");
  const [logCustomer, setLogCustomer] = useState("OPEL");
  const [logInvoice, setLogInvoice] = useState("");
  const [isLoggingDelivery, setIsLoggingDelivery] = useState(false);
  const [isLoggingProduction, setIsLoggingProduction] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const cleanBarcode = (val: string): string => {
    let clean = val.trim().toUpperCase();
    if (clean.length > 9) {
      const prefixes = ["I", "1", "P", "S"];
      if (prefixes.includes(clean[0])) {
        clean = clean.substring(1);
      }
    }
    return clean;
  };

  const getReferenceStock = (refCode: string): number => {
    if (!refCode) return 0;
    const cleanRef = cleanBarcode(refCode);
    return boxes
      .filter(b => cleanBarcode(b.reference) === cleanRef)
      .reduce((sum, b) => sum + b.expectedQty, 0);
  };

  const processedAssemblies = useMemo(() => {
    return PRODUCT_ASSEMBLIES.map(assembly => {
      const meshStock = assembly.meshRef ? getReferenceStock(assembly.meshRef) : 0;
      const gaineStock = getReferenceStock(assembly.gaineRef);
      const finalStock = getReferenceStock(assembly.finalRef);
      
      let maxAssemblies = 0;
      if (assembly.meshRef) {
        maxAssemblies = Math.min(meshStock, gaineStock);
      } else {
        maxAssemblies = gaineStock;
      }

      return {
        ...assembly,
        meshStock,
        gaineStock,
        finalStock,
        maxAssemblies
      };
    });
  }, [boxes]);

  const filteredAssemblies = useMemo(() => {
    return processedAssemblies.filter(asm => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        asm.finalRef.toLowerCase().includes(query) ||
        asm.gaineRef.toLowerCase().includes(query) ||
        asm.meshRef.toLowerCase().includes(query) ||
        asm.designation.toLowerCase().includes(query);

      const matchesMesh = 
        meshFilter === "All" ||
        (meshFilter === "WithMesh" && asm.meshRef !== "") ||
        (meshFilter === "WithoutMesh" && asm.meshRef === "");

      return matchesSearch && matchesMesh;
    });
  }, [processedAssemblies, searchQuery, meshFilter]);

  const handleOpenLogForm = (asm: ProductAssembly, type: "production" | "delivery") => {
    setSelectedAssembly(asm);
    setLogQty(300);
    setLogNotes("Dispatched under system auto-reduction.");
    setLogInvoice(`INV-${Math.floor(100000 + Math.random() * 900000)}`);
    setIsLoggingDelivery(type === "delivery");
    setIsLoggingProduction(type === "production");
    setActionError("");
    setActionSuccess("");
  };

  const executeLogDelivery = async () => {
    if (!selectedAssembly || !onLogDelivery) return;
    if (!logInvoice.trim()) {
      setActionError("Please enter an Invoice / Delivery Number.");
      return;
    }
    if (logQty <= 0) {
      setActionError("Please specify a valid quantity.");
      return;
    }

    try {
      setActionError("");
      await onLogDelivery(selectedAssembly.finalRef, logQty, logCustomer, logInvoice);
      setActionSuccess(`Shipped ${logQty} of ${selectedAssembly.finalRef}. Mesh deducted.`);
      
      setTimeout(() => {
        setIsLoggingDelivery(false);
        setSelectedAssembly(null);
        setActionSuccess("");
      }, 2000);
    } catch (err: any) {
      setActionError(err.message || "Failed to submit delivery.");
    }
  };

  const executeLogProduction = async () => {
    if (!selectedAssembly || !onLogProduction) return;
    try {
      setActionError("");
      await onLogProduction(selectedAssembly.finalRef, logQty, logNotes);
      setActionSuccess(`Successfully updated stock metrics!`);
      
      setTimeout(() => {
        setIsLoggingProduction(false);
        setSelectedAssembly(null);
        setActionSuccess("");
      }, 2000);
    } catch (err: any) {
      setActionError(err.message || "Failed to log production.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-1" id="precosido-workspace">
      
      {/* Simple, lightweight and elegant light control bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display font-bold text-slate-800 text-base">PRECOSIDO ({filteredAssemblies.length})</h3>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* Search box with very minimal text */}
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          {/* Simple selector */}
          <select
            value={meshFilter}
            onChange={(e) => setMeshFilter(e.target.value as any)}
            className="w-full sm:w-auto bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg py-1.5 px-3 focus:outline-none focus:border-indigo-500 focus:bg-white"
          >
            <option value="All">All Items</option>
            <option value="WithMesh">With Mesh</option>
            <option value="WithoutMesh">No Mesh</option>
          </select>
        </div>
      </div>

      {/* Clean Light Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="precosido-cards-grid">
        {filteredAssemblies.map((asm) => {
          const hasMesh = !!asm.meshRef;
          return (
            <div 
              key={asm.finalRef} 
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4 shadow-sm hover:shadow transition-all hover:border-slate-300"
            >
              {/* Header section with Reference Badge and Designation */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded">
                    {asm.finalRef}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    hasMesh ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {hasMesh ? 'Heated' : 'Standard'}
                  </span>
                </div>
                <h4 className="text-slate-800 font-semibold text-xs leading-normal font-display line-clamp-1">
                  {asm.designation}
                </h4>
              </div>

              {/* Minimal Material Linkage Details */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-2.5 text-[11px] border border-slate-100">
                
                {/* Leather (Gaine) */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      <span>Leather (GAINE):</span>
                    </div>
                    <span className="font-mono text-slate-800 font-medium">{asm.gaineRef}</span>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 mt-0.5">
                    {asm.gaineStock} in stock
                  </div>
                </div>

                {/* Mesh component (if heated) */}
                {hasMesh && (
                  <div className="border-t border-slate-200/60 pt-2.5 mt-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>Heating Mesh:</span>
                      </div>
                      <span className="font-mono text-emerald-600 font-medium">{asm.meshRef}</span>
                    </div>
                    <div className="text-right text-[10px] text-slate-400 mt-0.5">
                      {asm.meshStock} in stock
                    </div>
                  </div>
                )}
              </div>

              {/* Stock Potential & Actions */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-left">
                  <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">AVAILABLE</span>
                  <strong className="text-xs text-slate-700 font-mono">{asm.maxAssemblies} pcs</strong>
                </div>

                <div className="flex gap-1.5">
                  {currentUser.role === "admin" && (
                    <button
                      onClick={() => handleOpenLogForm(asm, "production")}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-semibold transition"
                    >
                      Assemble
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenLogForm(asm, "delivery")}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Truck className="w-3 h-3" />
                    <span>Deliver / Ship</span>
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Deliver / Shipment Modal (Light and Minimal Design) */}
      <AnimatePresence>
        {(isLoggingDelivery || isLoggingProduction) && selectedAssembly && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-xl max-w-sm w-full overflow-hidden shadow-xl"
            >
              {/* Modal header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    {isLoggingDelivery ? <Truck className="w-4 h-4" /> : <Boxes className="w-4 h-4" />}
                  </span>
                  <h3 className="font-display font-bold text-slate-800 text-xs">
                    {isLoggingDelivery ? "Log Precosido Shipment" : "Log Manual Assembly"}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsLoggingDelivery(false);
                    setIsLoggingProduction(false);
                    setSelectedAssembly(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              {/* Modal content */}
              <div className="p-5 space-y-4">
                
                {/* Visual Connection flow */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Ref:</span>
                  <strong className="text-indigo-600 font-mono text-xs">{selectedAssembly.finalRef}</strong>
                </div>

                {/* Main Fields */}
                <div className="space-y-3">
                  
                  {/* Delivery Quantity */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={logQty}
                      onChange={(e) => setLogQty(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  {isLoggingDelivery ? (
                    <>
                      {/* Customer Selector */}
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                          Customer
                        </label>
                        <select
                          value={logCustomer}
                          onChange={(e) => setLogCustomer(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="OPEL">OPEL</option>
                          <option value="FORD">FORD</option>
                          <option value="NISSAN">NISSAN</option>
                          <option value="Stellantis">Stellantis</option>
                          <option value="LANCIA">LANCIA</option>
                          <option value="RENAULT">RENAULT</option>
                        </select>
                      </div>

                      {/* Invoice/Delivery Note Number */}
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                          Invoice #
                        </label>
                        <input
                          type="text"
                          value={logInvoice}
                          onChange={(e) => setLogInvoice(e.target.value)}
                          placeholder="e.g. INV-928420"
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                        Notes
                      </label>
                      <textarea
                        rows={2}
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        placeholder="Optional details..."
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>

                {/* Actions notifications feedback */}
                {actionError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-xs text-red-600">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                  </div>
                )}

                {actionSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-start gap-2 text-xs text-emerald-600">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionSuccess}</span>
                  </div>
                )}

                {/* Footer action buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setIsLoggingDelivery(false);
                      setIsLoggingProduction(false);
                      setSelectedAssembly(null);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={isLoggingDelivery ? executeLogDelivery : executeLogProduction}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm</span>
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
