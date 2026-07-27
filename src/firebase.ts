import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with auto-detect long polling for maximum reliability across environments.
// This supports WebSockets and automatically falls back to long polling when needed.
const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || "(default)"
);

// Connection test to verify backend reachability
async function checkFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "references", "_healthcheck"));
  } catch (error) {
    // Expected behavior when offline: Firestore gracefully uses local cache until connection recovers
    if (error instanceof Error && error.message.includes("offline")) {
      console.warn("Firestore running in cached offline mode:", error.message);
    }
  }
}

checkFirestoreConnection();

export { db };


