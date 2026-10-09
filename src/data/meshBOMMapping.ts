/**
 * MESH BILL OF MATERIALS (BOM) MAPPING TABLE
 * 
 * Maps Steering Wheel (SW) and Precosido (Plantilla + Malla) references
 * to their corresponding mesh (malla / soft) references.
 *
 * Operational Deduction Rules:
 * 1. Steering Wheel (SW) delivery:
 *    - Automatically deducts the associated Mesh from STOCK 3 (Finished Goods).
 * 2. Plantilla + Mallas (Precosido) delivery:
 *    - Automatically deducts the associated Mesh from STOCK 2 (WIP / Sub-assembly).
 */

export interface SteeringWheelMeshMapping {
  steeringWheelRef: string;
  description: string;
  meshRef: string; // mallas / soft
  targetStock: "Stock 3"; // SW shipments consume from Stock 3
}

export interface PrecosidoMeshMapping {
  plantillaRef: string;
  description: string;
  meshRef: string; // mallas
  targetStock: "Stock 2"; // Precosido shipments consume from Stock 2
}

/**
 * Table 1: STEERING WHEEL -> MESHES / SOFT
 * Stock Deduction: Stock 3
 */
export const STEERING_WHEEL_MESH_MAPPINGS: SteeringWheelMeshMapping[] = [
  {
    steeringWheelRef: "R001H669A",
    description: "P2QO MCM HTD",
    meshRef: "A025M750B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R001H666A",
    description: "OV64 TEP PAD HTD",
    meshRef: "A025M750B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R001H670A",
    description: "OV64 TEP DIMPLE HEAT",
    meshRef: "A025M750B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R001H671A",
    description: "OV64 DIMPLE HEAT/HOD",
    meshRef: "A025M751B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000J597C",
    description: "CR3 TEP+SOFT CLIP",
    meshRef: "R000J610A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000J598C",
    description: "CR3 TEP+HEAT CLIP",
    meshRef: "R000J600C",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000J599C",
    description: "CR3 TEP+HEAT+HOD CLIP",
    meshRef: "R000J601B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R002W091A",
    description: "K9 MCM OVCTF TEP",
    meshRef: "R002W094A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R002W177A",
    description: "K9 MCM OVCTF TEP PADDLES",
    meshRef: "R002W094A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R003P523A",
    description: "K9 MCM OVCTF TEP Soft",
    meshRef: "R001L200A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A024J503A",
    description: "Alpine heated",
    meshRef: "A026L577A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A028L062A",
    description: "TEP2 HTD PADDLES",
    meshRef: "34364719C",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R002A667A",
    description: "P33B TEP HTD MY26",
    meshRef: "34316011B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000B637A",
    description: "PZ1D Black EGK9 HOD",
    meshRef: "R000B630A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000B638A",
    description: "PZ1D Black EGK9 HOD + HES",
    meshRef: "R000B629B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000B639A",
    description: "PZ1D Deep Purple EB85 HOD",
    meshRef: "R000B630A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R000B640A",
    description: "PZ1D Deep Purple EB85 HOD+ HES",
    meshRef: "R000B629B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "34349392A",
    description: "B479/C519 TEP METAL GRAY",
    meshRef: "34340679A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "34355954C",
    description: "C519 TEP HEATED EBONY BLACK",
    meshRef: "34340681C",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "34361491B",
    description: "Ford Generic Red",
    meshRef: "34340687B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "34361493C",
    description: "B479/C519/CX482 STL TEPGR HEAT",
    meshRef: "34340689D",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R002G558A",
    description: "L74 SW TEP + HES/HOD MAT",
    meshRef: "R001W189B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R002G559A",
    description: "L74 SW TEP +HES/HOD MAT INTEG",
    meshRef: "R001W189B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R002A665A",
    description: "STEERING WHEEL P33B SYNTHETIC WRAPPED",
    meshRef: "34316011B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R003A514A",
    description: "VOL FORRADO K9 MCM PEUGEOT HEATED PADD",
    meshRef: "A026K122B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "R003A432A",
    description: "VOLANTE FORRADO L74 TEP INTEGRALE",
    meshRef: "R001W189B",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A023V842C",
    description: "VOL FORR P64-74 GT HTD+HOD (TOP BITONE)",
    meshRef: "A026L577A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A024A609C",
    description: "SW WRAPPTOP FERF P64 PD STITCH BITON GT",
    meshRef: "A026L577A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A023V830B",
    description: "VOLANTE FORRADO P64-74 ACTIVE SPLIT",
    meshRef: "A026L577A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A023V834B",
    description: "VOL FORRADO P64-74 ALLURE (TOP MONOTONE)",
    meshRef: "A026L577A",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "34371819B",
    description: "VOLANTE FORRADO V316 CALEF TEP MOMENTUM",
    meshRef: "34340681C",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A026K881A",
    description: "SW BJA-ph2 Wrapped TEP1",
    meshRef: "34364719C",
    targetStock: "Stock 3"
  },
  {
    steeringWheelRef: "A028L046A",
    description: "VOLANTE FORRADO CMFB TEP 1 PADDELS",
    meshRef: "A026L577A",
    targetStock: "Stock 3"
  }
];

