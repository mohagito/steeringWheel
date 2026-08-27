import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long polling for robust connection through container proxies
let db: any;
try {
  db = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      cacheSizeBytes: 40000000, // 40MB cache for robust offline support
    },
    firebaseConfig.firestoreDatabaseId || "(default)"
  );
} catch (e) {
  try {
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (err) {
    db = getFirestore(app);
  }
}


// Graceful initial connectivity check
async function checkFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "references", "_healthcheck"));
  } catch (_err) {
    console.warn("Firestore running in offline/cached mode.");
  }
}

checkFirestoreConnection();

export { db };



