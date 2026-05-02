import {
  collection,
  getDocs,
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

function exchangeSubcollectionRef(
  exchangeId: string,
  subcollectionName: "olts" | "hdSplitterPanels" | "feederPanels"
) {
  return collection(
    db,
    "businesses",
    BUSINESS_ID,
    "exchanges",
    exchangeId,
    subcollectionName
  );
}

async function getSubcollectionDeletes<T extends { id: string }>(
  exchangeId: string,
  subcollectionName: "olts" | "hdSplitterPanels" | "feederPanels",
  nextItems: T[]
) {
  const subcollectionRef = exchangeSubcollectionRef(exchangeId, subcollectionName);
  const existingSnap = await getDocs(subcollectionRef);
  const nextIds = new Set(nextItems.map((item) => item.id));

  return existingSnap.docs
    .filter((docSnap) => !nextIds.has(docSnap.id))
    .map((docSnap) => docSnap.ref);
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

  const olts = exchangeWithDates.olts ?? [];
  const hdSplitterPanels = exchangeWithDates.hdSplitterPanels ?? [];
  const feederPanels = exchangeWithDates.feederPanels ?? [];

  const [oltDeletes, splitterDeletes, feederDeletes] = await Promise.all([
    getSubcollectionDeletes(exchange.id, "olts", olts),
    getSubcollectionDeletes(exchange.id, "hdSplitterPanels", hdSplitterPanels),
    getSubcollectionDeletes(exchange.id, "feederPanels", feederPanels),
  ]);

  const totalWrites =
    1 +
    oltDeletes.length +
    splitterDeletes.length +
    feederDeletes.length +
    olts.length +
    hdSplitterPanels.length +
    feederPanels.length;

  // Firestore allows a maximum of 500 operations in a single atomic batch.
  if (totalWrites > 500) {
    throw new Error(
      `Exchange save needs ${totalWrites} Firestore writes, which is over the 500-write batch limit. ` +
        "Split the save into smaller chunks before saving this exchange."
    );
  }

  const batch = writeBatch(db);

  // Root document stays tiny: good for map markers and avoids the 1 MiB document limit.
  batch.set(exchangeDoc(exchange.id), stripUndefined(exchangeSummary(exchangeWithDates)), { merge: true });

  [...oltDeletes, ...splitterDeletes, ...feederDeletes].forEach((docRef) => {
    batch.delete(docRef);
  });

  olts.forEach((olt) => {
    batch.set(doc(exchangeSubcollectionRef(exchange.id, "olts"), olt.id), stripUndefined(olt), { merge: true });
  });

  hdSplitterPanels.forEach((panel) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "hdSplitterPanels"), panel.id),
      stripUndefined(panel),
      { merge: true }
    );
  });

  feederPanels.forEach((panel) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "feederPanels"), panel.id),
      stripUndefined(panel),
      { merge: true }
    );
  });

  await batch.commit();
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
