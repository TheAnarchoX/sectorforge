import { memo, useMemo, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import type {
  ConnectionState,
  TelemetryRunMode,
  TelemetrySource,
} from "../../types/telemetry";

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
  adapters: TelemetrySource[];
  activeAdapterId: string | null;
  onStartAdapter: (adapterId: string) => void;
  onStopCollector: () => void;
  onRefresh: () => void;
};

export const DashboardHeader = memo(DashboardHeaderImpl);

function DashboardHeaderImpl({
  connectionState,
  runMode,
  isCollectorRunning,
  isReplayRunning,
  isBusy,
  trackName,
  sessionName,
  sourceName,
  samplesPublished,
  adapters,
  activeAdapterId,
  onStartAdapter,
  onStopCollector,
  onRefresh,
}: DashboardHeaderProps) {
  const startableAdapters = useMemo(
    () => adapters.filter((adapter) => adapter.status !== "NotImplemented"),
    [adapters],
  );
  const defaultAdapterId =
    activeAdapterId ?? startableAdapters[0]?.adapterId ?? "";
  const [requestedAdapterId, setRequestedAdapterId] = useState<string | null>(
    null,
  );
  const selectedAdapterId =
    requestedAdapterId !== null &&
    startableAdapters.some(
      (adapter) => adapter.adapterId === requestedAdapterId,
    )
      ? requestedAdapterId
      : defaultAdapterId;
  const modeLabel = isCollectorRunning ? runMode.toUpperCase() : "IDLE";
  const modeTone: ChipTone = !isCollectorRunning
    ? "stop"
    : runMode === "Replay"
      ? "warn"
      : "live";
  const isLiveAdapterActive =
    isCollectorRunning && runMode === "Live" && activeAdapterId !== null;
  const signalTone: ChipTone =
    connectionState === "connected"
      ? "live"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "warn"
        : "stop";

  return (
    <header className="topbar" aria-label="Race control header">
      <div className="topbar-brand">
        <img
          className="brand-mark"
          src="/favicon.svg"
          alt=""
          aria-hidden="true"
        />
        <div className="brand-stack">
          <img
            className="brand-wordmark"
            src="/sectorforge-wordmark.svg"
            alt="SectorForge"
            draggable={false}
          />
          <span className="brand-subtitle">
            LOCAL-FIRST SIM TELEMETRY PITWALL
          </span>
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
        <StatusChip
          label="ADAPTER"
          value={isLiveAdapterActive ? "ACTIVE" : "IDLE"}
          tone={isLiveAdapterActive ? "live" : "stop"}
        />
      </div>

      <div
        className="topbar-actions"
        role="group"
        aria-label="Dashboard controls"
      >
        <label className="topbar-adapter-picker">
          <span className="topbar-adapter-picker-label">Adapter</span>
          <select
            className="topbar-adapter-select mono"
            value={selectedAdapterId}
            onChange={(event) => setRequestedAdapterId(event.target.value)}
            disabled={isBusy || startableAdapters.length === 0}
            aria-label="Telemetry adapter to start"
          >
            {startableAdapters.length === 0 && (
              <option value="">No adapters</option>
            )}
            {startableAdapters.map((adapter) => (
              <option key={adapter.adapterId} value={adapter.adapterId}>
                {adapter.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button primary"
          type="button"
          onClick={() => onStartAdapter(selectedAdapterId)}
          disabled={
            isBusy ||
            startableAdapters.length === 0 ||
            (isCollectorRunning && selectedAdapterId === activeAdapterId)
          }
          aria-label={`Start ${selectedAdapterId}`}
          title={
            isCollectorRunning && selectedAdapterId !== activeAdapterId
              ? `Switch collector to ${selectedAdapterId}`
              : `Start ${selectedAdapterId}`
          }
        >
          <Play size={15} />
          {isCollectorRunning && selectedAdapterId !== activeAdapterId
            ? "Switch"
            : "Start"}
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
