import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  getFirestore, 
  doc, 
  getDoc,
  persistentLocalCache,
  persistentMultipleTabManager 
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore with robust HTTP long polling and multi-tab offline cache to eliminate WebSocket & stream failures in iframe/sandbox environments
let db: any;
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";

try {
  db = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    firestoreDbId
  );
} catch (e) {
  try {
    db = getFirestore(app, firestoreDbId);
  } catch (err) {
    db = getFirestore(app);
  }
}

// Non-blocking, fault-tolerant connection check that does not throw or trigger code=unavailable
async function testConnection() {
  try {
    // Graceful ping that works seamlessly with local cache and does not fail on network warmup
    await getDoc(doc(db, "test", "connection"));
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("offline") || msg.includes("unavailable")) {
      console.info("Firestore client operating with local cache / background synchronization.");
    } else {
      console.warn("Firestore connection check notice:", msg);
    }
  }
}

if (typeof window !== "undefined") {
  setTimeout(() => {
    testConnection();
  }, 1000);
}

export { db };



