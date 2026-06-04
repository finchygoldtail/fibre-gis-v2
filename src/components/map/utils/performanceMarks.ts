export type PerfMarkResult = {
  label: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
};

export function startPerfMark(label: string): () => PerfMarkResult {
  const startedAt = performance.now();

  return () => {
    const endedAt = performance.now();
    const result = {
      label,
      startedAt,
      endedAt,
      durationMs: Math.round((endedAt - startedAt) * 100) / 100,
    };

    if (import.meta.env.DEV) {
      console.log(`[Alistra GIS PERF] ${label}: ${result.durationMs}ms`);
    }

    return result;
  };
}

export async function measureAsync<T>(label: string, task: () => Promise<T>): Promise<T> {
  const end = startPerfMark(label);
  try {
    return await task();
  } finally {
    end();
  }
}

export function measureSync<T>(label: string, task: () => T): T {
  const end = startPerfMark(label);
  try {
    return task();
  } finally {
    end();
  }
}
