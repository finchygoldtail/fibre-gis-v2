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
import "./index.css";

import { AppModeProvider } from "./context/AppModeContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      <AppModeProvider>
        <App />
      </AppModeProvider>
    </AuthGate>
  </React.StrictMode>
);