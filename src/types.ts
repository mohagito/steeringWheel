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
  materialType?: "Mesh" | "Leather";
}

export interface Adjustment {
  id: string;
  barcode: string;
  reference: string;
  expectedQty: number;
  actualQty: number;
  difference: number;
  operatorName: string;
  timestamp: string;
  comment?: string;
  status: "pending" | "approved" | "rejected";
  validatedBy?: string;
  validatedAt?: string;
  materialType?: "Mesh" | "Leather";
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
