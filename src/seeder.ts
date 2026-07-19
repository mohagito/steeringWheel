import { collection, getDocs, setDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { User, Box, Adjustment, Reference } from "./types";

export const DEFAULT_REFERENCES: Reference[] = [
  {
    id: "34340681C",
    code: "34340681C",
    description: "MALLA CALEFACTADA CUERO SINTETICO C519",
    materialType: "Mesh",
    associatedLeather: "34340664A",
    currentStock: 320,
    stock1: 240,
    stock2: 80,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "34340689D",
    code: "34340689D",
    description: "HEATING ELEMENT ASSY B479 STLINE FOR TEP",
    materialType: "Mesh",
    associatedLeather: "34340675B",
    currentStock: 410,
    stock1: 350,
    stock2: 60,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "34316011B",
    code: "34316011B",
    description: "HEATING ELEMENT ASSY P33B SW",
    materialType: "Mesh",
    associatedLeather: "R002A631A",
    currentStock: 180,
    stock1: 150,
    stock2: 30,
    lastUpdate: new Date().toISOString(),
    customer: "NISSAN"
  },
  {
    id: "R000B629B",
    code: "R000B629B",
    description: "HEATING-HOD PZ1D",
    materialType: "Mesh",
    associatedLeather: "R000E487A, R000G739A",
    currentStock: 290,
    stock1: 200,
    stock2: 90,
    lastUpdate: new Date().toISOString(),
    customer: "NISSAN"
  },
  {
    id: "R000B630A",
    code: "R000B630A",
    description: "HOD PZ1D",
    materialType: "Mesh",
    associatedLeather: "R000E487A, R000G739A",
    currentStock: 150,
    stock1: 100,
    stock2: 50,
    lastUpdate: new Date().toISOString(),
    customer: "NISSAN"
  },
  {
    id: "A025M750B",
    code: "A025M750B",
    description: "OV64/OV85 HEATING MATERIAL",
    materialType: "Mesh",
    associatedLeather: "A028J493A, R001F923A",
    currentStock: 530,
    stock1: 450,
    stock2: 80,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "A025M751B",
    code: "A025M751B",
    description: "HEATING-HOD MAT OV64",
    materialType: "Mesh",
    associatedLeather: "R001F928A",
    currentStock: 220,
    stock1: 180,
    stock2: 40,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "R001W189B",
    code: "R001W189B",
    description: "HEATING MAT HES+HOD L74 SW",
    materialType: "Mesh",
    associatedLeather: "R002J088A, R002G542A",
    currentStock: 110,
    stock1: 80,
    stock2: 30,
    lastUpdate: new Date().toISOString(),
    customer: "LANCIA"
  },
  {
    id: "R000J601B",
    code: "R000J601B",
    description: "HEATING-HOD MAT CR3 SW",
    materialType: "Mesh",
    associatedLeather: "R000R523A",
    currentStock: 480,
    stock1: 400,
    stock2: 80,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "R000J600C",
    code: "R000J600C",
    description: "HEATING MAT CR3 SW",
    materialType: "Mesh",
    associatedLeather: "R000R523A",
    currentStock: 350,
    stock1: 300,
    stock2: 50,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "A026K122B",
    code: "A026K122B",
    description: "Heating Mat HES K9 MCM SW OVCTF",
    materialType: "Mesh",
    associatedLeather: "A026K160B",
    currentStock: 190,
    stock1: 150,
    stock2: 40,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "R002W094A",
    code: "R002W094A",
    description: "HEATING MAT HES, K9 MCM SW OVCTF",
    materialType: "Mesh",
    associatedLeather: "R003A180A",
    currentStock: 260,
    stock1: 200,
    stock2: 60,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "A026L577A",
    code: "A026L577A",
    description: "Heat Mat BJA ph2 Alpine",
    materialType: "Mesh",
    associatedLeather: "A026F717A, A026F718A",
    currentStock: 140,
    stock1: 100,
    stock2: 40,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "34364719C",
    code: "34364719C",
    description: "XJF HEATING MAT",
    materialType: "Mesh",
    associatedLeather: "A026L148A, A026L137A",
    currentStock: 280,
    stock1: 220,
    stock2: 60,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "34340679A",
    code: "34340679A",
    description: "SOFT PARA CUERO SINTETICO C519",
    materialType: "Soft",
    associatedLeather: "34340664A",
    currentStock: 160,
    stock1: 120,
    stock2: 40,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "34340687B",
    code: "34340687B",
    description: "FOAM PAD SOFT B479 STLINE FOR TEP",
    materialType: "Soft",
    associatedLeather: "34340675B",
    currentStock: 190,
    stock1: 150,
    stock2: 40,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "R000J610A",
    code: "R000J610A",
    description: "SOFT-FOAM CR3 SW",
    materialType: "Soft",
    associatedLeather: "R000M817A",
    currentStock: 130,
    stock1: 100,
    stock2: 30,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  }
];

// Seed data
const DEFAULT_USERS: User[] = [
  {
    id: "user_shifta",
    username: "shifta",
    fullName: "SHIFT A",
    role: "operator",
    pin: "1111"
  },
  {
    id: "user_shiftb",
    username: "shiftb",
    fullName: "SHIFT B",
    role: "operator",
    pin: "2222"
  },
  {
    id: "user_gonzalo",
    username: "gonzalo",
    fullName: "GONZALO",
    role: "admin",
    pin: "9472"
  },
  {
    id: "user_soukaina",
    username: "soukaina",
    fullName: "SOUKAINA",
    role: "supervisor",
    pin: "8315"
  }
];

const DEFAULT_BOXES: Box[] = [];

const DEFAULT_ADJUSTMENTS: Adjustment[] = [];

export async function seedDatabaseIfNeeded() {
  try {
    // Check if we have old/demo references or a mismatched reference count
    const refsSnapshotToCheck = await getDocs(collection(db, "references"));
    let needsPristineReset = false;
    const validRefIds = new Set(DEFAULT_REFERENCES.map(ref => ref.id));
    
    if (refsSnapshotToCheck.size !== DEFAULT_REFERENCES.length) {
      needsPristineReset = true;
    } else {
      refsSnapshotToCheck.forEach((docSnap) => {
        if (!validRefIds.has(docSnap.id)) {
          needsPristineReset = true;
        }
      });
    }

    if (needsPristineReset) {
      console.log("Database contains demo references or mismatched reference count. Performing auto-cleanup and resetting database to pristine state...");
      await resetDatabaseToPristineState();
      return;
    }

    // Ensure default users exist and have the correct PINs
    const userBatch = writeBatch(db);
    userBatch.delete(doc(db, "users", "user_mohamed"));
    DEFAULT_USERS.forEach((user) => {
      userBatch.set(doc(db, "users", user.id), user);
    });
    await userBatch.commit();

    // Ensure boxes are seeded if empty
    const boxesSnapshot = await getDocs(collection(db, "boxes"));
    if (boxesSnapshot.empty) {
      console.log("Seeding initial default boxes...");
      const boxBatch = writeBatch(db);
      DEFAULT_BOXES.forEach((box) => {
        boxBatch.set(doc(db, "boxes", box.id), box);
      });
      await boxBatch.commit();
    }

    // Ensure all references are present in the collection and have customer fields set
    const refsSnapshot = await getDocs(collection(db, "references"));
    const existingRefs = new Map(refsSnapshot.docs.map(doc => [doc.id, doc.data() as Reference]));
    const refBatch = writeBatch(db);
    let needsRefUpdate = false;

    // Delete any references from Firestore that are not in DEFAULT_REFERENCES
    refsSnapshot.docs.forEach((docSnap) => {
      if (!validRefIds.has(docSnap.id)) {
        console.log(`Deleting extra reference: ${docSnap.id}`);
        refBatch.delete(docSnap.ref);
        needsRefUpdate = true;
      }
    });

    DEFAULT_REFERENCES.forEach((ref) => {
      const existing = existingRefs.get(ref.id);
      if (!existing) {
        console.log(`Seeding missing predefined reference: ${ref.id}`);
        refBatch.set(doc(db, "references", ref.id), ref);
        needsRefUpdate = true;
      } else if (!existing.customer) {
        console.log(`Migrating customer field for predefined reference: ${ref.id} -> ${ref.customer}`);
        refBatch.set(doc(db, "references", ref.id), { ...existing, customer: ref.customer }, { merge: true });
        needsRefUpdate = true;
      }
    });
    
    if (needsRefUpdate) {
      await refBatch.commit();
      console.log("Database references seeded or migrated with customer fields successfully.");
    }
  } catch (error) {
    console.error("Database seeding failed:", error);
  }
}

export async function resetDatabaseToPristineState() {
  try {
    // 1. Delete all current adjustments in batches
    const adjSnapshot = await getDocs(collection(db, "adjustments"));
    if (!adjSnapshot.empty) {
      const adjBatch = writeBatch(db);
      adjSnapshot.forEach((docSnap) => {
        adjBatch.delete(docSnap.ref);
      });
      await adjBatch.commit();
    }

    // 1.5 Delete all current transactions in batches
    const transSnapshot = await getDocs(collection(db, "transactions"));
    if (!transSnapshot.empty) {
      const transBatch = writeBatch(db);
      transSnapshot.forEach((docSnap) => {
        transBatch.delete(docSnap.ref);
      });
      await transBatch.commit();
    }

    // 2. Delete all current boxes in batches
    const boxesSnapshot = await getDocs(collection(db, "boxes"));
    if (!boxesSnapshot.empty) {
      const boxesBatch = writeBatch(db);
      boxesSnapshot.forEach((docSnap) => {
        boxesBatch.delete(docSnap.ref);
      });
      await boxesBatch.commit();
    }

    // 3. Delete all references
    const refsSnapshot = await getDocs(collection(db, "references"));
    if (!refsSnapshot.empty) {
      const refsBatch = writeBatch(db);
      refsSnapshot.forEach((docSnap) => {
        refsBatch.delete(docSnap.ref);
      });
      await refsBatch.commit();
    }

    // 3.5 Delete all deliveries
    const deliveriesSnapshot = await getDocs(collection(db, "deliveries"));
    if (!deliveriesSnapshot.empty) {
      const delBatch = writeBatch(db);
      deliveriesSnapshot.forEach((docSnap) => {
        delBatch.delete(docSnap.ref);
      });
      await delBatch.commit();
    }

    // Delete all productions
    const productionsSnapshot = await getDocs(collection(db, "productions"));
    if (!productionsSnapshot.empty) {
      const prodBatch = writeBatch(db);
      productionsSnapshot.forEach((docSnap) => {
        prodBatch.delete(docSnap.ref);
      });
      await prodBatch.commit();
    }

    // 4. Reset users to DEFAULT_USERS in batches
    const usersSnapshot = await getDocs(collection(db, "users"));
    const usersBatch = writeBatch(db);
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((docSnap) => {
        usersBatch.delete(docSnap.ref);
      });
    }
    DEFAULT_USERS.forEach((user) => {
      usersBatch.set(doc(db, "users", user.id), user);
    });
    await usersBatch.commit();

    // 5. Seed pristine predefined references with 0 stock
    const seedBatch = writeBatch(db);
    DEFAULT_REFERENCES.forEach((ref) => {
      seedBatch.set(doc(db, "references", ref.id), ref);
    });

    // Seed pristine predefined boxes
    DEFAULT_BOXES.forEach((box) => {
      seedBatch.set(doc(db, "boxes", box.id), box);
    });

    await seedBatch.commit();
    console.log("Database reset to pristine state successfully.");
  } catch (error) {
    console.error("Failed to reset database:", error);
    throw error;
  }
}

