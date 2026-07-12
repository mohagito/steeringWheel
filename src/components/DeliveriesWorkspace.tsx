import React, { useState, useMemo } from "react";
import { Delivery, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Truck, Search, Package, AlertCircle, Plus, Calendar, FileText, 
  BarChart2, User as UserIcon, CheckCircle, TrendingDown, ArrowUpRight, HelpCircle, Trash2
} from "lucide-react";

interface DeliveriesWorkspaceProps {
  deliveries: Delivery[];
  references: Reference[];
  currentUser: User;
  onSubmitDeliveries: (deliveriesData: Omit<Delivery, "id" | "timestamp" | "operatorName">[]) => Promise<void>;
}

interface DispatchRow {
  referenceCode: string;
  quantity: string;
}

export default function DeliveriesWorkspace({
  deliveries,
  references,
  currentUser,
  onSubmitDeliveries
}: DeliveriesWorkspaceProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<DispatchRow[]>([{ referenceCode: "", quantity: "" }]);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search and filter for deliveries history
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("All");

  const handleAddRow = () => {
    setRows([...rows, { referenceCode: "", quantity: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    const updatedRows = [...rows];
    updatedRows.splice(index, 1);
    setRows(updatedRows);
  };

  const handleRowChange = (index: number, field: keyof DispatchRow, value: string) => {
    const updatedRows = [...rows];
    updatedRows[index] = {
      ...updatedRows[index],
      [field]: value
    };

    // Auto-fill customer if not specified and we select a reference that has a customer
    if (field === "referenceCode" && !customer.trim()) {
      const refObj = references.find((r) => r.code === value);
      if (refObj && refObj.customer) {
        setCustomer(refObj.customer);
      }
    }

    setRows(updatedRows);
  };

  // Handle Dispatch submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!invoiceNumber.trim()) {
      setErrorMsg("An Invoice / Delivery Note Number is required.");
      return;
    }

    if (!customer.trim()) {
      setErrorMsg("Please specify the destination Customer.");
      return;
    }

    // Validate rows
    if (rows.length === 0) {
      setErrorMsg("Please add at least one reference delivery.");
      return;
    }

    const cleanedInvoice = invoiceNumber.trim().toUpperCase();
    const cleanedCustomer = customer.trim().toUpperCase();

    const submissions: Omit<Delivery, "id" | "timestamp" | "operatorName">[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.referenceCode) {
        setErrorMsg(`Row ${i + 1}: Please select a Reference.`);
        return;
      }

      const deliverQty = parseInt(row.quantity, 10);
      if (isNaN(deliverQty) || deliverQty <= 0) {
        setErrorMsg(`Row ${i + 1} (${row.referenceCode}): Please enter a valid quantity greater than 0.`);
        return;
      }

      // Check stock warning
      const refObj = references.find((r) => r.code === row.referenceCode);
      const currentStock = refObj ? refObj.currentStock : 0;
      if (deliverQty > currentStock) {
        warnings.push(`Part ${row.referenceCode}: Quantity (${deliverQty} pcs) exceeds warehouse stock (${currentStock} pcs)`);
      }

      submissions.push({
        reference: row.referenceCode,
        quantity: deliverQty,
        invoiceNumber: cleanedInvoice,
        customer: cleanedCustomer,
        notes: notes.trim() || undefined
      });
    }

    if (warnings.length > 0) {
      const confirmProceed = window.confirm(
        `Warning:\n${warnings.join("\n")}\n\nDo you still want to proceed with this dispatch?`
      );
      if (!confirmProceed) return;
    }

    setSubmitting(true);
    try {
      await onSubmitDeliveries(submissions);

      setSuccessMsg(`Successfully registered invoice ${cleanedInvoice} with ${submissions.length} references delivered to ${cleanedCustomer}!`);
      
      // Clear inputs
      setInvoiceNumber("");
      setCustomer("");
      setNotes("");
      setRows([{ referenceCode: "", quantity: "" }]);

      // Fade success message
      setTimeout(() => {
        setSuccessMsg("");
      }, 6000);
    } catch (err: any) {
      console.error("Delivery dispatch error:", err);
      setErrorMsg(err?.message || "Failed to log delivery. Please check connection.");
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
      customerMap[d.customer] = (customerMap[d.customer] || 0) + d.quantity;
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
        (d.notes && d.notes.toLowerCase().includes(q))
      );
      const matchesCustomer = customerFilter === "All" || d.customer === customerFilter;
      return matchesSearch && matchesCustomer;
    });
  }, [deliveries, searchQuery, customerFilter]);

  // Unique list of customers in deliveries
  const uniqueCustomers = useMemo(() => {
    const customers = new Set(deliveries.map((d) => d.customer));
    return Array.from(customers);
  }, [deliveries]);

  return (
    <div className="space-y-6" id="deliveries-workspace">
      
      {/* Dynamic Overview Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-rose-50 text-rose-600">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Dispatched Parts</span>
            <span className="text-2xl font-black text-slate-900 font-display mt-0.5 block">
              {stats.totalQtyDelivered.toLocaleString()} pcs
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-blue-50 text-blue-600">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Completed Shipments</span>
            <span className="text-2xl font-black text-slate-900 font-display mt-0.5 block">
              {stats.totalShipments} invoices
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Customer Dispatch Breakdown</span>
          <div className="flex flex-wrap gap-2">
            {stats.customerShares.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No delivery data yet</span>
            ) : (
              stats.customerShares.map((c) => (
                <span key={c.name} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 font-mono">
                  <span className="font-bold text-rose-600">{c.val}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">{c.name}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Register Dispatch */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
              <ArrowUpRight className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">New Batch Dispatch</h3>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" id="delivery-dispatch-form">
              <div className="grid grid-cols-2 gap-4">
                {/* Invoice Number */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Invoice / Note #
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Pk84683"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full pl-8.5 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-mono font-bold uppercase"
                      required
                    />
                  </div>
                </div>

                {/* Destination Customer */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Customer / Destination
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. RENAULT"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-semibold uppercase font-mono"
                    required
                  />
                </div>
              </div>

              {/* Multiple Reference Rows */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    References to Deliver
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {rows.length} reference{rows.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {rows.map((row, index) => {
                    const selectedRefObj = references.find((r) => r.code === row.referenceCode);
                    return (
                      <div key={index} className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl relative space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-sm">
                            #{index + 1}
                          </span>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove Reference"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                          {/* Reference Selector */}
                          <div className="col-span-8">
                            <select
                              value={row.referenceCode}
                              onChange={(e) => handleRowChange(index, "referenceCode", e.target.value)}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-800 font-mono"
                              required
                            >
                              <option value="">-- Select Reference --</option>
                              {references.map((ref) => (
                                <option key={ref.code} value={ref.code}>
                                  {ref.code} ({ref.currentStock} pcs)
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div className="col-span-4">
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={row.quantity}
                              onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-800 font-mono font-bold"
                              required
                            />
                          </div>
                        </div>

                        {selectedRefObj && (
                          <div className="flex items-center justify-between text-[10px] font-mono px-0.5">
                            <span className="text-slate-400 truncate max-w-[150px]">{selectedRefObj.description}</span>
                            <div className="flex gap-2">
                              <span className="text-slate-400">Stock:</span>
                              <span className={`font-bold ${selectedRefObj.currentStock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                {selectedRefObj.currentStock} pcs
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Reference</span>
                </button>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Optional Comments / Notes
                </label>
                <textarea
                  placeholder="e.g. Truck plate, package seals..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800"
                />
              </div>

              {/* Notification Banners */}
              <AnimatePresence mode="wait">
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="font-medium">{errorMsg}</p>
                  </motion.div>
                )}

                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-start gap-2"
                  >
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <p className="font-medium">{successMsg}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md shadow-rose-100 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  submitting
                    ? "bg-slate-400 shadow-none cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-500 active:scale-98"
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>{submitting ? "Processing Dispatch..." : "Dispatch Shipment"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Shipment History / Logs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Professional Dispatches Ledger</h3>
                <p className="text-[11px] text-slate-400 font-medium">Traceable audit logs of customer shipments</p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search invoices, refs, customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white transition-all w-full sm:w-56 text-slate-800"
                  />
                </div>

                {/* Customer Filter */}
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none text-slate-600"
                >
                  <option value="All">All Customers</option>
                  {uniqueCustomers.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4 font-black">Invoice / Note</th>
                    <th className="py-3 px-4 font-black">Reference Code</th>
                    <th className="py-3 px-4 font-black">Quantity</th>
                    <th className="py-3 px-4 font-black">Customer</th>
                    <th className="py-3 px-4 font-black">Dispatched By</th>
                    <th className="py-3 px-4 font-black text-right">Timestamp</th>
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

                    return (
                      <tr key={delivery.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="flex items-center gap-1.5 font-mono font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded text-[10px] w-fit">
                            <FileText className="w-3 h-3" />
                            {delivery.invoiceNumber}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                          {delivery.reference}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-slate-900 text-[13px]">
                          -{delivery.quantity} pcs
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200/50 rounded font-mono text-[9px] font-bold uppercase">
                            {delivery.customer}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 flex items-center gap-1.5 font-sans font-semibold">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          {delivery.operatorName}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredDeliveries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 bg-slate-50/20">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                        <p className="text-sm font-semibold">No dispatches matching filters</p>
                        <p className="text-xs text-slate-400 mt-1">Register a new delivery in the left panel</p>
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
