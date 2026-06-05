import React from "react";

type Props = {
  enabled: boolean;
};

export default function ResponsiveFieldPolish({ enabled }: Props) {
  if (!enabled) return null;

  return (
    <style>{`
      @media (max-width: 900px) {
        .leaflet-control-zoom {
          margin-bottom: 96px !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 16px !important;
        }
        .leaflet-popup-content {
          font-size: 14px !important;
        }
        .alistra-measure-label div {
          font-size: 13px !important;
          padding: 6px 10px !important;
        }
      }
      @media (max-width: 640px) {
        .leaflet-control-attribution {
          display: none !important;
        }
      }
    `}</style>
  );
}
