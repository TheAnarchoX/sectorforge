import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { getSessionDetails } from "../../api/telemetryApi";
import type {
  CollectorStatus,
  TelemetrySample,
  TelemetrySessionDetails,
  TelemetrySessionSummary,
  TelemetrySource,
} from "../../types/telemetry";
import { TraceLane } from "./DashboardPrimitives";
import {
  formatDelta,
  formatNumber,
  formatShortTimestamp,
  formatTime,
} from "../../utils/telemetryFormat";

type TimingBoardProps = {
  collectorStatus: CollectorStatus | null;
  sample: TelemetrySample | null;
  activeSource: TelemetrySource | null;
  sessions: TelemetrySessionSummary[];
  isApiOffline: boolean;
  isBusy: boolean;
  activeReplaySessionId: string | null;
  onStartReplay: (sessionId: string) => void;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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
}: TimingBoardProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedSession, setSelectedSession] =
    useState<TelemetrySessionDetails | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedSessionSummary =
    selectedSessionId === null
      ? null
      : (sessions.find((session) => session.id === selectedSessionId) ?? null);
  const hasSelectedSession = selectedSessionSummary !== null;
  const selectedSessionLastSeenAt = selectedSessionSummary?.lastSeenAt ?? null;
  const selectedSessionSampleCount = selectedSessionSummary?.sampleCount ?? 0;
  const visibleSession =
    hasSelectedSession && selectedSession?.session.id === selectedSessionId
      ? selectedSession
      : null;

  useEffect(() => {
    if (selectedSessionId === null || !hasSelectedSession) {
      return;
    }

    const abortController = new AbortController();

    const loadSelectedSession = async () => {
      setIsDetailLoading(true);
      setDetailError(null);
      setSelectedSession((current) =>
        current?.session.id === selectedSessionId ? current : null,
      );

      try {
        const details = await getSessionDetails(selectedSessionId, {
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
    hasSelectedSession,
    selectedSessionId,
    selectedSessionLastSeenAt,
    selectedSessionSampleCount,
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
  const detailStatus = visibleSession
    ? `${visibleSession.samples.length} samples`
    : hasSelectedSession && isDetailLoading
      ? "Loading"
      : sessions.length > 0
        ? "Select"
        : "Empty";

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setIsDetailLoading(true);
    setDetailError(null);
    setSelectedSession((current) =>
      current?.session.id === sessionId ? current : null,
    );
  };

  const detailBody = (() => {
    if (visibleSession !== null) {
      return (
        <div className="panel-body session-detail-body">
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
                  const isSelected = selectedSessionId === session.id;
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
                          aria-pressed={isSelected}
                          title="Inspect capture detail"
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
                          onClick={() => onStartReplay(session.id)}
                          disabled={isBusy || isActiveReplay}
                        >
                          {isActiveReplay ? "Replaying" : "Replay"}
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
    </section>
  );
}
