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
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "A029G787B",
    code: "A029G787B",
    description: "OV64/OV85 HEATING ELEMENT ASSY",
    materialType: "Mesh",
    associatedLeather: "A028J493A, R001F923A",
    currentStock: 0,
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
    lastUpdate: new Date().toISOString(),
    customer: "Stellantis"
  },
  {
    id: "34358622A",
    code: "34358622A",
    description: "LEATHER COMPONENT FOR P33 SW",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "STELLANTIS"
  },
  {
    id: "A020M319B",
    code: "A020M319B",
    description: "SPLIT LEATHER COMPONENT P64-P74",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A020M334B",
    code: "A020M334B",
    description: "TOP LEATHER COMPONENT P64-P74",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A020M341B",
    code: "A020M341B",
    description: "PERF LEATHER COMPONENT P64-P74",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A022H262A",
    code: "A022H262A",
    description: "TEP COMPONENT V316",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A025N293A",
    code: "A025N293A",
    description: "LEATHER COMPONENT PCF SW OV64_OV85",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "A025P546A",
    code: "A025P546A",
    description: "LEATHER COMPONENT SPLIT K9 MCM PEUGEOT",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "PEUGEOT"
  },
  {
    id: "A026F719A",
    code: "A026F719A",
    description: "LEATHER COMPONENT Mainstream HJB PH2",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026F720A",
    code: "A026F720A",
    description: "LEATHER COMPONENT Mainstream PD HJB PH2",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026F717A",
    code: "A026F717A",
    description: "LEATHER COMPONENT BJA RS LINE",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026F718A",
    code: "A026F718A",
    description: "LEATHER COMPONENT Alpine Heated PADDLE",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026L137A",
    code: "A026L137A",
    description: "LEATHER COMPONENT Mainstream HEATED",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026L148A",
    code: "A026L148A",
    description: "LEATHER COMPONENT MAINSTREAM PAD HJB PH2",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A028J493A",
    code: "A028J493A",
    description: "LEATHER COMPONENT OV64 SW synthetic",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "R001E455A",
    code: "R001E455A",
    description: "LEATHER COMPONENT P13A MC TEP",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "R001E454A",
    code: "R001E454A",
    description: "LEATHER COMPONENT TEP P13A MC",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "R001F923A",
    code: "R001F923A",
    description: "LEATHER COMPONENT PCF C/DIMPLE OV64",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "R001E456B",
    code: "R001E456B",
    description: "HEATING MESH FOR P13A MC TEP",
    materialType: "Mesh",
    associatedLeather: "R001E455A",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026K160B",
    code: "A026K160B",
    description: "LEATHER COMPONENT SPLIT K9 MCM OVCTF",
    materialType: "Soft",
    associatedLeather: "",
    currentStock: 0,
    lastUpdate: new Date().toISOString(),
    customer: "STELLANTIS"
  },
  {
    id: "34358621A",
    code: "34358621A",
    description: "Conjunto cuero precosido P33 SW",
    materialType: "Soft",
    associatedLeather: "34358622A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "STELLANTIS"
  },
  {
    id: "A015E189B",
    code: "A015E189B",
    description: "PLANTILLA PRECOSID SPLIT LEATHER P64-P74",
    materialType: "Soft",
    associatedLeather: "A020M319B",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A020M330C",
    code: "A020M330C",
    description: "PLANTILLA PRECOSIDA TOP LEATHER P64-P74",
    materialType: "Soft",
    associatedLeather: "A020M334B",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A020M340C",
    code: "A020M340C",
    description: "PLANTILLA PRECO TOP LEATH PERF P64-P74",
    materialType: "Soft",
    associatedLeather: "A020M341B",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A022H261A",
    code: "A022H261A",
    description: "V316 MOM TEP PRESEWED",
    materialType: "Soft",
    associatedLeather: "A022H262A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A024J017A",
    code: "A024J017A",
    description: "PLANTILLA PRECOSIDA CALEFACT BJA RS LINE",
    materialType: "Mesh",
    associatedLeather: "A026F717A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A025N291A",
    code: "A025N291A",
    description: "PLANTILLA PRECOSIDA PCF SW OV64_OV85",
    materialType: "Soft",
    associatedLeather: "A025N293A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "A025P545A",
    code: "A025P545A",
    description: "PLANTILLA PRECOSIDA SPLIT K9 MCM PEUGEOT",
    materialType: "Soft",
    associatedLeather: "A025P546A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "PEUGEOT"
  },
  {
    id: "A026F705A",
    code: "A026F705A",
    description: "PLANT PREC Mainstream HJB PH2",
    materialType: "Soft",
    associatedLeather: "A026F719A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026F706A",
    code: "A026F706A",
    description: "PLANT PREC Mainstream PD HJB PH2",
    materialType: "Soft",
    associatedLeather: "A026F720A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026K152B",
    code: "A026K152B",
    description: "PLANTILLA PREC+MALLA SPLIT K9 MCM OVCTF",
    materialType: "Mesh",
    associatedLeather: "A026K160B",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "STELLANTIS"
  },
  {
    id: "A026K608A",
    code: "A026K608A",
    description: "PANEL-UNIT: Alpine Heated PADDLE",
    materialType: "Mesh",
    associatedLeather: "A026F718A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026L136A",
    code: "A026L136A",
    description: "PANEL-UNIT: Mainstream HEATED",
    materialType: "Mesh",
    associatedLeather: "A026L137A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A026L147A",
    code: "A026L147A",
    description: "PLANT PREC+MALLA MAINSTREAM PAD HJB PH2",
    materialType: "Mesh",
    associatedLeather: "A026L148A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "A029H198A",
    code: "A029H198A",
    description: "PLANTILLA PREC+MALLA OV64 SW synthetic",
    materialType: "Mesh",
    associatedLeather: "A028J493A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
  },
  {
    id: "R001E399A",
    code: "R001E399A",
    description: "PLANT PREC+MALLA P13A MC TEP",
    materialType: "Mesh",
    associatedLeather: "R001E455A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "R001E452A",
    code: "R001E452A",
    description: "PLANTILLA PRECOSIDA TEP P13A MC",
    materialType: "Soft",
    associatedLeather: "R001E454A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "RENAULT"
  },
  {
    id: "R001F925A",
    code: "R001F925A",
    description: "PLANT PRECOSIDA+ MALLA PCF C/DIMPLE OV64",
    materialType: "Mesh",
    associatedLeather: "R001F923A",
    currentStock: 300,
    lastUpdate: new Date().toISOString(),
    customer: "OPEL"
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

const DEFAULT_BOXES: Box[] = [
  {
    id: "BOX-101",
    barcode: "BOX-101",
    reference: "34340681C",
    expectedQty: 50,
    location: "Aisle A, Shelf 1, Bay 3",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-102",
    barcode: "BOX-102",
    reference: "34340679A",
    expectedQty: 40,
    location: "Aisle B, Shelf 2, Bay 1",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-103",
    barcode: "BOX-103",
    reference: "R000J610A",
    expectedQty: 35,
    location: "Aisle C, Shelf 4, Bay 2",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-104",
    barcode: "BOX-104",
    reference: "34340687B",
    expectedQty: 20,
    location: "Aisle D, Shelf 1, Bay 4",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-105",
    barcode: "BOX-105",
    reference: "R000B629B",
    expectedQty: 100,
    location: "Aisle E, Shelf 3, Bay 2",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-106",
    barcode: "BOX-106",
    reference: "34340681C",
    expectedQty: 65,
    location: "Aisle A, Shelf 3, Bay 1",
    createdAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-107",
    barcode: "BOX-107",
    reference: "34340679A",
    expectedQty: 48,
    location: "Aisle B, Shelf 4, Bay 3",
    createdAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-108",
    barcode: "BOX-108",
    reference: "R000J610A",
    expectedQty: 30,
    location: "Aisle C, Shelf 1, Bay 1",
    createdAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "BOX-201",
    barcode: "BOX-201",
    reference: "A025M750B",
    expectedQty: 300,
    location: "Aisle M, Shelf 2, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-202",
    barcode: "BOX-202",
    reference: "A025M750B",
    expectedQty: 200,
    location: "Aisle M, Shelf 2, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-203",
    barcode: "BOX-203",
    reference: "A028J493A",
    expectedQty: 450,
    location: "Aisle L, Shelf 1, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-204",
    barcode: "BOX-204",
    reference: "R001F923A",
    expectedQty: 400,
    location: "Aisle L, Shelf 1, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-205",
    barcode: "BOX-205",
    reference: "A026L577A",
    expectedQty: 300,
    location: "Aisle M, Shelf 3, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-206",
    barcode: "BOX-206",
    reference: "A026L577A",
    expectedQty: 300,
    location: "Aisle M, Shelf 3, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-207",
    barcode: "BOX-207",
    reference: "A026F717A",
    expectedQty: 400,
    location: "Aisle L, Shelf 2, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-208",
    barcode: "BOX-208",
    reference: "A026F718A",
    expectedQty: 350,
    location: "Aisle L, Shelf 2, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-209",
    barcode: "BOX-209",
    reference: "A026K122B",
    expectedQty: 300,
    location: "Aisle M, Shelf 4, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-210",
    barcode: "BOX-210",
    reference: "A026K160B",
    expectedQty: 400,
    location: "Aisle L, Shelf 3, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-211",
    barcode: "BOX-211",
    reference: "34364719C",
    expectedQty: 300,
    location: "Aisle M, Shelf 5, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-212",
    barcode: "BOX-212",
    reference: "34364719C",
    expectedQty: 300,
    location: "Aisle M, Shelf 5, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-213",
    barcode: "BOX-213",
    reference: "A026L137A",
    expectedQty: 400,
    location: "Aisle L, Shelf 4, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-214",
    barcode: "BOX-214",
    reference: "A026L148A",
    expectedQty: 450,
    location: "Aisle L, Shelf 4, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-215",
    barcode: "BOX-215",
    reference: "R001E456B",
    expectedQty: 300,
    location: "Aisle M, Shelf 1, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Mesh"
  },
  {
    id: "BOX-216",
    barcode: "BOX-216",
    reference: "R001E455A",
    expectedQty: 400,
    location: "Aisle L, Shelf 5, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-217",
    barcode: "BOX-217",
    reference: "R001E454A",
    expectedQty: 400,
    location: "Aisle L, Shelf 5, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-218",
    barcode: "BOX-218",
    reference: "34358622A",
    expectedQty: 350,
    location: "Aisle L, Shelf 6, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-219",
    barcode: "BOX-219",
    reference: "A020M319B",
    expectedQty: 300,
    location: "Aisle L, Shelf 6, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-220",
    barcode: "BOX-220",
    reference: "A020M334B",
    expectedQty: 300,
    location: "Aisle L, Shelf 7, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-221",
    barcode: "BOX-221",
    reference: "A020M341B",
    expectedQty: 300,
    location: "Aisle L, Shelf 7, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-222",
    barcode: "BOX-222",
    reference: "A022H262A",
    expectedQty: 300,
    location: "Aisle L, Shelf 8, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-223",
    barcode: "BOX-223",
    reference: "A025N293A",
    expectedQty: 300,
    location: "Aisle L, Shelf 8, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-224",
    barcode: "BOX-224",
    reference: "A025P546A",
    expectedQty: 300,
    location: "Aisle L, Shelf 9, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-225",
    barcode: "BOX-225",
    reference: "A026F719A",
    expectedQty: 300,
    location: "Aisle L, Shelf 9, Bay 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  },
  {
    id: "BOX-226",
    barcode: "BOX-226",
    reference: "A026F720A",
    expectedQty: 300,
    location: "Aisle L, Shelf 10, Bay 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    materialType: "Leather"
  }
];

const DEFAULT_ADJUSTMENTS: Adjustment[] = [
  {
    id: "adj-001",
    barcode: "BOX-101",
    reference: "34340681C",
    expectedQty: 50,
    actualQty: 48,
    difference: -2,
    operatorName: "SHIFT A",
    timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    comment: "Scratched parts removed during inspection",
    status: "approved",
    validatedBy: "GONZALO",
    validatedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000 + 3600000).toISOString()
  },
  {
    id: "adj-002",
    barcode: "BOX-102",
    reference: "34340679A",
    expectedQty: 40,
    actualQty: 42,
    difference: 2,
    operatorName: "SHIFT B",
    timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    comment: "Extra items found from previous packing shift",
    status: "approved",
    validatedBy: "GONZALO",
    validatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 2 * 3600000).toISOString()
  },
  {
    id: "adj-003",
    barcode: "BOX-104",
    reference: "34340687B",
    expectedQty: 20,
    actualQty: 18,
    difference: -2,
    operatorName: "SHIFT A",
    timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    comment: "Damaged packaging",
    status: "approved",
    validatedBy: "GONZALO",
    validatedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 4 * 3600000).toISOString()
  },
  {
    id: "adj-004",
    barcode: "BOX-105",
    reference: "R000B629B",
    expectedQty: 100,
    actualQty: 100,
    difference: 0,
    operatorName: "SHIFT B",
    timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    comment: "Standard stock validation count",
    status: "approved",
    validatedBy: "GONZALO",
    validatedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000 + 10 * 60000).toISOString()
  },
  {
    id: "adj-005",
    barcode: "BOX-103",
    reference: "R000J610A",
    expectedQty: 35,
    actualQty: 30,
    difference: -5,
    operatorName: "SHIFT A",
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    comment: "Boxes missing components",
    status: "pending"
  },
  {
    id: "adj-006",
    barcode: "BOX-106",
    reference: "34340681C",
    expectedQty: 65,
    actualQty: 67,
    difference: 2,
    operatorName: "SHIFT B",
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    comment: "Miscounted in previous batch",
    status: "pending"
  }
];

export async function seedDatabaseIfNeeded() {
  try {
    // Check if we have old placeholder references (e.g. starting with "PL-" or "STR-")
    const refsSnapshotToCheck = await getDocs(collection(db, "references"));
    let hasPlaceholderRefs = false;
    refsSnapshotToCheck.forEach((doc) => {
      if (doc.id.startsWith("PL-") || doc.id.startsWith("STR-")) {
        hasPlaceholderRefs = true;
      }
    });

    if (hasPlaceholderRefs) {
      console.log("Old placeholder references detected (e.g. PL-MSH-01-K9). Performing auto-cleanup and resetting database to pristine state...");
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
    const validRefIds = new Set(DEFAULT_REFERENCES.map(ref => ref.id));
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

