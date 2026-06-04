/**
 * Small timing helper for finding the real slow parts of Alistra GIS.
 *
 * Usage:
 * const done = startMapTimer("homes-load");
 * ...await work...
 * done();
 */
const ENABLE_MAP_TIMERS = true;

export function startMapTimer(label: string) {
  if (!ENABLE_MAP_TIMERS || typeof performance === "undefined") {
    return () => undefined;
  }

  const start = performance.now();

  return () => {
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    // Keep format easy to filter in Chrome console.
    console.info(`[AlistraPerf] ${label}: ${durationMs}ms`);
  };
}
