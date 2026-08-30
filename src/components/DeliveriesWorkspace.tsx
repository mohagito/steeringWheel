import React, { useState, useMemo } from "react";
import { Delivery, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Truck, Search, AlertCircle, Plus, FileText, 
  TrendingDown, ArrowUpRight, Trash2, CheckCircle, Building2, Layers
} from "lucide-react";
import Swal from "sweetalert2";
import { CustomReferenceSelect } from "./CustomReferenceSelect";
import { CustomSelect } from "./CustomSelect";

interface DeliveriesWorkspaceProps {
  deliveries: Delivery[];
  references: Reference[];
  currentUser: User;
  onSubmitDeliveries: (deliveriesData: Omit<Delivery, "id" | "timestamp" | "operatorName">[]) => Promise<void>;
}

interface DeliveryItemRow {
  referenceCode: string;
  quantity: string;
}

export default function DeliveriesWorkspace({
  deliveries,
  references,
  currentUser,
  onSubmitDeliveries
}: DeliveriesWorkspaceProps) {
  // Step 1: Invoice / Note # (belongs to the entire delivery)
  const [invoiceNumber, setInvoiceNumber] = useState("");

  // Step 2: Delivery Type (selected ONCE for the entire invoice)
  // "PRECOSIDO" -> Stock 2, "STEERING WHEELS" -> Stock 3
  const [deliveryType, setDeliveryType] = useState<"PRECOSIDO" | "STEERING WHEELS">("PRECOSIDO");

  // Step 3, 4, 5: Multiple Reference Items in the Invoice
  const [rows, setRows] = useState<DeliveryItemRow[]>([
    { referenceCode: "", quantity: "" }
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search and filter for deliveries ledger
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("All");

  const isPrecosido = deliveryType === "PRECOSIDO";

  const handleAddRow = () => {
    setRows((prev) => [...prev, { referenceCode: "", quantity: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof DeliveryItemRow, value: string) => {
    const updatedRows = [...rows];
    let processedValue = value;

    // Handle barcode scanner prefix stripping for reference code if applicable
    if (field === "referenceCode" && value) {
      const upper = value.trim().toUpperCase();
      const directRef = references.find((r) => r.code.toUpperCase() === upper);
      if (directRef) {
        processedValue = directRef.code;
      } else if (upper.length > 1) {
        const stripped = upper.slice(1);
        const strippedRef = references.find((r) => r.code.toUpperCase() === stripped);
        if (strippedRef) {
          processedValue = strippedRef.code;
        }
      }
    }

    updatedRows[index] = {
      ...updatedRows[index],
      [field]: processedValue
    };
    setRows(updatedRows);
  };

  // Handle Delivery Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const cleanedInvoice = invoiceNumber.trim().toUpperCase();
    if (!cleanedInvoice) {
      setErrorMsg("Step 1: Please enter an Invoice / Note #.");
      return;
    }

    if (rows.length === 0) {
      setErrorMsg("Please add at least one reference item to this delivery.");
      return;
    }

    // Cumulative quantities validation per reference in this invoice
    const cumulativeQtyMap: Record<string, number> = {};
    const submissions: Omit<Delivery, "id" | "timestamp" | "operatorName">[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.referenceCode) {
        setErrorMsg(`Item #${i + 1}: Please select a Reference.`);
        return;
      }

      const refObj = references.find((r) => r.code === row.referenceCode);
      if (!refObj) {
        setErrorMsg(`Item #${i + 1}: Reference "${row.referenceCode}" was not found in catalog.`);
        return;
      }

      const deliverQty = parseInt(row.quantity, 10);
      if (isNaN(deliverQty) || deliverQty <= 0) {
        setErrorMsg(`Item #${i + 1} (${row.referenceCode}): Please enter a valid quantity greater than 0.`);
        return;
      }

      cumulativeQtyMap[row.referenceCode] = (cumulativeQtyMap[row.referenceCode] || 0) + deliverQty;

      // Check available stock in the relevant tier
      // PRECOSIDO -> Stock 2; STEERING WHEELS -> Stock 3
      const availableStock = isPrecosido ? (refObj.stock2 || 0) : (refObj.stock3 || 0);
      const stockTierName = isPrecosido ? "Stock 2 (Glued Mesh WIP)" : "Stock 3 (Finished Goods)";

      if (cumulativeQtyMap[row.referenceCode] > availableStock) {
        setErrorMsg(
          `Item #${i + 1} (${row.referenceCode}): Total requested quantity (${cumulativeQtyMap[row.referenceCode]} pcs) exceeds available ${stockTierName} (${availableStock} pcs). Negative stock is not allowed.`
        );
        return;
      }

      // Customer is automatically retrieved from the reference data
      const autoCustomer = (refObj.customer || "GENERAL").trim().toUpperCase();

      submissions.push({
        invoiceNumber: cleanedInvoice,
        reference: row.referenceCode,
        quantity: deliverQty,
        customer: autoCustomer,
        deliveryType: deliveryType
      });
    }

    setSubmitting(true);
    try {
      await onSubmitDeliveries(submissions);

      const successText = `Successfully registered invoice ${cleanedInvoice} (${deliveryType}) with ${submissions.length} item(s)!`;
      setSuccessMsg(successText);

      // Reset form to clean initial state
      setInvoiceNumber("");
      setRows([{ referenceCode: "", quantity: "" }]);

      Swal.fire({
        title: "Delivery Created!",
        text: successText,
        icon: "success",
        confirmButtonText: "OK",
        confirmButtonColor: "#e11d48"
      });

      setTimeout(() => {
        setSuccessMsg("");
      }, 6000);
    } catch (err: any) {
      console.error("Delivery dispatch error:", err);
      setErrorMsg(err?.message || "Failed to create delivery. Please check connection.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delivery stats computations
  const stats = useMemo(() => {
    const totalQtyDelivered = deliveries.reduce((sum, d) => sum + d.quantity, 0);
    const totalShipments = new Set(deliveries.map((d) => d.invoiceNumber)).size;
    
    // Group by customer
    const customerMap: Record<string, number> = {};
    deliveries.forEach((d) => {
      const cust = d.customer || "GENERAL";
      customerMap[cust] = (customerMap[cust] || 0) + d.quantity;
    });

    return {
      totalQtyDelivered,
      totalShipments,
      customerShares: Object.entries(customerMap).map(([name, val]) => ({ name, val }))
    };
  }, [deliveries]);

  // Pre-filtered deliveries list
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ? true : (
        d.invoiceNumber.toLowerCase().includes(q) ||
        d.reference.toLowerCase().includes(q) ||
        d.customer.toLowerCase().includes(q) ||
        (d.deliveryType && d.deliveryType.toLowerCase().includes(q))
      );
      const matchesCustomer = customerFilter === "All" || d.customer === customerFilter;
      return matchesSearch && matchesCustomer;
    });
  }, [deliveries, searchQuery, customerFilter]);

  // Unique list of customers in deliveries
  const uniqueCustomers = useMemo(() => {
    const customers = new Set(deliveries.map((d) => d.customer));
    return Array.from(customers).filter(Boolean);
  }, [deliveries]);

  return (
    <div className="space-y-6" id="deliveries-workspace">
      
      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Total Dispatched</span>
            <span className="text-xl font-bold text-slate-900 font-mono mt-0.5 block">
              {stats.totalQtyDelivered.toLocaleString()} pcs
            </span>
          </div>
        </div>

        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Shipments</span>
            <span className="text-xl font-bold text-slate-900 font-mono mt-0.5 block">
              {stats.totalShipments} invoices
            </span>
          </div>
        </div>

        <div className="glass-panel p-5 flex flex-col justify-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 font-mono">Customer Breakdown</span>
          <div className="flex flex-wrap gap-2">
            {stats.customerShares.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No delivery data yet</span>
            ) : (
              stats.customerShares.map((c) => (
                <span key={c.name} className="px-2.5 py-1 bg-slate-100/80 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 font-mono">
                  <span className="font-bold text-rose-600">{c.val}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">{c.name}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: New Delivery Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2.5 mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <ArrowUpRight className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">New Delivery</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Customer dispatch register</p>
                </div>
              </div>

              {/* Delivery Tier Indicator Badge */}
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase border ${
                isPrecosido
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}>
                Deducts {isPrecosido ? "Stock 2" : "Stock 3"}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" id="delivery-dispatch-form">
              
              {/* Top Controls: Step 1 (Invoice #) & Step 2 (Delivery Type) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
                
                {/* STEP 1: Invoice / Note # */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                    <FileText className="w-3 h-3 text-slate-500" />
                    <span>Invoice / Note #</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MPT2286"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 font-mono font-bold uppercase transition-all placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 shadow-2xs"
                    required
                  />
                </div>

                {/* STEP 2: Delivery Type (Selected ONCE for the entire invoice) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                    <Layers className="w-3 h-3 text-slate-500" />
                    <span>Delivery Type</span>
                  </label>
                  <CustomSelect
                    value={deliveryType}
                    onChange={(val) => setDeliveryType(val as "PRECOSIDO" | "STEERING WHEELS")}
                    options={[
                      { 
                        value: "PRECOSIDO", 
                        label: "PRECOSIDO (Stock 2)",
                        description: "Deducts from Production Stock 2"
                      },
                      { 
                        value: "STEERING WHEELS", 
                        label: "STEERING WHEELS (Stock 3)",
                        description: "Deducts from Finished Goods Stock 3"
                      }
                    ]}
                    size="sm"
                  />
                </div>
              </div>

              {/* STEP 3, 4, 5: Delivery Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <span>Delivery Items</span>
                    <span className="text-slate-400">({rows.length})</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Source: <span className="font-bold text-slate-700">{isPrecosido ? "Stock 2 (WIP)" : "Stock 3 (Finished)"}</span>
                  </span>
                </div>

                <div className="space-y-3 overflow-visible">
                  {rows.map((row, index) => {
                    const selectedRefObj = references.find((r) => r.code === row.referenceCode);
                    const autoCustomer = selectedRefObj?.customer?.trim() || "";
                    const availableStock = selectedRefObj 
                      ? (isPrecosido ? (selectedRefObj.stock2 || 0) : (selectedRefObj.stock3 || 0))
                      : 0;

                    const rowQtyNumber = parseInt(row.quantity, 10);
                    const isOverStock = !isNaN(rowQtyNumber) && rowQtyNumber > availableStock;

                    return (
                      <div 
                        key={index} 
                        className="p-3.5 bg-slate-50/90 border border-slate-200/90 rounded-2xl relative space-y-3 transition-all hover:border-slate-300 shadow-2xs overflow-visible"
                      >
                        {/* Row Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold bg-slate-200/90 text-slate-700 px-2 py-0.5 rounded-md">
                              Item #{index + 1}
                            </span>
                            {autoCustomer && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-mono font-bold text-slate-700">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                {autoCustomer}
                              </span>
                            )}
                          </div>

                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove Reference Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Item Fields Layout: Responsive & Clean */}
                        <div className="space-y-3">
                          {/* STEP 3: Select Reference (Full width for clear, un-cramped display) */}
                          <div className="overflow-visible">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                              Reference Code
                            </label>
                            <CustomReferenceSelect
                              references={references}
                              value={row.referenceCode}
                              onChange={(val) => handleRowChange(index, "referenceCode", val)}
                              placeholder="Select reference..."
                              showStockBadges={false}
                              required
                              size="sm"
                            />
                          </div>

                          {/* STEP 4 & 5: Customer (Auto) and Quantity side-by-side */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                            {/* STEP 4: Customer (Auto-determined from Reference) */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                                Customer (Auto)
                              </label>
                              <div className="w-full min-h-[38px] px-3 py-2 text-xs bg-slate-100/90 border border-slate-200/90 rounded-xl text-slate-800 font-mono font-bold uppercase flex items-center justify-between select-none">
                                <span className="truncate">
                                  {autoCustomer || (row.referenceCode ? "GENERAL" : "—")}
                                </span>
                                {autoCustomer && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-normal font-sans shrink-0">
                                    Auto
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* STEP 5: Quantity */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                                Quantity (PCS)
                              </label>
                              <input
                                type="number"
                                min="1"
                                placeholder="Enter PCS..."
                                value={row.quantity}
                                onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                                className={`w-full min-h-[38px] px-3 py-2 text-xs bg-white border rounded-xl focus:outline-none focus:ring-2 transition-all font-mono font-bold ${
                                  isOverStock
                                    ? "border-rose-300 text-rose-700 focus:ring-rose-500/20 focus:border-rose-500 bg-rose-50/40"
                                    : "border-slate-200 text-slate-900 focus:ring-rose-500/20 focus:border-rose-500"
                                }`}
                                required
                              />
                            </div>
                          </div>
                        </div>

                        {/* Real-time stock status bar for this reference & tier */}
                        {selectedRefObj && (
                          <div className="flex items-center justify-between text-[10px] font-mono px-1 pt-1.5 border-t border-slate-200/60">
                            <span className="text-slate-500 truncate max-w-[200px]" title={selectedRefObj.description}>
                              {selectedRefObj.description}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-[9px]">
                                Avail {isPrecosido ? "Stock 2" : "Stock 3"}:
                              </span>
                              <span className={`font-bold ${
                                availableStock <= 0 
                                  ? "text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200" 
                                  : isOverStock 
                                    ? "text-rose-600 font-black"
                                    : "text-emerald-700 font-bold"
                              }`}>
                                {availableStock} PCS
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Another Reference Button */}
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs font-mono"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-500" />
                  <span>+ Add Another Reference</span>
                </button>
              </div>

              {/* Notification Banners */}
              <AnimatePresence mode="wait">
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <p className="font-medium leading-relaxed">{errorMsg}</p>
                  </motion.div>
                )}

                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-start gap-2.5"
                  >
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <p className="font-medium leading-relaxed">{successMsg}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit / Create Delivery Button */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-3 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer uppercase tracking-wider font-mono ${
                  submitting
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-700 active:scale-98 shadow-rose-600/20"
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>{submitting ? "Processing Delivery..." : "Create Delivery"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Shipment History / Dispatches Ledger */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Dispatches Ledger</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Historical customer shipment records</p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search invoice, ref, customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white transition-all w-full sm:w-52 text-slate-800"
                  />
                </div>

                {/* Customer Filter */}
                <CustomSelect
                  value={customerFilter}
                  onChange={(val) => setCustomerFilter(val)}
                  options={[
                    { value: "All", label: "All Customers" },
                    ...uniqueCustomers.map((c) => ({ value: c, label: c }))
                  ]}
                  className="w-40"
                  size="sm"
                />
              </div>
            </div>

            {/* Dispatches List Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>Invoice / Note</th>
                    <th>Delivery Type</th>
                    <th>Reference</th>
                    <th>Quantity</th>
                    <th>Customer</th>
                    <th>Dispatched By</th>
                    <th className="text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredDeliveries.map((delivery) => {
                    const formattedDate = new Date(delivery.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    const isItemPrecosido = delivery.deliveryType === "PRECOSIDO";

                    return (
                      <tr key={delivery.id} className="hover:bg-slate-50/80 transition-colors">
                        <td>
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded text-[10px]">
                            <FileText className="w-3 h-3" />
                            {delivery.invoiceNumber}
                          </span>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase border ${
                            isItemPrecosido 
                              ? "bg-amber-50 text-amber-800 border-amber-200/80" 
                              : "bg-blue-50 text-blue-800 border-blue-200/80"
                          }`}>
                            {delivery.deliveryType || "STEERING WHEELS"}
                          </span>
                        </td>
                        <td className="font-mono font-bold text-slate-900">
                          {delivery.reference}
                        </td>
                        <td className="font-mono font-bold text-rose-700 text-xs">
                          -{delivery.quantity} pcs
                        </td>
                        <td>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200/80 rounded font-mono text-[9px] font-bold uppercase">
                            {delivery.customer || "GENERAL"}
                          </span>
                        </td>
                        <td className="text-slate-600 font-sans font-medium text-xs">
                          {delivery.operatorName}
                        </td>
                        <td className="text-right text-slate-400 font-mono text-[10px]">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredDeliveries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 bg-slate-50/20">
                        <AlertCircle className="w-7 h-7 mx-auto mb-2 opacity-40 text-slate-500" />
                        <p className="text-xs font-semibold">No dispatches matching filters</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

