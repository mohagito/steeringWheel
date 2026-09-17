import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with resilient auto-detect long polling and caching
let db: any;
try {
  db = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId || "(default)"
  );
} catch (e) {
  try {
    db = initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId || "(default)"
    );
  } catch (err) {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  }
}

export { db };



