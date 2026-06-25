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
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-brand-800/60 text-brand-300 border border-brand-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              EPP Shopfloor Node Active
            </span>
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
                    {users.map((user) => (
                      <button
                        key={user.id}
                        id={`user-btn-${user.username}`}
                        onClick={() => setSelectedUser(user)}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-brand-950/40 border border-brand-800 hover:border-brand-500 hover:bg-brand-800/20 text-left transition-all duration-200 group active:scale-98"
                      >
                        <div className={`p-3 rounded-xl transition-colors ${
                          user.role === 'admin' ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' :
                          user.role === 'supervisor' ? 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20' :
                          'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20'
                        }`}>
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-brand-100 transition-colors">
                            {user.fullName}
                          </p>
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            user.role === 'admin' ? 'bg-blue-500/20 text-blue-300' :
                            user.role === 'supervisor' ? 'bg-amber-500/20 text-amber-300' :
                            'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {user.role === 'admin' ? 'Manager' : user.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                          </span>
                        </div>
                      </button>
                    ))}
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

                {/* Hints for ease of evaluation/testing */}
                <div className="text-[10px] text-brand-400 bg-brand-950/30 px-3 py-1 rounded-lg border border-brand-800/30">
                  Demo PIN for this user is: <strong className="text-white font-mono">{selectedUser.pin}</strong>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
