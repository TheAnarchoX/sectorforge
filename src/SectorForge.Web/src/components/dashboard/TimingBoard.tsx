import { useEffect, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Activity, Pause, Play, Square } from "lucide-react";
import { getSessionDetails } from "../../api/telemetryApi";
import type {
  CollectorStatus,
  CurrentLapTelemetrySeries,
  DashboardReplayState,
  ParticipantState,
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

function buildFallbackParticipant(sample: TelemetrySample): ParticipantState {
  return {
    driverName: sample.source.displayName,
    teamName: null,
    carName: sample.vehicle.carName ?? null,
    position: 1,
    isPlayer: true,
    isInPit: false,
    lapNumber: sample.lap.lapNumber ?? null,
    currentLapTime: sample.lap.currentLapTime ?? null,
    lastLapTime: sample.lap.lastLapTime ?? null,
    bestLapTime: sample.lap.bestLapTime ?? null,
    gapToLeader: null,
    intervalToAhead: null,
  };
}

function getSessionParticipants(sample: TelemetrySample | null) {
  const participants = sample?.participants ?? [];

  return participants.length > 0
    ? participants
    : sample !== null
      ? [buildFallbackParticipant(sample)]
      : [];
}

function formatGapToLeader(participant: ParticipantState) {
  if (participant.position <= 1 || !participant.gapToLeader) {
    return "Leader";
  }

  return formatDelta(participant.gapToLeader);
}

function getParticipantNote(participant: ParticipantState) {
  if (participant.position === 1) {
    return participant.isPlayer
      ? "Driver focus • Track leader"
      : "Track leader";
  }

  if (participant.intervalToAhead) {
    const intervalLabel = `${formatDelta(participant.intervalToAhead)} to car ahead`;
    return participant.isPlayer
      ? `Driver focus • ${intervalLabel}`
      : intervalLabel;
  }

  if (participant.isInPit) {
    return participant.isPlayer ? "Driver focus • Pit lane" : "Pit lane";
  }

  return participant.isPlayer ? "Driver focus" : "On track";
}

function getParticipantGapNote(participant: ParticipantState) {
  if (participant.position === 1) {
    return participant.isInPit ? "Leader • Pit lane" : "Track leader";
  }

  if (participant.intervalToAhead) {
    return `${formatDelta(participant.intervalToAhead)} to car ahead`;
  }

  return participant.isInPit ? "Pit lane" : "On track";
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
  const overviewSample = isReplaySessionActive
    ? visibleReplaySample
    : visibleSession !== null
      ? latestStoredSample
      : sample;
  const canShowOverview =
    visibleSession !== null || (!hasSelectedSession && overviewSample !== null);
  const overviewParticipants = getSessionParticipants(overviewSample);
  const focusParticipant =
    overviewParticipants.find((participant) => participant.isPlayer) ??
    overviewParticipants[0] ??
    null;
  const overviewModeLabel = isReplaySessionActive
    ? "Replay timeline"
    : visibleSession !== null
      ? "Stored capture"
      : collectorStatus?.isRunning && collectorStatus.runMode === "Live"
        ? "Live session"
        : overviewSample !== null
          ? "Recent live session"
          : "Awaiting session";
  const overviewSessionType =
    overviewSample?.session.sessionType ??
    (isReplaySessionActive
      ? "Replay"
      : visibleSession !== null
        ? "Stored capture"
        : collectorStatus?.isRunning
          ? "Active run"
          : "Recent session");
  const overviewTrackName =
    visibleSession?.session.trackName ??
    overviewSample?.track.trackName ??
    selectedSessionSummary?.trackName ??
    "Unknown track";
  const overviewGame =
    visibleSession?.session.game ??
    overviewSample?.source.game ??
    activeSource?.game ??
    "-";
  const overviewSourceName =
    visibleSession?.session.sourceName ??
    overviewSample?.source.displayName ??
    activeSource?.displayName ??
    "Unknown source";
  const overviewFocusName =
    focusParticipant?.driverName ??
    overviewSample?.source.displayName ??
    overviewSourceName;
  const overviewTeamName = focusParticipant?.teamName ?? "Team unknown";
  const overviewCarName =
    focusParticipant?.carName ??
    visibleSession?.session.carName ??
    overviewSample?.vehicle.carName ??
    "Unknown car";
  const overviewWeather = overviewSample?.track.weather ?? "-";
  const overviewStartedAt =
    visibleSession?.session.startedAt ??
    overviewSample?.session.startedAt ??
    null;
  const overviewLastSeenAt =
    visibleSession?.session.lastSeenAt ?? overviewSample?.timestamp ?? null;
  const overviewBestLap =
    focusParticipant?.bestLapTime ??
    visibleSession?.session.bestLapTime ??
    overviewSample?.lap.bestLapTime ??
    null;
  const overviewFieldCount =
    overviewParticipants.length > 0
      ? overviewParticipants.length
      : overviewSample !== null
        ? 1
        : 0;
  const overviewFieldLabel =
    overviewFieldCount > 0 ? `${overviewFieldCount} cars` : "No field data";
  const overviewLapNumber =
    focusParticipant?.lapNumber ?? overviewSample?.lap.lapNumber ?? null;
  const overviewMetadata = [
    { label: "Mode", value: overviewModeLabel, mono: false },
    { label: "Game", value: overviewGame, mono: false },
    { label: "Source", value: overviewSourceName, mono: false },
    { label: "Weather", value: overviewWeather, mono: false },
    {
      label: "Started",
      value: formatShortTimestamp(overviewStartedAt),
      mono: true,
    },
    {
      label: "Last seen",
      value: formatShortTimestamp(overviewLastSeenAt),
      mono: true,
    },
    { label: "Best lap", value: formatTime(overviewBestLap), mono: true },
    {
      label: "Samples",
      value: String(
        visibleSession?.session.sampleCount ??
          collectorStatus?.samplesPublished ??
          0,
      ),
      mono: true,
    },
  ];
  const detailTitle =
    overviewSample?.session.name ??
    visibleSession?.session.trackName ??
    selectedSessionSummary?.trackName ??
    "Session overview";
  const detailStatus = isReplaySessionActive
    ? `${isReplayAdvancing ? "Replay" : "Paused"} ${replayProgressLabel}`
    : visibleSession !== null
      ? `${visibleSession.samples.length} samples`
      : canShowOverview
        ? collectorStatus?.isRunning && collectorStatus.runMode === "Live"
          ? "Live"
          : "Recent"
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
    if (canShowOverview) {
      return (
        <div className="panel-body session-detail-body">
          {visibleSession !== null &&
            !isReplaySessionActive &&
            replayControlsSection}

          <div className="session-overview-strip">
            <div className="session-overview-cell">
              <div className="detail-label">Session</div>
              <div className="detail-value">{detailTitle}</div>
              <div className="table-subvalue muted">{overviewSessionType}</div>
            </div>
            <div className="session-overview-cell">
              <div className="detail-label">Driver focus</div>
              <div className="detail-value">{overviewFocusName}</div>
              <div className="table-subvalue muted">
                {overviewTeamName} • {overviewCarName}
              </div>
            </div>
            <div className="session-overview-cell">
              <div className="detail-label">Field snapshot</div>
              <div className="detail-value mono">{overviewFieldLabel}</div>
              <div className="table-subvalue muted">
                {overviewTrackName}
                {overviewLapNumber !== null
                  ? ` • Lap ${overviewLapNumber}`
                  : ""}
              </div>
            </div>
          </div>

          <div className="detail-grid">
            {overviewMetadata.map((item) => (
              <div className="detail-cell" key={item.label}>
                <div className="detail-label">{item.label}</div>
                <div
                  className={item.mono ? "detail-value mono" : "detail-value"}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className="session-detail-section">
            <div className="session-detail-heading">
              <div>
                <div className="panel-kicker">Lap snapshot</div>
                <h3 className="panel-title">Driver, car, and gap board</h3>
              </div>
              <div className="session-detail-note mono">
                {isReplaySessionActive
                  ? `Replay ${replayProgressLabel}`
                  : overviewFieldCount > 0
                    ? `${overviewFieldCount} participants`
                    : "No participant data"}
              </div>
            </div>

            <div className="table-panel-body session-laps-body">
              <table className="dense-table session-participant-table">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th>Car</th>
                    <th>Lap</th>
                    <th>Last</th>
                    <th>Best</th>
                    <th>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewParticipants.length === 0 ? (
                    <tr className="table-row-empty">
                      <td colSpan={8}>
                        <div className="table-empty-state">
                          <span>No participant snapshot yet</span>
                          <span className="table-subvalue muted">
                            This session has summary metadata, but no stored
                            participant field snapshot is available to render.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    overviewParticipants.map((participant) => (
                      <tr
                        className={
                          participant.isPlayer ? "table-row-active" : undefined
                        }
                        key={`${participant.driverName}-${participant.position}`}
                      >
                        <td className="mono">{participant.position}</td>
                        <td>
                          <div className="table-stack">
                            <span>{participant.driverName}</span>
                            <span className="table-subvalue muted">
                              {getParticipantNote(participant)}
                            </span>
                          </div>
                        </td>
                        <td>{participant.teamName ?? "-"}</td>
                        <td>{participant.carName ?? "-"}</td>
                        <td>
                          <div className="table-stack mono">
                            <span>{participant.lapNumber ?? "-"}</span>
                            <span className="table-subvalue muted">
                              {formatTime(participant.currentLapTime)}
                            </span>
                          </div>
                        </td>
                        <td className="mono">
                          {formatTime(participant.lastLapTime)}
                        </td>
                        <td className="mono">
                          {formatTime(participant.bestLapTime)}
                        </td>
                        <td>
                          <div className="table-stack mono">
                            <span>{formatGapToLeader(participant)}</span>
                            <span className="table-subvalue muted">
                              {getParticipantGapNote(participant)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {visibleSession === null && sessions.length > 0 && (
              <div className="table-subvalue muted">
                Select a capture from the timing board to load stored laps or
                start a replay with the full participant field intact.
              </div>
            )}
          </div>

          {visibleSession !== null && (
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
          )}

          {visibleSession !== null && (
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
                          <td className="mono">
                            {formatTime(lap.bestLapTime)}
                          </td>
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
          )}
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
            <span>Loading session overview</span>
            <span className="table-subvalue muted">
              Fetching metadata, lap summaries, participant snapshots, and
              stored samples from the local API.
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
            <span>Session overview unavailable</span>
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
            <span>No session data yet</span>
            <span className="table-subvalue muted">
              Active or stored session overview appears here after the first
              local capture is saved.
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
            metadata, participant field, lap summaries, and speed trace.
          </span>
        </div>
      </div>
    );
  })();

  return (
    <section
      className="timing-board"
      aria-label="Timing board and session overview"
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
              <div className="panel-kicker">Session overview</div>
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
