import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";

const exchangeIcon = L.divIcon({
  className: "exchange-star-marker",
  html: "⭐",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function ExchangeMarkersLayer({ exchanges, onExchangeClick }) {
  return (
    <>
      {exchanges.map((exchange) => (
        <Marker
          key={exchange.id}
          position={[exchange.lat, exchange.lng]}
          icon={exchangeIcon}
          eventHandlers={{
            click: () => onExchangeClick(exchange),
          }}
        >
          <Tooltip>{exchange.name}</Tooltip>
        </Marker>
      ))}
    </>
  );
}