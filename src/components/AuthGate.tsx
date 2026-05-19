// =====================================================
// FILE: AuthGate.tsx
// PURPOSE: Authentication shell + providers
// =====================================================

import React, { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";

import { auth, googleProvider } from "../firebase";

import { AppModeProvider } from "../context/AppModeContext";
import { UserRoleProvider } from "../context/UserRoleContext";

const ALLOWED_EMAILS = [
  "alistairlgrantham@gmail.com",
  "benedict.almond@brsk.co.uk",
  "adam.whittaker@brsk.co.uk",
  "james.oliver@brsk.co.uk",
  "alistair.grantham@brsk.co.uk",
  "ben.almond@brsk.co.uk",
  "maintenance1@alistragis.local",
  "j.bowes866@gmail.com",
];

type Props = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const isAllowedEmail = (value: string | null | undefined) =>
    !!value && ALLOWED_EMAILS.includes(value.toLowerCase());

  const handleGoogleSignIn = async () => {
    setAuthError("");

    try {
      const result = await signInWithPopup(auth, googleProvider);

      if (!isAllowedEmail(result.user.email)) {
        await auth.signOut();

        setAuthError(
          "This email is not allowed to access Alistra GIS.",
        );
      }
    } catch (err: any) {
      setAuthError(err.message || "Google sign in failed.");
    }
  };

  const handleEmailAuth = async () => {
    setAuthError("");

    if (!isAllowedEmail(email)) {
      setAuthError(
        "This email is not allowed to access Alistra GIS.",
      );
      return;
    }

    try {
      if (isCreatingAccount) {
        await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
      }
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

  if (user && !isAllowedEmail(user.email)) {
    void auth.signOut();

    return (
      <div style={screen}>
        <div style={card}>
          This account is not allowed to access Alistra GIS.
        </div>
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
          src="/alistra-logo.png"
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
          {isCreatingAccount
            ? "Create account"
            : "Sign in"}
        </button>

        <button
          style={secondaryButton}
          onClick={() =>
            setIsCreatingAccount((v) => !v)
          }
        >
          {isCreatingAccount
            ? "Already have an account?"
            : "Create account instead"}
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