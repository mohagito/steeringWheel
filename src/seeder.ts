import { collection, getDocs, setDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { User, Box, Adjustment, Reference } from "./types";

export const DEFAULT_REFERENCES: Omit<Reference, "">[] = [
  {
    id: "PL-MSH-01-K9",
    code: "PL-MSH-01-K9",
    description: "PLANTILLAS S/PREC MESH TOP K9",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-01-K9",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-02-K9",
    code: "PL-MSH-02-K9",
    description: "PLANTILLAS MESH COR TOP K9",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-02-K9",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-03-K9",
    code: "PL-MSH-03-K9",
    description: "PLANTILLAS S/PREC MESH COUPE K9",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-03-K9",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-01-K9",
    code: "PL-SFT-01-K9",
    description: "PLANTILLAS S/PREC SOFT BASE K9",
    materialType: "Soft",
    associatedLeather: "PL-LTH-04-K9",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-02-K9",
    code: "PL-SFT-02-K9",
    description: "PLANTILLAS SOFT COMFORT K9",
    materialType: "Soft",
    associatedLeather: "PL-LTH-05-K9",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-04-M8",
    code: "PL-MSH-04-M8",
    description: "PLANTILLAS S/PREC MESH TOP M8",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-01-M8",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-05-M8",
    code: "PL-MSH-05-M8",
    description: "PLANTILLAS MESH COR TOP M8",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-02-M8",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-06-M8",
    code: "PL-MSH-06-M8",
    description: "PLANTILLAS S/PREC MESH COUPE M8",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-03-M8",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-03-M8",
    code: "PL-SFT-03-M8",
    description: "PLANTILLAS S/PREC SOFT BASE M8",
    materialType: "Soft",
    associatedLeather: "PL-LTH-04-M8",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-04-M8",
    code: "PL-SFT-04-M8",
    description: "PLANTILLAS SOFT COMFORT M8",
    materialType: "Soft",
    associatedLeather: "PL-LTH-05-M8",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-07-G5",
    code: "PL-MSH-07-G5",
    description: "PLANTILLAS S/PREC MESH TOP G5",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-01-G5",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-08-G5",
    code: "PL-MSH-08-G5",
    description: "PLANTILLAS MESH COR TOP G5",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-02-G5",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-09-G5",
    code: "PL-MSH-09-G5",
    description: "PLANTILLAS S/PREC MESH COUPE G5",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-03-G5",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-05-G5",
    code: "PL-SFT-05-G5",
    description: "PLANTILLAS S/PREC SOFT BASE G5",
    materialType: "Soft",
    associatedLeather: "PL-LTH-04-G5",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-06-G5",
    code: "PL-SFT-06-G5",
    description: "PLANTILLAS SOFT COMFORT G5",
    materialType: "Soft",
    associatedLeather: "PL-LTH-05-G5",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-MSH-10-X2",
    code: "PL-MSH-10-X2",
    description: "PLANTILLAS S/PREC MESH HIGH X2",
    materialType: "Mesh",
    associatedLeather: "PL-LTH-01-X2",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  },
  {
    id: "PL-SFT-07-X2",
    code: "PL-SFT-07-X2",
    description: "PLANTILLAS SOFT ERGO HIGH X2",
    materialType: "Soft",
    associatedLeather: "PL-LTH-02-X2",
    currentStock: 0,
    lastUpdate: new Date().toISOString()
  }
];

// Seed data
const DEFAULT_USERS: User[] = [
  {
    id: "user_mohamed",
    username: "mohamed",
    fullName: "Mohamed",
    role: "operator",
    pin: "1111"
  },
  {
    id: "user_gonzalo",
    username: "gonzalo",
    fullName: "Gonzalo",
    role: "admin",
    pin: "2222"
  }
];

const DEFAULT_BOXES: Box[] = [
  {
    id: "BOX-101",
    barcode: "BOX-101",
    reference: "STR-WH-L4-BLK",
    expectedQty: 50,
    location: "Aisle A, Shelf 1, Bay 3",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-102",
    barcode: "BOX-102",
    reference: "STR-WH-S3-RED",
    expectedQty: 40,
    location: "Aisle B, Shelf 2, Bay 1",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-103",
    barcode: "BOX-103",
    reference: "STR-WH-A3-GRY",
    expectedQty: 35,
    location: "Aisle C, Shelf 4, Bay 2",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-104",
    barcode: "BOX-104",
    reference: "STR-WH-W4-BRW",
    expectedQty: 20,
    location: "Aisle D, Shelf 1, Bay 4",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-105",
    barcode: "BOX-105",
    reference: "STR-WH-E3-SLV",
    expectedQty: 100,
    location: "Aisle E, Shelf 3, Bay 2",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-106",
    barcode: "BOX-106",
    reference: "STR-WH-L4-BLK",
    expectedQty: 65,
    location: "Aisle A, Shelf 3, Bay 1",
    createdAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-107",
    barcode: "BOX-107",
    reference: "STR-WH-S3-RED",
    expectedQty: 48,
    location: "Aisle B, Shelf 4, Bay 3",
    createdAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-108",
    barcode: "BOX-108",
    reference: "STR-WH-A3-GRY",
    expectedQty: 30,
    location: "Aisle C, Shelf 1, Bay 1",
    createdAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
  }
];

const DEFAULT_ADJUSTMENTS: Adjustment[] = [
  {
    id: "adj-001",
    barcode: "BOX-101",
    reference: "STR-WH-L4-BLK",
    expectedQty: 50,
    actualQty: 48,
    difference: -2,
    operatorName: "Mohamed",
    timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    comment: "Scratched parts removed during inspection",
    status: "approved",
    validatedBy: "Gonzalo",
    validatedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000 + 3600000).toISOString()
  },
  {
    id: "adj-002",
    barcode: "BOX-102",
    reference: "STR-WH-S3-RED",
    expectedQty: 40,
    actualQty: 42,
    difference: 2,
    operatorName: "Mohamed",
    timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    comment: "Extra items found from previous packing shift",
    status: "approved",
    validatedBy: "Gonzalo",
    validatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 2 * 3600000).toISOString()
  },
  {
    id: "adj-003",
    barcode: "BOX-104",
    reference: "STR-WH-W4-BRW",
    expectedQty: 20,
    actualQty: 18,
    difference: -2,
    operatorName: "Mohamed",
    timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    comment: "Damaged packaging",
    status: "approved",
    validatedBy: "Gonzalo",
    validatedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 4 * 3600000).toISOString()
  },
  {
    id: "adj-004",
    barcode: "BOX-105",
    reference: "STR-WH-E3-SLV",
    expectedQty: 100,
    actualQty: 100,
    difference: 0,
    operatorName: "Mohamed",
    timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    comment: "Standard stock validation count",
    status: "approved",
    validatedBy: "Gonzalo",
    validatedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000 + 10 * 60000).toISOString()
  },
  {
    id: "adj-005",
    barcode: "BOX-103",
    reference: "STR-WH-A3-GRY",
    expectedQty: 35,
    actualQty: 30,
    difference: -5,
    operatorName: "Mohamed",
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    comment: "Boxes missing components",
    status: "pending"
  },
  {
    id: "adj-006",
    barcode: "BOX-106",
    reference: "STR-WH-L4-BLK",
    expectedQty: 65,
    actualQty: 67,
    difference: 2,
    operatorName: "Mohamed",
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    comment: "Miscounted in previous batch",
    status: "pending"
  }
];

