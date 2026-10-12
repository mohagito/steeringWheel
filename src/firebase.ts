/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  getFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
// Built-in production Firebase configuration for Steering Wheel Stock Control System
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0551621027",
  appId: "1:4192361386:web:6b54f9b3523f7949e6e9d3",
  apiKey: "AIzaSyBuEFjTbxG1a_4MgLWBnXZHyetur9_PcVQ",
  authDomain: "gen-lang-client-0551621027.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-ba55ba55-21de-4acf-b72b-c6e7609e0d10",
  storageBucket: "gen-lang-client-0551621027.firebasestorage.app",
  messagingSenderId: "4192361386",
  measurementId: "",
  oAuthClientId: "4192361386-385g7s4dkknmt4ptv67053avi9vm0qjk.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// Safe config resolution using import.meta.glob (does NOT fail build if JSON file is omitted from git)
const configGlob = typeof (import.meta as any).glob === "function" 
  ? (import.meta as any).glob("../firebase-applet-config.json", { eager: true }) 
  : {};
const loadedConfig = (configGlob as any)["../firebase-applet-config.json"]?.default || {};

const firebaseConfig = {
  ...DEFAULT_FIREBASE_CONFIG,
  ...loadedConfig,
  // Always guarantee the exact authoritative database ID so stock never resets to 0
  firestoreDatabaseId: loadedConfig.firestoreDatabaseId || DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore with robust multi-environment resilience
let db: any;
const firestoreDbId = firebaseConfig.firestoreDatabaseId;



try {
  db = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
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

export { db };



