import { useEffect, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Activity, Pause, Play, Square } from "lucide-react";
import { getSessionDetails } from "../../api/telemetryApi";
import type {
  CollectorStatus,
  CurrentLapTelemetrySeries,
  DashboardReplayState,
  TelemetrySample,
  TelemetrySessionDetails,
  TelemetrySessionSummary,
  TelemetrySource,
  TelemetryTraceSeries,
} from "../../types/telemetry";
import { TraceLane } from "./DashboardPrimitives";
import {
  clamp,
  formatDelta,
  formatNumber,
  formatShortTimestamp,
  formatTime,
  parseDurationSeconds,
} from "../../utils/telemetryFormat";

type TimingBoardProps = {
  collectorStatus: CollectorStatus | null;
  sample: TelemetrySample | null;
  activeSource: TelemetrySource | null;
  sessions: TelemetrySessionSummary[];
  isApiOffline: boolean;
  isBusy: boolean;
  activeReplaySessionId: string | null;
  onStartReplay: (sessionId: string) => Promise<boolean>;
  onStopReplay: () => Promise<void> | void;
  onReplayStateChange: Dispatch<SetStateAction<DashboardReplayState | null>>;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

const REPLAY_TRACE_WINDOW = 180;
const REPLAY_STEP_MS_FALLBACK = 60;
const REPLAY_STEP_MS_MIN = 35;
const REPLAY_STEP_MS_MAX = 140;
const EMPTY_REPLAY_LAP_TRACE: CurrentLapTelemetrySeries = {
  sessionId: null,
  lapNumber: null,
  points: [],
};

function buildReplayTraceSeries(
  samples: TelemetrySample[],
  sampleIndex: number,
): TelemetryTraceSeries {
  if (samples.length === 0) {
    return {
      speed: [],
      rpm: [],
      throttle: [],
      brake: [],
      steering: [],
    };
  }

  const clampedIndex = clamp(sampleIndex, 0, samples.length - 1);
  const windowStart = Math.max(0, clampedIndex + 1 - REPLAY_TRACE_WINDOW);
  const windowSamples = samples.slice(windowStart, clampedIndex + 1);

  return {
    speed: windowSamples.map((nextSample) => nextSample.vehicle.speedKph ?? 0),
    rpm: windowSamples.map((nextSample) => nextSample.vehicle.rpm ?? 0),
    throttle: windowSamples.map(
      (nextSample) => (nextSample.driverInput.throttle ?? 0) * 100,
    ),
    brake: windowSamples.map(
      (nextSample) => (nextSample.driverInput.brake ?? 0) * 100,
    ),
    steering: windowSamples.map(
      (nextSample) => (nextSample.driverInput.steering ?? 0) * 100,
    ),
  };
}

function buildReplayLapTrace(
  samples: TelemetrySample[],
  sampleIndex: number,
): CurrentLapTelemetrySeries {
  if (samples.length === 0) {
    return EMPTY_REPLAY_LAP_TRACE;
  }

  const clampedIndex = clamp(sampleIndex, 0, samples.length - 1);
  const currentSample = samples[clampedIndex] ?? null;

  if (currentSample === null) {
    return EMPTY_REPLAY_LAP_TRACE;
  }

  const currentLapNumber = currentSample.lap.lapNumber ?? null;
  if (currentLapNumber === null) {
    return {
      sessionId: currentSample.session.id,
      lapNumber: null,
      points: [],
    };
  }

  const points = samples.slice(0, clampedIndex + 1).flatMap((nextSample) => {
    if (nextSample.lap.lapNumber !== currentLapNumber) {
      return [];
    }

    const elapsedSeconds = parseDurationSeconds(nextSample.lap.currentLapTime);
    const speedKph = nextSample.vehicle.speedKph;

    if (
      elapsedSeconds === null ||
      speedKph === null ||
      speedKph === undefined
    ) {
      return [];
    }

    return [{ elapsedSeconds, value: speedKph }];
  });

  return {
    sessionId: currentSample.session.id,
    lapNumber: currentLapNumber,
    points,
  };
}

function getReplayDelayMs(samples: TelemetrySample[], sampleIndex: number) {
  if (sampleIndex >= samples.length - 1) {
    return REPLAY_STEP_MS_FALLBACK;
  }

  const currentTimestamp = Date.parse(samples[sampleIndex]?.timestamp ?? "");
  const nextTimestamp = Date.parse(samples[sampleIndex + 1]?.timestamp ?? "");

  if (Number.isNaN(currentTimestamp) || Number.isNaN(nextTimestamp)) {
    return REPLAY_STEP_MS_FALLBACK;
  }

  const acceleratedDelay = Math.max(1, (nextTimestamp - currentTimestamp) / 8);

  return clamp(
    Math.round(acceleratedDelay),
    REPLAY_STEP_MS_MIN,
    REPLAY_STEP_MS_MAX,
  );
}

export function TimingBoard({
  collectorStatus,
  sample,
  activeSource,
  sessions,
  isApiOffline,
  isBusy,
  activeReplaySessionId,
  onStartReplay,
  onStopReplay,
  onReplayStateChange,
}: TimingBoardProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedSession, setSelectedSession] =
    useState<TelemetrySessionDetails | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [requestedReplaySessionId, setRequestedReplaySessionId] = useState<
    string | null
  >(null);

  const effectiveSelectedSessionId = activeReplaySessionId ?? selectedSessionId;

  const selectedSessionSummary =
    effectiveSelectedSessionId === null
      ? null
      : (sessions.find(
          (session) => session.id === effectiveSelectedSessionId,
        ) ?? null);
  const hasSelectedSession = selectedSessionSummary !== null;
  const selectedSessionLastSeenAt = selectedSessionSummary?.lastSeenAt ?? null;
  const selectedSessionSampleCount = selectedSessionSummary?.sampleCount ?? 0;
  const visibleSession =
    hasSelectedSession &&
    selectedSession?.session.id === effectiveSelectedSessionId
      ? selectedSession
      : null;

  useEffect(() => {
    if (effectiveSelectedSessionId === null || !hasSelectedSession) {
      return;
    }

    const abortController = new AbortController();

    const loadSelectedSession = async () => {
      setIsDetailLoading(true);
      setDetailError(null);
      setSelectedSession((current) =>
        current?.session.id === effectiveSelectedSessionId ? current : null,
      );

      try {
        const details = await getSessionDetails(effectiveSelectedSessionId, {
          signal: abortController.signal,
        });
        setSelectedSession(details);
      } catch (requestError: unknown) {
        if (isAbortError(requestError)) {
          return;
        }

        setSelectedSession(null);
        setDetailError(
          "Capture detail could not be loaded. Refresh the captures list and try again.",
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsDetailLoading(false);
        }
      }
    };

    void loadSelectedSession();

    return () => {
      abortController.abort();
    };
  }, [
    effectiveSelectedSessionId,
    hasSelectedSession,
    selectedSessionLastSeenAt,
    selectedSessionSampleCount,
  ]);

  const visibleReplaySampleCount = visibleSession?.samples.length ?? 0;
  const visibleReplayIndex =
    visibleReplaySampleCount === 0
      ? 0
      : clamp(replayIndex, 0, visibleReplaySampleCount - 1);
  const visibleReplaySample =
    visibleSession?.samples[visibleReplayIndex] ?? null;
  const replaySession =
    activeReplaySessionId !== null &&
    visibleSession?.session.id === activeReplaySessionId
      ? visibleSession
      : null;
  const isReplaySessionActive = replaySession !== null;
  const replaySampleCount = replaySession?.samples.length ?? 0;
  const isReplayAtEnd =
    replaySampleCount > 0 && visibleReplayIndex >= replaySampleCount - 1;
  const isReplayAdvancing =
    isReplaySessionActive && isReplayPlaying && !isReplayAtEnd;
  const replayProgressLabel =
    visibleReplaySampleCount > 0
      ? `${visibleReplayIndex + 1}/${visibleReplaySampleCount}`
      : "0/0";

  useEffect(() => {
    if (!isReplayAdvancing || replaySampleCount === 0) {
      return;
    }

    const replayStep = window.setTimeout(
      () => {
        setReplayIndex((current) =>
          current >= replaySampleCount - 1 ? current : current + 1,
        );
      },
      getReplayDelayMs(replaySession.samples, visibleReplayIndex),
    );

    return () => {
      window.clearTimeout(replayStep);
    };
  }, [isReplayAdvancing, replaySampleCount, replaySession, visibleReplayIndex]);

  useEffect(() => {
    if (replaySession === null || replaySampleCount === 0) {
      onReplayStateChange(null);
      return;
    }

    const replaySample = replaySession.samples[visibleReplayIndex] ?? null;
    if (replaySample === null) {
      onReplayStateChange(null);
      return;
    }

    onReplayStateChange({
      sessionId: replaySession.session.id,
      sessionName:
        replaySample.session.name ??
        replaySession.session.trackName ??
        replaySession.session.sourceName ??
        replaySession.session.game,
      sampleIndex: visibleReplayIndex,
      sampleCount: replaySampleCount,
      isPlaying: isReplayAdvancing,
      sample: replaySample,
      traceSeries: buildReplayTraceSeries(
        replaySession.samples,
        visibleReplayIndex,
      ),
      lapTrace: buildReplayLapTrace(replaySession.samples, visibleReplayIndex),
    });
  }, [
    isReplayAdvancing,
    onReplayStateChange,
    replaySampleCount,
    replaySession,
    visibleReplayIndex,
  ]);

  const sessionSpeedValues =
    visibleSession?.samples.map(
      (nextSample) => nextSample.vehicle.speedKph ?? 0,
    ) ?? [];
  const latestStoredSample = visibleSession?.samples.at(-1) ?? null;
  const sessionSpeedMax = Math.max(320, ...sessionSpeedValues, 1);
  const detailTitle =
    visibleSession?.session.trackName ??
    selectedSessionSummary?.trackName ??
    "Inspect a recent capture";
  const detailStatus = isReplaySessionActive
    ? `${isReplayAdvancing ? "Replay" : "Paused"} ${replayProgressLabel}`
    : visibleSession
      ? `${visibleSession.samples.length} samples`
      : hasSelectedSession && isDetailLoading
        ? "Loading"
        : sessions.length > 0
          ? "Select"
          : "Empty";

  const handleSelectSession = (sessionId: string) => {
    if (activeReplaySessionId !== null && activeReplaySessionId !== sessionId) {
      return;
    }

    setSelectedSessionId(sessionId);
    setIsDetailLoading(true);
    setDetailError(null);
    setReplayIndex((current) =>
      selectedSessionId === sessionId ? current : 0,
    );
    setSelectedSession((current) =>
      current?.session.id === sessionId ? current : null,
    );
  };

  const handleStartReplay = async (sessionId: string) => {
    handleSelectSession(sessionId);
    setReplayIndex(0);
    setIsReplayPlaying(true);
    setRequestedReplaySessionId(sessionId);

    const started = await onStartReplay(sessionId);
    setRequestedReplaySessionId((current) =>
      current === sessionId ? null : current,
    );

    if (!started) {
      setIsReplayPlaying(false);
    }
  };

  const handleStopReplay = async () => {
    setIsReplayPlaying(false);
    setRequestedReplaySessionId(null);
    await onStopReplay();
  };

  const handleResumeReplay = () => {
    if (visibleReplaySampleCount === 0) {
      return;
    }

    setReplayIndex((current) =>
      current >= visibleReplaySampleCount - 1 ? 0 : current,
    );
    setIsReplayPlaying(true);
  };

  const handlePauseReplay = () => {
    setIsReplayPlaying(false);
  };

  const handleReplayTimelineChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsReplayPlaying(false);
    setReplayIndex(Number(event.target.value));
  };

  const replayControlsSection =
    visibleSession === null ? null : (
      <div className="session-detail-section">
        <div className="session-detail-heading">
          <div>
            <div className="panel-kicker">Replay controls</div>
            <h3 className="panel-title">Timeline transport</h3>
          </div>
          <div className="session-detail-note mono">
            {requestedReplaySessionId === visibleSession.session.id &&
            activeReplaySessionId === null
              ? "Starting"
              : isReplaySessionActive
                ? isReplayAdvancing
                  ? "Replay active"
                  : "Replay paused"
                : "Ready"}
          </div>
        </div>

        <div className="replay-controls">
          <div className="replay-controls-row">
            <div className="status-pill mono">
              {requestedReplaySessionId === visibleSession.session.id &&
              activeReplaySessionId === null
                ? "Starting replay"
                : isReplaySessionActive
                  ? isReplayAdvancing
                    ? "Replay live"
                    : "Replay paused"
                  : "Replay ready"}
            </div>

            <div
              className="replay-controls-actions"
              role="group"
              aria-label="Replay transport controls"
            >
              {isReplaySessionActive ? (
                <button
                  className="icon-button primary"
                  type="button"
                  onClick={
                    isReplayAdvancing ? handlePauseReplay : handleResumeReplay
                  }
                  disabled={replaySampleCount === 0}
                >
                  {isReplayAdvancing ? <Pause size={16} /> : <Play size={16} />}
                  {isReplayAdvancing ? "Pause" : "Resume"}
                </button>
              ) : (
                <button
                  className="icon-button primary"
                  type="button"
                  onClick={() =>
                    void handleStartReplay(visibleSession.session.id)
                  }
                  disabled={isBusy || visibleSession.samples.length === 0}
                >
                  <Play size={16} />
                  Start replay
                </button>
              )}

              <button
                className="icon-button danger"
                type="button"
                onClick={() => void handleStopReplay()}
                disabled={!isReplaySessionActive || isBusy}
              >
                <Square size={16} />
                Stop replay
              </button>
            </div>
          </div>

          <div className="replay-slider-group">
            <label
              className="detail-label"
              htmlFor={`replay-timeline-${visibleSession.session.id}`}
            >
              Replay timeline
            </label>
            <input
              id={`replay-timeline-${visibleSession.session.id}`}
              className="replay-slider"
              type="range"
              min={0}
              max={Math.max(0, visibleSession.samples.length - 1)}
              value={visibleReplayIndex}
              onChange={handleReplayTimelineChange}
              disabled={
                !isReplaySessionActive || visibleSession.samples.length === 0
              }
            />
            <div className="replay-timeline-meta mono">
              <span>Sample {replayProgressLabel}</span>
              <span>
                {formatTime(visibleReplaySample?.timing.sessionElapsed)}
              </span>
              <span>
                {formatShortTimestamp(visibleReplaySample?.timestamp)}
              </span>
            </div>
            <div className="table-subvalue muted">
              {isReplaySessionActive
                ? "Drag to scrub the stored capture. Scrubbing pauses playback until you resume."
                : "Start replay to drive the dashboard from this stored capture, then scrub through the timeline here."}
            </div>
          </div>
        </div>
      </div>
    );

  const detailBody = (() => {
    if (visibleSession !== null) {
      return (
        <div className="panel-body session-detail-body">
          {!isReplaySessionActive && replayControlsSection}

          <div className="detail-grid">
            <div className="detail-cell">
              <div className="detail-label">Game</div>
              <div className="detail-value">{visibleSession.session.game}</div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Source</div>
              <div className="detail-value">
                {visibleSession.session.sourceName ?? "Unknown source"}
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Track</div>
              <div className="detail-value">
                {visibleSession.session.trackName ?? "Unknown track"}
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Car</div>
              <div className="detail-value">
                {visibleSession.session.carName ?? "Unknown car"}
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Started</div>
              <div className="detail-value mono">
                {formatShortTimestamp(visibleSession.session.startedAt)}
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Last seen</div>
              <div className="detail-value mono">
                {formatShortTimestamp(visibleSession.session.lastSeenAt)}
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Best lap</div>
              <div className="detail-value mono">
                {formatTime(visibleSession.session.bestLapTime)}
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Samples</div>
              <div className="detail-value mono">
                {visibleSession.session.sampleCount}
              </div>
            </div>
          </div>

          <div className="session-detail-section">
            <div className="session-detail-heading">
              <div>
                <div className="panel-kicker">Recent speed trace</div>
                <h3 className="panel-title">Stored speed envelope</h3>
              </div>
              <div className="session-detail-note mono">
                {visibleSession.samples.length} recent samples
              </div>
            </div>
            <div className="trace-stack">
              <TraceLane
                label="Speed"
                value={formatNumber(latestStoredSample?.vehicle.speedKph, 0)}
                unit="kph"
                values={sessionSpeedValues}
                min={0}
                max={sessionSpeedMax}
                color="var(--accent-cyan)"
              />
            </div>
          </div>

          <div className="session-detail-section">
            <div className="session-detail-heading">
              <div>
                <div className="panel-kicker">Lap summaries</div>
                <h3 className="panel-title">Recent recorded laps</h3>
              </div>
              <div className="session-detail-note mono">
                {visibleSession.laps.length} laps
              </div>
            </div>

            <div className="table-panel-body session-laps-body">
              <table className="dense-table session-lap-table">
                <thead>
                  <tr>
                    <th>Lap</th>
                    <th>Lap time</th>
                    <th>Best</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSession.laps.length === 0 ? (
                    <tr className="table-row-empty">
                      <td colSpan={4}>
                        <div className="table-empty-state">
                          <span>No lap summaries yet</span>
                          <span className="table-subvalue muted">
                            This capture has stored samples, but no completed
                            laps have been recorded yet.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleSession.laps.map((lap) => (
                      <tr key={`${lap.sessionId}-${lap.lapNumber}`}>
                        <td className="mono">{lap.lapNumber}</td>
                        <td className="mono">{formatTime(lap.lapTime)}</td>
                        <td className="mono">{formatTime(lap.bestLapTime)}</td>
                        <td className="mono">
                          {formatShortTimestamp(lap.updatedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (isDetailLoading) {
      return (
        <div className="panel-body session-detail-body">
          <div
            className="session-detail-state"
            role="status"
            aria-live="polite"
          >
            <span>Loading capture detail</span>
            <span className="table-subvalue muted">
              Fetching metadata, lap summaries, and stored samples from the
              local API.
            </span>
          </div>
        </div>
      );
    }

    if (detailError !== null) {
      return (
        <div className="panel-body session-detail-body">
          <div
            className="session-detail-state session-detail-state-error"
            role="alert"
          >
            <span>Capture detail unavailable</span>
            <span className="table-subvalue muted">{detailError}</span>
          </div>
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <div className="panel-body session-detail-body">
          <div
            className="session-detail-state"
            role="status"
            aria-live="polite"
          >
            <span>No captures selected</span>
            <span className="table-subvalue muted">
              Stored session detail appears here after the first local capture
              is saved.
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="panel-body session-detail-body">
        <div className="session-detail-state" role="status" aria-live="polite">
          <span>Select a capture</span>
          <span className="table-subvalue muted">
            Choose a recent session from the timing board to inspect its
            metadata, lap summaries, and speed trace.
          </span>
        </div>
      </div>
    );
  })();

  return (
    <section
      className="timing-board"
      aria-label="Timing board and capture detail"
    >
      <div className="timing-board-layout">
        <div className="panel timing-board-table-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">Timing board</div>
              <h2 className="panel-title">Live stream and recent captures</h2>
            </div>
            <div className="status-pill mono">
              <Activity size={16} />
              {collectorStatus?.samplesPublished ?? 0}
            </div>
          </div>

          <div className="table-panel-body">
            <table className="dense-table timing-table">
              <thead>
                <tr>
                  <th>Feed</th>
                  <th>Track</th>
                  <th>Source</th>
                  <th>Current</th>
                  <th>Best</th>
                  <th>Stamp</th>
                  <th>Samples</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="table-row-live">
                  <td>
                    <span
                      className={`table-badge ${isApiOffline ? "table-badge-offline" : "table-badge-live"}`}
                    >
                      {isApiOffline
                        ? "Offline"
                        : collectorStatus?.isRunning
                          ? collectorStatus.runMode
                          : "Idle"}
                    </span>
                  </td>
                  <td>{sample?.track.trackName ?? "-"}</td>
                  <td>
                    <div className="table-stack">
                      <span>
                        {sample?.vehicle.carName ??
                          activeSource?.displayName ??
                          "-"}
                      </span>
                      <span className="table-subvalue muted">
                        {isApiOffline
                          ? "API unavailable"
                          : (activeSource?.inputKind ??
                            sample?.source.game ??
                            "No source")}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="table-stack mono">
                      <span>{formatTime(sample?.lap.currentLapTime)}</span>
                      <span className="table-subvalue">
                        {formatDelta(sample?.timing.deltaToBestLap)}
                      </span>
                    </div>
                  </td>
                  <td className="mono">
                    {formatTime(sample?.lap.bestLapTime)}
                  </td>
                  <td className="mono">
                    {formatTime(sample?.timing.sessionElapsed)}
                  </td>
                  <td className="mono">
                    {collectorStatus?.samplesPublished ?? 0}
                  </td>
                  <td>
                    <span
                      className={`table-badge ${isApiOffline ? "table-badge-offline" : "table-badge-live"}`}
                    >
                      {isApiOffline ? "Unavailable" : "Stream"}
                    </span>
                  </td>
                </tr>

                {!isApiOffline && sessions.length === 0 && (
                  <tr className="table-row-empty">
                    <td colSpan={8}>
                      <div className="table-empty-state">
                        <span>No recent captures yet</span>
                        <span className="table-subvalue muted">
                          {collectorStatus?.isRunning
                            ? "This board fills in after the current run saves its first telemetry samples."
                            : "Start fake telemetry and let it run for a few moments to create the first capture."}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {sessions.slice(0, 10).map((session) => {
                  const isActiveReplay = activeReplaySessionId === session.id;
                  const isReplayRequested =
                    requestedReplaySessionId === session.id;
                  const isSelected = effectiveSelectedSessionId === session.id;
                  const rowClassName = [
                    isActiveReplay ? "table-row-active" : null,
                    isSelected ? "table-row-selected" : null,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <tr className={rowClassName || undefined} key={session.id}>
                      <td>
                        <span className="table-badge">Capture</span>
                      </td>
                      <td>{session.trackName ?? "Unknown track"}</td>
                      <td>
                        <button
                          className={`session-select ${isSelected ? "active" : ""}`}
                          type="button"
                          onClick={() => handleSelectSession(session.id)}
                          disabled={
                            activeReplaySessionId !== null && !isActiveReplay
                          }
                          aria-pressed={isSelected}
                          title={
                            activeReplaySessionId !== null && !isActiveReplay
                              ? "Stop the active replay before inspecting another capture"
                              : "Inspect capture detail"
                          }
                        >
                          <span className="table-stack">
                            <span>
                              {session.carName ??
                                session.sourceName ??
                                session.game}
                            </span>
                            <span className="table-subvalue muted">
                              {session.game}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="mono">-</td>
                      <td className="mono">
                        {formatTime(session.bestLapTime)}
                      </td>
                      <td className="mono">
                        {formatShortTimestamp(session.lastSeenAt)}
                      </td>
                      <td className="mono">{session.sampleCount}</td>
                      <td>
                        <button
                          className={`session-action ${isActiveReplay ? "active" : ""}`}
                          type="button"
                          onClick={() => void handleStartReplay(session.id)}
                          disabled={
                            isBusy ||
                            isActiveReplay ||
                            isReplayRequested ||
                            (activeReplaySessionId !== null && !isActiveReplay)
                          }
                        >
                          {isActiveReplay
                            ? "Active"
                            : isReplayRequested
                              ? "Starting"
                              : "Replay"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="panel session-detail-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">Capture detail</div>
              <h2 className="panel-title">{detailTitle}</h2>
            </div>
            <div className="status-pill mono">{detailStatus}</div>
          </div>
          {detailBody}
        </aside>
      </div>

      {isReplaySessionActive && replayControlsSection !== null && (
        <div
          className="replay-dock"
          role="complementary"
          aria-label="Active replay controls"
        >
          {replayControlsSection}
        </div>
      )}
    </section>
  );
}
