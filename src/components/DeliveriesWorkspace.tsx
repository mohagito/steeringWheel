import React, { useState, useMemo } from "react";
import { Delivery, Reference, User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Truck, Search, Package, AlertCircle, Plus, Calendar, FileText, 
  BarChart2, User as UserIcon, CheckCircle, TrendingDown, ArrowUpRight, HelpCircle, Trash2
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

interface DispatchRow {
  referenceCode: string;
  quantity: string;
  customer: string;
  deliveryType: "PRECOSIDO" | "Villanova" | "Normal Delivery";
}

export default function DeliveriesWorkspace({
  deliveries,
  references,
  currentUser,
  onSubmitDeliveries
}: DeliveriesWorkspaceProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [defaultCustomer, setDefaultCustomer] = useState("");
  const [defaultDeliveryType, setDefaultDeliveryType] = useState<"PRECOSIDO" | "Villanova" | "Normal Delivery">("Villanova");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<DispatchRow[]>([
    { referenceCode: "", quantity: "", customer: "", deliveryType: "Villanova" }
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Search and filter for deliveries history
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("All");

  const handleAddRow = () => {
    setRows([
      ...rows, 
      { 
        referenceCode: "", 
        quantity: "", 
        customer: defaultCustomer.trim().toUpperCase() || "", 
        deliveryType: defaultDeliveryType 
      }
    ]);
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

    // Auto-fill customer & auto-resolve scanner prefix for referenceCode
    if (field === "referenceCode" && value) {
      const upper = value.trim().toUpperCase();
      const directRef = references.find((r) => r.code.toUpperCase() === upper);
      if (directRef) {
        updatedRows[index].referenceCode = directRef.code;
        if (directRef.customer && !updatedRows[index].customer) {
          updatedRows[index].customer = directRef.customer;
        }
      } else if (upper.length > 1) {
        const stripped = upper.slice(1);
        const strippedRef = references.find((r) => r.code.toUpperCase() === stripped);
        if (strippedRef) {
          updatedRows[index].referenceCode = strippedRef.code;
          if (strippedRef.customer && !updatedRows[index].customer) {
            updatedRows[index].customer = strippedRef.customer;
          }
        }
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

    // Validate rows
    if (rows.length === 0) {
      setErrorMsg("Please add at least one reference delivery.");
      return;
    }

    const cleanedInvoice = invoiceNumber.trim().toUpperCase();

    const submissions: Omit<Delivery, "id" | "timestamp" | "operatorName">[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.referenceCode) {
        setErrorMsg(`Row ${i + 1}: Please select a Reference.`);
        return;
      }

      const rowCustomer = (row.customer || defaultCustomer || "").trim().toUpperCase();
      if (!rowCustomer) {
        setErrorMsg(`Row ${i + 1} (${row.referenceCode}): Please specify the destination Customer.`);
        return;
      }

      const deliverQty = parseInt(row.quantity, 10);
      if (isNaN(deliverQty) || deliverQty <= 0) {
        setErrorMsg(`Row ${i + 1} (${row.referenceCode}): Please enter a valid quantity greater than 0.`);
        return;
      }

      const rowType = row.deliveryType || defaultDeliveryType || "Villanova";

      // Check stock warning against correct stock level (Stock 2 for Precosido, Stock 3 for Villanova)
      const refObj = references.find((r) => r.code === row.referenceCode);
      if (rowType === "PRECOSIDO") {
        const stock2Val = refObj ? (refObj.stock2 || 0) : 0;
        if (deliverQty > stock2Val) {
          warnings.push(`Part ${row.referenceCode}: Qty (${deliverQty} pcs) exceeds Stock 2 Glued Mesh (${stock2Val} pcs)`);
        }
      } else {
        const stock3Val = refObj ? (refObj.stock3 || 0) : 0;
        if (deliverQty > stock3Val) {
          warnings.push(`Part ${row.referenceCode}: Qty (${deliverQty} pcs) exceeds Stock 3 Steering Wheels (${stock3Val} pcs)`);
        }
      }

      submissions.push({
        reference: row.referenceCode,
        quantity: deliverQty,
        invoiceNumber: cleanedInvoice,
        customer: rowCustomer,
        deliveryType: rowType,
        notes: notes.trim() || undefined
      });
    }

    if (warnings.length > 0) {
      const result = await Swal.fire({
        title: "Dispatch Warning",
        html: `
          <div class="text-left text-xs font-mono space-y-1 bg-amber-50 p-3 border border-amber-200 text-amber-900 rounded-none mb-3">
            ${warnings.map(w => `<p>⚠️ ${w}</p>`).join("")}
          </div>
          <p class="text-sm font-sans font-bold text-slate-800">Do you still want to proceed with this customer delivery dispatch?</p>
        `,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Yes, Proceed Dispatch",
        cancelButtonText: "Cancel"
      });
      if (!result.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      await onSubmitDeliveries(submissions);

      setSuccessMsg(`Successfully registered invoice ${cleanedInvoice} with ${submissions.length} dispatched reference(s)!`);
      
      // Clear inputs
      setInvoiceNumber("");
      setDefaultCustomer("");
      setNotes("");
      setRows([{ referenceCode: "", quantity: "", customer: "", deliveryType: defaultDeliveryType }]);

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
        
        {/* Left Column: Register Dispatch */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
              <ArrowUpRight className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">New Batch Dispatch</h3>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" id="delivery-dispatch-form">
              <div className="grid grid-cols-3 gap-3">
                {/* Invoice Number */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Invoice / Note #
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="MPT2286"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full pl-8 pr-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:bg-white transition-all text-slate-900 font-mono font-bold uppercase"
                      required
                    />
                  </div>
                </div>

                {/* Default Customer fallback */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Default Customer
                  </label>
                  <input
                    type="text"
                    placeholder="RENAULT"
                    value={defaultCustomer}
                    onChange={(e) => setDefaultCustomer(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:bg-white transition-all text-slate-900 font-bold uppercase font-mono"
                  />
                </div>

                {/* Default Delivery Type */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Default Type
                  </label>
                  <CustomSelect
                    value={defaultDeliveryType}
                    onChange={(val) => setDefaultDeliveryType(val as any)}
                    options={[
                      { value: "Villanova", label: "Steering Wheels stock 3" },
                      { value: "PRECOSIDO", label: "PRECOSIDO stock 2" }
                    ]}
                    size="sm"
                  />
                </div>
              </div>

              {/* Multiple Reference Rows */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Dispatched Items
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {rows.length} item{rows.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-3 overflow-visible">
                  {rows.map((row, index) => {
                    const selectedRefObj = references.find((r) => r.code === row.referenceCode);
                    const rowDeliveryType = row.deliveryType || defaultDeliveryType || "Villanova";
                    const isPrecosido = rowDeliveryType === "PRECOSIDO";
                    const relevantStock = selectedRefObj 
                      ? (isPrecosido ? (selectedRefObj.stock2 || 0) : (selectedRefObj.stock3 || 0))
                      : 0;

                    return (
                      <div key={index} className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl relative space-y-2.5 overflow-visible">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md">
                            Item #{index + 1}
                          </span>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove Reference"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-12 gap-2.5 items-start overflow-visible">
                          {/* Reference Selector */}
                          <div className="col-span-12 sm:col-span-6 overflow-visible">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reference</label>
                            <CustomReferenceSelect
                              references={references}
                              value={row.referenceCode}
                              onChange={(val) => handleRowChange(index, "referenceCode", val)}
                              placeholder="Select reference..."
                              required
                              size="sm"
                            />
                          </div>

                          {/* Customer per Row */}
                          <div className="col-span-12 sm:col-span-6">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Customer</label>
                            <input
                              type="text"
                              placeholder={defaultCustomer || "FORD / RENAULT"}
                              value={row.customer}
                              onChange={(e) => handleRowChange(index, "customer", e.target.value.toUpperCase())}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 font-mono font-bold uppercase"
                              required
                            />
                          </div>

                          {/* Delivery Type per Row */}
                          <div className="col-span-12 sm:col-span-7 overflow-visible">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Delivery Type</label>
                            <CustomSelect
                              value={row.deliveryType || defaultDeliveryType}
                              onChange={(val) => handleRowChange(index, "deliveryType", val as any)}
                              options={[
                                { value: "Villanova", label: "Steering Wheels stock 3" },
                                { value: "PRECOSIDO", label: "PRECOSIDO stock 2" }
                              ]}
                              size="sm"
                            />
                          </div>

                          {/* Quantity per Row */}
                          <div className="col-span-12 sm:col-span-5">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dispatched Qty</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={row.quantity}
                              onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 font-mono font-bold"
                              required
                            />
                          </div>
                        </div>

                        {selectedRefObj && (
                          <div className="flex items-center justify-between text-[10px] font-mono px-0.5 pt-1 border-t border-slate-200/50">
                            <span className="text-slate-400 truncate max-w-[170px]">{selectedRefObj.description}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-[9px]">
                                Avail {isPrecosido ? "S2" : "S3"}:
                              </span>
                              <span className={`font-bold ${relevantStock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                {relevantStock} pcs
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
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100/80 border border-dashed border-slate-200/80 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Reference</span>
                </button>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Optional Comments
                </label>
                <textarea
                  placeholder="Truck plate, package seals..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:bg-white transition-all text-slate-800"
                />
              </div>

              {/* Notification Banners */}
              <AnimatePresence mode="wait">
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2"
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
                    className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-start gap-2"
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
                className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer uppercase tracking-wider ${
                  submitting
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-700 active:scale-98"
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>{submitting ? "Dispatching..." : "Dispatch Shipment"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Shipment History / Logs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Dispatches Ledger</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Customer shipment logs</p>
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

            {/* List Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>Invoice / Note</th>
                    <th>Reference Code</th>
                    <th>Type</th>
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

                    const isPrecosido = delivery.deliveryType === "PRECOSIDO";

                    return (
                      <tr key={delivery.id} className="hover:bg-slate-50/80 transition-colors">
                        <td>
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded text-[10px]">
                            <FileText className="w-3 h-3" />
                            {delivery.invoiceNumber}
                          </span>
                        </td>
                        <td className="font-mono font-bold text-slate-900">
                          {delivery.reference}
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase border ${
                            isPrecosido 
                              ? "bg-amber-50 text-amber-800 border-amber-200/80" 
                              : "bg-blue-50 text-blue-800 border-blue-200/80"
                          }`}>
                            {delivery.deliveryType || "Villanova"}
                          </span>
                        </td>
                        <td className="font-mono font-bold text-slate-900 text-xs">
                          -{delivery.quantity} pcs
                        </td>
                        <td>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200/80 rounded font-mono text-[9px] font-bold uppercase">
                            {delivery.customer}
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
