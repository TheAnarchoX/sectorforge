import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectorStatus } from "./types/telemetry";
import App from "./App";
import { LAP_BASKET_STORAGE_KEY } from "./hooks/useLapBasket";
import {
  createCollectorStatus,
  createLapChannelsResponse,
  createSessionDetails,
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

const telemetryApiMock = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getLapChannelsForBasketEntry: vi.fn(),
  getSessionDetails: vi.fn(),
}));

vi.mock("./hooks/useTelemetryDashboard", () => ({
  useTelemetryDashboard: () => dashboardHookMock.current,
}));

vi.mock("./hooks/useDevelopmentMemoryMonitor", () => ({
  useDevelopmentMemoryMonitor: () => memoryMonitorMock.current,
}));

vi.mock("./api/telemetryApi", () => ({
  deleteSession: telemetryApiMock.deleteSession,
  getLapChannelsForBasketEntry: telemetryApiMock.getLapChannelsForBasketEntry,
  getSessionDetails: telemetryApiMock.getSessionDetails,
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
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    dashboardHookMock.current = createDashboardState();
    memoryMonitorMock.current = null;
    telemetryApiMock.deleteSession.mockReset();
    telemetryApiMock.getLapChannelsForBasketEntry.mockReset();
    telemetryApiMock.getSessionDetails.mockReset();
    telemetryApiMock.deleteSession.mockResolvedValue(true);
    telemetryApiMock.getSessionDetails.mockResolvedValue(
      createSessionDetails(),
    );
    telemetryApiMock.getLapChannelsForBasketEntry.mockImplementation(
      (entry: { sessionId: string; lapNumber: number }) =>
        Promise.resolve(
          createLapChannelsResponse({
            sessionId: entry.sessionId,
            lapNumber: entry.lapNumber,
          }),
        ),
    );
  });

  it("switches workspaces and wires top-level actions in the idle state", async () => {
    const user = userEvent.setup();
    dashboardHookMock.current = createDashboardState({
      games: [createTelemetrySource()],
    });
    render(<App />);

    expect(screen.getByText("Collector idle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Start fake$/i }));
    await user.click(
      screen.getByRole("button", { name: "Refresh dashboard state" }),
    );

    expect(dashboardHookMock.current?.startCollector).toHaveBeenCalledTimes(1);
    expect(dashboardHookMock.current?.refreshDashboard).toHaveBeenCalledTimes(
      1,
    );

    await user.click(screen.getByRole("button", { name: /live/i }));
    expect(window.location.pathname).toBe("/");

    await user.click(screen.getByRole("button", { name: /driver/i }));
    expect(
      screen.getByRole("heading", { name: "Awaiting telemetry" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /compare/i }));
    expect(screen.getByText("No comparison set loaded")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/compare");

    await user.click(screen.getByRole("button", { name: /adapters/i }));
    expect(screen.getByTestId("adapter-row-fake")).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: "Stop replay" }));
    expect(dashboardHookMock.current?.stopCollector).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /driver/i }));
    expect(screen.getByText("SPEED")).toBeInTheDocument();
    expect(screen.getByText("GEAR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /adapters/i }));
    expect(screen.getAllByText("Fake telemetry").length).toBeGreaterThan(0);
    expect(
      within(screen.getByTestId("adapter-row-fake")).getByText("Running"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("adapter-stop-fake")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /compare/i }));
    await user.click(screen.getByRole("button", { name: "Open Sessions" }));
    expect(screen.getByText("Stored sessions")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/sessions");
  });

  it("opens Compare from the URL and follows browser workspace navigation", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/compare");

    render(<App />);

    expect(screen.getByText("No comparison set loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compare/i })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const workspaceRail = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    await user.click(
      within(workspaceRail).getByRole("button", { name: /sessions/i }),
    );
    expect(window.location.pathname).toBe("/sessions");
    expect(screen.getByText("Stored sessions")).toBeInTheDocument();

    act(() => {
      window.history.pushState(null, "", "/driver");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(
      screen.getByRole("heading", { name: "Awaiting telemetry" }),
    ).toBeInTheDocument();
  });

  it("shows a Compare rail badge for persisted pinned laps", () => {
    window.localStorage.setItem(
      LAP_BASKET_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: [
          {
            sessionId: "session-1",
            lapNumber: 3,
            label: "Silverstone L3",
            color: "#63b8d6",
          },
        ],
      }),
    );

    render(<App />);

    const workspaceRail = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    const compareButton = within(workspaceRail).getByRole("button", {
      name: /compare, 1 pinned lap/i,
    });

    expect(within(compareButton).getByText("1")).toBeInTheDocument();
  });

  it("opens Compare with laps selected from Session History", async () => {
    const user = userEvent.setup();
    const session = createSessionSummary();
    dashboardHookMock.current = createDashboardState({ sessions: [session] });

    render(<App />);

    await user.click(screen.getByRole("button", { name: /sessions/i }));
    await user.click(screen.getByText("Silverstone"));
    await screen.findByText(/recorded laps/i);

    await user.click(
      screen.getByRole("checkbox", { name: "Select lap 3 for compare" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Select lap 4 for compare" }),
    );
    await user.click(screen.getByRole("button", { name: "Compare Selected" }));

    expect(window.location.pathname).toBe("/compare");
    expect(
      (await screen.findAllByText("Silverstone L3")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Silverstone L4").length).toBeGreaterThan(0);
    expect(telemetryApiMock.getLapChannelsForBasketEntry).toHaveBeenCalledTimes(
      2,
    );
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
