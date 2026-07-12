import { Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { ExchangeAsset } from "./storage/exchangeStorage";

const exchangeIcon = L.divIcon({
  className: "exchange-star-marker",
  html: "EX",
  iconSize: [34, 24],
  iconAnchor: [17, 12],
});

type Props = {
  exchanges: ExchangeAsset[];
  onExchangeClick: (exchange: ExchangeAsset) => void;
  onExchangeDelete?: (exchange: ExchangeAsset) => void;
};

export function ExchangeMarkersLayer({
  exchanges,
  onExchangeClick,
  onExchangeDelete,
}: Props) {
  return (
    <>
      {exchanges
        .filter((exchange) => Number.isFinite(exchange.lat) && Number.isFinite(exchange.lng))
        .map((exchange) => (
          <Marker
            key={exchange.id}
            position={[exchange.lat, exchange.lng]}
            icon={exchangeIcon}
          >
            <Tooltip>{exchange.name || "Exchange"}</Tooltip>

            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {exchange.name || "Exchange"}
                </div>

                {exchange.code && (
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Code: {exchange.code}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onExchangeClick(exchange)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    marginBottom: 6,
                    borderRadius: 6,
                    border: "none",
                    background: "#2563eb",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Open Exchange
                </button>

                {onExchangeDelete && (
                  <button
                    type="button"
                    onClick={() => onExchangeDelete(exchange)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "none",
                      background: "#dc2626",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    Delete Exchange
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
    </>
  );
}
