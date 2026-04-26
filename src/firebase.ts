import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCt-M8Tn0YKQPu6IMfAkCO8wu_OTNNXmYg",
  authDomain: "fibre-gis.firebaseapp.com",
  projectId: "fibre-gis",
  storageBucket: "fibre-gis.firebasestorage.app",
  messagingSenderId: "156986555833",
  appId: "1:156986555833:web:ea0efbd97bfd26d6570a68",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});