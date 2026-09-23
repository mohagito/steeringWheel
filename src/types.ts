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
  createdAt: string | any;
  updatedAt: string | any;
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
  timestamp: string | any;
  comment?: string;
  status: "pending" | "approved" | "rejected" | "edited" | "deleted";
  validatedBy?: string;
  validatedAt?: string | any;
  materialType?: "Mesh" | "Soft" | "Leather";
  stockBefore?: number;
  stockAdded?: number;
  stockAfter?: number;
  invoiceNumber?: string;
  palletQuality?: string;
  changeHistory?: Array<{ action: string; oldQty: number; newQty: number; modifiedBy: string; timestamp: number | string | any; reason: string }>;
}

export interface Delivery {
  id: string;
  invoiceNumber: string;
  reference: string;
  quantity: number;
  operatorName: string;
  timestamp: string | any;
  customer: string;
  deliveryType?: "PRECOSIDO" | "STEERING WHEELS" | "Villanova" | "Mini Project" | "Normal Delivery";
  notes?: string;
  status?: "completed" | "edited" | "deleted";
  changeHistory?: Array<{ action: string; oldQty: number; newQty: number; modifiedBy: string; timestamp: number | string | any; reason: string }>;
}

export interface Production {
  id: string;
  date: string; // "YYYY-MM-DD" e.g., "2026-07-09"
  reference: string;
  quantity: number;
  operatorName: string;
  timestamp: string | any;
  notes?: string;
  status?: "completed" | "edited" | "deleted";
  changeHistory?: Array<{ action: string; oldQty: number; newQty: number; modifiedBy: string; timestamp: number | string | any; reason: string }>;
}

export interface Reference {
  id: string; // Matches reference code
  code: string;
  description: string;
  materialType: "Mesh" | "Soft" | string;
  associatedLeather?: string;
  customer?: string;
  active?: boolean; // Default true if undefined
  createdAt?: string | any;
  createdBy?: string;
  updatedAt?: string | any;
  updatedBy?: string;
  currentStock: number; // Total combined across stocks
  stock1: number; // STOCK 1 - Warehouse Stock (Raw Materials)
  stock2: number; // STOCK 2 - Production Stock (WIP)
  stock3: number; // STOCK 3 - Finished Goods Stock
  lastUpdate: string | any;
}

export interface ScrapEntry {
  id: string;
  operationId?: string;
  operationType?: string; // "SCRAP / NOK"
  date: string; // YYYY-MM-DD
  reference: string;
  quantity: number;
  condition?: string; // Optional (legacy traceability e.g. "CON COLA" / "SIN COLA")
  cola?: "CON_COLA" | "SIN_COLA";
  colaStatus?: "CON_COLA" | "SIN_COLA";
  invoiceNumber?: string; // Scrap delivery invoice for traceability
  notes?: string;
  supervisorName: string;
  operator?: string;
  operatorName?: string;
  timestamp: string | any;
  serverTimestamp?: any;
  sourceStock?: "Stock 1" | "Stock 2" | "Stock 3";
  stockDeductedFrom: "Stock 1" | "Stock 2" | "Stock 3";
  stockBefore: number;
  stockAfter: number;
  status?: "completed" | "edited" | "deleted";
  changeHistory?: Array<{ action: string; oldQty: number; newQty: number; modifiedBy: string; timestamp: number | string | any; reason: string }>;
}

