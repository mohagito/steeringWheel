import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore with forced HTTP long polling to eliminate WebSocket handshake failures in iframe/sandbox environments
let db: any;
try {
  db = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId || "(default)"
  );
} catch (e) {
  try {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  } catch (err) {
    db = getFirestore(app);
  }
}

// Non-blocking connection test as mandated by Firebase integration standards
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firestore running in offline cache mode.");
    }
  }
}
testConnection();

export { db };



