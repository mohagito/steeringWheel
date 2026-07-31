export type UserRole = "operator" | "supervisor" | "admin";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  pin: string;
}

export interface Box {
  id: string; // Matches barcode
  barcode: string;
  reference: string;
  expectedQty: number; // Barcode label quantity
  actualQty?: number;  // Real manually counted quantity
  location: string;
  createdAt: string;
  updatedAt: string;
  materialType?: "Mesh" | "Leather" | "Soft";
  invoiceNumber?: string;
  palletQuality?: string;
}

export interface Adjustment {
  id: string;
  barcode: string;
  reference: string;
  expectedQty: number;
  actualQty: number; // Real Counted Quantity
  difference: number;
  operatorName: string;
  timestamp: string;
  comment?: string;
  status: "pending" | "approved" | "rejected";
  validatedBy?: string;
  validatedAt?: string;
  materialType?: "Mesh" | "Soft" | "Leather";
  stockBefore?: number;
  stockAdded?: number;
  stockAfter?: number;
  invoiceNumber?: string;
  palletQuality?: string;
}

export interface Delivery {
  id: string;
  invoiceNumber: string;
  reference: string;
  quantity: number;
  operatorName: string;
  timestamp: string;
  customer: string;
  deliveryType?: "PRECOSIDO" | "Villanova" | "Mini Project" | "Normal Delivery";
  notes?: string;
}

export interface Production {
  id: string;
  date: string; // "YYYY-MM-DD" e.g., "2026-07-09"
  reference: string;
  quantity: number;
  operatorName: string;
  timestamp: string;
  notes?: string;
}

export interface Reference {
  id: string; // Matches reference code
  code: string;
  description: string;
  materialType: "Mesh" | "Soft" | string;
  associatedLeather?: string;
  customer?: string;
  active?: boolean; // Default true if undefined
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  currentStock: number; // Total combined across stocks
  stock1: number; // STOCK 1 - Warehouse Stock (Raw Materials)
  stock2: number; // STOCK 2 - Production Stock (WIP)
  stock3: number; // STOCK 3 - Finished Goods Stock
  lastUpdate: string;
}

export interface ScrapEntry {
  id: string;
  date: string; // YYYY-MM-DD
  reference: string;
  quantity: number;
  condition: "CON COLA" | "SIN COLA"; // CON COLA -> Stock 3, SIN COLA -> Stock 2
  invoiceNumber?: string; // Scrap delivery invoice for traceability
  notes?: string;
  supervisorName: string;
  timestamp: string;
  stockDeductedFrom: "Stock 2" | "Stock 3";
  stockBefore: number;
  stockAfter: number;
}

export interface InventoryTransaction {
  id: string;
  barcode?: string;
  reference: string;
  movementType: "STOCK 1 IN" | "STOCK 1 OUT" | "TRANSFER S1->S2" | "STOCK 2 IN" | "STOCK 2 OUT" | "STOCK 2 OUT / STOCK 3 IN" | "STOCK 3 IN" | "STOCK 3 OUT" | "TRANSFER" | "DELIVERY" | "SCRAP (CON COLA)" | "SCRAP (SIN COLA)";
  stock: "Stock 1" | "Stock 2" | "Stock 3" | "Stock 1 -> Stock 2" | "Stock 2 -> Stock 3";
  quantity: number;
  operatorName: string;
  timestamp: string;
  notes?: string;
  deliveryType?: "PRECOSIDO" | "Villanova" | "Mini Project" | "Normal Delivery";
  stock1Before?: number;
  stock1After?: number;
  stock2Before?: number;
  stock2After?: number;
  stock3Before?: number;
  stock3After?: number;
}

export interface ReferenceSummary {
  reference: string;
  totalChecks: number;
  totalDifference: number;
  expectedQtySum: number;
  actualQtySum: number;
  accuracyRate: number; // Percentage
  boxCount: number;
}

export interface ProductAssembly {
  meshRef: string; // MAILLE CHAUFF
  gaineRef: string; // GAINE
  finalRef: string; // RÉFÉRENCE
  designation: string; // DÉSIGNATION
}
