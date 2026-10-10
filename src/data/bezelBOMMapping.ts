/**
 * BEZEL BILL OF MATERIALS (BOM) MAPPING TABLE
 * 
 * Maps Steering Wheel (SW) references to their corresponding Bezel references.
 * 
 * Operational Deduction Rule:
 * When a Steering Wheel (SW) delivery PDF invoice is uploaded,
 * the associated Bezel is automatically identified and deducted from STOCK 2 (Ready / Assembled).
 */

export interface SteeringWheelBezelMapping {
  steeringWheelRef: string;
  bezelRef: string;
  description: string;
  targetStock: "Stock 2"; // Bezels are consumed and shipped from Stock 2
}

/**
 * Official Steering Wheel -> Bezel Decomposition Table
 */
export const STEERING_WHEEL_BEZEL_MAPPINGS: SteeringWheelBezelMapping[] = [
  // 1. BEZEL A025B907B (Assy OV64 SW 6H Spoke - OPEL / STELLANTIS)
  {
    steeringWheelRef: "R001H666A",
    bezelRef: "A025B907B",
    description: "VOL FORR OV64 TEP PADD CAL+6H LOWER BEZ",
    targetStock: "Stock 2"
  },
  {
    steeringWheelRef: "R001H668A",
    bezelRef: "A025B907B",
    description: "VOL FORRADO P2QO MCM TEP + 6H BEZEL",
    targetStock: "Stock 2"
  },
  {
    steeringWheelRef: "R001H669A",
    bezelRef: "A025B907B",
    description: "VOL FORRADO P2QO MCM TEP MALLA+ 6H BEZEL",
    targetStock: "Stock 2"
  },
  {
    steeringWheelRef: "R001H671A",
    bezelRef: "A025B907B",
    description: "VOL FORR OV64TEP DIMP HEAT/HOD+BEZEL 6H",
    targetStock: "Stock 2"
  },
  {
    steeringWheelRef: "R001H670A",
    bezelRef: "A025B907B",
    description: "VOL FORRADO OV64 TEP DIMPLE HEAT+6H BEZ",
    targetStock: "Stock 2"
  },

  // 2. BEZEL A024H181B (BEZEL R8 STW - PSA / PEUGEOT K9 MCM)
  {
    steeringWheelRef: "R003Y829A",
    bezelRef: "A024H181B",
    description: "SW K9 MCM PEUGEOT WRAPPED GT+EMBLEM 6H",
    targetStock: "Stock 2"
  },
  {
    steeringWheelRef: "R001H213A",
    bezelRef: "A024H181B",
    description: "VOL FORRADO+ LOGO GT K9 MCM Peugeot",
    targetStock: "Stock 2"
  },

  // 3. BEZEL A015E335A (Rim Badge GT P64-P74 - PSA / RENAULT P64-74)
  {
    steeringWheelRef: "A023V842C",
    bezelRef: "A015E335A",
    description: "VOL FORR P64-74 GT HTD+HOD (TOP BITONE)",
    targetStock: "Stock 2"
  },
  {
    steeringWheelRef: "A024A609C",
    bezelRef: "A015E335A",
    description: "VOLANTE FORRADO P64-74 GT (TOP BITONE)",
    targetStock: "Stock 2"
  }
];

// Normalized lookup map for instant O(1) resolution
const normalizedSWBezelMap = new Map<string, SteeringWheelBezelMapping>();
for (const item of STEERING_WHEEL_BEZEL_MAPPINGS) {
  normalizedSWBezelMap.set(item.steeringWheelRef.trim().toUpperCase(), item);
}

/**
 * Resolves which Bezel reference must be deducted from Stock 2
 * for a given Steering Wheel reference.
 */
export function resolveBezelDeduction(reference: string): {
  bezelRef: string;
  targetStock: "Stock 2";
  description: string;
} | null {
  if (!reference) return null;
  const cleanRef = reference.trim().toUpperCase();

  const match = normalizedSWBezelMap.get(cleanRef);
  if (match) {
    return {
      bezelRef: match.bezelRef,
      targetStock: "Stock 2",
      description: match.description
    };
  }

  return null;
}

/**
 * Checks whether an SW reference has an associated bezel.
 */
export function hasAssociatedBezel(reference: string): boolean {
  if (!reference) return false;
  return normalizedSWBezelMap.has(reference.trim().toUpperCase());
}
