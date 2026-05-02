import {
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
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

export async function loadExchanges(): Promise<ExchangeAsset[]> {
  const snap = await getDocs(exchangesCollection);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ExchangeAsset, "id">),
  }));
}

export async function saveExchange(exchange: ExchangeAsset) {
  await setDoc(
    doc(db, "businesses", BUSINESS_ID, "exchanges", exchange.id),
    {
      ...exchange,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function deleteExchange(exchangeId: string) {
  await deleteDoc(doc(db, "businesses", BUSINESS_ID, "exchanges", exchangeId));
}
