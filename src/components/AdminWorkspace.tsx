import React, { useState, useMemo } from "react";
import { Box, User, UserRole } from "../types";
import { motion } from "motion/react";
import { 
  Plus, Edit, Trash2, Key, Users, Settings, Package, MapPin, 
  Layers, RefreshCw, Check, AlertCircle, Save 
} from "lucide-react";

interface AdminWorkspaceProps {
  boxes: Box[];
  users: User[];
  onAddBox: (boxData: Omit<Box, "createdAt" | "updatedAt">) => Promise<void>;
  onDeleteBox: (boxId: string) => Promise<void>;
  onAddUser: (userData: User) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onCleanDatabase: () => Promise<void>;
}

export default function AdminWorkspace({
  boxes,
  users,
  onAddBox,
  onDeleteBox,
  onAddUser,
  onDeleteUser,
  onCleanDatabase
}: AdminWorkspaceProps) {
  const [activeSubTab, setActiveSubTab] = useState<"boxes" | "users">("boxes");

  // State for Database Maintenance
  const [cleanLoading, setCleanLoading] = useState(false);
  const [cleanSuccess, setCleanSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deletingBoxId, setDeletingBoxId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // State for Box Form
  const [newBarcode, setNewBarcode] = useState("");
  const [newReference, setNewReference] = useState("");
  const [newExpectedQty, setNewExpectedQty] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [boxSubmitLoading, setBoxSubmitLoading] = useState(false);
  const [boxError, setBoxError] = useState("");
  const [boxSuccess, setBoxSuccess] = useState(false);

  // State for User Form
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("operator");
  const [newPin, setNewPin] = useState("");
  const [userSubmitLoading, setUserSubmitLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState(false);

  // Handle Box Submit
  const handleBoxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBoxError("");
    setBoxSuccess(false);

    if (!newBarcode || !newReference || !newExpectedQty || !newLocation) {
      setBoxError("All fields are required.");
      return;
    }

    const qty = parseInt(newExpectedQty, 10);
    if (isNaN(qty) || qty < 0) {
      setBoxError("Expected quantity must be a non-negative number.");
      return;
    }

    // Check if barcode already exists
    if (boxes.some(b => b.barcode.toUpperCase() === newBarcode.toUpperCase().trim())) {
      setBoxError("This box barcode already exists in the system.");
      return;
    }

    setBoxSubmitLoading(true);
    try {
      await onAddBox({
        id: newBarcode.toUpperCase().trim(),
        barcode: newBarcode.toUpperCase().trim(),
        reference: newReference.toUpperCase().trim(),
        expectedQty: qty,
        location: newLocation.trim()
      });

      setBoxSuccess(true);
      setNewBarcode("");
      setNewReference("");
      setNewExpectedQty("");
      setNewLocation("");
      setTimeout(() => setBoxSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      setBoxError("Error creating container record. Try again.");
    } finally {
      setBoxSubmitLoading(false);
    }
  };

  // Handle User Submit
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError("");
    setUserSuccess(false);

    if (!newUsername || !newFullName || !newPin) {
      setUserError("All fields are required.");
      return;
    }

    if (newPin.length !== 4 || isNaN(parseInt(newPin, 10))) {
      setUserError("PIN must be exactly a 4-digit number.");
      return;
    }

    // Check if username already exists
    if (users.some(u => u.username.toLowerCase() === newUsername.toLowerCase().trim())) {
      setUserError("This username already exists.");
      return;
    }

    setUserSubmitLoading(true);
    try {
      await onAddUser({
        id: `user_${Date.now()}`,
        username: newUsername.toLowerCase().trim(),
        fullName: newFullName.trim(),
        role: newRole,
        pin: newPin
      });

      setUserSuccess(true);
      setNewUsername("");
      setNewFullName("");
      setNewPin("");
      setNewRole("operator");
      setTimeout(() => setUserSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      setUserError("Error creating user account.");
    } finally {
      setUserSubmitLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="admin-workspace-tab">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
            AD
          </div>
          <div>
            <h3 className="font-display font-bold text-brand-950 text-base">Admin Panel</h3>
            <p className="text-xs text-brand-500 font-normal">
              Manage physical cartons, catalog steering wheel references, and configure shopfloor accounts.
            </p>
          </div>
        </div>

        {/* Workspace Tab Switcher */}
        <div className="flex bg-brand-50 p-1 rounded-xl border border-brand-100 self-start md:self-auto" id="admin-subtab-switcher">
          <button
            onClick={() => setActiveSubTab("boxes")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeSubTab === "boxes"
                ? "bg-white text-brand-950 shadow-xs"
                : "text-brand-500 hover:text-brand-800"
            }`}
            id="subtab-boxes-btn"
          >
            Manage Boxes ({boxes.length})
          </button>
          <button
            onClick={() => setActiveSubTab("users")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeSubTab === "users"
                ? "bg-white text-brand-950 shadow-xs"
                : "text-brand-500 hover:text-brand-800"
            }`}
            id="subtab-users-btn"
          >
            User Accounts ({users.length})
          </button>
        </div>
      </div>

      {/* SUBTAB 1: Boxes management */}
      {activeSubTab === "boxes" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="boxes-admin-view">
          
          {/* Left Column (Forms & Settings) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Box Creator Form */}
            <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-brand-50">
                <Plus className="w-5 h-5 text-brand-600" />
                <h4 className="font-display font-bold text-brand-950 text-sm">Add New Carton</h4>
              </div>

              <form onSubmit={handleBoxSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                    Carton Barcode ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BOX-109"
                    value={newBarcode}
                    id="admin-box-barcode-input"
                    onChange={(e) => setNewBarcode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl font-mono text-xs uppercase font-semibold text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                    Steering Wheel Reference Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 34340681C"
                    value={newReference}
                    id="admin-box-reference-input"
                    onChange={(e) => setNewReference(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl font-mono text-xs uppercase font-semibold text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                      Expected Quantity
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 50"
                      value={newExpectedQty}
                      id="admin-box-qty-input"
                      onChange={(e) => setNewExpectedQty(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl font-mono text-xs font-semibold text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                      Warehouse Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Aisle F, Shelf 2"
                      value={newLocation}
                      id="admin-box-location-input"
                      onChange={(e) => setNewLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-xs font-semibold text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                </div>

                {boxError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{boxError}</span>
                  </div>
                )}

                {boxSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>Carton registered successfully!</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={boxSubmitLoading}
                  id="admin-add-box-btn"
                  className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer shadow-xs"
                >
                  {boxSubmitLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Register Carton
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Database Maintenance Card */}
            <div className="bg-white p-5 rounded-2xl border border-rose-100 shadow-xs" id="db-maintenance-card">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-brand-50">
                <Trash2 className="w-5 h-5 text-rose-500" />
                <h4 className="font-display font-bold text-brand-950 text-sm">Database Maintenance</h4>
              </div>
              
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Instantly wipe all validation logs, pending/approved adjustments, and restore default carton values to the factory-seeded state.
              </p>

              {cleanSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs flex items-center gap-2 mb-3">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Database cleaned and reset to default successfully!</span>
                </div>
              )}

              {!showResetConfirm ? (
                <button
                  type="button"
                  id="admin-clean-db-btn"
                  disabled={cleanLoading}
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full py-2.5 px-4 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clean & Reset Database
                </button>
              ) : (
                <div className="space-y-3 p-3.5 bg-rose-50 border border-rose-100 rounded-xl" id="admin-reset-confirm-box">
                  <p className="text-xs text-rose-700 font-medium">
                    ⚠️ <strong>Are you sure?</strong> This will completely delete all operator physical count logs and reset the database to its pristine zero starting point.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={cleanLoading}
                      onClick={async () => {
                        setCleanLoading(true);
                        try {
                          await onCleanDatabase();
                          setCleanSuccess(true);
                          setShowResetConfirm(false);
                          setTimeout(() => setCleanSuccess(false), 3000);
                        } catch (err) {
                          console.error("Clean error:", err);
                        } finally {
                          setCleanLoading(false);
                        }
                      }}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      {cleanLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        "Yes, Reset Database"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={cleanLoading}
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Box List / Database */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
            <h4 className="font-display font-bold text-brand-950 text-sm mb-4">Tracked Inventory Carton Database</h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" id="inventory-database-table">
                <thead>
                  <tr className="border-b border-brand-100 text-brand-400 font-medium">
                    <th className="py-2.5 font-normal uppercase">Carton ID</th>
                    <th className="py-2.5 font-normal uppercase">Reference</th>
                    <th className="py-2.5 font-normal uppercase text-right">Expected stock</th>
                    <th className="py-2.5 font-normal uppercase">Location</th>
                    <th className="py-2.5 font-normal uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {boxes.map((box) => (
                    <tr key={box.id} className="hover:bg-brand-50/20">
                      <td className="py-3 font-mono font-bold text-brand-950">{box.barcode}</td>
                      <td className="py-3 font-mono text-brand-600">{box.reference}</td>
                      <td className="py-3 text-right font-mono text-brand-800 font-semibold">{box.expectedQty} pcs</td>
                      <td className="py-3 font-medium text-brand-500">{box.location}</td>
                      <td className="py-3 text-center">
                        {deletingBoxId === box.id ? (
                          <div className="flex items-center justify-center gap-1.5" id={`confirm-delete-box-container-${box.id}`}>
                            <button
                              onClick={() => {
                                onDeleteBox(box.id);
                                setDeletingBoxId(null);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingBoxId(null)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium cursor-pointer transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingBoxId(box.id)}
                            id={`delete-box-${box.id}`}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Delete Box"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {boxes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-brand-400">
                        No cartons found in system. Create one on the left.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUBTAB 2: Users Management */}
      {activeSubTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="users-admin-view">
          
          {/* User Creator Form */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-brand-50">
              <Users className="w-5 h-5 text-brand-600" />
              <h4 className="font-display font-bold text-brand-950 text-sm">Create New Shopfloor Profile</h4>
            </div>

            <form onSubmit={handleUserSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                  Username (Unique Code)
                </label>
                <input
                  type="text"
                  placeholder="e.g. op_pablo"
                  value={newUsername}
                  id="admin-user-username-input"
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-xs font-semibold text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                  Full Name / Tag Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pablo Ramírez"
                  value={newFullName}
                  id="admin-user-fullname-input"
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-xs font-semibold text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                    User Role
                  </label>
                  <select
                    value={newRole}
                    id="admin-user-role-select"
                    onChange={(e: any) => setNewRole(e.target.value)}
                    className="w-full px-3 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-xs font-medium text-brand-950 focus:outline-none focus:border-brand-500"
                  >
                    <option value="operator">Operator</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-1.5">
                    4-Digit Access PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="e.g. 1234"
                    value={newPin}
                    id="admin-user-pin-input"
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl font-mono text-center tracking-widest font-extrabold text-xs text-brand-950 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              {userError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{userError}</span>
                </div>
              )}

              {userSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>User registered successfully!</span>
                </div>
              )}

              <button
                type="submit"
                disabled={userSubmitLoading}
                id="admin-add-user-btn"
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer shadow-xs"
              >
                {userSubmitLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Registering Profile...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Profile
                  </>
                )}
              </button>
            </form>
          </div>

          {/* User Account List */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-brand-100 shadow-xs">
            <h4 className="font-display font-bold text-brand-950 text-sm mb-4">Configured Shopfloor Team Profiles</h4>

            <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1" id="admin-users-list">
              {users.map((u) => {
                const roleColors = {
                  admin: "bg-rose-50 text-rose-700 border-rose-100",
                  supervisor: "bg-amber-50 text-amber-700 border-amber-100",
                  operator: "bg-emerald-50 text-emerald-700 border-emerald-100"
                };

                return (
                  <div key={u.id} className="flex items-center justify-between p-3.5 bg-brand-50/20 border border-brand-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-white border border-brand-100 rounded-lg text-brand-600">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-xs text-brand-950 block">{u.fullName}</span>
                        <span className="text-[10px] text-brand-400 font-mono block mt-0.5">@{u.username} • PIN: {u.pin}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-wider border ${roleColors[u.role]}`}>
                        {u.role === 'admin' ? 'Manager' : u.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                      </span>
                      
                      {/* Cannot delete Gonzalo for safety */}
                      {u.username !== "gonzalo" && (
                        deletingUserId === u.id ? (
                          <div className="flex items-center gap-1.5" id={`confirm-delete-user-container-${u.id}`}>
                            <button
                              onClick={() => {
                                onDeleteUser(u.id);
                                setDeletingUserId(null);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingUserId(null)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium cursor-pointer transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingUserId(u.id)}
                            id={`delete-user-${u.id}`}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
