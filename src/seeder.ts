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
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "34340689D",
    code: "34340689D",
    description: "HEATING ELEMENT ASSY B479 STLINE FOR TEP",
    materialType: "Mesh",
    associatedLeather: "34340675B",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "34316011B",
    code: "34316011B",
    description: "HEATING ELEMENT ASSY P33B SW",
    materialType: "Mesh",
    associatedLeather: "R002A631A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "NISSAN"
  },
  {
    id: "R000B629B",
    code: "R000B629B",
    description: "HEATING-HOD PZ1D",
    materialType: "Mesh",
    associatedLeather: "R000E487A, R000G739A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "NISSAN"
  },
  {
    id: "R000B630A",
    code: "R000B630A",
    description: "HOD PZ1D",
    materialType: "Mesh",
    associatedLeather: "R000E487A, R000G739A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "NISSAN"
  },
  {
    id: "A025M750B",
    code: "A025M750B",
    description: "OV64/OV85 HEATING MATERIAL",
    materialType: "Mesh",
    associatedLeather: "A028J493A, R001F923A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "A025M751B",
    code: "A025M751B",
    description: "HEATING-HOD MAT OV64",
    materialType: "Mesh",
    associatedLeather: "R001F928A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "R001W189B",
    code: "R001W189B",
    description: "HEATING MAT HES+HOD L74 SW",
    materialType: "Mesh",
    associatedLeather: "R002J088A, R002G542A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "LANCIA"
  },
  {
    id: "R000J601B",
    code: "R000J601B",
    description: "HEATING-HOD MAT CR3 SW",
    materialType: "Mesh",
    associatedLeather: "R000R523A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "R000J600C",
    code: "R000J600C",
    description: "HEATING MAT CR3 SW",
    materialType: "Mesh",
    associatedLeather: "R000R523A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "A026K122B",
    code: "A026K122B",
    description: "Heating Mat HES K9 MCM SW OVCTF",
    materialType: "Mesh",
    associatedLeather: "A026K160B",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "R002W094A",
    code: "R002W094A",
    description: "HEATING MAT HES, K9 MCM SW OVCTF",
    materialType: "Mesh",
    associatedLeather: "R003A180A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "A026L577A",
    code: "A026L577A",
    description: "Heat Mat BJA ph2 Alpine",
    materialType: "Mesh",
    associatedLeather: "A026F717A, A026F718A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "34364719C",
    code: "34364719C",
    description: "XJF HEATING MAT",
    materialType: "Mesh",
    associatedLeather: "A026L148A, A026L137A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "34340679A",
    code: "34340679A",
    description: "SOFT PARA CUERO SINTETICO C519",
    materialType: "Soft",
    associatedLeather: "34340664A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "34340687B",
    code: "34340687B",
    description: "FOAM PAD SOFT B479 STLINE FOR TEP",
    materialType: "Soft",
    associatedLeather: "34340675B",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
    lastUpdate: new Date().toISOString(),
    customer: "FORD"
  },
  {
    id: "R000J610A",
    code: "R000J610A",
    description: "SOFT-FOAM CR3 SW",
    materialType: "Soft",
    associatedLeather: "R000M817A",
    currentStock: 0,
    stock1: 0,
    stock2: 0,
    stock3: 0,
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

// Helper to chunk large batch deletions (max 400 operations per batch)
async function clearCollection(collectionName: string) {
  const snapshot = await getDocs(collection(db, collectionName));
  if (snapshot.empty) return;
  
  const docs = snapshot.docs;
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + chunkSize);
    chunk.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
}

export async function seedDatabaseIfNeeded() {
  try {
    // 1. Ensure default users exist
    const usersSnapshot = await getDocs(collection(db, "users"));
    if (usersSnapshot.empty) {
      console.log("Seeding default users...");
      const userBatch = writeBatch(db);
      DEFAULT_USERS.forEach((user) => {
        userBatch.set(doc(db, "users", user.id), user);
      });
      await userBatch.commit();
    }

    // 2. Ensure references exist if collection is empty
    const refsSnapshot = await getDocs(collection(db, "references"));
    if (refsSnapshot.empty) {
      console.log("Seeding initial master references with 0 stock...");
      const refBatch = writeBatch(db);
      DEFAULT_REFERENCES.forEach((ref) => {
        refBatch.set(doc(db, "references", ref.id), ref);
      });
      await refBatch.commit();
    } else {
      // If references exist, migrate any missing customer fields or missing default refs
      const existingRefs = new Map(refsSnapshot.docs.map(doc => [doc.id, doc.data() as Reference]));
      const refBatch = writeBatch(db);
      let needsUpdate = false;

      DEFAULT_REFERENCES.forEach((ref) => {
        const existing = existingRefs.get(ref.id);
        if (!existing) {
          console.log(`Seeding missing predefined reference: ${ref.id}`);
          refBatch.set(doc(db, "references", ref.id), ref);
          needsUpdate = true;
        } else if (!existing.customer) {
          refBatch.set(doc(db, "references", ref.id), { ...existing, customer: ref.customer }, { merge: true });
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        await refBatch.commit();
      }
    }
  } catch (error) {
    console.error("Database seeding check failed:", error);
  }
}

export async function resetDatabaseToPristineState() {
  try {
    const timestamp = new Date().toISOString();

    // 1. Delete all transactional / movement records in chunked batches
    await clearCollection("adjustments");
    await clearCollection("transactions");
    await clearCollection("boxes");
    await clearCollection("deliveries");
    await clearCollection("productions");
    await clearCollection("scraps");

    // 2. Reset master references to pristine state with 0 stock
    await clearCollection("references");
    const refDocs = DEFAULT_REFERENCES.map((ref) => ({
      ...ref,
      stock1: 0,
      stock2: 0,
      stock3: 0,
      currentStock: 0,
      lastUpdate: timestamp
    }));

    const chunkSize = 400;
    for (let i = 0; i < refDocs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = refDocs.slice(i, i + chunkSize);
      chunk.forEach((ref) => {
        batch.set(doc(db, "references", ref.id), ref);
      });
      await batch.commit();
    }

    // 3. Reset users to default team
    await clearCollection("users");
    const userBatch = writeBatch(db);
    DEFAULT_USERS.forEach((user) => {
      userBatch.set(doc(db, "users", user.id), user);
    });
    await userBatch.commit();

    console.log("Database successfully reset to pristine state with 0 stock.");
  } catch (error) {
    console.error("Failed to reset database:", error);
    throw error;
  }
}

