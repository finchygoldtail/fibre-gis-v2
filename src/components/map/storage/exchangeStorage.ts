import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { normaliseBusinessId } from "../../../utils/clientAccessControl";

export type ExchangePortStatus = "active" | "spare" | "reserved" | "fault";

export type RackSide = "front" | "back";

export type RackMountPosition = {
  rackId?: string;
  side?: RackSide;
  uStart: number;
  heightU: number;
};

export type ExchangeCabinet = {
  id: string;
  name: string;
  uCount: number;
  notes?: string;
};

export type PonPort = {
  id: string;
  portNumber: number;
  label?: string;
  connectedCableId?: string;
  status?: ExchangePortStatus;
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
  manufacturer?: string;
  model?: string;
  panels: OltPanel[];
  rackPosition?: RackMountPosition;
};

export type FeederPanel = {
  id: string;
  name: string;
  fibreCount: 144 | 288;
  manufacturer?: string;
  feederCableId?: string;
  rackPosition?: RackMountPosition;
  fibres: {
    id: string;
    fibreNumber: number;
    connectedSplitterOutputId?: string;
    connectedCableId?: string;
    status?: ExchangePortStatus;
    notes?: string;
  }[];
};

export type HdSplitterPanel = {
  id: string;
  name: string;
  manufacturer?: string;
  splitterRatio?: "1:2" | "1:4";
  rackPosition?: RackMountPosition;
  inputs: {
    id: string;
    inputNumber: number;
    connectedPonPortId?: string;
    status?: ExchangePortStatus;
    notes?: string;
    splitterRatio: "1:2" | "1:4";
    outputs: {
      id: string;
      outputNumber: number;
      connectedFeederFibreId?: string;
      status?: ExchangePortStatus;
      notes?: string;
    }[];
  }[];
};

export type WdmPanel = {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  portsPerSide: 72;
  rackPosition?: RackMountPosition;
  oltPorts: {
    id: string;
    portNumber: number;
    connectedOltPortId?: string;
    status?: ExchangePortStatus;
    notes?: string;
  }[];
  odfPorts: {
    id: string;
    portNumber: number;
    connectedSplitterInputId?: string;
    status?: ExchangePortStatus;
    notes?: string;
  }[];
};

export type EbclPanel = {
  id: string;
  name: string;
  manufacturer?: string;
  rackPosition?: RackMountPosition;
  notes?: string;
};

export type TestHead = {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  rackPosition?: RackMountPosition;
  notes?: string;
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
  wdmPanels?: WdmPanel[];
  ebclPanels?: EbclPanel[];
  testHeads?: TestHead[];
  cabinets?: ExchangeCabinet[];
  createdAt?: number;
  updatedAt?: number;
};

const BUSINESS_ID = "fibre-gis-v2";

function getBusinessId(businessId?: string): string {
  return normaliseBusinessId(businessId || BUSINESS_ID);
}

function exchangesCollection(businessId?: string) {
  return collection(db, "businesses", getBusinessId(businessId), "exchanges");
}

function exchangeDoc(exchangeId: string, businessId?: string) {
  return doc(db, "businesses", getBusinessId(businessId), "exchanges", exchangeId);
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function exchangeSummary(exchange: ExchangeAsset): Omit<ExchangeAsset, "olts" | "feederPanels" | "hdSplitterPanels" | "wdmPanels" | "ebclPanels" | "testHeads"> {
  const { olts, feederPanels, hdSplitterPanels, wdmPanels, ebclPanels, testHeads, ...summary } = exchange;
  return summary;
}

function exchangeSubcollectionRef(
  exchangeId: string,
  subcollectionName: "olts" | "hdSplitterPanels" | "feederPanels" | "wdmPanels" | "ebclPanels" | "testHeads",
  businessId?: string,
) {
  return collection(
    db,
    "businesses",
    getBusinessId(businessId),
    "exchanges",
    exchangeId,
    subcollectionName
  );
}

async function getSubcollectionDeletes<T extends { id: string }>(
  exchangeId: string,
  subcollectionName: "olts" | "hdSplitterPanels" | "feederPanels" | "wdmPanels" | "ebclPanels" | "testHeads",
  nextItems: T[],
  businessId?: string,
) {
  const subcollectionRef = exchangeSubcollectionRef(exchangeId, subcollectionName, businessId);
  const existingSnap = await getDocs(subcollectionRef);
  const nextIds = new Set(nextItems.map((item) => item.id));

  return existingSnap.docs
    .filter((docSnap) => !nextIds.has(docSnap.id))
    .map((docSnap) => docSnap.ref);
}

export async function loadExchanges(businessId?: string): Promise<ExchangeAsset[]> {
  const snap = await getDocs(exchangesCollection(businessId));

  // Map markers only need the root exchange document.
  // Heavy OLT / splitter / feeder data is lazy-loaded when the exchange is opened.
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ExchangeAsset, "id">),
    olts: [],
    feederPanels: [],
    hdSplitterPanels: [],
    wdmPanels: [],
    ebclPanels: [],
    testHeads: [],
  }));
}

