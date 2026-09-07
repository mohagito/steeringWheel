import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Shield, Key, Eye, EyeOff, UserCheck, Loader2 } from "lucide-react";

interface RoleGateProps {
  onLogin: (user: User) => void;
}

export default function RoleGate({ onLogin }: RoleGateProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch users from Firestore
  useEffect(() => {
    async function loadUsers() {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const userList: User[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as User;
          const fullName = (data.username === "gonzalo" || data.fullName === "GONZALO") ? "MANAGER" : data.fullName;
          userList.push({ id: doc.id, ...data, fullName });
        });
        
        // Sorting users so operator is first, supervisor second, admin last
        const roleOrder = { operator: 0, supervisor: 1, admin: 2 };
        userList.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
        
        setUsers(userList);
      } catch (err) {
        console.error("Error loading users in RoleGate:", err);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  // Colorful, pretty button styling with clean text only (no extra subtext, no icons)
  const getUserButtonStyle = (user: User) => {
    const isShiftA = user.username === "shift_a" || user.fullName?.toUpperCase().includes("SHIFT A");
    const isShiftB = user.username === "shift_b" || user.fullName?.toUpperCase().includes("SHIFT B");
    const isManager = user.role === "admin" || user.username === "gonzalo" || user.fullName?.toUpperCase().includes("MANAGER") || user.fullName === "GONZALO";

    if (isShiftA) {
      return {
        displayName: "SHIFT A",
        btnClass: "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-400/30 shadow-md shadow-emerald-950/40",
      };
    }
    if (isShiftB) {
      return {
        displayName: "SHIFT B",
        btnClass: "bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 border border-blue-400/30 shadow-md shadow-blue-950/40",
      };
    }
    if (isManager) {
      return {
        displayName: "MANAGER",
        btnClass: "bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border border-amber-400/30 shadow-md shadow-amber-950/40",
      };
    }
    return {
      displayName: user.fullName || user.username.toUpperCase(),
      btnClass: "bg-gradient-to-b from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 border border-slate-500/30 shadow-md shadow-slate-950/40",
    };
  };

  const handleKeyPress = (num: string) => {
    if (success) return;
    setError("");
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    if (success) return;
    setError("");
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (success) return;
    setError("");
    setPin("");
  };

  // Submit PIN automatically when 4 digits are reached, or via OK button
  useEffect(() => {
    if (pin.length === 4 && selectedUser) {
      verifyPin();
    }
  }, [pin]);

  const verifyPin = () => {
    if (!selectedUser) return;
    if (pin === selectedUser.pin) {
      setSuccess(true);
      setError("");
      setTimeout(() => {
        onLogin(selectedUser);
      }, 800);
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
      // Add a subtle tactile trigger - window.navigator.vibrate if supported
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }
    }
  };

  // Physical keyboard listener for PIN entry
  useEffect(() => {
    if (!selectedUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If we already succeeded, ignore
      if (success) return;

      const key = e.key;

      if (key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (key === "Escape") {
        e.preventDefault();
        setSelectedUser(null);
        setPin("");
        setError("");
      } else if (key === "Delete") {
        e.preventDefault();
        handleClear();
      } else if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        handleKeyPress(key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedUser, pin, success]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a1322] p-6 relative" id="rolegate-screen">
      {/* Main Container */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-4xl bg-[#0f1e36] border border-[#1e293b] rounded shadow-xl z-10 grid grid-cols-1 md:grid-cols-12"
      >
        {/* Left column: Branding (Logo & Welcome) */}
        <div className="md:col-span-5 bg-[#0a1322] p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#1e293b] relative">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            {/* EPP Natur High Fidelity Logo */}
            <img 
              src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
              alt="EPP NATUR" 
              className="h-10 object-contain mb-8 filter brightness-110"
              referrerPolicy="no-referrer"
              id="brand-logo-gate"
            />
            <h1 className="font-display text-xl font-bold tracking-tight text-white mb-2 uppercase border-b-2 border-brand-500 pb-1.5">
              Stock Control System
            </h1>
          </div>

          <div className="mt-8 md:mt-0 text-center md:text-left text-[10px] text-slate-500 font-mono">
            TERMINAL: TRM-01
          </div>
        </div>

        {/* Right column: Action (User selector / PIN Pad) */}
        <div className="md:col-span-7 p-8 flex flex-col justify-center min-h-[500px]">
          <AnimatePresence mode="wait">
            {!selectedUser ? (
              // Step 1: Select Profile
              <motion.div
                key="select-user"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center md:text-left border-b border-[#1e293b] pb-3">
                  <h2 className="font-display text-lg font-bold text-white uppercase tracking-wider">User Authentication</h2>
                  <p className="text-slate-400 text-xs mt-1">Select your profile to sign in</p>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                    <p className="text-slate-400 text-xs">Loading shopfloor team profiles...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="profile-selection-grid">
                    {users.map((user, idx) => {
                      const style = getUserButtonStyle(user);
                      const isLastOdd = users.length % 2 !== 0 && idx === users.length - 1;
                      const isCentered = isLastOdd || user.username === "gonzalo" || style.displayName === "MANAGER";

                      return (
                        <button
                          key={user.id}
                          id={`user-btn-${user.username}`}
                          onClick={() => setSelectedUser(user)}
                          className={`w-full py-4 sm:py-5 px-6 rounded-xl font-display font-black text-base sm:text-lg tracking-wider text-white uppercase transition-all duration-200 cursor-pointer active:scale-[0.98] hover:scale-[1.02] flex items-center justify-center text-center select-none ${style.btnClass} ${
                            isCentered
                              ? "sm:col-span-2 sm:w-[calc(50%-0.5rem)] sm:mx-auto"
                              : ""
                          }`}
                        >
                          {style.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              // Step 2: Enter PIN Code (Optimized for factory tablet)
              <motion.div
                key="enter-pin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center space-y-6"
              >
                {/* Header with back button */}
                <div className="w-full flex items-center justify-between pb-3 border-b border-[#1e293b]">
                  <button 
                    onClick={() => { setSelectedUser(null); setPin(""); setError(""); }}
                    className="text-slate-400 hover:text-white text-xs font-bold flex items-center gap-1 transition-colors uppercase tracking-wider cursor-pointer"
                    id="back-to-profiles-btn"
                  >
                    ← Exit Profile
                  </button>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                    SECURE SIGN-ON
                  </span>
                </div>

                <div className="text-center">
                  <div className={`mx-auto w-12 h-12 rounded-xl mb-3 flex items-center justify-center border shadow-md transition-all ${
                    success 
                      ? "bg-emerald-950 border-emerald-500 text-emerald-400" 
                      : "bg-[#0a1322] border-[#1e293b] text-slate-300"
                  }`}>
                    {success ? <UserCheck className="w-6 h-6" /> : <Key className="w-6 h-6" />}
                  </div>
                  <h3 className="font-display text-xl font-extrabold text-white uppercase tracking-wide">
                    {selectedUser ? getUserButtonStyle(selectedUser).displayName : ""}
                  </h3>
                  <p className="text-slate-400 text-xs mt-1 font-mono">ENTER SECURITY PASS-CODE</p>
                </div>

                {/* PIN dots visualizer */}
                <div className="flex justify-center gap-3 my-1">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className={`w-3.5 h-3.5 rounded-none border transition-all duration-100 ${
                        pin.length > index
                          ? "bg-brand-500 border-brand-500"
                          : "border-slate-600 bg-transparent"
                      }`}
                    />
                  ))}
                </div>

                {/* Error / Success message */}
                <div className="h-4 text-center">
                  {error && (
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wider">
                      {error}
                    </p>
                  )}
                  {success && (
                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      ACCESS PERMITTED - LOADING TERMINAL...
                    </p>
                  )}
                </div>

                {/* Industrial Grid Touch Keyboard */}
                <div className="grid grid-cols-3 gap-2 w-full max-w-[270px]" id="pinpad-grid">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleKeyPress(num)}
                      className="h-12 rounded-sm bg-[#0a1322] border border-[#1e293b] hover:border-[#334155] hover:bg-[#0f1e36] text-white font-display text-lg font-bold transition-colors flex items-center justify-center cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={handleClear}
                    className="h-12 rounded-sm bg-[#0a1322]/40 hover:bg-[#1e293b] text-slate-400 text-xs font-bold transition-colors flex items-center justify-center cursor-pointer"
                  >
                    RESET
                  </button>
                  <button
                    onClick={() => handleKeyPress("0")}
                    className="h-12 rounded-sm bg-[#0a1322] border border-[#1e293b] hover:border-[#334155] hover:bg-[#0f1e36] text-white font-display text-lg font-bold transition-colors flex items-center justify-center cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="h-12 rounded-sm bg-[#0a1322]/40 hover:bg-[#1e293b] text-slate-400 text-sm transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ⌫
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
