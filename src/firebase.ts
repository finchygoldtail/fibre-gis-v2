import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBjihPWC3aV5ae0DOSkk_34xHvmjeAtikA",
  authDomain: "fibre-gis-v2.firebaseapp.com",
  projectId: "fibre-gis-v2",
  storageBucket: "fibre-gis-v2.firebasestorage.app",
  messagingSenderId: "886932988702",
  appId: "1:886932988702:web:c9bbe13e9e75629cdf5f0f"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});