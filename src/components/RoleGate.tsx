import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  UserCheck, Loader2, ArrowRight, User as UserIcon, 
  Shield, Check, AlertCircle, ArrowLeft, Lock, Factory
} from "lucide-react";

interface RoleGateProps {
  onLogin: (user: User) => void;
}

export default function RoleGate({ onLogin }: RoleGateProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Fetch users from Firestore
  useEffect(() => {
    async function loadUsers() {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const userList: User[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as User;
          const fullName = (data.username === "gonzalo" || data.fullName === "GONZALO") ? "Manager" : (data.fullName === "SHIFT A" ? "Shift A" : data.fullName === "SHIFT B" ? "Shift B" : data.fullName);
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

  // Theme styling matching the exact visual design in the provided mockup
  const getUserCardTheme = (user: User) => {
    const isShiftA = user.username === "shift_a" || user.fullName?.toUpperCase().includes("SHIFT A");
    const isShiftB = user.username === "shift_b" || user.fullName?.toUpperCase().includes("SHIFT B");
    const isManager = user.role === "admin" || user.username === "gonzalo" || user.fullName?.toUpperCase().includes("MANAGER") || user.fullName === "GONZALO";

    if (isShiftA) {
      return {
        tag: "SHIFT A",
        title: "Shift A",
        badgeClass: "bg-[#092b21] text-emerald-400 border border-emerald-800/40",
        iconBgClass: "bg-[#092b21] text-emerald-400 border border-emerald-800/40",
        cardBorderClass: "border-[#0e4838] bg-[#071322] hover:border-emerald-500/60 hover:shadow-emerald-950/40",
        accentColor: "text-emerald-400",
        arrowBg: "bg-[#092b21] text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950",
      };
    }
    if (isShiftB) {
      return {
        tag: "SHIFT B",
        title: "Shift B",
        badgeClass: "bg-[#092142] text-blue-400 border border-blue-800/40",
        iconBgClass: "bg-[#092142] text-blue-400 border border-blue-800/40",
        cardBorderClass: "border-[#143d73] bg-[#071322] hover:border-blue-500/60 hover:shadow-blue-950/40",
        accentColor: "text-blue-400",
        arrowBg: "bg-[#092142] text-blue-400 group-hover:bg-blue-500 group-hover:text-white",
      };
    }
    if (isManager) {
      return {
        tag: "MANAGER",
        title: "Manager",
        badgeClass: "bg-[#35200b] text-amber-400 border border-amber-800/40",
        iconBgClass: "bg-[#35200b] text-amber-400 border border-amber-800/40",
        cardBorderClass: "border-[#5e3814] bg-[#071322] hover:border-amber-500/60 hover:shadow-amber-950/40",
        accentColor: "text-amber-400",
        arrowBg: "bg-[#35200b] text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950",
      };
    }
    return {
      tag: user.role.toUpperCase(),
      title: user.fullName || user.username.toUpperCase(),
      badgeClass: "bg-slate-800 text-slate-300 border border-slate-700",
      iconBgClass: "bg-slate-800 text-slate-300 border border-slate-700",
      cardBorderClass: "border-slate-800 bg-[#071322] hover:border-slate-600",
      accentColor: "text-slate-200",
      arrowBg: "bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-white",
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

  // Submit PIN automatically when 4 digits are reached
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
      }, 500);
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
      if (window.navigator?.vibrate) {
        window.navigator.vibrate(100);
      }
    }
  };

  // Physical keyboard listener for PIN entry
  useEffect(() => {
    if (!selectedUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
    <div className="min-h-screen bg-[#070e18] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none relative overflow-y-auto" id="rolegate-screen">
      
      {/* Background Subtle Industrial Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-[#0a1424]/60 via-transparent to-[#050b14] opacity-80" />

      {/* Main Authentication Card */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative z-10 w-full max-w-3xl bg-[#08111e]/95 border border-[#16253c] rounded-[28px] shadow-2xl shadow-black/90 backdrop-blur-md p-6 sm:p-8 md:p-10 my-auto"
      >
        {/* Header Branding Area */}
        <div className="flex flex-col items-center text-center pb-6 sm:pb-8 border-b border-[#16253c]">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img 
              src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
              alt="EPP NATUR" 
              className="h-10 object-contain filter brightness-110 drop-shadow-md"
              referrerPolicy="no-referrer"
              id="brand-logo-gate"
            />
          </div>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#131f33] border border-[#21324d] text-slate-300 text-[11px] font-mono font-bold uppercase tracking-wider mb-2.5">
            <Factory className="w-3.5 h-3.5 text-slate-400" />
            <span>STEERING WHEEL STOCK CONTROL</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white font-display tracking-tight">
            User Authentication
          </h1>
        </div>

        {/* Dynamic Content Area: Profile Selection vs. PIN Pad */}
        <div className="pt-6 sm:pt-8 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {!selectedUser ? (
              // Step 1: Profile Selection Cards (Matching user's exact screenshot)
              <motion.div
                key="select-user"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                    AVAILABLE PROFILES
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-400">
                    {users.length} Active Accounts
                  </span>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <p className="text-slate-400 text-xs font-mono">Loading profiles...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="profile-selection-grid">
                    {users.map((user) => {
                      const theme = getUserCardTheme(user);

                      return (
                        <button
                          key={user.id}
                          id={`user-btn-${user.username}`}
                          onClick={() => {
                            setSelectedUser(user);
                            setPin("");
                            setError("");
                          }}
                          className={`group relative text-left p-6 rounded-2xl border transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex flex-col justify-between ${theme.cardBorderClass}`}
                        >
                          {/* Card Top: Badge & Icon */}
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${theme.badgeClass}`}>
                                {theme.tag}
                              </span>
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ${theme.iconBgClass}`}>
                                {user.role === "admin" ? (
                                  <Shield className="w-4 h-4" />
                                ) : (
                                  <UserIcon className="w-4 h-4" />
                                )}
                              </div>
                            </div>

                            <h3 className="text-xl font-bold text-white tracking-tight my-4 group-hover:text-white">
                              {theme.title}
                            </h3>
                          </div>

                          {/* Card Bottom: Interactive Sign-in prompt */}
                          <div className="pt-4 border-t border-[#142338] flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-200 transition-colors">
                              ENTER PIN
                            </span>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${theme.arrowBg}`}>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              // Step 2: Clean Industrial Dark PIN Pad (Kept perfectly with all numbers visible)
              <motion.div
                key="enter-pin"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center max-w-sm mx-auto w-full"
              >
                {/* Back Button & Selected Profile Badge */}
                <div className="w-full flex items-center justify-between mb-3">
                  <button 
                    onClick={() => { 
                      setSelectedUser(null); 
                      setPin(""); 
                      setError(""); 
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-mono font-bold transition-all cursor-pointer shadow-xs"
                    id="back-to-profiles-btn"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>

                  {/* Selected Profile Badge */}
                  {selectedUser && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${getUserCardTheme(selectedUser).badgeClass}`}>
                      {getUserCardTheme(selectedUser).tag}
                    </span>
                  )}
                </div>

                {/* Profile Identity Heading */}
                <div className="text-center mb-2">
                  <div className={`mx-auto w-10 h-10 rounded-xl mb-1.5 flex items-center justify-center border shadow-xs transition-all ${
                    success 
                      ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-400" 
                      : getUserCardTheme(selectedUser).iconBgClass
                  }`}>
                    {success ? <UserCheck className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                  </div>

                  <h2 className="text-base sm:text-lg font-extrabold text-white">
                    {getUserCardTheme(selectedUser).title}
                  </h2>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Enter 4-digit security PIN
                  </p>
                </div>

                {/* PIN Dots Visualizer */}
                <div className="flex justify-center gap-3 my-2">
                  {[0, 1, 2, 3].map((index) => {
                    const isFilled = pin.length > index;
                    return (
                      <div
                        key={index}
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                          isFilled
                            ? "bg-blue-500 border-blue-400 scale-110 shadow-md shadow-blue-500/50"
                            : "border-slate-600 bg-slate-800/80"
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Status / Alert feedback message */}
                <div className="h-5 flex items-center justify-center mb-2">
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-full text-[10px] font-mono font-bold"
                    >
                      <AlertCircle className="w-3 h-3" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                  {success && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full text-[10px] font-mono font-bold"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>ACCESS GRANTED</span>
                    </motion.div>
                  )}
                </div>

                {/* Full Complete Industrial Keypad (Rows 1-3, 4-6, 7-9, CLR-0-⌫) */}
                <div className="grid grid-cols-3 gap-2 w-full max-w-[320px]" id="pinpad-grid">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleKeyPress(num)}
                      className="h-11 sm:h-12 rounded-xl bg-[#132238] border border-slate-700/80 hover:border-slate-500 hover:bg-[#1a2d47] active:bg-[#0f1b2d] active:scale-95 text-white font-mono text-lg font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm"
                    >
                      {num}
                    </button>
                  ))}
                  
                  {/* Clear Button */}
                  <button
                    onClick={handleClear}
                    className="h-11 sm:h-12 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-slate-500 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-slate-200 font-mono text-xs font-bold uppercase transition-all flex items-center justify-center cursor-pointer shadow-sm"
                  >
                    CLR
                  </button>

                  {/* 0 Button */}
                  <button
                    onClick={() => handleKeyPress("0")}
                    className="h-11 sm:h-12 rounded-xl bg-[#132238] border border-slate-700/80 hover:border-slate-500 hover:bg-[#1a2d47] active:bg-[#0f1b2d] active:scale-95 text-white font-mono text-lg font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm"
                  >
                    0
                  </button>

                  {/* Backspace Button */}
                  <button
                    onClick={handleBackspace}
                    className="h-11 sm:h-12 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-slate-500 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-slate-200 font-mono text-base transition-all flex items-center justify-center cursor-pointer shadow-sm"
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
