import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import {
  ErrorBanner,
  StateNotice,
} from "./components/dashboard/DashboardPrimitives";
import { MainTelemetryColumn } from "./components/dashboard/MainTelemetryColumn";
import { TelemetrySidebar } from "./components/dashboard/TelemetrySidebar";
import { TimingBoard } from "./components/dashboard/TimingBoard";
import { useTelemetryDashboard } from "./hooks/useTelemetryDashboard";
import "./App.css";

function App() {
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
  const isLiveRunning = isCollectorRunning && runMode === "Live";
  const isReplayRunning = isCollectorRunning && runMode === "Replay";
  const isApiOffline = apiAvailability === "offline";
  const activeReplaySessionId = isReplayRunning
    ? (sample?.session.id ?? collectorStatus?.latestSample?.sessionId ?? null)
    : null;
  const stateNotices = isApiOffline
    ? [
        {
          title: "API offline",
          message:
            "The dashboard cannot reach the local SectorForge API. Restore the local service, then press Refresh to recover live state.",
          tone: "danger" as const,
        },
      ]
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
    <main className="app-shell">
      <DashboardHeader
        connectionState={connectionState}
        runMode={runMode}
        isCollectorRunning={isCollectorRunning}
        isLiveRunning={isLiveRunning}
        isReplayRunning={isReplayRunning}
        isBusy={isBusy}
        trackName={sample?.track.trackName}
        sessionName={sample?.session.name}
        sourceName={activeSource?.displayName}
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
          activeSource={activeSource}
          runMode={runMode}
          sample={sample}
          traceSeries={traceSeries}
          lapTrace={lapTrace}
        />
        <TelemetrySidebar
          sample={sample}
          games={games}
          collectorStatus={collectorStatus}
        />
      </div>

      <TimingBoard
        collectorStatus={collectorStatus}
        sample={sample}
        activeSource={activeSource}
        sessions={sessions}
        isApiOffline={isApiOffline}
        isBusy={isBusy}
        activeReplaySessionId={activeReplaySessionId}
        onStartReplay={(sessionId) => void startReplay(sessionId)}
      />
    </main>
  );
}

export default App;
