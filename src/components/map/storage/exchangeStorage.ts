import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { spatialApiConfig } from "../../../services/spatialApi/spatialApiConfig";
import {
  deleteSpatialRecord,
  getSpatialRecord,
  listSpatialRecords,
  saveSpatialRecord,
  type SpatialRecord,
} from "../../../services/spatialApi/spatialRecordService";

export type ExchangePortStatus = "active" | "spare" | "reserved" | "fault";

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
    status?: ExchangePortStatus;
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
    status?: ExchangePortStatus;
    notes?: string;
    splitterRatio: "1:4";
    outputs: {
      id: string;
      outputNumber: number;
      connectedFeederFibreId?: string;
      status?: ExchangePortStatus;
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
const EXCHANGE_RECORD = "exchange";
const OLT_RECORD = "exchange-olt";
const SPLITTER_RECORD = "exchange-hd-splitter-panel";
const FEEDER_RECORD = "exchange-feeder-panel";

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
  if (spatialApiConfig.postgisOnly) {
    const records = await listSpatialRecords<Omit<ExchangeAsset, "id">>(EXCHANGE_RECORD);
    return records.map((record) => ({
      id: record.recordId,
      ...record.data,
      olts: [],
      feederPanels: [],
      hdSplitterPanels: [],
    }));
  }

  return loadExchangeMarkersFromFirestore();
}

export async function loadExchange(exchangeId: string): Promise<ExchangeAsset | null> {
  if (spatialApiConfig.postgisOnly) {
    const root = await getSpatialRecord<Omit<ExchangeAsset, "id">>(EXCHANGE_RECORD, exchangeId);
    if (!root) return null;

    const [oltRecords, splitterRecords, feederRecords] = await Promise.all([
      listSpatialRecords<Omit<Olt, "id">>(OLT_RECORD, {
        parentType: EXCHANGE_RECORD,
        parentId: exchangeId,
      }),
      listSpatialRecords<Omit<HdSplitterPanel, "id">>(SPLITTER_RECORD, {
        parentType: EXCHANGE_RECORD,
        parentId: exchangeId,
      }),
      listSpatialRecords<Omit<FeederPanel, "id">>(FEEDER_RECORD, {
        parentType: EXCHANGE_RECORD,
        parentId: exchangeId,
      }),
    ]);

    return {
      id: root.recordId,
      ...root.data,
      olts: recordsToItems<Olt>(oltRecords),
      hdSplitterPanels: recordsToItems<HdSplitterPanel>(splitterRecords),
      feederPanels: recordsToItems<FeederPanel>(feederRecords),
    };
  }

  return loadExchangeFromFirestore(exchangeId);
}

async function loadExchangeMarkersFromFirestore(): Promise<ExchangeAsset[]> {
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

async function loadExchangeFromFirestore(exchangeId: string): Promise<ExchangeAsset | null> {
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

  if (spatialApiConfig.postgisOnly) {
    await Promise.all([
      syncExchangeSubrecords(exchange.id, OLT_RECORD, olts),
      syncExchangeSubrecords(exchange.id, SPLITTER_RECORD, hdSplitterPanels),
      syncExchangeSubrecords(exchange.id, FEEDER_RECORD, feederPanels),
      saveSpatialRecord(EXCHANGE_RECORD, exchange.id, stripUndefined(exchangeSummary(exchangeWithDates))),
    ]);
    return;
  }

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
  if (spatialApiConfig.postgisOnly) {
    const [oltRecords, splitterRecords, feederRecords] = await Promise.all([
      listSpatialRecords(OLT_RECORD, { parentType: EXCHANGE_RECORD, parentId: exchangeId }),
      listSpatialRecords(SPLITTER_RECORD, { parentType: EXCHANGE_RECORD, parentId: exchangeId }),
      listSpatialRecords(FEEDER_RECORD, { parentType: EXCHANGE_RECORD, parentId: exchangeId }),
    ]);

    await Promise.all([
      ...oltRecords.map((record) => deleteSpatialRecord(OLT_RECORD, record.recordId)),
      ...splitterRecords.map((record) => deleteSpatialRecord(SPLITTER_RECORD, record.recordId)),
      ...feederRecords.map((record) => deleteSpatialRecord(FEEDER_RECORD, record.recordId)),
      deleteSpatialRecord(EXCHANGE_RECORD, exchangeId),
    ]);
    return;
  }

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

async function syncExchangeSubrecords<T extends { id: string }>(
  exchangeId: string,
  recordType: string,
  nextItems: T[],
) {
  const existingRecords = await listSpatialRecords(recordType, {
    parentType: EXCHANGE_RECORD,
    parentId: exchangeId,
  });
  const nextIds = new Set(nextItems.map((item) => item.id));

  await Promise.all([
    ...existingRecords
      .filter((record) => !nextIds.has(record.recordId))
      .map((record) => deleteSpatialRecord(recordType, record.recordId)),
    ...nextItems.map((item) =>
      saveSpatialRecord(recordType, item.id, stripUndefined(item), {
        parentType: EXCHANGE_RECORD,
        parentId: exchangeId,
      }),
    ),
  ]);
}

function recordsToItems<T extends { id: string }>(records: SpatialRecord<Omit<T, "id">>[]): T[] {
  return records.map((record) => ({
    id: record.recordId,
    ...record.data,
  })) as T[];
}