/**
 * Table 2: PLANTILLA + MALLAS (PRECOSIDO) -> MALLAS
 * Stock Deduction: Stock 2
 */
export const PRECOSIDO_MESH_MAPPINGS: PrecosidoMeshMapping[] = [
  {
    plantillaRef: "A024J017A",
    description: "PLANTILLA PRECOSIDA CALEFACT BJA RS LINE",
    meshRef: "A026L577A",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A026K152B",
    description: "PLANTILLA PREC+MALLA SPLIT K9 MCM OVCTF",
    meshRef: "A026K122B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A026K608A",
    description: "PANEL-UNIT: Alpine_Heated_PADDLE",
    meshRef: "A026L577A",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A026L136A",
    description: "PANEL-UNIT: Mainstream_HEATED",
    meshRef: "34364719C",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A026L147A",
    description: "PLANT PREC+MALLA MAINSTREAM PAD HJB PH2",
    meshRef: "34364719C",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A029H198A",
    description: "PLANTILLA PREC+MALLA OV64 SW synthetic",
    meshRef: "A025M750B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "R001E399A",
    description: "PLANT PREC+MALLA P13A MC TEP",
    meshRef: "R001E456B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "R001F925A",
    description: "PLANT PRECOSIDA+ MALLA PCF C/DIMPLE OV64",
    meshRef: "A025M750B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A025P546A",
    description: "CJTO PLANT S/PREC SPLIT K9 MCM PEUGEOT",
    meshRef: "A026K122B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A026K160B",
    description: "SET PLANT S/PREC HEATED K9 MCM OVCTF",
    meshRef: "A026K122B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A025P562A",
    description: "CJTO PLANTILLAS S/PREC TOP K9 MCMPEUGEOT",
    meshRef: "A026K122B",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A020M334B",
    description: "CONJ. PLANTILLAS S/PRECOSER TOP P64-P74",
    meshRef: "A026L577A",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "A020M341B",
    description: "CONJ PLANTILLAS S/PREC TOP PERF P64-P74",
    meshRef: "A026L577A",
    targetStock: "Stock 2"
  },
  {
    plantillaRef: "34340664A",
    description: "SET MATERIAL SINTETICO C519",
    meshRef: "34340679A",
    targetStock: "Stock 2"
  }
];

// Normalized lookup maps for instant O(1) resolution
const normalizedSWMap = new Map<string, SteeringWheelMeshMapping>();
for (const item of STEERING_WHEEL_MESH_MAPPINGS) {
  normalizedSWMap.set(item.steeringWheelRef.trim().toUpperCase(), item);
}

const normalizedPrecosidoMap = new Map<string, PrecosidoMeshMapping>();
for (const item of PRECOSIDO_MESH_MAPPINGS) {
  normalizedPrecosidoMap.set(item.plantillaRef.trim().toUpperCase(), item);
}

/**
 * Resolve mesh and target stock by reference and optional delivery context.
 */
export function resolveMeshDeduction(reference: string, deliveryType?: "STEERING WHEELS" | "PRECOSIDO" | string): {
  meshRef: string;
  targetStock: "Stock 3" | "Stock 2";
  description: string;
  sourceType: "STEERING_WHEEL" | "PRECOSIDO";
} | null {
  const cleanRef = reference.trim().toUpperCase();

  // If explicitly specified as Precosido, check precosido map first
  if (deliveryType === "PRECOSIDO") {
    const precMatch = normalizedPrecosidoMap.get(cleanRef);
    if (precMatch) {
      return {
        meshRef: precMatch.meshRef,
        targetStock: "Stock 2",
        description: precMatch.description,
        sourceType: "PRECOSIDO"
      };
    }
  }

  // If explicitly specified as Steering Wheel, check SW map first
  if (deliveryType === "STEERING WHEELS") {
    const swMatch = normalizedSWMap.get(cleanRef);
    if (swMatch) {
      return {
        meshRef: swMatch.meshRef,
        targetStock: "Stock 3",
        description: swMatch.description,
        sourceType: "STEERING_WHEEL"
      };
    }
  }

  // Automatic detection: check SW first, then Precosido
  const swMatch = normalizedSWMap.get(cleanRef);
  if (swMatch) {
    return {
      meshRef: swMatch.meshRef,
      targetStock: "Stock 3",
      description: swMatch.description,
      sourceType: "STEERING_WHEEL"
    };
  }

  const precMatch = normalizedPrecosidoMap.get(cleanRef);
  if (precMatch) {
    return {
      meshRef: precMatch.meshRef,
      targetStock: "Stock 2",
      description: precMatch.description,
      sourceType: "PRECOSIDO"
    };
  }

  return null;
}
