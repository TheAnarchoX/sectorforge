import { useEffect, useRef, useState } from "react";

type BrowserMemoryInfo = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

type BrowserPerformanceWithMemory = Performance & {
  memory?: BrowserMemoryInfo;
};

export type DevelopmentMemoryNotice = {
  title: string;
  message: string;
  tone: "warning";
};

type UseDevelopmentMemoryMonitorOptions = {
  enabled?: boolean;
  sampleIntervalMs?: number;
  performanceObject?: BrowserPerformanceWithMemory | null;
};

const DEFAULT_SAMPLE_INTERVAL_MS = 15000;
const WARNING_USED_BYTES = 192 * 1024 * 1024;
const WARNING_HEAP_RATIO = 0.72;
const WARNING_GROWTH_BYTES = 96 * 1024 * 1024;
const HISTORY_LIMIT = 4;

function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function createMemoryNotice(
  memory: BrowserMemoryInfo,
  growthBytes: number,
): DevelopmentMemoryNotice | null {
  const heapLimit = memory.jsHeapSizeLimit || memory.totalJSHeapSize;

  if (heapLimit <= 0 || memory.usedJSHeapSize <= 0) {
    return null;
  }

  const usedRatio = memory.usedJSHeapSize / heapLimit;
  const isHeapHot =
    memory.usedJSHeapSize >= WARNING_USED_BYTES && usedRatio >= WARNING_HEAP_RATIO;
  const isGrowingQuickly = growthBytes >= WARNING_GROWTH_BYTES;

  if (!isHeapHot && !isGrowingQuickly) {
    return null;
  }

  const growthLabel =
    growthBytes > 0
      ? ` Heap growth across recent samples is ${formatMegabytes(growthBytes)}.`
      : "";

  return {
    title: "High frontend memory usage",
    message:
      `JS heap is using ${formatMegabytes(memory.usedJSHeapSize)} of ${formatMegabytes(heapLimit)}.${growthLabel} Close heavy capture views, keep Sessions hidden when you do not need full capture detail, or reload the dashboard after long replay runs.`,
    tone: "warning",
  };
}

function getPerformanceWithMemory(
  performanceObject?: BrowserPerformanceWithMemory | null,
) {
  if (performanceObject !== undefined) {
    return performanceObject;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.performance as BrowserPerformanceWithMemory;
}

export function useDevelopmentMemoryMonitor(
  options?: UseDevelopmentMemoryMonitorOptions,
) {
  const [notice, setNotice] = useState<DevelopmentMemoryNotice | null>(null);
  const historyRef = useRef<number[]>([]);
  const warningKeyRef = useRef<string | null>(null);
  const enabled = options?.enabled ?? import.meta.env.DEV;
  const sampleIntervalMs =
    options?.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const performanceWithMemory = getPerformanceWithMemory(
    options?.performanceObject,
  );
  const isMonitoringActive =
    enabled && performanceWithMemory?.memory !== undefined;

  useEffect(() => {
    historyRef.current = [];
    warningKeyRef.current = null;

    if (!isMonitoringActive) {
      return;
    }

    const sampleMemory = () => {
      const memory = performanceWithMemory.memory;
      if (memory === undefined) {
        historyRef.current = [];
        warningKeyRef.current = null;
        setNotice(null);
        return;
      }

      historyRef.current = [...historyRef.current, memory.usedJSHeapSize].slice(
        -HISTORY_LIMIT,
      );
      const oldestUsedBytes = historyRef.current[0] ?? memory.usedJSHeapSize;
      const growthBytes = Math.max(0, memory.usedJSHeapSize - oldestUsedBytes);
      const nextNotice = createMemoryNotice(memory, growthBytes);
      setNotice(nextNotice);

      if (nextNotice === null) {
        warningKeyRef.current = null;
        return;
      }

      const nextWarningKey = `${memory.usedJSHeapSize}:${growthBytes}`;
      if (warningKeyRef.current === nextWarningKey) {
        return;
      }

      warningKeyRef.current = nextWarningKey;
      console.warn("[SectorForge] High frontend memory usage detected.", {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        growthBytes,
      });
    };

    sampleMemory();

    const monitorInterval = window.setInterval(sampleMemory, sampleIntervalMs);

    return () => {
      window.clearInterval(monitorInterval);
    };
  }, [isMonitoringActive, performanceWithMemory, sampleIntervalMs]);

  return isMonitoringActive ? notice : null;
}
