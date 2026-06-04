// =====================================================
// FILE: AuthGate.tsx
// PURPOSE: Authentication shell + providers
// =====================================================

/**
 * Alistra GIS
 * Copyright © 2026 Alistra GIS. All Rights Reserved.
 *
 * Unauthorized copying, modification, distribution,
 * reverse engineering, resale, or commercial use is prohibited.
 */

import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";

import { auth, googleProvider } from "../firebase";

import { AppModeProvider } from "../context/AppModeContext";
import { UserRoleProvider } from "../context/UserRoleContext";


type Props = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || "Google sign in failed.");
    }
  };

  const handleEmailAuth = async () => {
    setAuthError("");

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed.");
    }
  };

  if (loading) {
    return (
      <div style={screen}>
        Loading Fibre GIS Platform...
      </div>
    );
  }

  if (user) {
    return (
      <UserRoleProvider user={user}>
        <AppModeProvider>
          {children}
        </AppModeProvider>
      </UserRoleProvider>
    );
  }

  return (
    <div style={screen}>
      <div style={card}>
        <img
  src="/Alistra GIS Logo.png"
  alt="Alistra GIS"
  style={logo}
/>

        <h1 style={{ margin: "0 0 6px" }}>
          Alistra GIS
        </h1>

        <p
          style={{
            color: "#9ca3af",
            marginTop: 0,
          }}
        >
          Sign in to continue
        </p>

        <input
          style={input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          style={input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <button
          style={button}
          onClick={handleEmailAuth}
        >
          Sign in
        </button>


        <div style={divider}>or</div>

        <button
          style={secondaryButton}
          onClick={handleGoogleSignIn}
        >
          Sign in with Google
        </button>

        {authError && (
          <div style={errorText}>
            {authError}
          </div>
        )}
      </div>

      <div style={copyrightFooter}>
        <div>Alistra GIS v1.0.0</div>
        <div>© 2026 Alistra GIS. All Rights Reserved.</div>
        <div>Confidential &amp; Proprietary Software</div>
      </div>
    </div>
  );
}

const logo: React.CSSProperties = {
  width: 120,
  marginBottom: 16,
};

const screen: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#020617",
  color: "white",
  position: "relative",
};

const card: React.CSSProperties = {
  background: "#111827",
  padding: "2rem",
  borderRadius: 16,
  width: 380,
  maxWidth: "90vw",
  textAlign: "center",
  boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
  border:
    "1px solid rgba(148,163,184,0.18)",
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

const copyrightFooter: React.CSSProperties = {
  position: "fixed",
  bottom: 12,
  left: "50%",
  transform: "translateX(-50%)",
  textAlign: "center",
  color: "#6b7280",
  fontSize: 12,
  lineHeight: 1.4,
  pointerEvents: "none",
  userSelect: "none",
};
