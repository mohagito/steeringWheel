import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { BlueMaterialSettings, BlueMaterialMovement, User } from "../types";
import { normalizeDocTimestamps } from "../utils/timeUtils";

const SETTINGS_DOC_REF = doc(db, "blue_material_settings", "config");
const MOVEMENTS_COL_REF = collection(db, "blue_material_movements");

export const DEFAULT_BLUE_MATERIAL_SETTINGS: BlueMaterialSettings = {
  coveragePerRoll: 5000,
  totalAvailableRolls: 1,
  updatedBy: "System",
};

/**
 * Subscribes to real-time Blue Material configuration.
 */
export function subscribeToBlueMaterialSettings(
  callback: (settings: BlueMaterialSettings) => void
): () => void {
  return onSnapshot(
    SETTINGS_DOC_REF,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = normalizeDocTimestamps(docSnap.data());
        callback({
          coveragePerRoll: Number(data.coveragePerRoll) || 5000,
          totalAvailableRolls: Math.max(0, Number(data.totalAvailableRolls) || 0),
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy || "System",
        });
      } else {
        // Fallback default
        callback(DEFAULT_BLUE_MATERIAL_SETTINGS);
      }
    },
    (err) => {
      console.warn("Notice subscribing to blue_material_settings:", err);
      callback(DEFAULT_BLUE_MATERIAL_SETTINGS);
    }
  );
}

/**
 * Subscribes to real-time Blue Material movement logs.
 */
export function subscribeToBlueMaterialMovements(
  callback: (movements: BlueMaterialMovement[]) => void
): () => void {
  const q = query(MOVEMENTS_COL_REF, orderBy("timestamp", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: BlueMaterialMovement[] = [];
      snapshot.forEach((snap) => {
        list.push({
          id: snap.id,
          ...normalizeDocTimestamps(snap.data()),
        } as BlueMaterialMovement);
      });
      // Sort in-memory as backup
      list.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.receivedDate || 0).getTime();
        const timeB = new Date(b.timestamp || b.receivedDate || 0).getTime();
        return timeB - timeA;
      });
      callback(list);
    },
    (err) => {
      console.warn("Notice subscribing to blue_material_movements:", err);
    }
  );
}

/**
 * Initializes or adjusts starting point of Blue Material to 1 Roll.
 */
export async function seedBlueMaterialIfEmpty(): Promise<boolean> {
  try {
    const snap = await getDoc(SETTINGS_DOC_REF);
    // If not exists or if it still has the temporary 5-roll demo seed
    const shouldInitializeToOneRoll = !snap.exists() || (snap.exists() && snap.data().totalAvailableRolls === 5);

    if (shouldInitializeToOneRoll) {
      const currentCoverage = snap.exists() ? (Number(snap.data().coveragePerRoll) || 5000) : 5000;
      await setDoc(SETTINGS_DOC_REF, {
        coveragePerRoll: currentCoverage,
        totalAvailableRolls: 1,
        updatedAt: serverTimestamp(),
        updatedBy: "System",
      });

      // Clean legacy seed docs if any
      try {
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(doc(MOVEMENTS_COL_REF, "BM-SEED-1"));
        await deleteDoc(doc(MOVEMENTS_COL_REF, "BM-SEED-2"));
      } catch (e) {
        // Ignore if not present
      }

      // Starting inventory: 1 Roll
      const startMovRef = doc(MOVEMENTS_COL_REF, "BM-START-1");
      await setDoc(startMovRef, {
        operationId: "BM-1001",
        type: "RECEIPT",
        rolls: 1,
        receivedDate: "2026-10-13",
        operatorName: "Admin",
        timestamp: new Date("2026-10-13T08:30:00").toISOString(),
        createdAt: serverTimestamp(),
        notes: "Starting company inventory",
      });

      return true;
    }
    return false;
  } catch (error) {
    console.warn("Could not check/seed blue material collection:", error);
    return false;
  }
}

/**
 * Records receipt of Blue Material rolls.
 * Updates total available rolls atomically and creates an authoritative audit record.
 */
export async function addBlueMaterialReceipt(params: {
  rolls: number;
  receivedDate: string;
  currentUser: User;
}): Promise<string> {
  const { rolls, receivedDate, currentUser } = params;

  if (!rolls || rolls <= 0 || !Number.isFinite(rolls)) {
    throw new Error("Number of rolls must be a positive number.");
  }

  const opId = `BM-${Date.now().toString().slice(-6)}`;

  await runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(SETTINGS_DOC_REF);
    let currentRolls = 0;
    let coverage = 5000;

    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      currentRolls = Number(data.totalAvailableRolls) || 0;
      coverage = Number(data.coveragePerRoll) || 5000;
    }

    const newTotal = currentRolls + rolls;

    // Update settings document with new total rolls
    transaction.set(
      SETTINGS_DOC_REF,
      {
        totalAvailableRolls: newTotal,
        coveragePerRoll: coverage,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.fullName,
      },
      { merge: true }
    );

    // Create immutable receipt movement document
    const movementRef = doc(MOVEMENTS_COL_REF);
    transaction.set(movementRef, {
      operationId: opId,
      type: "RECEIPT",
      rolls: Math.round(rolls),
      receivedDate: receivedDate || new Date().toISOString().slice(0, 10),
      operatorName: currentUser.fullName,
      userId: currentUser.id,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  });

  return opId;
}

/**
 * Updates Coverage Per Roll configuration.
 * Restricted to supervisor or admin roles.
 */
export async function updateCoveragePerRoll(
  newCoverage: number,
  currentUser: User
): Promise<void> {
  if (currentUser.role !== "admin" && currentUser.role !== "supervisor") {
    throw new Error("Unauthorized. Only management can edit coverage configuration.");
  }

  if (!newCoverage || newCoverage <= 0 || !Number.isFinite(newCoverage)) {
    throw new Error("Coverage must be a valid positive number.");
  }

  await runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(SETTINGS_DOC_REF);
    let currentRolls = 0;

    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      currentRolls = Number(data.totalAvailableRolls) || 0;
    }

    transaction.set(
      SETTINGS_DOC_REF,
      {
        coveragePerRoll: Math.round(newCoverage),
        totalAvailableRolls: currentRolls,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.fullName,
      },
      { merge: true }
    );
  });
}
