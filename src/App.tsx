import { useState, useEffect } from "react";
import { 
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, setDoc, query, orderBy, getDoc, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import { seedDatabaseIfNeeded, resetDatabaseToPristineState } from "./seeder";
import { Box, Adjustment, User, Reference, Delivery, Production } from "./types";
import RoleGate from "./components/RoleGate";
import DashboardOverview from "./components/DashboardOverview";
import OperatorWorkspace from "./components/OperatorWorkspace";
import SupervisorWorkspace from "./components/SupervisorWorkspace";
import AdminWorkspace from "./components/AdminWorkspace";
import StockWorkspace from "./components/StockWorkspace";
import DeliveriesWorkspace from "./components/DeliveriesWorkspace";
import ProductionWorkspace from "./components/ProductionWorkspace";
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, Scan, ClipboardCheck, Settings, LogOut, 
  RefreshCw, CheckSquare, Shield, HelpCircle, Database, Truck, Factory
} from "lucide-react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "stock" | "operator" | "supervisor" | "admin" | "deliveries" | "production">("dashboard");

  // Sync state with Firestore on mount
  useEffect(() => {
    let unsubBoxes: (() => void) | null = null;
    let unsubAdjustments: (() => void) | null = null;
    let unsubReferences: (() => void) | null = null;
    let unsubUsers: (() => void) | null = null;
    let unsubDeliveries: (() => void) | null = null;
    let unsubProductions: (() => void) | null = null;

    async function initApp() {
      try {
        // 1. Seed database with rich sample data if completely empty
        await seedDatabaseIfNeeded();
      } catch (err) {
        console.error("Seeding failed", err);
      }

      // 2. Real-time subscriptions to Firestore collections
      unsubBoxes = onSnapshot(
        collection(db, "boxes"), 
        (snapshot) => {
          const boxesList: Box[] = [];
          snapshot.forEach((doc) => {
            boxesList.push({ id: doc.id, ...doc.data() } as Box);
          });
          // Sort boxes alphabetically by barcode
          boxesList.sort((a, b) => a.barcode.localeCompare(b.barcode));
          setBoxes(boxesList);
        },
        (error) => {
          console.error("Error subscribing to boxes:", error);
        }
      );

      // Sort adjustments by timestamp descending
      unsubAdjustments = onSnapshot(
        collection(db, "adjustments"), 
        (snapshot) => {
          const adjList: Adjustment[] = [];
          snapshot.forEach((doc) => {
            adjList.push({ id: doc.id, ...doc.data() } as Adjustment);
          });
          adjList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setAdjustments(adjList);
        },
        (error) => {
          console.error("Error subscribing to adjustments:", error);
        }
      );

      unsubReferences = onSnapshot(
        collection(db, "references"),
        (snapshot) => {
          const refList: Reference[] = [];
          snapshot.forEach((doc) => {
            refList.push({ id: doc.id, ...doc.data() } as Reference);
          });
          refList.sort((a, b) => a.code.localeCompare(b.code));
          setReferences(refList);
        },
        (error) => {
          console.error("Error subscribing to references:", error);
        }
      );

      // Subscribing to Deliveries collection
      unsubDeliveries = onSnapshot(
        collection(db, "deliveries"),
        (snapshot) => {
          const delList: Delivery[] = [];
          snapshot.forEach((doc) => {
            delList.push({ id: doc.id, ...doc.data() } as Delivery);
          });
          // Sort deliveries descending by timestamp
          delList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setDeliveries(delList);
        },
        (error) => {
          console.error("Error subscribing to deliveries:", error);
        }
      );

      // Subscribing to Productions collection
      unsubProductions = onSnapshot(
        collection(db, "productions"),
        (snapshot) => {
          const prodList: Production[] = [];
          snapshot.forEach((doc) => {
            prodList.push({ id: doc.id, ...doc.data() } as Production);
          });
          // Sort productions descending by date, then by timestamp
          prodList.sort((a, b) => {
            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
          setProductions(prodList);
        },
        (error) => {
          console.error("Error subscribing to productions:", error);
        }
      );

      unsubUsers = onSnapshot(
        collection(db, "users"), 
        (snapshot) => {
          const usersList: User[] = [];
          snapshot.forEach((doc) => {
            usersList.push({ id: doc.id, ...doc.data() } as User);
          });
          setUsers(usersList);
          setLoading(false);
        },
        (error) => {
          console.error("Error subscribing to users:", error);
          setLoading(false); // Make sure we stop loading even on error
        }
      );
    }

    initApp();

    return () => {
      if (unsubBoxes) unsubBoxes();
      if (unsubAdjustments) unsubAdjustments();
      if (unsubReferences) unsubReferences();
      if (unsubDeliveries) unsubDeliveries();
      if (unsubProductions) unsubProductions();
      if (unsubUsers) unsubUsers();
    };
  }, []);

  // Helper to remove undefined values before writing to Firestore
  const cleanUndefined = <T extends Record<string, any>>(obj: T): T => {
    const clean: any = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== undefined) {
        clean[key] = obj[key];
      }
    });
    return clean as T;
  };

  // Action: Operator logs multiple deliveries / dispatches in a batch under one invoice
  const handleSubmitDeliveries = async (deliveriesData: Omit<Delivery, "id" | "timestamp" | "operatorName">[]) => {
    if (!currentUser) return;
    const batch = writeBatch(db);
    const timestamp = new Date().toISOString();
    
    // Determine all references to fetch and update
    const allRefCodesToUpdate = new Set<string>();
    deliveriesData.forEach(d => {
      allRefCodesToUpdate.add(d.reference);
    });

    const refCodesArray = Array.from(allRefCodesToUpdate);
    const refSnaps = await Promise.all(
      refCodesArray.map(ref => getDoc(doc(db, "references", ref)))
    );
    
    const refSnapMap: Record<string, number> = {};
    refSnaps.forEach((snap: any) => {
      if (snap.exists()) {
        refSnapMap[snap.id] = snap.data()?.currentStock || 0;
      } else {
        refSnapMap[snap.id] = 0;
      }
    });

    deliveriesData.forEach((delivery, index) => {
      const refCode = delivery.reference;
      const qty = delivery.quantity;
      const currentStock = refSnapMap[refCode] || 0;
      
      const stockAfter = Math.max(0, currentStock - qty);
      refSnapMap[refCode] = stockAfter; // update locally in case of duplicate references in input

      const newId = `del-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`;
      const newDelivery: Delivery = {
        ...delivery,
        id: newId,
        operatorName: currentUser.fullName,
        timestamp
      };

      batch.set(doc(db, "deliveries", newId), cleanUndefined(newDelivery));
      batch.set(doc(db, "references", refCode), {
        currentStock: stockAfter,
        lastUpdate: timestamp
      }, { merge: true });

      // Decrement corresponding quantity from active warehouse boxes to keep the stock numbers perfectly in sync!
      const componentBoxes = [...boxes]
        .filter(b => b.reference.toUpperCase() === refCode.toUpperCase())
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      let remainingToDeduct = qty;
      for (const box of componentBoxes) {
        if (remainingToDeduct <= 0) break;

        const currentQty = box.expectedQty || 0;
        const deduction = Math.min(currentQty, remainingToDeduct);
        const newQty = currentQty - deduction;
        remainingToDeduct -= deduction;

        // Update the box in firestore
        batch.update(doc(db, "boxes", box.id), {
          expectedQty: newQty,
          updatedAt: timestamp
        });

        // Log an Adjustment record for tracking
        const adjId = `adj-consume-delivery-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`;
        const adj: Adjustment = {
          id: adjId,
          barcode: box.barcode,
          reference: refCode,
          expectedQty: currentQty,
          actualQty: newQty,
          difference: -deduction,
          operatorName: currentUser.fullName,
          timestamp,
          status: "approved",
          comment: `Consumed automatically on delivery of reference ${refCode}`,
          materialType: box.materialType
        };
        batch.set(doc(db, "adjustments", adjId), cleanUndefined(adj));
      }
    });

    await batch.commit();
  };

  // Action: Operator logs production consumption in a batch
  const handleSubmitProduction = async (productionEntries: { date: string; reference: string; quantity: number; notes?: string }[]) => {
    if (!currentUser) return;
    const batch = writeBatch(db);
    const timestamp = new Date().toISOString();
    
    // Fetch all reference snaps in parallel
    const refSnaps = await Promise.all(
      productionEntries.map(p => getDoc(doc(db, "references", p.reference)))
    );
    
    const refSnapMap: Record<string, number> = {};
    refSnaps.forEach((snap: any) => {
      if (snap.exists()) {
        refSnapMap[snap.id] = snap.data()?.currentStock || 0;
      } else {
        refSnapMap[snap.id] = 0;
      }
    });

    productionEntries.forEach((entry, index) => {
      const refCode = entry.reference;
      const currentStock = refSnapMap[refCode] || 0;
      
      const stockAfter = Math.max(0, currentStock - entry.quantity);
      refSnapMap[refCode] = stockAfter; // update locally in case of duplicate references in input

      const newId = `prod-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`;
      const newProduction: Production = {
        ...entry,
        id: newId,
        operatorName: currentUser.fullName,
        timestamp
      };

      batch.set(doc(db, "productions", newId), cleanUndefined(newProduction));
      batch.set(doc(db, "references", refCode), {
        currentStock: stockAfter,
        lastUpdate: timestamp
      }, { merge: true });
    });

    await batch.commit();
  };

  // Action: Operator submits a physical count adjustment
  const handleSubmitAdjustment = async (adjustmentData: Omit<Adjustment, "id" | "timestamp" | "status">) => {
    const refCode = adjustmentData.reference;
    const refDocRef = doc(db, "references", refCode);
    const refSnap = await getDoc(refDocRef);
    
    let currentStock = 0;
    if (refSnap.exists()) {
      currentStock = refSnap.data().currentStock || 0;
    }
    
    const stockBefore = currentStock;
    const stockAdded = adjustmentData.actualQty; // Real Counted Quantity added
    const stockAfter = stockBefore + stockAdded;

    // Save adjustment record to Firestore with stock tracking info
    const newId = `adj-${Date.now()}`;
    const newAdjustment: Adjustment = {
      ...adjustmentData,
      id: newId,
      timestamp: new Date().toISOString(),
      status: "approved", // Automatically approved/added on operators save
      stockBefore,
      stockAdded,
      stockAfter
    };

    await setDoc(doc(db, "adjustments", newId), cleanUndefined(newAdjustment));

    // Update reference currentStock
    await setDoc(refDocRef, {
      currentStock: stockAfter,
      lastUpdate: new Date().toISOString()
    }, { merge: true });

    // Save/update the carton (box) record as well
    const boxRef = doc(db, "boxes", adjustmentData.barcode);
    await setDoc(boxRef, {
      id: adjustmentData.barcode,
      barcode: adjustmentData.barcode,
      reference: refCode,
      expectedQty: adjustmentData.actualQty, // Baseline is updated
      location: "Zone A",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      materialType: adjustmentData.materialType || "Mesh",
      invoiceNumber: adjustmentData.invoiceNumber || "",
      palletQuality: adjustmentData.palletQuality || ""
    });
  };

  // Action: Supervisor approves count adjustment
  // Crucial logic: Marks as approved and UPDATES the physical expectedQty of the carton!
  const handleApproveAdjustment = async (adjustmentId: string) => {
    if (!currentUser) return;
    const adj = adjustments.find(a => a.id === adjustmentId);
    if (!adj) return;

    // 1. Update adjustment state in Firestore
    const adjRef = doc(db, "adjustments", adjustmentId);
    await updateDoc(adjRef, {
      status: "approved",
      validatedBy: currentUser.fullName,
      validatedAt: new Date().toISOString()
    });

    // 2. Adjust expected quantity in physical carton / box
    const boxRef = doc(db, "boxes", adj.barcode);
    await updateDoc(boxRef, {
      expectedQty: adj.actualQty,
      updatedAt: new Date().toISOString()
    });
  };

  // Action: Supervisor rejects count adjustment
  const handleRejectAdjustment = async (adjustmentId: string) => {
    if (!currentUser) return;
    const adjRef = doc(db, "adjustments", adjustmentId);
    await updateDoc(adjRef, {
      status: "rejected",
      validatedBy: currentUser.fullName,
      validatedAt: new Date().toISOString()
    });
  };



  // Action: Admin registers a box
  const handleAddBox = async (boxData: Omit<Box, "createdAt" | "updatedAt">) => {
    const newBox: Box = {
      ...boxData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, "boxes", boxData.id), newBox);
  };

  // Action: Admin deletes a box
  const handleDeleteBox = async (boxId: string) => {
    await deleteDoc(doc(db, "boxes", boxId));
  };

  // Action: Admin updates a box
  const handleUpdateBox = async (boxId: string, updatedFields: Partial<Box>) => {
    const boxRef = doc(db, "boxes", boxId);
    await updateDoc(boxRef, {
      ...updatedFields,
      updatedAt: new Date().toISOString()
    });
  };

  // Action: Admin updates a reference
  const handleUpdateReference = async (refId: string, updatedFields: Partial<Reference>) => {
    const refRef = doc(db, "references", refId);
    await updateDoc(refRef, {
      ...updatedFields,
      lastUpdate: new Date().toISOString()
    });
  };

  // Action: Admin adds a user profile
  const handleAddUser = async (userData: User) => {
    await setDoc(doc(db, "users", userData.id), userData);
  };

  // Action: Admin deletes a user profile
  const handleDeleteUser = async (userId: string) => {
    await deleteDoc(doc(db, "users", userId));
  };

  // Action: Clean/Reset Database
  const handleCleanDatabase = async () => {
    await resetDatabaseToPristineState();
  };

  // Change active profile/Logout
  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab("dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-950 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-12 h-12 text-brand-400 animate-spin mb-4" />
        <p className="text-brand-200 text-sm font-medium tracking-wide">
          Connecting to EPP NATUR shopfloor database...
        </p>
      </div>
    );
  }

  // If no user is logged in, show the RoleGate PIN Authenticator!
  if (!currentUser) {
    return (
      <RoleGate 
        onLogin={(user) => {
          setCurrentUser(user);
          if (user.role === "operator") {
            setActiveTab("operator");
          } else {
            setActiveTab("dashboard");
          }
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col md:flex-row text-slate-800 font-sans" id="app-root-layout">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-[#0a1322] text-slate-300 flex flex-col justify-between p-5 md:p-6 shrink-0 border-b md:border-b-0 md:border-r border-[#1e293b]">
        <div className="space-y-6 md:space-y-8">
          
          {/* EPP Natur Branding */}
          <div className="select-none flex flex-col items-start gap-1" id="sidebar-epp-natur-logo">
            <img 
              src="https://www.eppnatur.es/media/yootheme/cache/1c/logo_eppnatur_3-1ce587ca.webp" 
              alt="EPP NATUR Logo" 
              className="h-10 object-contain filter brightness-110"
              referrerPolicy="no-referrer"
            />
            <div className="text-[8px] text-slate-500 uppercase tracking-[0.2em] font-mono font-bold ml-1">
              STEERING WHEEL STOCK
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex md:flex-col flex-row flex-wrap md:space-y-1 gap-1" id="primary-navigation-tabs">
            
            {/* Dashboard Tab */}
            {currentUser.role !== "operator" && (
              <button
                onClick={() => setActiveTab("dashboard")}
                id="nav-tab-dashboard"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "dashboard"
                    ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>Analytics</span>
                </div>
              </button>
            )}

            {/* Stock Tab */}
            <button
              onClick={() => setActiveTab("stock")}
              id="nav-tab-stock"
              className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                activeTab === "stock"
                  ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                  : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 shrink-0" />
                <span>Stock</span>
              </div>
            </button>



            {/* Deliveries Tab */}
            {currentUser.role === "admin" && (
              <button
                onClick={() => setActiveTab("deliveries")}
                id="nav-tab-deliveries"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "deliveries"
                    ? "text-white font-bold bg-[#0f1e36] border-brand-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span>Deliveries</span>
                </div>
              </button>
            )}

            {/* Production Tab */}
            {currentUser.role === "admin" && (
              <button
                onClick={() => setActiveTab("production")}
                id="nav-tab-production"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "production"
                    ? "text-blue-400 font-bold bg-[#0f1e36] border-blue-400"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Factory className="w-4 h-4 shrink-0" />
                  <span>Production</span>
                </div>
              </button>
            )}

            {/* Operator Tab */}
            {currentUser.role !== "admin" && (
              <button
                onClick={() => setActiveTab("operator")}
                id="nav-tab-operator"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "operator"
                    ? "text-emerald-400 font-bold bg-[#0f1e36] border-emerald-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Scan className="w-4 h-4 shrink-0" />
                  <span>Operator count</span>
                </div>
              </button>
            )}

            {/* Supervisor Tab */}
            {(currentUser.role === "supervisor" || currentUser.role === "admin") && (
              <button
                onClick={() => setActiveTab("supervisor")}
                id="nav-tab-supervisor"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "supervisor"
                    ? "text-amber-400 font-bold bg-[#0f1e36] border-amber-500"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="w-4 h-4 shrink-0" />
                  <span>Supervisor sign-offs</span>
                </div>
              </button>
            )}

            {/* Admin Tab */}
            {currentUser.role === "admin" && (
              <button
                onClick={() => setActiveTab("admin")}
                id="nav-tab-admin"
                className={`p-2.5 rounded-sm text-xs md:text-sm font-semibold transition-all flex items-center gap-3 cursor-pointer w-full text-left select-none border-l-2 ${
                  activeTab === "admin"
                    ? "text-blue-400 font-bold bg-[#0f1e36] border-blue-400"
                    : "text-slate-400 hover:bg-[#0f1e36]/50 hover:text-white border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Admin settings</span>
                </div>
              </button>
            )}

          </nav>
        </div>

        {/* User Session Footer at bottom of sidebar */}
        <div className="border-t border-slate-800 pt-4 mt-4 md:mt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-slate-700 text-white font-bold text-sm rounded-full flex items-center justify-center uppercase shrink-0">
                {currentUser.fullName.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate" title={currentUser.fullName}>
                  {currentUser.fullName}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                  {currentUser.role === 'admin' ? 'Manager' : currentUser.role === 'supervisor' ? 'Supervisor' : 'Operator'}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              id="topbar-signout-btn"
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
              title="Exit Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 font-display">
              {activeTab === "dashboard" && "Operational Dashboard"}
              {activeTab === "stock" && "Real-time Stock Inventory"}

              {activeTab === "deliveries" && "Customer Deliveries & Dispatches"}
              {activeTab === "production" && "Daily Production Consumption"}
              {activeTab === "operator" && "Inventory Count Workspace"}
              {activeTab === "supervisor" && "Supervisor Validation & Sign-offs"}
              {activeTab === "admin" && "Administrative Control Center"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {activeTab !== "operator" && currentUser.role !== "admin" && (
              <button
                onClick={() => setActiveTab("operator")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xs shadow-md shadow-blue-200 transition-all cursor-pointer active:scale-95"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>NEW COUNT</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {activeTab === "dashboard" && (
                <DashboardOverview 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  references={references}
                  onTriggerScan={currentUser.role !== "admin" ? () => setActiveTab("operator") : undefined}
                />
              )}

              {activeTab === "stock" && (
                <StockWorkspace 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  references={references}
                  currentUser={currentUser}
                  onDeleteBox={handleDeleteBox}
                  onUpdateBox={handleUpdateBox}
                  onUpdateReference={handleUpdateReference}
                />
              )}



              {activeTab === "deliveries" && currentUser.role === "admin" && (
                <DeliveriesWorkspace
                  deliveries={deliveries}
                  references={references}
                  currentUser={currentUser}
                  onSubmitDeliveries={handleSubmitDeliveries}
                />
              )}

              {activeTab === "production" && currentUser.role === "admin" && (
                <ProductionWorkspace
                  productions={productions}
                  references={references}
                  currentUser={currentUser}
                  onSubmitProduction={handleSubmitProduction}
                />
              )}

              {activeTab === "operator" && (
                <OperatorWorkspace 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  references={references}
                  currentUser={currentUser} 
                  onSubmitAdjustment={handleSubmitAdjustment}
                />
              )}

              {activeTab === "supervisor" && (
                <SupervisorWorkspace 
                  boxes={boxes} 
                  adjustments={adjustments} 
                  currentUser={currentUser} 
                  onApproveAdjustment={handleApproveAdjustment}
                  onRejectAdjustment={handleRejectAdjustment}
                />
              )}

              {activeTab === "admin" && (
                <AdminWorkspace 
                  users={users} 
                  onAddUser={handleAddUser}
                  onDeleteUser={handleDeleteUser}
                  onCleanDatabase={handleCleanDatabase}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

    </div>
  );
}
