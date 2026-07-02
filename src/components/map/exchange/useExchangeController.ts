import { useEffect, useState } from "react";
import {
  deleteExchange,
  loadExchange,
  loadExchanges,
  saveExchange,
  type ExchangeAsset,
} from "../storage/exchangeStorage";

export type { ExchangeAsset };

function toExchangeMarker(exchange: ExchangeAsset): ExchangeAsset {
  return {
    id: exchange.id,
    name: exchange.name,
    code: exchange.code,
    lat: exchange.lat,
    lng: exchange.lng,
    projectId: exchange.projectId,
    notes: exchange.notes,
    createdAt: exchange.createdAt,
    updatedAt: exchange.updatedAt,
    olts: [],
    feederPanels: [],
    hdSplitterPanels: [],
  };
}

export function useExchangeController() {
  const [savedExchanges, setSavedExchanges] = useState<ExchangeAsset[]>([]);
  const [openExchangeAsset, setOpenExchangeAsset] =
    useState<ExchangeAsset | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadExchanges()
      .then((loadedExchanges) => {
        if (!cancelled) setSavedExchanges(loadedExchanges);
      })
      .catch((err) => {
        console.error("Failed to load exchanges", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenExchange = async (exchange: ExchangeAsset) => {
    try {
      const fullExchange = await loadExchange(exchange.id);
      setOpenExchangeAsset(fullExchange ?? exchange);
    } catch (err) {
      console.error("Failed to open exchange", err);
      alert("Exchange failed to open. Check console.");
    }
  };

  const handleSaveExchange = async (exchange: ExchangeAsset) => {
    const markerExchange = toExchangeMarker(exchange);

    setSavedExchanges((prev) => {
      const exists = prev.some((item) => item.id === exchange.id);

      if (exists) {
        return prev.map((item) =>
          item.id === exchange.id ? markerExchange : item,
        );
      }

      return [...prev, markerExchange];
    });

    try {
      await saveExchange(exchange);
      setOpenExchangeAsset(exchange);
    } catch (err) {
      console.error("Failed to save exchange", err);
      alert("Exchange failed to save. Check console.");
    }
  };

  const handleDeleteExchange = async (exchange: ExchangeAsset) => {
    if (
      !confirm(
        `Delete ${exchange.name || "this exchange"}? This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await deleteExchange(exchange.id);
      setSavedExchanges((prev) =>
        prev.filter((item) => item.id !== exchange.id),
      );

      setOpenExchangeAsset((current) =>
        current?.id === exchange.id ? null : current,
      );
    } catch (err) {
      console.error("Failed to delete exchange", err);
      alert("Exchange failed to delete. Check console.");
    }
  };

  return {
    savedExchanges,
    openExchangeAsset,
    setOpenExchangeAsset,
    handleOpenExchange,
    handleSaveExchange,
    handleDeleteExchange,
  };
}
