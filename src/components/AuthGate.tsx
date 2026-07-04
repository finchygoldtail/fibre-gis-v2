// =====================================================
// FILE: AuthGate.tsx
// PURPOSE: Authentication shell + providers
// =====================================================

/**
 * Alistra GIS
 * Copyright (c) 2026 Alistra GIS. All Rights Reserved.
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
import AlistraLanding from "./landing/AlistraLanding";

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
      <div style={loadingScreen}>
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
    <AlistraLanding
      loginPanel={
        <div style={loginCard} id="login">
          <img
            src="/Alistra GIS Logo.png"
            alt="Alistra GIS"
            style={loginLogo}
          />

          <h2 style={loginTitle}>
            Client login
          </h2>

          <p style={loginCopy}>
            Secure access for authorised infrastructure teams.
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
      }
    />
  );
}

const loadingScreen: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#020617",
  color: "white",
};

const loginCard: React.CSSProperties = {
  width: "100%",
  background: "rgba(15,23,42,0.94)",
  padding: "24px",
  borderRadius: 8,
  textAlign: "center",
  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
  border:
    "1px solid rgba(148,163,184,0.2)",
  boxSizing: "border-box",
};

const loginLogo: React.CSSProperties = {
  width: 88,
  marginBottom: 14,
};

const loginTitle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 24,
  color: "#ffffff",
};

const loginCopy: React.CSSProperties = {
  color: "#b6c6d9",
  margin: "0 0 18px",
  lineHeight: 1.5,
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
  fontWeight: 800,
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
