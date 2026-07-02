import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Firestore with experimentalForceLongPolling enabled.
// In sandboxed iframe environments (like AI Studio previews), WebSockets are often blocked or restricted, 
// forcing long-polling guarantees reliable communication with the Cloud Firestore backend.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || "(default)");

export { db };

