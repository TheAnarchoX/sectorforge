import { useCallback, useState } from "react";
import { GitCompareArrows, Plug } from "lucide-react";
import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import {
  ErrorBanner,
  SessionBand,
  StateNotice,
} from "./components/dashboard/DashboardPrimitives";
import { LiveStatusPanels } from "./components/dashboard/LiveStatusPanels";
import { AdapterSetupTable } from "./components/dashboard/AdapterSetupTable";
import { MainTelemetryColumn } from "./components/dashboard/MainTelemetryColumn";
import { SimplifiedDriveView } from "./components/dashboard/SimplifiedDriveView";
import { TelemetrySidebar } from "./components/dashboard/TelemetrySidebar";
import { TimingBoard } from "./components/dashboard/TimingBoard";
import {
  WorkspaceRail,
  type Workspace,
} from "./components/dashboard/WorkspaceRail";
import { useDevelopmentMemoryMonitor } from "./hooks/useDevelopmentMemoryMonitor";
import { useTelemetryDashboard } from "./hooks/useTelemetryDashboard";
import type { DashboardReplayState, TelemetrySource } from "./types/telemetry";
import "./App.css";

function App() {
  const [workspace, setWorkspace] = useState<Workspace>("live");
  const [replayState, setReplayState] = useState<DashboardReplayState | null>(
    null,
  );
  const memoryNotice = useDevelopmentMemoryMonitor();
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
    refreshSessions,
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
  const shouldRenderTimingBoard = workspace === "sessions" || isReplayRunning;
  const replayNotice = isReplayRunning
    ? [
        {
          title: activeReplayState?.isPlaying
            ? "Replay active"
            : "Replay paused",
          message:
            activeReplayState === null
              ? "A stored capture is driving the dashboard. Open the Sessions workspace to scrub, pause, or resume the timeline."
              : `${activeReplayState.sessionName ?? "Stored capture"} is driving the dashboard at sample ${activeReplayState.sampleIndex + 1} of ${activeReplayState.sampleCount}. Open the Sessions workspace to scrub or resume playback.`,
          tone: "warning" as const,
        },
      ]
    : [];
  const runtimeNotices = isApiOffline
    ? []
    : replayNotice.length > 0
      ? replayNotice
      : !isCollectorRunning
        ? [
            {
              title: "Collector idle",
              message:
                sessions.length > 0
                  ? "Live telemetry is stopped. Press Start fake to resume streaming, or open Sessions to replay a stored capture."
                  : "Live telemetry is stopped. Press Start fake to begin streaming and create the first local capture.",
              tone: "warning" as const,
            },
          ]
        : [];
  const stateNotices =
    memoryNotice === null ? runtimeNotices : [memoryNotice, ...runtimeNotices];

  const handleStopCollector = useCallback(() => {
    void stopCollector();
  }, [stopCollector]);
  const handleStartAdapter = useCallback(
    (adapterId: string) => {
      void startCollector(adapterId);
    },
    [startCollector],
  );
  const handleRefresh = useCallback(() => {
    void refreshDashboard();
  }, [refreshDashboard]);
  const handleSessionDeleted = useCallback(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const liveWorkspace = (
    <section className="pitwall-console" aria-label="Pitwall console">
      <SessionBand
        sessionType={displaySample?.session.sessionType ?? null}
        sessionName={displaySample?.session.name ?? null}
        trackName={displaySample?.track.trackName ?? null}
        weather={displaySample?.track.weather ?? null}
        trackTempC={displaySample?.track.trackTemperatureC ?? null}
        airTempC={displaySample?.track.airTemperatureC ?? null}
        elapsed={displaySample?.timing.sessionElapsed ?? null}
        remaining={displaySample?.timing.sessionRemaining ?? null}
        lapNumber={displaySample?.lap.lapNumber ?? null}
        flag={isReplayRunning ? "yellow" : "green"}
      />
      <LiveStatusPanels sample={displaySample} />
      <div className="pitwall-grid">
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
    </section>
  );

  return (
    <main
      className={`app-shell app-shell-rail${isReplayRunning && workspace === "live" ? " app-shell-replay-active" : ""}`}
    >
      <WorkspaceRail
        active={workspace}
        onSelect={setWorkspace}
        isReplayRunning={isReplayRunning}
      />

      <div className="app-shell-content">
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
          adapters={games}
          activeAdapterId={displaySource?.adapterId ?? null}
          onStartAdapter={handleStartAdapter}
          onStopCollector={handleStopCollector}
          onRefresh={handleRefresh}
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

        {workspace === "live" && liveWorkspace}

        {workspace === "driver" && (
          <SimplifiedDriveView
            activeSource={displaySource}
            runMode={runMode}
            sample={displaySample}
          />
        )}

        {workspace === "compare" && (
          <WorkspacePlaceholder
            kicker="Compare"
            title="Lap overlays — coming soon"
            body="Pin two or more laps from the Sessions workspace to compare deltas, traces, and sector splits side-by-side. Pick a session first."
            icon={<GitCompareArrows size={20} />}
            actionLabel="Open Sessions"
            onAction={() => setWorkspace("sessions")}
          />
        )}

        {workspace === "adapters" && (
          <AdaptersWorkspace
            games={games}
            activeSource={displaySource}
            collectorRunMode={runMode}
            samplesPublished={collectorStatus?.samplesPublished ?? 0}
            isCollectorRunning={isCollectorRunning}
            isBusy={isBusy}
            onStartAdapter={handleStartAdapter}
            onStopAdapter={handleStopCollector}
          />
        )}

        {shouldRenderTimingBoard && (
          <div
            className={
              workspace === "sessions" ? undefined : "timing-board-hidden"
            }
            aria-hidden={workspace !== "sessions"}
          >
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
              onSessionDeleted={handleSessionDeleted}
            />
          </div>
        )}
      </div>
    </main>
  );
}

type WorkspacePlaceholderProps = {
  kicker: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

function WorkspacePlaceholder({
  kicker,
  title,
  body,
  icon,
  actionLabel,
  onAction,
}: WorkspacePlaceholderProps) {
  return (
    <section className="workspace-empty" aria-label={title}>
      <div className="workspace-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <span className="workspace-empty-kicker">{kicker}</span>
      <h2 className="workspace-empty-title">{title}</h2>
      <p className="workspace-empty-body">{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="icon-button primary"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </section>
  );
}

type AdaptersWorkspaceProps = {
  games: TelemetrySource[];
  activeSource: TelemetrySource | null;
  collectorRunMode: string;
  samplesPublished: number;
  isCollectorRunning: boolean;
  isBusy: boolean;
  onStartAdapter: (adapterId: string) => void;
  onStopAdapter: () => void;
};

function AdaptersWorkspace({
  games,
  activeSource,
  collectorRunMode,
  samplesPublished,
  isCollectorRunning,
  isBusy,
  onStartAdapter,
  onStopAdapter,
}: AdaptersWorkspaceProps) {
  return (
    <section className="adapters-workspace" aria-label="Adapter registry">
      <header className="zone-bar">
        <div className="zone-bar-title">
          <span className="zone-kicker">Telemetry inputs</span>
          <span className="zone-source">
            <Plug size={13} /> Adapter registry
          </span>
        </div>
        <div className="zone-bar-meta mono">
          collector {isCollectorRunning ? "ONLINE" : "IDLE"} ·{" "}
          {collectorRunMode} · {samplesPublished.toLocaleString()} samples
        </div>
      </header>
      {games.length === 0 ? (
        <div className="empty-chart">
          No adapters reported yet. Start the collector to discover available
          inputs.
        </div>
      ) : (
        <AdapterSetupTable
          adapters={games}
          activeAdapterId={activeSource?.adapterId ?? null}
          isCollectorRunning={isCollectorRunning}
          isBusy={isBusy}
          onStartAdapter={onStartAdapter}
          onStopAdapter={onStopAdapter}
        />
      )}
    </section>
  );
}

export default App;
