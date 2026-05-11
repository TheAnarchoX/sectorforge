import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { CompareWorkspace } from "./components/dashboard/CompareWorkspace";
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
import {
  TimingBoard,
  type LapComparePinInput,
} from "./components/dashboard/TimingBoard";
import {
  WorkspaceRail,
  type Workspace,
} from "./components/dashboard/WorkspaceRail";
import { useDevelopmentMemoryMonitor } from "./hooks/useDevelopmentMemoryMonitor";
import { useLapBasket } from "./hooks/useLapBasket";
import { useReferenceLapChannels } from "./hooks/useReferenceLapChannels";
import { useTelemetryDashboard } from "./hooks/useTelemetryDashboard";
import type {
  DashboardReplayState,
  ReferenceLapSelection,
  TelemetrySource,
} from "./types/telemetry";
import "./App.css";

const WORKSPACE_ROUTES: Record<Workspace, string> = {
  live: "/",
  driver: "/driver",
  sessions: "/sessions",
  compare: "/compare",
  adapters: "/adapters",
};

function normalizePathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function workspaceFromPathname(pathname: string): Workspace {
  switch (normalizePathname(pathname)) {
    case "/driver":
      return "driver";
    case "/sessions":
      return "sessions";
    case "/compare":
      return "compare";
    case "/adapters":
      return "adapters";
    default:
      return "live";
  }
}

function readWorkspaceFromLocation(): Workspace {
  if (typeof window === "undefined") {
    return "live";
  }

  return workspaceFromPathname(window.location.pathname);
}

function pushWorkspaceRoute(nextWorkspace: Workspace) {
  if (typeof window === "undefined") {
    return;
  }

  const nextPathname = WORKSPACE_ROUTES[nextWorkspace];
  if (normalizePathname(window.location.pathname) === nextPathname) {
    return;
  }

  window.history.pushState({ workspace: nextWorkspace }, "", nextPathname);
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() =>
    readWorkspaceFromLocation(),
  );
  const [replayState, setReplayState] = useState<DashboardReplayState | null>(
    null,
  );
  const [liveReferenceLap, setLiveReferenceLap] =
    useState<ReferenceLapSelection | null>(null);
  const lapBasket = useLapBasket();
  const addLapToBasket = lapBasket.addLap;
  const liveReferenceChannelsState = useReferenceLapChannels(liveReferenceLap);
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
  const isLiveRunning = isCollectorRunning && runMode === "Live";
  const isReplayRunning = isCollectorRunning && runMode === "Replay";
  const activeLiveAdapterId = isLiveRunning
    ? (collectorStatus?.activeAdapterId ?? activeSource?.adapterId ?? null)
    : null;
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
  const handleWorkspaceSelect = useCallback((nextWorkspace: Workspace) => {
    setWorkspace(nextWorkspace);
    pushWorkspaceRoute(nextWorkspace);
  }, []);
  const handleOpenSessions = useCallback(() => {
    handleWorkspaceSelect("sessions");
  }, [handleWorkspaceSelect]);
  const handleCompareSelectedLaps = useCallback(
    (laps: LapComparePinInput[]) => {
      for (const lap of laps) {
        addLapToBasket(lap);
      }

      handleWorkspaceSelect("compare");
    },
    [addLapToBasket, handleWorkspaceSelect],
  );
  const handleSetLiveReferenceLap = useCallback(
    (referenceLap: ReferenceLapSelection) => {
      setLiveReferenceLap(referenceLap);
    },
    [],
  );
  const handleClearLiveReferenceLap = useCallback(() => {
    setLiveReferenceLap(null);
  }, []);

  const liveReferenceChannels =
    liveReferenceChannelsState.status === "ready"
      ? liveReferenceChannelsState.response
      : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePopState = () => {
      setWorkspace(readWorkspaceFromLocation());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
      <LiveStatusPanels
        sample={displaySample}
        referenceChannels={liveReferenceChannels}
      />
      <div className="pitwall-grid">
        <MainTelemetryColumn
          activeSource={displaySource}
          runMode={runMode}
          sample={displaySample}
          traceSeries={displayTraceSeries}
          lapTrace={displayLapTrace}
          referenceLap={liveReferenceLap}
          referenceChannelsState={liveReferenceChannelsState}
          onClearReferenceLap={handleClearLiveReferenceLap}
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
      className={`app-shell app-shell-rail${isReplayRunning && workspace !== "sessions" ? " app-shell-replay-active" : ""}`}
    >
      <WorkspaceRail
        active={workspace}
        onSelect={handleWorkspaceSelect}
        isReplayRunning={isReplayRunning}
        compareBasketCount={lapBasket.entries.length}
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
          activeAdapterId={activeLiveAdapterId}
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
            lapTrace={displayLapTrace}
            sessions={sessions}
          />
        )}

        {workspace === "compare" && (
          <CompareWorkspace
            basketEntries={lapBasket.entries}
            onRemoveLap={lapBasket.removeLap}
            onSetReferenceLap={lapBasket.setReference}
            onSetPanelChannel={lapBasket.setPanelChannel}
            onImportComparisonSet={lapBasket.replace}
            onClearBasket={lapBasket.clear}
            maxBasketEntries={lapBasket.maxEntries}
            onOpenSessions={handleOpenSessions}
          />
        )}

        {workspace === "adapters" && (
          <AdaptersWorkspace
            games={games}
            activeAdapterId={activeLiveAdapterId}
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
              pinnedLapCount={lapBasket.entries.length}
              maxPinnedLaps={lapBasket.maxEntries}
              isApiOffline={isApiOffline}
              isBusy={isBusy}
              activeReplaySessionId={activeReplaySessionId}
              referenceLap={liveReferenceLap}
              isLapPinned={lapBasket.isPinned}
              onPinLap={lapBasket.addLap}
              onUnpinLap={lapBasket.removeLap}
              onSetReferenceLap={handleSetLiveReferenceLap}
              onCompareSelectedLaps={handleCompareSelectedLaps}
              onStartReplay={startReplay}
              onStopReplay={stopCollector}
              onReplayStateChange={setReplayState}
              showGlobalReplayControls={workspace !== "sessions"}
              onSessionDeleted={handleSessionDeleted}
            />
          </div>
        )}
      </div>
    </main>
  );
}

type AdaptersWorkspaceProps = {
  games: TelemetrySource[];
  activeAdapterId: string | null;
  collectorRunMode: string;
  samplesPublished: number;
  isCollectorRunning: boolean;
  isBusy: boolean;
  onStartAdapter: (adapterId: string) => void;
  onStopAdapter: () => void;
};

function AdaptersWorkspace({
  games,
  activeAdapterId,
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
          activeAdapterId={activeAdapterId}
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
