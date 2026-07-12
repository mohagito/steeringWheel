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
                <select
                  value={newRole}
                  id="admin-user-role-select"
                  onChange={(e: any) => setNewRole(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-none text-xs focus:outline-none focus:border-blue-600 font-bold"
                >
                  <option value="operator">Operator</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Manager</option>
                </select>
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
                      deletingUserId === u.id ? (
                        <div className="flex items-center gap-1.5" id={`confirm-delete-user-container-${u.id}`}>
                          <button
                            onClick={() => {
                              onDeleteUser(u.id);
                              setDeletingUserId(null);
                            }}
                            className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white border border-red-700 text-[9px] font-bold cursor-pointer"
                          >
                            CONFIRM
                          </button>
                          <button
                            onClick={() => setDeletingUserId(null)}
                            className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300 text-[9px] font-bold cursor-pointer"
                          >
                            CANCEL
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingUserId(u.id)}
                          id={`delete-user-${u.id}`}
                          className="p-1 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-none transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
