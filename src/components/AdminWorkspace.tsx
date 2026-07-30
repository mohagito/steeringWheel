import React, { useState } from "react";
import { User, UserRole } from "../types";
import { CustomSelect } from "./CustomSelect";
import { 
  Plus, Trash2, Users, RefreshCw, Check, AlertCircle, ShieldCheck 
} from "lucide-react";
import Swal from "sweetalert2";

interface AdminWorkspaceProps {
  users: User[];
  onAddUser: (userData: User) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onCleanDatabase: () => Promise<void>;
  onAuditDatabase?: () => Promise<{ repairedRefs: number; repairedUsers: number }>;
}

export default function AdminWorkspace({
  users,
  onAddUser,
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
    <div className="space-y-4" id="admin-workspace-tab">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-none border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-none bg-[#0f1e36] text-white flex items-center justify-center font-mono font-bold border border-[#1e293b]">
            AD
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 block tracking-widest">SYSTEM MANAGEMENT</span>
            <h3 className="font-mono font-black text-slate-900 text-sm uppercase">Administrator Terminal</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" id="users-admin-view">
        
        {/* User Creator Form */}
        <div className="lg:col-span-5 bg-white p-4 rounded-none border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
            <Users className="w-4 h-4 text-slate-600" />
            <h4 className="font-mono font-bold text-slate-800 text-xs uppercase">Create Profile</h4>
          </div>

          <form onSubmit={handleUserSubmit} className="space-y-3 font-mono text-xs">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Username / Identifier
              </label>
              <input
                type="text"
                placeholder="e.g. op_pablo"
                value={newUsername}
                id="admin-user-username-input"
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-none text-xs focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                type="text"
                placeholder="e.g. Pablo Ramírez"
                value={newFullName}
                id="admin-user-fullname-input"
                onChange={(e) => setNewFullName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-none text-xs focus:outline-none focus:border-blue-600 font-sans font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
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
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  4-Digit Access PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  value={newPin}
                  id="admin-user-pin-input"
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-none font-mono text-center tracking-widest font-extrabold text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {userError && (
              <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{userError}</span>
              </div>
            )}

            {userSuccess && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>User registered successfully!</span>
              </div>
            )}

            <button
              type="submit"
              disabled={userSubmitLoading}
              id="admin-add-user-btn"
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
        <div className="lg:col-span-7 bg-white p-4 rounded-none border border-slate-200 shadow-2xs">
          <h4 className="font-mono font-bold text-slate-800 text-xs uppercase mb-3 border-b border-slate-100 pb-2">Configured Shopfloor Team Profiles</h4>

          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1" id="admin-users-list">
            {users.map((u) => {
              const roleColors = {
                admin: "bg-red-50 text-red-700 border-red-200",
                supervisor: "bg-amber-50 text-amber-700 border-amber-200",
                operator: "bg-emerald-50 text-emerald-700 border-emerald-200"
              };

              return (
                <div key={u.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-none font-mono">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white border border-slate-200 rounded-none text-slate-600">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-sans font-bold text-xs text-slate-900 block">{u.fullName}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">@{u.username} • PIN: {u.pin}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded-none text-[8px] font-bold uppercase tracking-wider border ${roleColors[u.role]}`}>
                      {u.role === 'admin' ? 'Manager' : u.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                    </span>
                    
                    {/* Cannot delete Gonzalo for safety */}
                    {u.username !== "gonzalo" && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        id={`delete-user-${u.id}`}
                        className="p-1 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-none transition-colors cursor-pointer"
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

      {/* Enterprise Integrity Audit & Maintenance */}
      <div className="bg-white p-4 rounded-none border border-emerald-200 shadow-2xs mt-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-emerald-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h4 className="font-mono font-bold text-emerald-900 text-xs uppercase">Enterprise Data Integrity & Audit</h4>
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
          <div className="space-y-1">
            <p className="font-bold text-slate-800">1-Click Database Audit & Self-Healing Verification</p>
            <p className="text-[10px] text-slate-500">
              Validates mathematical stock equations (<span className="font-mono text-slate-700">Stock1 + Stock2 + Stock3 = Total</span>), fixes null or undefined fields, and verifies user access permissions.
            </p>
          </div>
          <button
            onClick={handleAuditDatabase}
            disabled={isAuditing}
            id="admin-audit-db-btn"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-700 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 select-none uppercase shadow-2xs"
          >
            <ShieldCheck className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>AUDIT & SECURE DATABASE</span>
          </button>
        </div>
      </div>

      {/* Danger Zone: Database Reset */}
      <div className="bg-white p-4 rounded-none border border-red-200 shadow-2xs mt-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-red-100">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <h4 className="font-mono font-bold text-red-800 text-xs uppercase">Danger Zone</h4>
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
          <div className="space-y-1">
            <p className="font-bold text-slate-800">Reset System Database to Pristine State</p>
          </div>
          <button
            onClick={handleResetDatabase}
            disabled={isResetting}
            id="admin-reset-db-btn"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold border border-red-700 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 select-none uppercase"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>RESET DATABASE TO 0</span>
          </button>
        </div>
      </div>

    </div>
  );
}
