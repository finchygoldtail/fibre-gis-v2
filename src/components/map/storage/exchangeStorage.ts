import {
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../firebase";

export type PonPort = {
  id: string;
  portNumber: number;
  label?: string;
  connectedCableId?: string;
  notes?: string;
};

export type OltPanel = {
  id: string;
  panelNumber: number;
  ports: PonPort[];
};

export type Olt = {
  id: string;
  name: string;
  panels: OltPanel[];
};

export type FeederPanel = {
  id: string;
  name: string;
  fibreCount: 144 | 288;
  feederCableId?: string;
  fibres: {
    id: string;
    fibreNumber: number;
    connectedSplitterOutputId?: string;
    connectedCableId?: string;
    notes?: string;
  }[];
};

export type HdSplitterPanel = {
  id: string;
  name: string;
  inputs: {
    id: string;
    inputNumber: number;
    connectedPonPortId?: string;
    notes?: string;
    splitterRatio: "1:4";
    outputs: {
      id: string;
      outputNumber: number;
      connectedFeederFibreId?: string;
      notes?: string;
    }[];
  }[];
};

export type ExchangeAsset = {
  id: string;
  name: string;
  code?: string;
  lat: number;
  lng: number;
  projectId?: string;
  notes?: string;
  olts?: Olt[];
  feederPanels?: FeederPanel[];
  hdSplitterPanels?: HdSplitterPanel[];
  createdAt?: number;
  updatedAt?: number;
};

const BUSINESS_ID = "fibre-gis-v2";

const exchangesCollection = collection(
  db,
  "businesses",
  BUSINESS_ID,
  "exchanges"
);

function exchangeDoc(exchangeId: string) {
  return doc(db, "businesses", BUSINESS_ID, "exchanges", exchangeId);
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function exchangeSummary(exchange: ExchangeAsset): Omit<ExchangeAsset, "olts" | "feederPanels" | "hdSplitterPanels"> {
  const { olts, feederPanels, hdSplitterPanels, ...summary } = exchange;
  return summary;
}

async function replaceSubcollection<T extends { id: string }>(
  exchangeId: string,
  subcollectionName: "olts" | "hdSplitterPanels" | "feederPanels",
  items: T[]
) {
  const subcollectionRef = collection(
    db,
    "businesses",
    BUSINESS_ID,
    "exchanges",
    exchangeId,
    subcollectionName
  );

  const existingSnap = await getDocs(subcollectionRef);
  const nextIds = new Set(items.map((item) => item.id));
  const batch = writeBatch(db);

  existingSnap.docs.forEach((docSnap) => {
    if (!nextIds.has(docSnap.id)) {
      batch.delete(docSnap.ref);
    }
  });

  items.forEach((item) => {
    batch.set(doc(subcollectionRef, item.id), stripUndefined(item), { merge: true });
  });

  await batch.commit();
}

export async function loadExchanges(): Promise<ExchangeAsset[]> {
  const snap = await getDocs(exchangesCollection);

  // Map markers only need the root exchange document.
  // Heavy OLT / splitter / feeder data is lazy-loaded when the exchange is opened.
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ExchangeAsset, "id">),
    olts: [],
    feederPanels: [],
    hdSplitterPanels: [],
  }));
}

export async function loadExchange(exchangeId: string): Promise<ExchangeAsset | null> {
  const rootSnap = await getDoc(exchangeDoc(exchangeId));
  if (!rootSnap.exists()) return null;

  const [oltsSnap, splitterPanelsSnap, feederPanelsSnap] = await Promise.all([
    getDocs(collection(db, "businesses", BUSINESS_ID, "exchanges", exchangeId, "olts")),
    getDocs(collection(db, "businesses", BUSINESS_ID, "exchanges", exchangeId, "hdSplitterPanels")),
    getDocs(collection(db, "businesses", BUSINESS_ID, "exchanges", exchangeId, "feederPanels")),
  ]);

  return {
    id: rootSnap.id,
    ...(rootSnap.data() as Omit<ExchangeAsset, "id">),
    olts: oltsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<Olt, "id">) })),
    hdSplitterPanels: splitterPanelsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<HdSplitterPanel, "id">),
    })),
    feederPanels: feederPanelsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<FeederPanel, "id">),
    })),
  };
}

export async function saveExchange(exchange: ExchangeAsset) {
  const now = Date.now();
  const exchangeWithDates: ExchangeAsset = {
    ...exchange,
    createdAt: exchange.createdAt ?? now,
    updatedAt: now,
  };

  // Root document stays tiny: good for map markers and avoids the 1 MiB document limit.
  await setDoc(exchangeDoc(exchange.id), stripUndefined(exchangeSummary(exchangeWithDates)), { merge: true });

  // Heavy data is split into panel-level documents.
  await Promise.all([
    replaceSubcollection(exchange.id, "olts", exchangeWithDates.olts ?? []),
    replaceSubcollection(exchange.id, "hdSplitterPanels", exchangeWithDates.hdSplitterPanels ?? []),
    replaceSubcollection(exchange.id, "feederPanels", exchangeWithDates.feederPanels ?? []),
  ]);
}

export async function deleteExchange(exchangeId: string) {
  const [oltsSnap, splitterPanelsSnap, feederPanelsSnap] = await Promise.all([
    getDocs(collection(db, "businesses", BUSINESS_ID, "exchanges", exchangeId, "olts")),
    getDocs(collection(db, "businesses", BUSINESS_ID, "exchanges", exchangeId, "hdSplitterPanels")),
    getDocs(collection(db, "businesses", BUSINESS_ID, "exchanges", exchangeId, "feederPanels")),
  ]);

  const batch = writeBatch(db);
  [...oltsSnap.docs, ...splitterPanelsSnap.docs, ...feederPanelsSnap.docs].forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  batch.delete(exchangeDoc(exchangeId));

  await batch.commit();
}
