import { Marker, Tooltip, Popup } from "react-leaflet";
import L from "leaflet";

const exchangeIcon = L.divIcon({
  className: "exchange-star-marker",
  html: "⭐",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function ExchangeMarkersLayer({
  exchanges,
  onExchangeClick,
  onExchangeDelete,
}) {
  return (
    <>
      {exchanges.map((exchange) => (
        <Marker
          key={exchange.id}
          position={[exchange.lat, exchange.lng]}
          icon={exchangeIcon}
        >
          <Tooltip>{exchange.name}</Tooltip>

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
