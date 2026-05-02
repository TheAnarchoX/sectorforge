import { Activity } from "lucide-react";
import type {
  CollectorStatus,
  TelemetrySample,
  TelemetrySessionSummary,
  TelemetrySource,
} from "../../types/telemetry";
import {
  formatDelta,
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
  return (
    <section className="panel timing-board">
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
              <td className="mono">{formatTime(sample?.lap.bestLapTime)}</td>
              <td className="mono">
                {formatTime(sample?.timing.sessionElapsed)}
              </td>
              <td className="mono">{collectorStatus?.samplesPublished ?? 0}</td>
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

              return (
                <tr
                  className={isActiveReplay ? "table-row-active" : undefined}
                  key={session.id}
                >
                  <td>
                    <span className="table-badge">Capture</span>
                  </td>
                  <td>{session.trackName ?? "Unknown track"}</td>
                  <td>
                    <div className="table-stack">
                      <span>
                        {session.carName ?? session.sourceName ?? session.game}
                      </span>
                      <span className="table-subvalue muted">
                        {session.game}
                      </span>
                    </div>
                  </td>
                  <td className="mono">-</td>
                  <td className="mono">{formatTime(session.bestLapTime)}</td>
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
    </section>
  );
}
