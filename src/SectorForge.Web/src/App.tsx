import { useState } from "react";
import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import {
  ErrorBanner,
  StateNotice,
} from "./components/dashboard/DashboardPrimitives";
import { MainTelemetryColumn } from "./components/dashboard/MainTelemetryColumn";
import { TelemetrySidebar } from "./components/dashboard/TelemetrySidebar";
import { TimingBoard } from "./components/dashboard/TimingBoard";
import { useTelemetryDashboard } from "./hooks/useTelemetryDashboard";
import type { DashboardReplayState } from "./types/telemetry";
import "./App.css";

function App() {
  const [replayState, setReplayState] = useState<DashboardReplayState | null>(
    null,
  );
  const {
    connectionState,
    apiAvailability,
    collectorStatus,
    sample,
    games,
    sessions,
    traceSeries,
    lapTrace,
    isBusy,
    error,
    refreshDashboard,
    startCollector,
    stopCollector,
    startReplay,
  } = useTelemetryDashboard();

  const activeSource = collectorStatus?.source ?? sample?.source ?? null;
  const runMode = collectorStatus?.runMode ?? "Idle";
  const isCollectorRunning = collectorStatus?.isRunning ?? false;
  const isReplayRunning = isCollectorRunning && runMode === "Replay";
  const isApiOffline = apiAvailability === "offline";
  const activeReplayState = isReplayRunning ? replayState : null;
  const displaySample = activeReplayState?.sample ?? sample;
  const displaySource = activeReplayState?.sample.source ?? activeSource;
  const displayTraceSeries = activeReplayState?.traceSeries ?? traceSeries;
  const displayLapTrace = activeReplayState?.lapTrace ?? lapTrace;
  const activeReplaySessionId = isReplayRunning
    ? (activeReplayState?.sessionId ??
      displaySample?.session.id ??
      collectorStatus?.latestSample?.sessionId ??
      null)
    : null;
  const replayNotice = isReplayRunning
    ? [
        {
          title: activeReplayState?.isPlaying
            ? "Replay active"
            : "Replay paused",
          message:
            activeReplayState === null
              ? "A stored capture is driving the dashboard. Load the replay timeline below to scrub, pause, or resume the session."
              : `${activeReplayState.sessionName ?? "Stored capture"} is driving the dashboard at sample ${activeReplayState.sampleIndex + 1} of ${activeReplayState.sampleCount}. Use the timing board controls below to scrub or resume playback.`,
          tone: "warning" as const,
        },
      ]
    : [];
  const stateNotices = isApiOffline
    ? [
        {
          title: "API offline",
          message:
            "The dashboard cannot reach the local SectorForge API. Restore the local service, then press Refresh to recover live state.",
          tone: "danger" as const,
        },
      ]
    : replayNotice.length > 0
      ? replayNotice
      : !isCollectorRunning
        ? [
            {
              title: "Collector idle",
              message:
                sessions.length > 0
                  ? "Live telemetry is stopped. Press Start fake to resume streaming, or replay one of the stored captures below."
                  : "Live telemetry is stopped. Press Start fake to begin streaming and create the first local capture.",
              tone: "warning" as const,
            },
          ]
        : [];

  return (
    <main
      className={`app-shell${isReplayRunning ? " app-shell-replay-active" : ""}`}
    >
      <DashboardHeader
        connectionState={connectionState}
        runMode={runMode}
        isCollectorRunning={isCollectorRunning}
        isReplayRunning={isReplayRunning}
        isBusy={isBusy}
        trackName={displaySample?.track.trackName}
        sessionName={displaySample?.session.name}
        sourceName={displaySource?.displayName}
        samplesPublished={collectorStatus?.samplesPublished ?? 0}
        onStartCollector={() => void startCollector()}
        onStopCollector={() => void stopCollector()}
        onRefresh={() => void refreshDashboard()}
      />

      {error && (
        <ErrorBanner
          title={error.title}
          message={error.message}
          tone={error.tone}
        />
      )}

      {stateNotices.length > 0 && (
        <section className="state-notice-grid" aria-label="Dashboard state">
          {stateNotices.map((notice) => (
            <StateNotice
              key={notice.title}
              title={notice.title}
              message={notice.message}
              tone={notice.tone}
            />
          ))}
        </section>
      )}

      <div className="dashboard-grid">
        <MainTelemetryColumn
          activeSource={displaySource}
          runMode={runMode}
          sample={displaySample}
          traceSeries={displayTraceSeries}
          lapTrace={displayLapTrace}
        />
        <TelemetrySidebar
          sample={displaySample}
          games={games}
          collectorStatus={collectorStatus}
        />
      </div>

      <TimingBoard
        collectorStatus={collectorStatus}
        sample={displaySample}
        activeSource={displaySource}
        sessions={sessions}
        isApiOffline={isApiOffline}
        isBusy={isBusy}
        activeReplaySessionId={activeReplaySessionId}
        onStartReplay={startReplay}
        onStopReplay={stopCollector}
        onReplayStateChange={setReplayState}
      />
    </main>
  );
}

export default App;
