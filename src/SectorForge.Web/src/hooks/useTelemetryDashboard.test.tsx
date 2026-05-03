import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCollectorStatus,
  createSessionSummary,
  createTelemetrySample,
  createTelemetrySource,
} from "../test/telemetryFixtures";

const apiMock = vi.hoisted(() => ({
  getCollectorStatus: vi.fn(),
  getGames: vi.fn(),
  getSessions: vi.fn(),
  getTelemetryHubUrl: vi.fn(() => "http://localhost:5221/hubs/telemetry"),
  startFakeCollector: vi.fn(),
  startReplay: vi.fn(),
  stopCollector: vi.fn(),
}));

const signalRMock = vi.hoisted(() => {
  type Handler<T = unknown> = (payload: T) => void;

  let collectorStatusHandler: Handler | null = null;
  let telemetrySampleHandler: Handler | null = null;
  let reconnectingHandler: (() => void) | null = null;
  let reconnectedHandler: (() => void) | null = null;
  let closeHandler: (() => void) | null = null;

  const connection = {
    state: "Disconnected",
    on: vi.fn((eventName: string, handler: Handler) => {
      if (eventName === "collectorStatus") {
        collectorStatusHandler = handler;
      }

      if (eventName === "telemetrySample") {
        telemetrySampleHandler = handler;
      }
    }),
    onreconnecting: vi.fn((handler: () => void) => {
      reconnectingHandler = handler;
    }),
    onreconnected: vi.fn((handler: () => void) => {
      reconnectedHandler = handler;
    }),
    onclose: vi.fn((handler: () => void) => {
      closeHandler = handler;
    }),
    start: vi.fn(async () => {
      connection.state = "Connected";
    }),
    stop: vi.fn(async () => {
      connection.state = "Disconnected";
    }),
  };

  return {
    connection,
    reset() {
      collectorStatusHandler = null;
      telemetrySampleHandler = null;
      reconnectingHandler = null;
      reconnectedHandler = null;
      closeHandler = null;
      connection.state = "Disconnected";
      connection.on.mockClear();
      connection.onreconnecting.mockClear();
      connection.onreconnected.mockClear();
      connection.onclose.mockClear();
      connection.start.mockClear();
      connection.stop.mockClear();
      connection.start.mockImplementation(async () => {
        connection.state = "Connected";
      });
      connection.stop.mockImplementation(async () => {
        connection.state = "Disconnected";
      });
    },
    emitCollectorStatus(payload: unknown) {
      collectorStatusHandler?.(payload);
    },
    emitTelemetrySample(payload: unknown) {
      telemetrySampleHandler?.(payload);
    },
    emitReconnecting() {
      reconnectingHandler?.();
    },
    emitReconnected() {
      connection.state = "Connected";
      reconnectedHandler?.();
    },
    emitClose() {
      connection.state = "Disconnected";
      closeHandler?.();
    },
  };
});

vi.mock("@microsoft/signalr", () => ({
  HubConnectionState: {
    Disconnected: "Disconnected",
    Connected: "Connected",
  },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }

    withAutomaticReconnect() {
      return this;
    }

    build() {
      return signalRMock.connection;
    }
  },
}));

vi.mock("../api/telemetryApi", () => ({
  getCollectorStatus: apiMock.getCollectorStatus,
  getGames: apiMock.getGames,
  getSessions: apiMock.getSessions,
  getTelemetryHubUrl: apiMock.getTelemetryHubUrl,
  startFakeCollector: apiMock.startFakeCollector,
  startReplay: apiMock.startReplay,
  stopCollector: apiMock.stopCollector,
}));

import { useTelemetryDashboard } from "./useTelemetryDashboard";

