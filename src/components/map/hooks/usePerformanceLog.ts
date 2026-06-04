import { useCallback, useState } from "react";
import type { PerfMarkResult } from "../utils/performanceMarks";

export function usePerformanceLog(limit = 40) {
  const [items, setItems] = useState<PerfMarkResult[]>([]);

  const addPerfResult = useCallback(
    (item: PerfMarkResult) => {
      setItems((prev) => [item, ...prev].slice(0, limit));
    },
    [limit],
  );

  const clearPerfResults = useCallback(() => setItems([]), []);

  return {
    performanceItems: items,
    addPerfResult,
    clearPerfResults,
  };
}
