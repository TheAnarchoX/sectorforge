import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDevelopmentMemoryMonitor } from "./useDevelopmentMemoryMonitor";

type TestPerformance = {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

describe("useDevelopmentMemoryMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("warns when the browser heap is already in a high-usage state", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const performanceObject: TestPerformance = {
      memory: {
        usedJSHeapSize: 440 * 1024 * 1024,
        totalJSHeapSize: 460 * 1024 * 1024,
        jsHeapSizeLimit: 500 * 1024 * 1024,
      },
    };

    const { result } = renderHook(() =>
      useDevelopmentMemoryMonitor({
        enabled: true,
        performanceObject: performanceObject as Performance,
        sampleIntervalMs: 1000,
      }),
    );

    expect(result.current?.title).toBe("High frontend memory usage");
    expect(result.current?.message).toMatch(/440 MB of 500 MB/i);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for moderate dev heap usage", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const performanceObject: TestPerformance = {
      memory: {
        usedJSHeapSize: 240 * 1024 * 1024,
        totalJSHeapSize: 260 * 1024 * 1024,
        jsHeapSizeLimit: 320 * 1024 * 1024,
      },
    };

    const { result } = renderHook(() =>
      useDevelopmentMemoryMonitor({
        enabled: true,
        performanceObject: performanceObject as Performance,
        sampleIntervalMs: 1000,
      }),
    );

    expect(result.current).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("clears the warning after usage drops back below the threshold", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const performanceObject: TestPerformance = {
      memory: {
        usedJSHeapSize: 440 * 1024 * 1024,
        totalJSHeapSize: 460 * 1024 * 1024,
        jsHeapSizeLimit: 500 * 1024 * 1024,
      },
    };

    const { result } = renderHook(() =>
      useDevelopmentMemoryMonitor({
        enabled: true,
        performanceObject: performanceObject as Performance,
        sampleIntervalMs: 1000,
      }),
    );

    expect(result.current).not.toBeNull();

    performanceObject.memory = {
      usedJSHeapSize: 96 * 1024 * 1024,
      totalJSHeapSize: 160 * 1024 * 1024,
      jsHeapSizeLimit: 320 * 1024 * 1024,
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current).toBeNull();
  });

  it("stays quiet when the browser does not expose heap stats", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useDevelopmentMemoryMonitor({
        enabled: true,
        performanceObject: {} as Performance,
        sampleIntervalMs: 1000,
      }),
    );

    expect(result.current).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
