import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimingBoard } from "./TimingBoard";
import {
  createCollectorStatus,
  createSessionDetails,
  createSessionSummary,
  createTelemetrySample,
  createTelemetrySource,
} from "../../test/telemetryFixtures";

const timingBoardApiMock = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSessionDetails: vi.fn(),
}));

vi.mock("../../api/telemetryApi", () => ({
  deleteSession: timingBoardApiMock.deleteSession,
  getSessionDetails: timingBoardApiMock.getSessionDetails,
}));

function getSessionCaptureButton(trackName: string) {
  const captures = screen.getByLabelText("Stored captures");
  const title = within(captures).getByText(trackName);
  const button = title.closest("button");

  if (button === null) {
    throw new Error(`Could not find stored capture button for ${trackName}`);
  }

  return button;
}

function renderTimingBoard(
  override?: Partial<React.ComponentProps<typeof TimingBoard>>,
) {
  const onStartReplay = vi.fn().mockResolvedValue(true);
  const onStopReplay = vi.fn().mockResolvedValue(undefined);
  const onReplayStateChange = vi.fn();
  const onSessionDeleted = vi.fn().mockResolvedValue(undefined);
  const isLapPinned = vi.fn().mockReturnValue(false);
  const onPinLap = vi.fn();
  const onUnpinLap = vi.fn();
  const onCompareSelectedLaps = vi.fn();

  const utils = render(
    <TimingBoard
      collectorStatus={createCollectorStatus()}
      sample={createTelemetrySample()}
      activeSource={createTelemetrySource()}
      sessions={[createSessionSummary()]}
      pinnedLapCount={0}
      maxPinnedLaps={6}
      isApiOffline={false}
      isBusy={false}
      activeReplaySessionId={null}
      isLapPinned={isLapPinned}
      onPinLap={onPinLap}
      onUnpinLap={onUnpinLap}
      onCompareSelectedLaps={onCompareSelectedLaps}
      onStartReplay={onStartReplay}
      onStopReplay={onStopReplay}
      onReplayStateChange={onReplayStateChange}
      onSessionDeleted={onSessionDeleted}
      {...override}
    />,
  );

  return {
    ...utils,
    onStartReplay,
    onStopReplay,
    onReplayStateChange,
    onSessionDeleted,
    isLapPinned,
    onPinLap,
    onUnpinLap,
    onCompareSelectedLaps,
  };
}

