import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectorStatus } from "./types/telemetry";
import App from "./App";
import {
  createCollectorStatus,
  createLapTrace,
  createSessionSummary,
  createTelemetrySample,
  createTelemetrySource,
  createTraceSeries,
} from "./test/telemetryFixtures";

const dashboardHookMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createDashboardState> | null,
}));

const memoryMonitorMock = vi.hoisted(() => ({
  current: null as {
    title: string;
    message: string;
    tone: "warning";
  } | null,
}));

vi.mock("./hooks/useTelemetryDashboard", () => ({
  useTelemetryDashboard: () => dashboardHookMock.current,
}));

vi.mock("./hooks/useDevelopmentMemoryMonitor", () => ({
  useDevelopmentMemoryMonitor: () => memoryMonitorMock.current,
}));

function createDashboardState(
  override?: Partial<{
    collectorStatus: CollectorStatus | null;
    sample: ReturnType<typeof createTelemetrySample> | null;
    games: ReturnType<typeof createTelemetrySource>[];
    sessions: ReturnType<typeof createSessionSummary>[];
    error: { title: string; message: string; tone: "error" | "warning" } | null;
  }>,
) {
  return {
    connectionState: "connected" as const,
    apiAvailability: "online" as const,
    collectorStatus:
      override?.collectorStatus ??
      createCollectorStatus({
        isRunning: false,
        runMode: "Idle",
        samplesPublished: 0,
        source: null,
        latestSample: null,
      }),
    sample: override?.sample ?? null,
    games: override?.games ?? [],
    sessions: override?.sessions ?? [],
    traceSeries: createTraceSeries({
      speed: [],
      rpm: [],
      throttle: [],
      brake: [],
      steering: [],
    }),
    lapTrace: createLapTrace({ sessionId: null, lapNumber: null, points: [] }),
    isBusy: false,
    error: override?.error ?? null,
    refreshDashboard: vi.fn().mockResolvedValue(undefined),
    refreshSessions: vi.fn().mockResolvedValue(undefined),
    startCollector: vi.fn().mockResolvedValue(undefined),
    stopCollector: vi.fn().mockResolvedValue(undefined),
    startReplay: vi.fn().mockResolvedValue(true),
  };
}

describe("App", () => {
  beforeEach(() => {
    dashboardHookMock.current = createDashboardState();
    memoryMonitorMock.current = null;
  });

  it("switches workspaces and wires top-level actions in the idle state", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("Collector idle")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Start fake telemetry" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Refresh dashboard state" }),
    );

    expect(dashboardHookMock.current?.startCollector).toHaveBeenCalledTimes(1);
    expect(dashboardHookMock.current?.refreshDashboard).toHaveBeenCalledTimes(
      1,
    );

    await user.click(screen.getByRole("button", { name: /driver/i }));
    expect(
      screen.getByRole("heading", { name: "Awaiting telemetry" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /compare/i }));
    expect(screen.getByText(/Lap overlays/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /adapters/i }));
    expect(screen.getByText(/No adapters reported yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sessions/i }));
    expect(screen.getAllByText("No captures yet").length).toBeGreaterThan(0);
  });

  it("renders replay notices, sample-driven panels, and compare navigation", async () => {
    const user = userEvent.setup();
    const sample = createTelemetrySample();
    dashboardHookMock.current = {
      ...createDashboardState({
        collectorStatus: createCollectorStatus({ runMode: "Replay" }),
        sample,
        games: [createTelemetrySource()],
        sessions: [createSessionSummary()],
        error: {
          title: "Replay warning",
          message: "Stored playback is driving the dashboard.",
          tone: "warning",
        },
      }),
      traceSeries: createTraceSeries(),
      lapTrace: createLapTrace(),
    };

    render(<App />);

    expect(screen.getByText("Replay paused")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Replay warning");
    expect(screen.getByText("Speed trace")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /driver/i }));
    expect(screen.getByText("SPEED")).toBeInTheDocument();
    expect(screen.getByText("GEAR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /adapters/i }));
    expect(screen.getAllByText("Fake telemetry").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /compare/i }));
    await user.click(screen.getByRole("button", { name: "Open Sessions" }));
    expect(screen.getByText("Stored sessions")).toBeInTheDocument();
  });

  it("renders development memory warnings in the shared notice area", () => {
    memoryMonitorMock.current = {
      title: "High frontend memory usage",
      message: "JS heap is using 240 MB of 320 MB.",
      tone: "warning",
    };

    render(<App />);

    expect(screen.getByText("High frontend memory usage")).toBeInTheDocument();
    expect(screen.getByText(/240 MB of 320 MB/i)).toBeInTheDocument();
    expect(screen.getByText("Collector idle")).toBeInTheDocument();
  });
});
