import React, { useState } from "react";
import { User, UserRole } from "../types";
import { 
  Plus, Trash2, Users, RefreshCw, Check, AlertCircle 
} from "lucide-react";

interface AdminWorkspaceProps {
  users: User[];
  onAddUser: (userData: User) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
}

export default function AdminWorkspace({
  users,
  onAddUser,
  onDeleteUser,
}: AdminWorkspaceProps) {
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

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
              Configure and manage shopfloor user accounts and access profiles.
            </p>
          </div>
        </div>
      </div>

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

    </div>
  );
}
