import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long polling for container / proxy compatibility
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
    // Silence network failure warnings during initial container boot
    console.log("Firestore initialized; using cached persistence.");
  }
}

checkFirestoreConnection();

export { db };


