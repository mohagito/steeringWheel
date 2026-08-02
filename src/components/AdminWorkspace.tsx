import React, { useState } from "react";
import { User, UserRole } from "../types";
import { CustomSelect } from "./CustomSelect";
import { 
  Plus, Trash2, Users, RefreshCw, Check, AlertCircle, ShieldCheck,
  Pencil, Eye, EyeOff, KeyRound, X
} from "lucide-react";
import Swal from "sweetalert2";

interface AdminWorkspaceProps {
  users: User[];
  onAddUser: (userData: User) => Promise<void>;
  onUpdateUser?: (userId: string, updatedFields: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onCleanDatabase: () => Promise<void>;
  onAuditDatabase?: () => Promise<{ repairedRefs: number; repairedUsers: number }>;
}

export default function AdminWorkspace({
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onCleanDatabase,
  onAuditDatabase,
}: AdminWorkspaceProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);

  // State for User Form
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("operator");
  const [newPin, setNewPin] = useState("");
  const [userSubmitLoading, setUserSubmitLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState(false);

  // State for Editing Existing User Profile
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("operator");
  const [editPin, setEditPin] = useState("");
  const [showEditPin, setShowEditPin] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const handleStartEditUser = (u: User) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditUsername(u.username);
    setEditRole(u.role);
    setEditPin(u.pin);
    setShowEditPin(false);
  };