async function flushStartup() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe("useTelemetryDashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signalRMock.reset();

    const source = createTelemetrySource();
    apiMock.getCollectorStatus.mockResolvedValue(
      createCollectorStatus({
        isRunning: false,
        runMode: "Idle",
        source,
        latestSample: null,
        samplesPublished: 0,
      }),
    );
    apiMock.getGames.mockResolvedValue([source]);
    apiMock.getSessions.mockResolvedValue([createSessionSummary()]);
    apiMock.startFakeCollector.mockResolvedValue(
      createCollectorStatus({ samplesPublished: 12 }),
    );
    apiMock.stopCollector.mockResolvedValue(
      createCollectorStatus({
        isRunning: false,
        runMode: "Idle",
        latestSample: null,
      }),
    );
    apiMock.startReplay.mockResolvedValue(
      createCollectorStatus({ runMode: "Replay" }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads snapshots, consumes SignalR updates, and reconnects after a close", async () => {
    const initialSource = createTelemetrySource();
    const initialStatus = createCollectorStatus({
      isRunning: false,
      runMode: "Idle",
      source: initialSource,
      latestSample: null,
      samplesPublished: 0,
    });

    apiMock.getCollectorStatus.mockResolvedValue(initialStatus);

    const { result, unmount } = renderHook(() => useTelemetryDashboard());

    await flushStartup();

    expect(result.current.connectionState).toBe("connected");
    expect(result.current.apiAvailability).toBe("online");
    expect(result.current.collectorStatus).toEqual(initialStatus);
    expect(result.current.games).toEqual([initialSource]);
    expect(result.current.sessions).toHaveLength(1);

    act(() => {
      signalRMock.emitCollectorStatus(
        createCollectorStatus({
          lastError: "collector runtime issue",
        }),
      );
    });

    expect(result.current.error?.title).toBe("Collector needs attention");

    const sampleOne = createTelemetrySample({
      sequence: 1,
      lap: { lapNumber: 3, currentLapTime: "00:00:10.000" },
      vehicle: { speedKph: 150, rpm: 6400 },
      driverInput: { throttle: 0.5, brake: 0.1, steering: 0.2 },
    });
    const sampleTwo = createTelemetrySample({
      sequence: 2,
      lap: { lapNumber: 3, currentLapTime: "00:00:10.000" },
      vehicle: { speedKph: 151, rpm: 6450 },
      driverInput: { throttle: 0.55, brake: 0.08, steering: 0.18 },
    });
    const sampleThree = createTelemetrySample({
      sequence: 3,
      lap: { lapNumber: 3, currentLapTime: "00:00:10.500" },
      vehicle: { speedKph: 152, rpm: 6500 },
      driverInput: { throttle: 0.6, brake: 0.05, steering: 0.15 },
    });
    const sampleFour = createTelemetrySample({
      sequence: 4,
      lap: { lapNumber: 4, currentLapTime: "00:00:01.500" },
      vehicle: { speedKph: 160, rpm: 6600 },
      driverInput: { throttle: 0.7, brake: 0.02, steering: -0.12 },
    });

    act(() => {
      signalRMock.emitCollectorStatus(createCollectorStatus());
      signalRMock.emitTelemetrySample(sampleOne);
      signalRMock.emitTelemetrySample(sampleTwo);
      signalRMock.emitTelemetrySample(sampleThree);
      signalRMock.emitTelemetrySample(sampleFour);
    });

    // Sample, trace, and lap-trace updates are batched into a single React
    // commit at COMMIT_INTERVAL_MS (50ms). Advance the throttled commit timer
    // so the snapshot lands in state before assertions.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.sample?.sequence).toBe(4);
    expect(result.current.traceSeries.speed).toEqual([150, 151, 152, 160]);
    expect(result.current.lapTrace.lapNumber).toBe(4);
    expect(result.current.lapTrace.points).toEqual([
      { elapsedSeconds: 1.5, value: 160 },
    ]);

    act(() => {
      signalRMock.emitCollectorStatus(
        createCollectorStatus({
          isRunning: false,
          runMode: "Idle",
          latestSample: null,
        }),
      );
    });

    expect(result.current.lapTrace.points).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(apiMock.getSessions).toHaveBeenCalledTimes(3);

    act(() => {
      signalRMock.emitReconnecting();
    });

    expect(result.current.connectionState).toBe("reconnecting");

    apiMock.getCollectorStatus.mockResolvedValueOnce(
      createCollectorStatus({ samplesPublished: 42 }),
    );

    act(() => {
      signalRMock.emitReconnected();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe("connected");
    expect(result.current.collectorStatus?.samplesPublished).toBe(42);

    act(() => {
      signalRMock.emitClose();
    });

    expect(result.current.connectionState).toBe("disconnected");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(signalRMock.connection.start).toHaveBeenCalledTimes(2);

    unmount();

    expect(signalRMock.connection.stop).toHaveBeenCalledTimes(1);
  });

  it("refreshes data and completes collector control actions", async () => {
    const { result } = renderHook(() => useTelemetryDashboard());

    await flushStartup();

    expect(result.current.connectionState).toBe("connected");

    apiMock.getCollectorStatus.mockResolvedValueOnce(
      createCollectorStatus({ samplesPublished: 18 }),
    );
    apiMock.getGames.mockResolvedValueOnce([
      createTelemetrySource({ displayName: "Updated source" }),
    ]);
    apiMock.getSessions.mockResolvedValueOnce([
      createSessionSummary({ sampleCount: 220 }),
    ]);

    await act(async () => {
      await result.current.refreshDashboard();
    });

    expect(result.current.collectorStatus?.samplesPublished).toBe(18);
    expect(result.current.games[0]?.displayName).toBe("Updated source");

    apiMock.getSessions.mockResolvedValueOnce([
      createSessionSummary({ id: "session-2", trackName: "Spa" }),
    ]);

    await act(async () => {
      await result.current.refreshSessions();
    });

    expect(result.current.sessions[0]?.id).toBe("session-2");

    apiMock.startFakeCollector.mockResolvedValueOnce(
      createCollectorStatus({ samplesPublished: 24 }),
    );
    apiMock.getGames.mockResolvedValueOnce([
      createTelemetrySource({ displayName: "Fake telemetry" }),
    ]);

    await act(async () => {
      await result.current.startCollector();
    });

    expect(apiMock.startFakeCollector).toHaveBeenCalledTimes(1);
    expect(result.current.collectorStatus?.samplesPublished).toBe(24);
    expect(result.current.isBusy).toBe(false);

    apiMock.stopCollector.mockResolvedValueOnce(
      createCollectorStatus({
        isRunning: false,
        runMode: "Idle",
        latestSample: null,
        samplesPublished: 24,
      }),
    );
    apiMock.getGames.mockResolvedValueOnce([
      createTelemetrySource({ status: "Available" }),
    ]);
    apiMock.getSessions.mockResolvedValueOnce([
      createSessionSummary({ sampleCount: 260 }),
    ]);

    await act(async () => {
      await result.current.stopCollector();
    });

    expect(apiMock.stopCollector).toHaveBeenCalledTimes(1);
    expect(result.current.collectorStatus?.runMode).toBe("Idle");
    expect(result.current.sessions[0]?.sampleCount).toBe(260);

    apiMock.startReplay.mockResolvedValueOnce(
      createCollectorStatus({ runMode: "Replay" }),
    );

    await act(async () => {
      await expect(result.current.startReplay("session-1")).resolves.toBe(true);
    });

    expect(apiMock.startReplay).toHaveBeenCalledWith("session-1");
    expect(result.current.collectorStatus?.runMode).toBe("Replay");
  });

  it("surfaces refresh, control, and reconnect failures", async () => {
    const { result } = renderHook(() => useTelemetryDashboard());

    await flushStartup();

    expect(result.current.connectionState).toBe("connected");

    apiMock.getCollectorStatus.mockRejectedValueOnce(
      new Error("Failed to fetch"),
    );

    await act(async () => {
      await result.current.refreshDashboard();
    });

    expect(result.current.apiAvailability).toBe("offline");
    expect(result.current.error?.title).toBe("API offline");

    apiMock.getSessions.mockRejectedValueOnce(new Error("sessions down"));

    await act(async () => {
      await result.current.refreshSessions();
    });

    expect(result.current.error?.title).toBe("Dashboard refresh failed");

    apiMock.startFakeCollector.mockRejectedValueOnce(new Error("start denied"));

    await act(async () => {
      await result.current.startCollector();
    });

    expect(result.current.error?.title).toBe("Could not start telemetry");

    apiMock.stopCollector.mockRejectedValueOnce(new Error("stop denied"));

    await act(async () => {
      await result.current.stopCollector();
    });

    expect(result.current.error?.title).toBe("Could not stop telemetry");

    apiMock.startReplay.mockRejectedValueOnce(new Error("replay denied"));

    await act(async () => {
      await expect(result.current.startReplay("session-1")).resolves.toBe(
        false,
      );
    });

    expect(result.current.error?.title).toBe("Could not start replay");

    signalRMock.connection.start.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    act(() => {
      signalRMock.emitClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.apiAvailability).toBe("offline");
  });
});
