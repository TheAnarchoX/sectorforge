import {
  Flag,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  TimerReset,
} from "lucide-react";
import type { ConnectionState, TelemetryRunMode } from "../../types/telemetry";
import { ModePill, StatusPill } from "./DashboardPrimitives";

type DashboardHeaderProps = {
  connectionState: ConnectionState;
  runMode: TelemetryRunMode;
  isCollectorRunning: boolean;
  isLiveRunning: boolean;
  isReplayRunning: boolean;
  isBusy: boolean;
  trackName?: string | null;
  sessionName?: string | null;
  sourceName?: string | null;
  samplesPublished: number;
  onStartCollector: () => void;
  onStopCollector: () => void;
  onRefresh: () => void;
};

export function DashboardHeader({
  connectionState,
  runMode,
  isCollectorRunning,
  isLiveRunning,
  isReplayRunning,
  isBusy,
  trackName,
  sessionName,
  sourceName,
  samplesPublished,
  onStartCollector,
  onStopCollector,
  onRefresh,
}: DashboardHeaderProps) {
  const collectorState: ConnectionState = isCollectorRunning
    ? "connected"
    : "disconnected";

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="brand-cluster">
          <div className="brand-mark">SF</div>
          <div>
            <div className="brand-subtitle">Race control // telemetry bus</div>
            <h1 className="brand-title">SectorForge</h1>
          </div>
        </div>

        <div className="status-rack">
          <StatusPill label="SignalR" state={connectionState} />
          <StatusPill label="Collector" state={collectorState} />
          <ModePill mode={runMode} isRunning={isCollectorRunning} />
        </div>
      </div>

      <div className="topbar-row">
        <div className="command-strip">
          <div className="command-cell">
            <div className="command-label">
              <Flag size={14} />
              Circuit
            </div>
            <div className="command-value">
              {trackName ?? "Awaiting circuit lock"}
            </div>
          </div>

          <div className="command-cell">
            <div className="command-label">
              <TimerReset size={14} />
              Session
            </div>
            <div className="command-value">
              {sessionName ?? "No active stint"}
            </div>
          </div>

          <div className="command-cell command-cell-emphasis">
            <div className="command-label">
              <RadioTower size={14} />
              Feed
            </div>
            <div className="command-value">
              {sourceName ?? "Telemetry bus offline"}
            </div>
            <div className="command-meta mono">
              {samplesPublished.toLocaleString()} samples
            </div>
          </div>
        </div>

        <div
          className="button-row"
          role="group"
          aria-label="Collector controls"
        >
          <button
            className="icon-button primary"
            type="button"
            onClick={onStartCollector}
            disabled={isBusy || isLiveRunning}
            aria-label="Start fake telemetry"
            title="Start fake telemetry"
          >
            <Play size={17} />
            Start fake
          </button>

          <button
            className="icon-button danger"
            type="button"
            onClick={onStopCollector}
            disabled={isBusy || !isCollectorRunning}
            aria-label={isReplayRunning ? "Stop replay" : "Stop collector"}
            title={isReplayRunning ? "Stop replay" : "Stop collector"}
          >
            <Pause size={17} />
            Stop
          </button>

          <button
            className="icon-button"
            type="button"
            onClick={onRefresh}
            aria-label="Refresh dashboard state"
            title="Refresh API state"
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}