  const handleSaveEditUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingUser) return;

    if (!editFullName.trim() || !editUsername.trim() || !editPin.trim()) {
      Swal.fire({
        title: "Required Fields",
        text: "Full Name, Username, and PIN cannot be empty.",
        icon: "warning",
        confirmButtonColor: "#2563eb"
      });
      return;
    }

    if (editPin.length !== 4 || isNaN(parseInt(editPin, 10))) {
      Swal.fire({
        title: "Invalid PIN",
        text: "Access PIN must be a 4-digit number (e.g. 1234).",
        icon: "warning",
        confirmButtonColor: "#2563eb"
      });
      return;
    }

    // Check if username conflicts with another profile
    const usernameConflict = users.some(
      u => u.id !== editingUser.id && u.username.toLowerCase() === editUsername.trim().toLowerCase()
    );
    if (usernameConflict) {
      Swal.fire({
        title: "Username Taken",
        text: `The username "@${editUsername.trim()}" is already assigned to another profile.`,
        icon: "warning",
        confirmButtonColor: "#2563eb"
      });
      return;
    }

    setEditLoading(true);
    try {
      if (onUpdateUser) {
        await onUpdateUser(editingUser.id, {
          fullName: editFullName.trim(),
          username: editUsername.trim().toLowerCase(),
          pin: editPin.trim(),
          role: editRole
        });
      }

      await Swal.fire({
        title: "Profile Updated!",
        text: `Successfully updated credentials for ${editFullName.trim()}.`,
        icon: "success",
        timer: 1600,
        showConfirmButton: false
      });

      setEditingUser(null);
    } catch (err: any) {
      console.error(err);
      await Swal.fire({
        title: "Update Failed",
        text: err?.message || "Error updating user profile.",
        icon: "error",
        confirmButtonColor: "#dc2626"
      });
    } finally {
      setEditLoading(false);
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
      
      Swal.fire({
        title: "User Created!",
        text: `Successfully created user profile for ${newFullName.trim()}.`,
        icon: "success",
        timer: 1800,
        showConfirmButton: false
      });

      setTimeout(() => setUserSuccess(false), 2000);
    } catch (err: any) {
      console.error(err);
      setUserError("Error creating user account.");
      Swal.fire("Error", err?.message || "Error creating user account.", "error");
    } finally {
      setUserSubmitLoading(false);
    }
  };

  // Handle User Delete with SweetAlert
  const handleDeleteUser = async (u: User) => {
    const result = await Swal.fire({
      title: `Delete user @${u.username}?`,
      text: `Are you sure you want to permanently delete profile for ${u.fullName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete User",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        await onDeleteUser(u.id);
        await Swal.fire({
          title: "User Deleted",
          text: `Profile for ${u.fullName} was removed.`,
          icon: "success",
          timer: 1500,
          showConfirmButton: false
        });
      } catch (err: any) {
        console.error(err);
        await Swal.fire("Error", err?.message || "Failed to delete user.", "error");
      }
    }
  };

  // Handle Audit & Database Health Check
  const handleAuditDatabase = async () => {
    if (!onAuditDatabase) return;
    try {
      setIsAuditing(true);
      const res = await onAuditDatabase();
      if (res.repairedRefs > 0 || res.repairedUsers > 0) {
        await Swal.fire({
          title: "Database Audited & Repaired!",
          text: `Verified system database! Repaired ${res.repairedRefs} reference stock records and ${res.repairedUsers} user profiles. All stock formulas and security schemas are 100% verified.`,
          icon: "success",
          confirmButtonColor: "#16a34a"
        });
      } else {
        await Swal.fire({
          title: "Database 100% Solid & Verified!",
          text: "Audit complete! All reference stock records, user profiles, and security structures are completely healthy, mathematically synced, and secure.",
          icon: "success",
          confirmButtonColor: "#2563eb"
        });
      }
    } catch (err: any) {
      console.error(err);
      await Swal.fire({
        title: "Audit Failed",
        text: err?.message || "Failed to audit database.",
        icon: "error",
        confirmButtonColor: "#dc2626"
      });
    } finally {
      setIsAuditing(false);
    }
  };

  // Handle Reset Database with SweetAlert
  const handleResetDatabase = async () => {
    const result = await Swal.fire({
      title: "Reset Database to 0 Stock?",
      text: "CRITICAL: Are you absolutely sure you want to reset all inventory counts, cartons, and transaction history to 0? This action is permanent and cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, RESET EVERYTHING TO 0!",
      cancelButtonText: "Cancel / Keep Data"
    });

    if (result.isConfirmed) {
      try {
        setIsResetting(true);
        await onCleanDatabase();
        await Swal.fire({
          title: "Database Reset Complete!",
          text: "All reference inventory counts, carton records, and transactions have been reset to 0 stock starting state.",
          icon: "success",
          confirmButtonColor: "#2563eb"
        });
      } catch (e: any) {
        console.error(e);
        await Swal.fire({
          title: "Reset Failed",
          text: e?.message || "Failed to reset database.",
          icon: "error",
          confirmButtonColor: "#2563eb"
        });
      } finally {
        setIsResetting(false);
      }
    }
  };

  return (
    <div className="space-y-6" id="admin-workspace-tab">
      
      {/* Header Panel */}
      <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-xs">
            AD
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 block tracking-widest uppercase">SYSTEM MANAGEMENT</span>
            <h3 className="font-bold text-slate-900 text-sm tracking-tight mt-0.5">Administrator Terminal</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="users-admin-view">
        
        {/* User Creator Form */}
        <div className="lg:col-span-5 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <Users className="w-4 h-4 text-blue-600" />
            <h4 className="font-mono font-bold text-slate-900 text-xs uppercase">Create User Profile</h4>
          </div>

          <form onSubmit={handleUserSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Username / Identifier
              </label>
              <input
                type="text"
                placeholder="e.g. op_pablo"
                value={newUsername}
                id="admin-user-username-input"
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                type="text"
                placeholder="e.g. Pablo Ramírez"
                value={newFullName}
                id="admin-user-fullname-input"
                onChange={(e) => setNewFullName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all text-slate-900 font-sans font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  User Role
                </label>
                <CustomSelect
                  value={newRole}
                  onChange={(val) => setNewRole(val as any)}
                  options={[
                    { value: "operator", label: "Operator" },
                    { value: "supervisor", label: "Supervisor" },
                    { value: "admin", label: "Manager" }
                  ]}
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  4-Digit Access PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  value={newPin}
                  id="admin-user-pin-input"
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center tracking-widest font-bold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {userError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{userError}</span>
              </div>
            )}

            {userSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>User registered successfully!</span>
              </div>
            )}

            <button
              type="submit"
              disabled={userSubmitLoading}
              id="admin-add-user-btn"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 uppercase tracking-wider shadow-xs"
            >
              {userSubmitLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering Profile...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Profile</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* User Account List */}
        <div className="lg:col-span-7 glass-panel p-5 sm:p-6">
          <h4 className="font-mono font-bold text-slate-900 text-xs uppercase mb-4 pb-3 border-b border-slate-100">Configured Shopfloor Team Profiles</h4>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1" id="admin-users-list">
            {users.map((u) => {
              const roleColors = {
                admin: "bg-rose-50 text-rose-700 border-rose-200/80",
                supervisor: "bg-amber-50 text-amber-700 border-amber-200/80",
                operator: "bg-emerald-50 text-emerald-700 border-emerald-200/80"
              };

              return (
                <div key={u.id} className="flex items-center justify-between p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl font-mono">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 shadow-2xs">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-sans font-bold text-xs text-slate-900 block">{u.fullName}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">@{u.username} • PIN: {u.pin}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${roleColors[u.role]}`}>
                      {u.role === 'admin' ? 'Manager' : u.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                    </span>

                    <button
                      onClick={() => handleStartEditUser(u)}
                      id={`edit-user-${u.id}`}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      title="Edit Profile Name, Username, Role & PIN / Password"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    
                    {/* Cannot delete Gonzalo for safety */}
                    {u.username !== "gonzalo" && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        id={`delete-user-${u.id}`}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200 border border-transparent rounded-lg transition-colors cursor-pointer"
                        title="Delete User"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Edit User Profile Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider font-mono">Edit Team Profile</h3>
                  <span className="text-[11px] text-slate-400 font-normal block mt-0.5 font-sans">Editing credentials for @{editingUser.username}</span>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Full Name / Display Name
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  id="edit-user-fullname-input"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-sans font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="e.g. Gonzalo Perez"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Username / Handle
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  id="edit-user-username-input"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="e.g. gonzalo"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    User Role
                  </label>
                  <CustomSelect
                    value={editRole}
                    onChange={(val) => setEditRole(val as any)}
                    options={[
                      { value: "operator", label: "Operator" },
                      { value: "supervisor", label: "Supervisor" },
                      { value: "admin", label: "Manager" }
                    ]}
                    size="sm"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    4-Digit PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPin ? "text" : "password"}
                      maxLength={4}
                      value={editPin}
                      id="edit-user-pin-input"
                      onChange={(e) => setEditPin(e.target.value)}
                      className="w-full px-3 py-2 pr-8 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center tracking-widest font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                      placeholder="e.g. 1234"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPin(!showEditPin)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title={showEditPin ? "Hide PIN" : "Show PIN"}
                    >
                      {showEditPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  id="edit-user-save-btn"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {editLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Danger Zone: Database Reset */}
      <div className="glass-panel p-5 mt-4 border-rose-200/80 bg-rose-50/20">
        <div className="flex items-center justify-between gap-4 font-sans text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <h4 className="font-mono font-bold text-rose-800 text-xs uppercase">Danger Zone</h4>
          </div>
          <button
            onClick={handleResetDatabase}
            disabled={isResetting}
            id="admin-reset-db-btn"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 uppercase text-xs tracking-wider font-mono shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>RESET DATABASE TO 0</span>
          </button>
        </div>
      </div>

    </div>
  );
}
