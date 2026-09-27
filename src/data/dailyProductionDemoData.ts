export interface DailyProductionRow {
  id: string;
  refMaille: string;
  libelle: string;
  qtyConsommes: number;
  matchedReference?: {
    code: string;
    description: string;
    customer?: string;
    stock2: number;
    stock3: number;
  } | null;
  isValid: boolean;
  validationError?: string;
}

export const INITIAL_DEMO_CSV = `Ref Maille,Libellé,Qty consommés
34316011B,HEATING ELEMENT ASSY P33B SW,55
A026K122B,HEAT MAT HES K9 MCM SW OVCTF,276
A025M750B,OV64/OV85 HEATING MATERIAL,129
R000J601B,HEATING -HOD MAT CR3,35
R000J610A,SOFT-FOAM CR3 SW,12
A025M751B,OV64/OV85 HEATING -HOD,23
34340679A,SOFT PARA CUERO SINTETICO C519,141
R001W189B,HEATING MAT HES+HOD L74,7`;

export const INITIAL_DEMO_ROWS: DailyProductionRow[] = [
  {
    id: "demo-1",
    refMaille: "34316011B",
    libelle: "HEATING ELEMENT ASSY P33B SW",
    qtyConsommes: 55,
    isValid: true
  },
  {
    id: "demo-2",
    refMaille: "A026K122B",
    libelle: "HEAT MAT HES K9 MCM SW OVCTF",
    qtyConsommes: 276,
    isValid: true
  },
  {
    id: "demo-3",
    refMaille: "A025M750B",
    libelle: "OV64/OV85 HEATING MATERIAL",
    qtyConsommes: 129,
    isValid: true
  },
  {
    id: "demo-4",
    refMaille: "R000J601B",
    libelle: "HEATING -HOD MAT CR3",
    qtyConsommes: 35,
    isValid: true
  },
  {
    id: "demo-5",
    refMaille: "R000J610A",
    libelle: "SOFT-FOAM CR3 SW",
    qtyConsommes: 12,
    isValid: true
  },
  {
    id: "demo-6",
    refMaille: "A025M751B",
    libelle: "OV64/OV85 HEATING -HOD",
    qtyConsommes: 23,
    isValid: true
  },
  {
    id: "demo-7",
    refMaille: "34340679A",
    libelle: "SOFT PARA CUERO SINTETICO C519",
    qtyConsommes: 141,
    isValid: true
  },
  {
    id: "demo-8",
    refMaille: "R001W189B",
    libelle: "HEATING MAT HES+HOD L74",
    qtyConsommes: 7,
    isValid: true
  }
];
