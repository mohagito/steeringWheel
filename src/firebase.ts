import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long polling for robust connection through container proxies
const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || "(default)"
);

// Graceful initial connectivity check
async function checkFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "references", "_healthcheck"));
  } catch (_err) {
    // Graceful offline fallback
  }
}

checkFirestoreConnection();

export { db };


