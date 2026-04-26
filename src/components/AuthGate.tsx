import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const ALLOWED_EMAILS = [
  "alistairlgrantham@gmail.com",
  "benedict.almond@netomnia.com",
  "adam.whittaker@netomnia.com",
  "james.oliver@netomnia.com",
  "alistair.grantham@brsk.co.uk",
];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const allowed =
    user?.email &&
    ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(
      user.email.toLowerCase()
    );

  const handleEmailLogin = async () => {
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateAccount = async () => {
    setError("");

    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (checking) {
    return (
      <div style={screen}>
        <div style={card}>
          <h1>Fibre GIS</h1>
          <p>Checking login...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={screen}>
        <div style={card}>
          <h1>Fibre GIS</h1>
          <p>Please sign in to continue.</p>

          <input
            style={input}
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button style={button} onClick={handleEmailLogin}>
            Sign in with Email
          </button>

          <button style={secondaryButton} onClick={handleCreateAccount}>
            Create Account
          </button>

          <div style={divider}>or</div>

          <button style={button} onClick={handleGoogleLogin}>
            Sign in with Google
          </button>

          {error && <p style={errorText}>{error}</p>}
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={screen}>
        <div style={card}>
          <h1>Access denied</h1>
          <p>{user.email} is not authorised to use this system.</p>

          <button style={button} onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={topBar}>
        <span>Signed in as {user.email}</span>
        <button style={smallButton} onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>

      {children}
    </>
  );
}

const screen: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#111827",
  color: "white",
};

const card: React.CSSProperties = {
  background: "#1f2937",
  padding: "2rem",
  borderRadius: 12,
  width: 380,
  maxWidth: "90vw",
  textAlign: "center",
  boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.75rem",
  marginBottom: "0.75rem",
  borderRadius: 8,
  border: "1px solid #374151",
  fontSize: 14,
};

const button: React.CSSProperties = {
  width: "100%",
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "0.75rem 1rem",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
  marginBottom: "0.75rem",
};

const secondaryButton: React.CSSProperties = {
  ...button,
  background: "#374151",
};

const divider: React.CSSProperties = {
  margin: "0.5rem 0 1rem",
  color: "#9ca3af",
};

const errorText: React.CSSProperties = {
  color: "#fca5a5",
  fontSize: 13,
  marginTop: 10,
};

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "8px 12px",
  background: "#111827",
  color: "white",
  fontSize: 13,
};

const smallButton: React.CSSProperties = {
  background: "#374151",
  color: "white",
  border: "none",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
};