export interface InventoryTransaction {
  id: string;
  barcode?: string;
  reference: string;
  movementType: "STOCK 1 IN" | "STOCK 1 OUT" | "TRANSFER S1->S2" | "STOCK 2 IN" | "STOCK 2 OUT" | "STOCK 2 OUT / STOCK 3 IN" | "STOCK 3 IN" | "STOCK 3 OUT" | "TRANSFER" | "DELIVERY" | "SCRAP (CON COLA)" | "SCRAP (SIN COLA)" | "RETURN S2->S1" | "INCOMPLETA" | string;
  stock: "Stock 1" | "Stock 2" | "Stock 3" | "Stock 1 -> Stock 2" | "Stock 2 -> Stock 3" | "Stock 2 -> Stock 1" | string;
  quantity: number;
  operatorName: string;
  timestamp: string | any;
  notes?: string;
  invoiceNumber?: string;
  cola?: "CON_COLA" | "SIN_COLA";
  colaStatus?: "CON_COLA" | "SIN_COLA";
  expectedQty?: number;
  actualQty?: number;
  difference?: number;
  palletQuality?: string;
  deliveryType?: "PRECOSIDO" | "STEERING WHEELS" | "Villanova" | "Mini Project" | "Normal Delivery";
  stock1Before?: number;
  stock1After?: number;
  stock2Before?: number;
  stock2After?: number;
  stock3Before?: number;
  stock3After?: number;
  destinationStock?: "Stock 1" | "Stock 2" | "Stock 3";
  status?: "active" | "edited" | "REVERSED" | string;
  originalQuantity?: number;
  reversedAt?: string | any;
  reversedBy?: string;
  reversalReason?: string;
  lastModifiedAt?: string | any;
  lastModifiedBy?: string;
  changeHistory?: Array<{ action: string; oldQty: number; newQty: number; delta?: number; modifiedBy: string; timestamp: number | string | any; reason: string }>;
}

export interface ScannedInvoiceBox {
  id: string;
  boxBarcode: string;
  reference: string;
  expectedQty: number;
  quantity: number; // Real/Physical quantity
  scannedAt: string | any;
  materialType?: string;
  difference?: number;
  palletQuality?: string;
  destinationStock?: "Stock 1" | "Stock 2" | "Stock 3";
}

export interface ScannedTransferItem {
  id: string;
  reference: string;
  quantity: number;
  scannedAt: string;
  materialType?: string;
  description?: string;
}

export interface ReceivingInvoice {
  id: string; // Unique session/invoice ID
  invoiceNumber: string;
  operator: string;
  operatorId?: string;
  createdAt: string;
  status: "pending" | "approved" | "cancelled";
  items: ScannedInvoiceBox[];
  totalBoxes: number;
  totalQuantity: number;
  approvedAt?: string;
  approvedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  notes?: string;
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

export type ProtectionEventType =
  | "NEGATIVE_STOCK_BLOCKED"
  | "INVALID_QUANTITY_BLOCKED"
  | "UNKNOWN_REFERENCE_BLOCKED"
  | "DUPLICATE_OPERATION_BLOCKED"
  | "INVALID_OPERATION_TYPE_BLOCKED"
  | "UNAUTHORIZED_WRITE_BLOCKED"
  | "CONCURRENCY_CONFLICT";

export interface ProtectionLog {
  id: string;
  eventType: ProtectionEventType;
  reference?: string;
  attemptedOperation: string;
  reason: string;
  timestamp: string;
  operator?: string;
  source?: string;
  payloadSummary?: string;
}

// ==========================================
// BEZEL MODULE TYPES & DATA CONTRACTS
// ==========================================

export interface BezelReference {
  id: string; // Typically matches code, e.g. "A015E335A"
  code: string;
  description: string;
  client?: string; // Client, e.g. "PSA", "OPEL"
  stock1: number; // Incoming / available Bezel material
  stock2: number; // Assemblage / ready for delivery
  totalStock?: number; // stock1 + stock2
  active: boolean;
  createdAt: string | any;
  updatedAt: string | any;
  createdBy?: string;
  lastOperation?: string;
}

export type BezelOperationType =
  | "NEW_TRUCK"
  | "BEZEL_ASSEMBLAGE"
  | "BEZEL_DELIVERY"
  | "BEZEL_RETURN"
  | "BEZEL_SCRAP";

export interface BezelOperation {
  id: string; // Unique stable operation ID
  operationType: BezelOperationType;
  reference: string;
  quantity: number;
  sourceStock?: "STOCK 1" | "STOCK 2";
  destinationStock?: "STOCK 1" | "STOCK 2" | "OUT" | "SCRAP";
  invoiceNumber?: string;
  reason?: string;
  operatorName: string;
  operatorId?: string;
  timestamp: string | any;
  stock1Before?: number;
  stock1After?: number;
  stock2Before?: number;
  stock2After?: number;
  status: "completed" | "reversed";
  reversalReason?: string;
  reversedAt?: string | any;
  reversedBy?: string;
  notes?: string;
}

export interface BezelTruckItem {
  id: string;
  reference: string;
  quantity: number;
  destinationStock: "STOCK 1" | "STOCK 2";
}

