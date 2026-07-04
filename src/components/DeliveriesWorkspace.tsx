import React, { useState, useMemo } from "react";
import { Delivery, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Truck, Search, Package, AlertCircle, Plus, Calendar, FileText, 
  BarChart2, User as UserIcon, CheckCircle, TrendingDown, ArrowUpRight, HelpCircle
} from "lucide-react";

interface DeliveriesWorkspaceProps {
  deliveries: Delivery[];
  references: Reference[];
  currentUser: User;
  onSubmitDelivery: (deliveryData: Omit<Delivery, "id" | "timestamp" | "operatorName">) => Promise<void>;
}

export default function DeliveriesWorkspace({
  deliveries,
  references,
  currentUser,
  onSubmitDelivery
}: DeliveriesWorkspaceProps) {
  const [selectedRefCode, setSelectedRefCode] = useState("");
  const [qty, setQty] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search and filter for deliveries history
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("All");

  // Selected Reference Object
  const selectedRef = useMemo(() => {
    return references.find((r) => r.code === selectedRefCode) || null;
  }, [selectedRefCode, references]);

  // When reference changes, auto-fill customer name
  const handleRefChange = (code: string) => {
    setSelectedRefCode(code);
    const refObj = references.find((r) => r.code === code);
    if (refObj && refObj.customer) {
      setCustomer(refObj.customer);
    } else {
      setCustomer("");
    }
  };

  // Handle Dispatch submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedRefCode) {
      setErrorMsg("Please select a master Reference to deliver.");
      return;
    }

    const deliverQty = parseInt(qty, 10);
    if (isNaN(deliverQty) || deliverQty <= 0) {
      setErrorMsg("Please enter a valid delivery quantity greater than 0.");
      return;
    }

    if (!invoiceNumber.trim()) {
      setErrorMsg("An Invoice Number is required for professional dispatch tracking.");
      return;
    }

    if (!customer.trim()) {
      setErrorMsg("Please specify the destination Customer.");
      return;
    }

    // Check stock warning
    const currentStock = selectedRef ? selectedRef.currentStock : 0;
    if (deliverQty > currentStock) {
      const confirmProceed = window.confirm(
        `Warning: Selected quantity (${deliverQty} pcs) exceeds the current available warehouse stock (${currentStock} pcs). Do you still want to proceed with this dispatch?`
      );
      if (!confirmProceed) return;
    }

    setSubmitting(true);
    try {
      await onSubmitDelivery({
        reference: selectedRefCode,
        quantity: deliverQty,
        invoiceNumber: invoiceNumber.trim().toUpperCase(),
        customer: customer.trim(),
        notes: notes.trim() || undefined
      });

      setSuccessMsg(`Delivery dispatched successfully! ${deliverQty} pcs of ${selectedRefCode} under Invoice ${invoiceNumber.toUpperCase()} has been removed from active stock.`);
      
      // Clear inputs
      setSelectedRefCode("");
      setQty("");
      setInvoiceNumber("");
      setCustomer("");
      setNotes("");

      // Fade success message
      setTimeout(() => {
        setSuccessMsg("");
      }, 5000);
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
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              Removed from active stock
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
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              Unique deliveries dispatched
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
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
              <ArrowUpRight className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">New Delivery Dispatch</h3>
                <p className="text-[11px] text-slate-400 font-medium">Record a shipment to remove it from stock</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" id="delivery-dispatch-form">
              {/* Reference Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Select Reference
                </label>
                <select
                  value={selectedRefCode}
                  onChange={(e) => handleRefChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-mono"
                  required
                >
                  <option value="">-- Choose Reference --</option>
                  {references.map((ref) => (
                    <option key={ref.code} value={ref.code}>
                      {ref.code} - {ref.description.slice(0, 30)}... ({ref.currentStock} in stock)
                    </option>
                  ))}
                </select>
                
                {selectedRef && (
                  <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-500 font-bold uppercase font-sans">Active Stock:</span>
                    <span className={`font-black ${selectedRef.currentStock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {selectedRef.currentStock} pcs
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity to Deliver */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Quantity to Deliver (pcs)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 100"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-mono font-bold"
                  required
                />
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Invoice / Delivery Note #
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. IV-884021"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-mono font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Destination Customer */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Customer / Destination
                </label>
                <input
                  type="text"
                  placeholder="e.g. FORD, RENAULT, NISSAN"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all text-slate-800 font-semibold uppercase font-mono"
                  required
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
                <span>{submitting ? "Processing Shipment..." : "Dispatch Shipment"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Shipment History / Logs */}
        <div className="lg:col-span-8 space-y-4">
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
