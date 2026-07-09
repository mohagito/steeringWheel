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
          userList.push({ id: doc.id, ...doc.data() } as User);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-950 p-4 relative overflow-hidden" id="rolegate-screen">
      {/* Background organic light glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-brand-400/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl bg-brand-900/60 border border-brand-800/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl z-10 grid grid-cols-1 md:grid-cols-12"
      >
        {/* Left column: Branding (Logo & Welcome) */}
        <div className="md:col-span-5 bg-gradient-to-br from-brand-900 via-brand-950 to-brand-800 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-brand-800/60 relative">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            {/* EPP Natur High Fidelity Logo */}
            <motion.img 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
              alt="EPP NATUR" 
              className="h-14 object-contain mb-8 filter brightness-110 drop-shadow-md"
              referrerPolicy="no-referrer"
              id="brand-logo-gate"
            />
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white mb-2 leading-tight">
              Stock Control System
            </h1>
            <p className="text-brand-300 text-sm font-light max-w-sm">
              Steering Wheels Production Department. Verify and reconcile physical stock counts with absolute traceability.
            </p>
          </div>

          <div className="mt-8 md:mt-0 text-center md:text-left">
          </div>
        </div>

        {/* Right column: Action (User selector / PIN Pad) */}
        <div className="md:col-span-7 p-8 flex flex-col justify-center min-h-[500px]">
          <AnimatePresence mode="wait">
            {!selectedUser ? (
              // Step 1: Select Profile
              <motion.div
                key="select-user"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="text-center md:text-left">
                  <h2 className="font-display text-xl font-semibold text-white">Identify Yourself</h2>
                  <p className="text-brand-300 text-xs mt-1">Select your profile to sign in to the production terminal</p>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                    <p className="text-brand-300 text-xs">Loading shopfloor team profiles...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="profile-selection-grid">
                    {users.map((user, idx) => {
                      const isOperator = user.role === "operator";
                      const isAdmin = user.role === "admin";
                      const isSupervisor = user.role === "supervisor";

                      // Unique styles for each role (Operator = Emerald, Manager = Blue, Supervisor = Amber)
                      const roleTheme = isOperator
                        ? {
                            borderHover: "hover:border-emerald-400/80",
                            bgHover: "hover:bg-emerald-500/10",
                            shadowColor: "rgba(16, 185, 129, 0.25)",
                            iconBg: "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:text-emerald-300",
                            badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                            textHover: "group-hover:text-emerald-200"
                          }
                        : isAdmin
                        ? {
                            borderHover: "hover:border-blue-400/80",
                            bgHover: "hover:bg-blue-500/10",
                            shadowColor: "rgba(59, 130, 246, 0.25)",
                            iconBg: "bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:text-blue-300",
                            badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                            textHover: "group-hover:text-blue-200"
                          }
                        : {
                            borderHover: "hover:border-amber-400/80",
                            bgHover: "hover:bg-amber-500/10",
                            shadowColor: "rgba(245, 158, 11, 0.25)",
                            iconBg: "bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 group-hover:text-amber-300",
                            badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                            textHover: "group-hover:text-amber-200"
                          };

                      return (
                        <motion.button
                          key={user.id}
                          id={`user-btn-${user.username}`}
                          onClick={() => setSelectedUser(user)}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ 
                            type: "spring", 
                            stiffness: 260, 
                            damping: 20,
                            delay: idx * 0.08 
                          }}
                          whileHover={{ 
                            scale: 1.04, 
                            y: -4,
                            boxShadow: `0 12px 30px -10px ${roleTheme.shadowColor}`,
                          }}
                          whileTap={{ scale: 0.97 }}
                          className={`flex items-center gap-4 p-4 rounded-2xl bg-brand-950/40 border border-brand-800/80 text-left transition-all duration-300 group cursor-pointer ${roleTheme.borderHover} ${roleTheme.bgHover}`}
                        >
                          <div className={`p-3 rounded-xl transition-all duration-300 ${roleTheme.iconBg}`}>
                            <Shield className="w-5 h-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white group-hover:text-brand-100 transition-colors duration-300">
                              {user.fullName}
                            </p>
                            <span className={`inline-block text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 mt-1 border rounded-md transition-colors duration-300 ${roleTheme.badge}`}>
                              {user.role === 'admin' ? 'Manager' : user.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                            </span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              // Step 2: Enter PIN Code (Optimized for factory tablet)
              <motion.div
                key="enter-pin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center space-y-6"
              >
                {/* Header with back button */}
                <div className="w-full flex items-center justify-between pb-2 border-b border-brand-800/50">
                  <button 
                    onClick={() => { setSelectedUser(null); setPin(""); setError(""); }}
                    className="text-brand-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    id="back-to-profiles-btn"
                  >
                    ← Back to profiles
                  </button>
                  <span className="text-[10px] text-brand-400 uppercase tracking-widest font-mono">
                    Secure PIN Entry
                  </span>
                </div>

                <div className="text-center">
                  <div className={`mx-auto w-12 h-12 rounded-full mb-3 flex items-center justify-center ${
                    success ? "bg-emerald-500 text-white" : "bg-brand-800/50 text-brand-300"
                  }`}>
                    {success ? <UserCheck className="w-6 h-6 animate-bounce" /> : <Key className="w-5 h-5" />}
                  </div>
                  <h3 className="font-display text-lg font-medium text-white">{selectedUser.fullName}</h3>
                  <p className="text-brand-300 text-xs">Enter your 4-digit PIN to authenticate</p>
                </div>

                {/* PIN dots visualizer */}
                <div className="flex justify-center gap-4 my-2">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                        pin.length > index
                          ? "bg-brand-400 border-brand-400 scale-110 shadow-lg shadow-brand-400/20"
                          : "border-brand-700 bg-transparent"
                      }`}
                    />
                  ))}
                </div>

                {/* Error / Success message */}
                <div className="h-5 text-center">
                  {error && (
                    <motion.p 
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-xs font-medium"
                    >
                      {error}
                    </motion.p>
                  )}
                  {success && (
                    <motion.p 
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-emerald-400 text-xs font-semibold tracking-wide"
                    >
                      ACCESS GRANTED - Redirecting...
                    </motion.p>
                  )}
                </div>

                {/* Industrial Grid Touch Keyboard */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]" id="pinpad-grid">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleKeyPress(num)}
                      className="h-14 rounded-2xl bg-brand-950/60 border border-brand-800 hover:border-brand-500 hover:bg-brand-800 text-white font-display text-xl font-semibold transition-all duration-150 active:scale-90 flex items-center justify-center"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={handleClear}
                    className="h-14 rounded-2xl bg-brand-950/20 hover:bg-brand-800/30 text-brand-400 text-xs font-mono transition-all duration-150 active:scale-90 flex items-center justify-center"
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={() => handleKeyPress("0")}
                    className="h-14 rounded-2xl bg-brand-950/60 border border-brand-800 hover:border-brand-500 hover:bg-brand-800 text-white font-display text-xl font-semibold transition-all duration-150 active:scale-90 flex items-center justify-center"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="h-14 rounded-2xl bg-brand-950/20 hover:bg-brand-800/30 text-brand-400 text-sm transition-all duration-150 active:scale-90 flex items-center justify-center"
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