export async function loadExchange(exchangeId: string, businessId?: string): Promise<ExchangeAsset | null> {
  const cleanBusinessId = getBusinessId(businessId);
  const rootSnap = await getDoc(exchangeDoc(exchangeId, cleanBusinessId));
  if (!rootSnap.exists()) return null;

  const [oltsSnap, splitterPanelsSnap, feederPanelsSnap, wdmPanelsSnap, ebclPanelsSnap, testHeadsSnap] = await Promise.all([
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "olts")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "hdSplitterPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "feederPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "wdmPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "ebclPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "testHeads")),
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
    wdmPanels: wdmPanelsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<WdmPanel, "id">),
    })),
    ebclPanels: ebclPanelsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<EbclPanel, "id">),
    })),
    testHeads: testHeadsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<TestHead, "id">),
    })),
  };
}

export async function saveExchange(exchange: ExchangeAsset, businessId?: string) {
  const cleanBusinessId = getBusinessId(businessId);
  const now = Date.now();
  const exchangeWithDates: ExchangeAsset = {
    ...exchange,
    createdAt: exchange.createdAt ?? now,
    updatedAt: now,
  };

  const olts = exchangeWithDates.olts ?? [];
  const hdSplitterPanels = exchangeWithDates.hdSplitterPanels ?? [];
  const feederPanels = exchangeWithDates.feederPanels ?? [];
  const wdmPanels = exchangeWithDates.wdmPanels ?? [];
  const ebclPanels = exchangeWithDates.ebclPanels ?? [];
  const testHeads = exchangeWithDates.testHeads ?? [];

  const [oltDeletes, splitterDeletes, feederDeletes, wdmDeletes, ebclDeletes, testHeadDeletes] = await Promise.all([
    getSubcollectionDeletes(exchange.id, "olts", olts, cleanBusinessId),
    getSubcollectionDeletes(exchange.id, "hdSplitterPanels", hdSplitterPanels, cleanBusinessId),
    getSubcollectionDeletes(exchange.id, "feederPanels", feederPanels, cleanBusinessId),
    getSubcollectionDeletes(exchange.id, "wdmPanels", wdmPanels, cleanBusinessId),
    getSubcollectionDeletes(exchange.id, "ebclPanels", ebclPanels, cleanBusinessId),
    getSubcollectionDeletes(exchange.id, "testHeads", testHeads, cleanBusinessId),
  ]);

  const totalWrites =
    1 +
    oltDeletes.length +
    splitterDeletes.length +
    feederDeletes.length +
    wdmDeletes.length +
    ebclDeletes.length +
    testHeadDeletes.length +
    olts.length +
    hdSplitterPanels.length +
    feederPanels.length +
    wdmPanels.length +
    ebclPanels.length +
    testHeads.length;

  // Firestore allows a maximum of 500 operations in a single atomic batch.
  if (totalWrites > 500) {
    throw new Error(
      `Exchange save needs ${totalWrites} Firestore writes, which is over the 500-write batch limit. ` +
        "Split the save into smaller chunks before saving this exchange."
    );
  }

  const batch = writeBatch(db);

  // Root document stays tiny: good for map markers and avoids the 1 MiB document limit.
  batch.set(exchangeDoc(exchange.id, cleanBusinessId), stripUndefined(exchangeSummary(exchangeWithDates)), { merge: true });

  [...oltDeletes, ...splitterDeletes, ...feederDeletes, ...wdmDeletes, ...ebclDeletes, ...testHeadDeletes].forEach((docRef) => {
    batch.delete(docRef);
  });

  olts.forEach((olt) => {
    batch.set(doc(exchangeSubcollectionRef(exchange.id, "olts", cleanBusinessId), olt.id), stripUndefined(olt), { merge: true });
  });

  hdSplitterPanels.forEach((panel) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "hdSplitterPanels", cleanBusinessId), panel.id),
      stripUndefined(panel),
      { merge: true }
    );
  });

  feederPanels.forEach((panel) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "feederPanels", cleanBusinessId), panel.id),
      stripUndefined(panel),
      { merge: true }
    );
  });

  wdmPanels.forEach((panel) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "wdmPanels", cleanBusinessId), panel.id),
      stripUndefined(panel),
      { merge: true }
    );
  });

  ebclPanels.forEach((panel) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "ebclPanels", cleanBusinessId), panel.id),
      stripUndefined(panel),
      { merge: true }
    );
  });

  testHeads.forEach((testHead) => {
    batch.set(
      doc(exchangeSubcollectionRef(exchange.id, "testHeads", cleanBusinessId), testHead.id),
      stripUndefined(testHead),
      { merge: true }
    );
  });

  await batch.commit();
}

export async function deleteExchange(exchangeId: string, businessId?: string) {
  const cleanBusinessId = getBusinessId(businessId);
  const [oltsSnap, splitterPanelsSnap, feederPanelsSnap, wdmPanelsSnap, ebclPanelsSnap, testHeadsSnap] = await Promise.all([
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "olts")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "hdSplitterPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "feederPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "wdmPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "ebclPanels")),
    getDocs(collection(db, "businesses", cleanBusinessId, "exchanges", exchangeId, "testHeads")),
  ]);

  const batch = writeBatch(db);
  [...oltsSnap.docs, ...splitterPanelsSnap.docs, ...feederPanelsSnap.docs, ...wdmPanelsSnap.docs, ...ebclPanelsSnap.docs, ...testHeadsSnap.docs].forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  batch.delete(exchangeDoc(exchangeId, cleanBusinessId));

  await batch.commit();
}
