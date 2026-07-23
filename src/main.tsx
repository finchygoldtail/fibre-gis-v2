/**
 * Alistra GIS
 * Copyright © 2026 Alistra GIS. All Rights Reserved.
 *
 * Unauthorized copying, modification, distribution, reverse engineering,
 * resale, or commercial use of this software is prohibited.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthGate from "./components/AuthGate";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </ThemeProvider>
  </React.StrictMode>
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.error("Alistra GIS service worker registration failed", error));
  });
}