export async function seedDatabaseIfNeeded() {
  try {
    // Check users
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    // Check if we have old profiles (e.g. user_juan) or if it's empty
    let hasOldUsers = false;
    usersSnapshot.forEach((doc) => {
      if (doc.id === "user_juan") {
        hasOldUsers = true;
      }
    });

    if (usersSnapshot.empty || hasOldUsers) {
      console.log("Seeding or resetting users for Mohamed and Gonzalo...");
      const batch = writeBatch(db);
      
      // If we had old users, clear them
      if (hasOldUsers) {
        usersSnapshot.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
      }
      
      DEFAULT_USERS.forEach((user) => {
        batch.set(doc(db, "users", user.id), user);
      });
      await batch.commit();
    }

    // Seed actual cartons from the user's photos if completely empty
    const boxesSnapshot = await getDocs(collection(db, "boxes"));
    if (boxesSnapshot.empty) {
      console.log("Seeding initial cartons from photos...");
      const batch = writeBatch(db);
      
      const ACTUAL_PHOTOS_CARTONS: Box[] = [
        {
          id: "A025P562A",
          barcode: "A025P562A",
          reference: "PL-MSH-01-K9",
          expectedQty: 100,
          location: "GI-AREA (Dest 95A 910)",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          materialType: "Mesh"
        },
        {
          id: "A020M334B",
          barcode: "A020M334B",
          reference: "PL-MSH-02-K9",
          expectedQty: 100,
          location: "GI-AREA (Dest 95A 910)",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          materialType: "Mesh"
        },
        {
          id: "A026K122D",
          barcode: "A026K122D",
          reference: "PL-MSH-01-K9",
          expectedQty: 100,
          location: "GI-AREA (Dest 95A 910)",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          materialType: "Mesh"
        }
      ];

      ACTUAL_PHOTOS_CARTONS.forEach((box) => {
        batch.set(doc(db, "boxes", box.id), box);
      });
      await batch.commit();
      console.log("Database seeded with photo cartons successfully.");
    } else {
      console.log("Database seed check completed. Carton inventory already exists.");
    }

    // Seed 17 predefined references if completely empty
    const refsSnapshot = await getDocs(collection(db, "references"));
    if (refsSnapshot.empty) {
      console.log("Seeding initial 17 predefined references with 0 stock...");
      const batch = writeBatch(db);
      DEFAULT_REFERENCES.forEach((ref) => {
        batch.set(doc(db, "references", ref.id), ref);
      });
      await batch.commit();
      console.log("Database seeded with 17 predefined references successfully.");
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

    // 5. Seed pristine photo cartons
    const seedBatch = writeBatch(db);
    const ACTUAL_PHOTOS_CARTONS: Box[] = [
      {
        id: "A025P562A",
        barcode: "A025P562A",
        reference: "PL-MSH-01-K9",
        expectedQty: 100,
        location: "GI-AREA (Dest 95A 910)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        materialType: "Mesh"
      },
      {
        id: "A020M334B",
        barcode: "A020M334B",
        reference: "PL-MSH-02-K9",
        expectedQty: 100,
        location: "GI-AREA (Dest 95A 910)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        materialType: "Mesh"
      },
      {
        id: "A026K122D",
        barcode: "A026K122D",
        reference: "PL-MSH-01-K9",
        expectedQty: 100,
        location: "GI-AREA (Dest 95A 910)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        materialType: "Mesh"
      }
    ];

    ACTUAL_PHOTOS_CARTONS.forEach((box) => {
      seedBatch.set(doc(db, "boxes", box.id), box);
    });

    // 6. Seed pristine 17 predefined references with 0 stock
    DEFAULT_REFERENCES.forEach((ref) => {
      seedBatch.set(doc(db, "references", ref.id), ref);
    });

    await seedBatch.commit();
    console.log("Database reset to pristine state successfully.");
  } catch (error) {
    console.error("Failed to reset database:", error);
    throw error;
  }
}