describe("TimingBoard", () => {
  beforeEach(() => {
    timingBoardApiMock.getSessionDetails.mockReset();
    timingBoardApiMock.deleteSession.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters captures and prompts the user to pick a stored session", async () => {
    const user = userEvent.setup();
    const silverstone = createSessionSummary({
      id: "session-1",
      trackName: "Silverstone",
    });
    const suzuka = createSessionSummary({
      id: "session-2",
      trackName: "Suzuka",
      bestLapTime: "00:01:59.200",
      sampleCount: 420,
      lastSeenAt: "2026-05-03T12:10:00.000Z",
    });

    renderTimingBoard({ sessions: [silverstone, suzuka], sample: null });

    expect(screen.getByText("Pick a capture")).toBeInTheDocument();

    const searchBox = screen.getByRole("searchbox", {
      name: "Search captures",
    });
    await user.type(searchBox, "suzuka");

    expect(
      within(screen.getByLabelText("Stored captures")).queryByText(
        "Silverstone",
      ),
    ).toBeNull();
    expect(getSessionCaptureButton("Suzuka")).toBeInTheDocument();

    await user.clear(searchBox);
    await user.type(searchBox, "monza");
    expect(screen.getByText("No matches")).toBeInTheDocument();

    await user.clear(searchBox);
    await user.click(screen.getByRole("button", { name: "Best lap" }));
    expect(screen.getByRole("button", { name: "Best lap" })).toHaveClass(
      "chip-active",
    );
    await user.click(screen.getByRole("button", { name: "Samples" }));
    expect(screen.getByRole("button", { name: "Samples" })).toHaveClass(
      "chip-active",
    );
  });

  it("loads session details and manages replay transport controls", async () => {
    const user = userEvent.setup();
    const session = createSessionSummary();
    const sessionDetails = createSessionDetails({
      samples: [
        createTelemetrySample({
          sequence: 1,
          timestamp: "2026-05-03T12:00:00.000Z",
        }),
        createTelemetrySample({
          sequence: 2,
          timestamp: "2026-05-03T12:00:10.000Z",
        }),
        createTelemetrySample({
          sequence: 3,
          timestamp: "2026-05-03T12:00:20.000Z",
        }),
      ],
    });

    timingBoardApiMock.getSessionDetails.mockResolvedValue(sessionDetails);

    const rendered = renderTimingBoard({ sessions: [session], sample: null });

    await user.click(getSessionCaptureButton("Silverstone"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(timingBoardApiMock.getSessionDetails).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    expect(screen.getByText(/recorded laps/i)).toBeInTheDocument();
    expect(screen.getByText("Driver, car, and gap board")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start replay" }));

    expect(rendered.onStartReplay).toHaveBeenCalledWith(session.id);

    rendered.rerender(
      <TimingBoard
        collectorStatus={createCollectorStatus({ runMode: "Replay" })}
        sample={null}
        activeSource={createTelemetrySource()}
        sessions={[session]}
        pinnedLapCount={0}
        maxPinnedLaps={6}
        isApiOffline={false}
        isBusy={false}
        activeReplaySessionId={session.id}
        isLapPinned={rendered.isLapPinned}
        onPinLap={rendered.onPinLap}
        onUnpinLap={rendered.onUnpinLap}
        onCompareSelectedLaps={rendered.onCompareSelectedLaps}
        onStartReplay={rendered.onStartReplay}
        onStopReplay={rendered.onStopReplay}
        onReplayStateChange={rendered.onReplayStateChange}
        onSessionDeleted={rendered.onSessionDeleted}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.onReplayStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        sampleIndex: 0,
        sampleCount: sessionDetails.samples.length,
        isPlaying: true,
      }),
    );

    expect(screen.getByText("Replay live")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.onReplayStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ isPlaying: false }),
    );

    fireEvent.change(screen.getByLabelText("Timeline"), {
      target: { value: "1" },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.onReplayStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sampleIndex: 1, isPlaying: false }),
    );

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(rendered.onStopReplay).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Sample 2/3")).toBeInTheDocument();
  });

  it("pins and unpins stored lap rows for compare", async () => {
    const user = userEvent.setup();
    const session = createSessionSummary();
    const pinnedKeys = new Set<string>();
    const isLapPinned = vi.fn((sessionId: string, lapNumber: number) =>
      pinnedKeys.has(`${sessionId}:${lapNumber}`),
    );

    timingBoardApiMock.getSessionDetails.mockResolvedValue(
      createSessionDetails(),
    );

    const rendered = renderTimingBoard({
      sessions: [session],
      sample: null,
      isLapPinned,
    });

    await user.click(getSessionCaptureButton("Silverstone"));
    await screen.findByText(/recorded laps/i);

    const pinLap = screen.getByRole("button", {
      name: /pin lap 3 for compare/i,
    });
    expect(pinLap).toHaveAttribute("aria-pressed", "false");

    await user.click(pinLap);

    expect(rendered.onPinLap).toHaveBeenCalledWith({
      sessionId: session.id,
      lapNumber: 3,
      label: "Silverstone L3",
      session: {
        game: "SectorForge Sim",
        sourceName: "Fake telemetry",
        trackName: "Silverstone",
        carName: "GT3 Evo",
        startedAt: "2026-05-03T11:45:00.000Z",
        lastSeenAt: "2026-05-03T12:05:00.000Z",
        weather: "Dry",
        trackTemperatureC: 31.2,
        airTemperatureC: 22.4,
      },
    });

    pinnedKeys.add(`${session.id}:3`);
    rendered.rerender(
      <TimingBoard
        collectorStatus={createCollectorStatus()}
        sample={null}
        activeSource={createTelemetrySource()}
        sessions={[session]}
        pinnedLapCount={1}
        maxPinnedLaps={6}
        isApiOffline={false}
        isBusy={false}
        activeReplaySessionId={null}
        isLapPinned={isLapPinned}
        onPinLap={rendered.onPinLap}
        onUnpinLap={rendered.onUnpinLap}
        onCompareSelectedLaps={rendered.onCompareSelectedLaps}
        onStartReplay={rendered.onStartReplay}
        onStopReplay={rendered.onStopReplay}
        onReplayStateChange={rendered.onReplayStateChange}
        onSessionDeleted={rendered.onSessionDeleted}
      />,
    );

    const unpinLap = screen.getByRole("button", {
      name: /unpin lap 3 from compare/i,
    });
    expect(unpinLap).toHaveClass("active");
    expect(unpinLap).toHaveAttribute("aria-pressed", "true");

    await user.click(unpinLap);

    expect(rendered.onUnpinLap).toHaveBeenCalledWith(session.id, 3);
  });

  it("sends selected stored laps to Compare in one action", async () => {
    const user = userEvent.setup();
    const session = createSessionSummary();

    timingBoardApiMock.getSessionDetails.mockResolvedValue(
      createSessionDetails(),
    );

    const rendered = renderTimingBoard({ sessions: [session], sample: null });

    await user.click(getSessionCaptureButton("Silverstone"));
    await screen.findByText(/recorded laps/i);

    const compareSelected = screen.getByRole("button", {
      name: "Compare Selected",
    });
    expect(compareSelected).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: "Select lap 3 for compare" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Select lap 4 for compare" }),
    );

    expect(compareSelected).toBeEnabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(compareSelected);

    expect(rendered.onCompareSelectedLaps).toHaveBeenCalledWith([
      {
        sessionId: session.id,
        lapNumber: 3,
        label: "Silverstone L3",
        session: {
          game: "SectorForge Sim",
          sourceName: "Fake telemetry",
          trackName: "Silverstone",
          carName: "GT3 Evo",
          startedAt: "2026-05-03T11:45:00.000Z",
          lastSeenAt: "2026-05-03T12:05:00.000Z",
          weather: "Dry",
          trackTemperatureC: 31.2,
          airTemperatureC: 22.4,
        },
      },
      {
        sessionId: session.id,
        lapNumber: 4,
        label: "Silverstone L4",
        session: {
          game: "SectorForge Sim",
          sourceName: "Fake telemetry",
          trackName: "Silverstone",
          carName: "GT3 Evo",
          startedAt: "2026-05-03T11:45:00.000Z",
          lastSeenAt: "2026-05-03T12:05:00.000Z",
          weather: "Dry",
          trackTemperatureC: 31.2,
          airTemperatureC: 22.4,
        },
      },
    ]);
  });

  it("reloads selected-session details when the selected capture summary changes", async () => {
    const user = userEvent.setup();
    const session = createSessionSummary();
    const updatedSession = createSessionSummary({
      id: session.id,
      sampleCount: session.sampleCount + 240,
      lastSeenAt: "2026-05-03T12:45:00.000Z",
    });
    const sessionDetails = createSessionDetails();

    timingBoardApiMock.getSessionDetails.mockResolvedValue(sessionDetails);

    const rendered = renderTimingBoard({ sessions: [session], sample: null });

    await user.click(getSessionCaptureButton("Silverstone"));
    await screen.findByText(/recorded laps/i);

    expect(timingBoardApiMock.getSessionDetails).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <TimingBoard
        collectorStatus={createCollectorStatus()}
        sample={null}
        activeSource={createTelemetrySource()}
        sessions={[updatedSession]}
        pinnedLapCount={0}
        maxPinnedLaps={6}
        isApiOffline={false}
        isBusy={false}
        activeReplaySessionId={null}
        isLapPinned={rendered.isLapPinned}
        onPinLap={rendered.onPinLap}
        onUnpinLap={rendered.onUnpinLap}
        onCompareSelectedLaps={rendered.onCompareSelectedLaps}
        onStartReplay={rendered.onStartReplay}
        onStopReplay={rendered.onStopReplay}
        onReplayStateChange={rendered.onReplayStateChange}
        onSessionDeleted={rendered.onSessionDeleted}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(timingBoardApiMock.getSessionDetails).toHaveBeenCalledTimes(2);
  });

  it("shows a detail error when capture data cannot be loaded", async () => {
    const user = userEvent.setup();

    timingBoardApiMock.getSessionDetails.mockRejectedValue(new Error("boom"));

    renderTimingBoard({ sessions: [createSessionSummary()], sample: null });

    await user.click(getSessionCaptureButton("Silverstone"));

    expect(
      await screen.findByText("Capture overview unavailable"),
    ).toBeInTheDocument();
  });

  it("reports when a selected capture has already been removed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const session = createSessionSummary();

    timingBoardApiMock.getSessionDetails.mockResolvedValue(
      createSessionDetails(),
    );
    timingBoardApiMock.deleteSession.mockResolvedValue(false);

    const rendered = renderTimingBoard({ sessions: [session], sample: null });

    await user.click(getSessionCaptureButton("Silverstone"));
    await screen.findByText(/recorded laps/i);

    await user.click(
      screen.getByRole("button", { name: "Delete selected capture" }),
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(timingBoardApiMock.deleteSession).toHaveBeenCalledWith(session.id);
    expect(
      await screen.findByText("Capture was already removed from storage."),
    ).toBeInTheDocument();
    expect(rendered.onSessionDeleted).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it("surfaces delete failures from the local API", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    timingBoardApiMock.getSessionDetails.mockResolvedValue(
      createSessionDetails(),
    );
    timingBoardApiMock.deleteSession.mockRejectedValue(new Error("Disk full"));

    renderTimingBoard({ sessions: [createSessionSummary()], sample: null });

    await user.click(getSessionCaptureButton("Silverstone"));
    await screen.findByText(/recorded laps/i);

    const toolbar = screen.getByRole("button", {
      name: "Delete selected capture",
    });
    expect(toolbar).toHaveAttribute("title", "Delete selected capture");

    await user.click(toolbar);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Disk full/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
