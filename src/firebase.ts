import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with auto-detect long polling for optimal container & proxy connection
const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
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


