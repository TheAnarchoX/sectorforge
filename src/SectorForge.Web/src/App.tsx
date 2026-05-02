import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import { ErrorBanner } from "./components/dashboard/DashboardPrimitives";
import { MainTelemetryColumn } from "./components/dashboard/MainTelemetryColumn";
import { TelemetrySidebar } from "./components/dashboard/TelemetrySidebar";
import { TimingBoard } from "./components/dashboard/TimingBoard";
import { useTelemetryDashboard } from "./hooks/useTelemetryDashboard";
import "./App.css";

function App() {
  const {
    connectionState,
    collectorStatus,
    sample,
    games,
    sessions,
    traceSeries,
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
  const activeReplaySessionId = isReplayRunning
    ? (sample?.session.id ?? collectorStatus?.latestSample?.sessionId ?? null)
    : null;

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

      {error && <ErrorBanner message={error} />}

      <div className="dashboard-grid">
        <MainTelemetryColumn
          activeSource={activeSource}
          runMode={runMode}
          sample={sample}
          traceSeries={traceSeries}
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
        isBusy={isBusy}
        activeReplaySessionId={activeReplaySessionId}
        onStartReplay={(sessionId) => void startReplay(sessionId)}
      />
    </main>
  );
}

export default App;
