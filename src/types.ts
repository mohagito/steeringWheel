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
  expectedQty: number;
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
  materialType: "Mesh" | "Soft";
  associatedLeather: string;
  currentStock: number;
  stock1: number; // STOCK 1 - Warehouse Stock
  stock2: number; // STOCK 2 - Production Stock
  lastUpdate: string;
  customer?: string;
}

export interface InventoryTransaction {
  id: string;
  barcode?: string;
  reference: string;
  movementType: "STOCK 1 IN" | "STOCK 1 OUT" | "STOCK 2 IN" | "STOCK 2 OUT" | "TRANSFER";
  stock: "Stock 1" | "Stock 2" | "Stock 1 -> Stock 2";
  quantity: number;
  operatorName: string;
  timestamp: string;
  notes?: string;
  deliveryType?: "Mini Project" | "Normal Delivery";
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
