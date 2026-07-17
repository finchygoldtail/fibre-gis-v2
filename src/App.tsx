/**
 * Alistra GIS
 * Copyright (c) 2026 Alistra GIS. All Rights Reserved.
 *
 * Unauthorized copying, modification, distribution, reverse engineering,
 * resale, or commercial use of this software is prohibited.
 */

import { useState } from "react";
import AlistraApplication from "./shells/AlistraApplication";

const APP_NAME = "Alistra GIS";
const APP_VERSION = "8.x";
const COPYRIGHT_NOTICE = "Copyright (c) 2026 Alistra GIS. All Rights Reserved.";

const LEGAL_NOTICE =
  "Alistra GIS, including its source code, interface design, fibre intelligence logic, AG continuity processing, network topology workflows, mapping tools, documentation, exports, graphics, and associated assets, is protected by copyright. Unauthorized copying, modification, distribution, reverse engineering, resale, or commercial use is prohibited without written permission from Alistra GIS.";

export default function App() {
  const [showLegalNotice, setShowLegalNotice] = useState(false);

  return (
    <div className="alistra-app-shell">
      <AlistraApplication />

      <div className="alistra-legal-footer" aria-label="Alistra GIS copyright notice">
        <span>{COPYRIGHT_NOTICE}</span>
        <button
          type="button"
          className="alistra-legal-link"
          onClick={() => setShowLegalNotice(true)}
          aria-label="Open Alistra GIS legal notice"
        >
          Legal
        </button>
      </div>

      {showLegalNotice && (
        <div
          className="alistra-legal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alistra-legal-title"
        >
          <div className="alistra-legal-modal">
            <div className="alistra-legal-modal-header">
              <div>
                <h2 id="alistra-legal-title">{APP_NAME}</h2>
                <p>Version {APP_VERSION}</p>
              </div>

              <button
                type="button"
                className="alistra-legal-close"
                onClick={() => setShowLegalNotice(false)}
                aria-label="Close legal notice"
              >
                x
              </button>
            </div>

            <div className="alistra-legal-modal-body">
              <p className="alistra-legal-copyright">{COPYRIGHT_NOTICE}</p>

              <p>{LEGAL_NOTICE}</p>

              <div className="alistra-legal-warning">
                <strong>Protected software notice</strong>
                <span>
                  This platform is intended for authorised users only. Access,
                  use, copying, resale, redistribution, or extraction of system
                  logic without permission is not allowed.
                </span>
              </div>
            </div>

            <div className="alistra-legal-modal-footer">
              <button
                type="button"
                className="alistra-legal-primary"
                onClick={() => setShowLegalNotice(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
