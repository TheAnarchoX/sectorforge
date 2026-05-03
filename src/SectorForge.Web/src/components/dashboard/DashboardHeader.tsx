import { Pause, Play, RefreshCw } from "lucide-react";
import type { ConnectionState, TelemetryRunMode } from "../../types/telemetry";

type DashboardHeaderProps = {
  connectionState: ConnectionState;
  runMode: TelemetryRunMode;
  isCollectorRunning: boolean;
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
  const modeLabel = isCollectorRunning ? runMode.toUpperCase() : "IDLE";
  const modeTone: ChipTone = !isCollectorRunning
    ? "stop"
    : runMode === "Replay"
      ? "warn"
      : "live";
  const signalTone: ChipTone =
    connectionState === "connected"
      ? "live"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "warn"
        : "stop";

  return (
    <header className="topbar" aria-label="Race control header">
      <div className="topbar-brand">
        <div className="brand-mark" aria-hidden="true">
          SF
        </div>
        <div className="brand-stack">
          <span className="brand-title">SECTORFORGE</span>
          <span className="brand-subtitle">PITWALL // TELEMETRY BUS</span>
        </div>
      </div>

      <div className="topbar-context" role="group" aria-label="Active session">
        <ContextBlock label="Circuit" value={trackName ?? "—"} />
        <ContextBlock label="Session" value={sessionName ?? "—"} />
        <ContextBlock
          label="Feed"
          value={sourceName ?? "—"}
          meta={`${samplesPublished.toLocaleString()} samples`}
        />
      </div>

      <div className="topbar-status" role="group" aria-label="System status">
        <StatusChip label="MODE" value={modeLabel} tone={modeTone} primary />
        <StatusChip
          label="SIGNAL"
          value={connectionState.toUpperCase()}
          tone={signalTone}
        />
        <StatusChip
          label="COLLECT"
          value={isCollectorRunning ? "ONLINE" : "OFFLINE"}
          tone={isCollectorRunning ? "live" : "stop"}
        />
      </div>

      <div
        className="topbar-actions"
        role="group"
        aria-label="Dashboard controls"
      >
        <button
          className="icon-button primary"
          type="button"
          onClick={onStartCollector}
          disabled={isBusy || isCollectorRunning}
          aria-label="Start fake telemetry"
          title="Start fake telemetry"
        >
          <Play size={15} />
          Start
        </button>
        <button
          className="icon-button danger"
          type="button"
          onClick={onStopCollector}
          disabled={isBusy || !isCollectorRunning}
          aria-label={isReplayRunning ? "Stop replay" : "Stop collector"}
          title={isReplayRunning ? "Stop replay" : "Stop collector"}
        >
          <Pause size={15} />
          Stop
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onRefresh}
          aria-label="Refresh dashboard state"
          title="Refresh API state"
        >
          <RefreshCw size={15} />
          Sync
        </button>
      </div>
    </header>
  );
}

type ChipTone = "live" | "warn" | "stop";

function ContextBlock({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="context-block">
      <span className="context-label">{label}</span>
      <span className="context-value" title={value}>
        {value}
      </span>
      {meta && <span className="context-meta mono">{meta}</span>}
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone,
  primary = false,
}: {
  label: string;
  value: string;
  tone: ChipTone;
  primary?: boolean;
}) {
  return (
    <div
      className={`status-chip-block status-chip-${tone}${primary ? " status-chip-primary" : ""}`}
    >
      <span className={`status-dot ${tone}`} aria-hidden="true" />
      <span className="status-chip-label">{label}</span>
      <span className="status-chip-value mono">{value}</span>
    </div>
  );
}
