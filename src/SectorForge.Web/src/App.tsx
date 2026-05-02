import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  Gauge,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  TimerReset,
} from "lucide-react";
import * as signalR from "@microsoft/signalr";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5221";
const SPEED_HISTORY_LIMIT = 140;

type TelemetrySourceStatus =
  | "Offline"
  | "Available"
  | "Running"
  | "NotImplemented";

type TelemetryRunMode = "Idle" | "Live" | "Replay";

type TelemetrySource = {
  adapterId: string;
  game: string;
  displayName: string;
  inputKind: string;
  isSimulated: boolean;
  status: TelemetrySourceStatus;
  notes?: string | null;
};

type WheelTemperatureState = {
  surfaceC?: number | null;
  coreC?: number | null;
  innerC?: number | null;
  middleC?: number | null;
  outerC?: number | null;
};

type TelemetrySample = {
  sessionId: string;
  sequence: number;
  timestamp: string;
  source: TelemetrySource;
  session: {
    id: string;
    name?: string | null;
    sessionType?: string | null;
    startedAt: string;
    isActive: boolean;
  };
  lap: {
    lapNumber?: number | null;
    currentLapTime?: string | null;
    lastLapTime?: string | null;
    bestLapTime?: string | null;
    sectorIndex?: number | null;
  };
  vehicle: {
    carName?: string | null;
    speedKph?: number | null;
    rpm?: number | null;
    gear?: number | null;
    engineTemperatureC?: number | null;
  };
  tyres: {
    frontLeft?: WheelTemperatureState | null;
    frontRight?: WheelTemperatureState | null;
    rearLeft?: WheelTemperatureState | null;
    rearRight?: WheelTemperatureState | null;
    frontLeftPressurePsi?: number | null;
    frontRightPressurePsi?: number | null;
    rearLeftPressurePsi?: number | null;
    rearRightPressurePsi?: number | null;
  };
  brakes: {
    frontLeftTemperatureC?: number | null;
    frontRightTemperatureC?: number | null;
    rearLeftTemperatureC?: number | null;
    rearRightTemperatureC?: number | null;
  };
  fuel: {
    remainingLiters?: number | null;
    capacityLiters?: number | null;
    litersPerLapEstimate?: number | null;
    lapsRemainingEstimate?: number | null;
  };
  track: {
    trackName?: string | null;
    trackTemperatureC?: number | null;
    airTemperatureC?: number | null;
    weather?: string | null;
  };
  driverInput: {
    throttle?: number | null;
    brake?: number | null;
    steering?: number | null;
    clutch?: number | null;
  };
  timing: {
    sessionElapsed?: string | null;
    sessionRemaining?: string | null;
    deltaToBestLap?: string | null;
    sectorDelta?: string | null;
  };
};

type CollectorStatus = {
  isRunning: boolean;
  runMode: TelemetryRunMode;
  activeAdapterId?: string | null;
  source?: TelemetrySource | null;
  startedAt?: string | null;
  lastSampleAt?: string | null;
  samplesPublished: number;
  lastError?: string | null;
  latestSample?: TelemetrySample | null;
};

type TelemetrySessionSummary = {
  id: string;
  game: string;
  sourceName?: string | null;
  trackName?: string | null;
  carName?: string | null;
  startedAt: string;
  lastSeenAt: string;
  bestLapTime?: string | null;
  sampleCount: number;
};

type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [collectorStatus, setCollectorStatus] =
    useState<CollectorStatus | null>(null);
  const [sample, setSample] = useState<TelemetrySample | null>(null);
  const [games, setGames] = useState<TelemetrySource[]>([]);
  const [sessions, setSessions] = useState<TelemetrySessionSummary[]>([]);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/collector/status`);
    if (!response.ok) {
      throw new Error(`Status request failed: ${response.status}`);
    }
    setCollectorStatus(await response.json());
  }, []);

  const fetchGames = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/games`);
    if (!response.ok) {
      throw new Error(`Games request failed: ${response.status}`);
    }
    setGames(await response.json());
  }, []);

  const fetchSessions = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/sessions`);
    if (!response.ok) {
      throw new Error(`Sessions request failed: ${response.status}`);
    }
    setSessions(await response.json());
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void Promise.all([fetchStatus(), fetchGames(), fetchSessions()]).catch(
        (requestError: unknown) => {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "API request failed",
          );
        },
      );
    }, 0);

    const sessionRefresh = window.setInterval(() => {
      void fetchSessions().catch(() => undefined);
    }, 5000);

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/telemetry`)
      .withAutomaticReconnect()
      .build();

    connection.on("collectorStatus", (status: CollectorStatus) => {
      setCollectorStatus(status);
      if (status.lastError) {
        setError(status.lastError);
      }
    });

    connection.on("telemetrySample", (nextSample: TelemetrySample) => {
      setSample(nextSample);
      setError(null);
      setSpeedHistory((current) => {
        const next = [...current, nextSample.vehicle.speedKph ?? 0];
        return next.slice(Math.max(0, next.length - SPEED_HISTORY_LIMIT));
      });
    });

    connection.onreconnecting(() => setConnectionState("reconnecting"));
    connection.onreconnected(() => setConnectionState("connected"));
    connection.onclose(() => setConnectionState("disconnected"));

    connection
      .start()
      .then(() => setConnectionState("connected"))
      .catch((startError: unknown) => {
        setConnectionState("disconnected");
        setError(
          startError instanceof Error
            ? startError.message
            : "SignalR connection failed",
        );
      });

    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(sessionRefresh);
      void connection.stop();
    };
  }, [fetchGames, fetchSessions, fetchStatus]);

  const startCollector = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/collector/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapterId: "fake" }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setCollectorStatus(await response.json());
      await fetchGames();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Collector start failed",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const stopCollector = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const endpoint =
        collectorStatus?.runMode === "Replay"
          ? "/api/replay/stop"
          : "/api/collector/stop";
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setCollectorStatus(await response.json());
      await Promise.all([fetchGames(), fetchSessions()]);
    } catch (stopError) {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "Collector stop failed",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const startReplay = async (sessionId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/replay/start/${sessionId}`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setCollectorStatus(await response.json());
    } catch (replayError) {
      setError(
        replayError instanceof Error
          ? replayError.message
          : "Replay start failed",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const metricItems = useMemo(
    () => [
      {
        label: "Speed",
        value: formatNumber(sample?.vehicle.speedKph, 0),
        unit: "kph",
      },
      {
        label: "RPM",
        value: formatNumber(sample?.vehicle.rpm, 0),
        unit: "rev/min",
      },
      {
        label: "Gear",
        value: formatGear(sample?.vehicle.gear),
        unit: "current",
      },
      {
        label: "Fuel",
        value: formatNumber(sample?.fuel.remainingLiters, 1),
        unit: "liters",
      },
      {
        label: "Current lap",
        value: formatTime(sample?.lap.currentLapTime),
        unit: `lap ${sample?.lap.lapNumber ?? "-"}`,
      },
      {
        label: "Best lap",
        value: formatTime(sample?.lap.bestLapTime),
        unit: "session",
      },
      {
        label: "Delta",
        value: formatDelta(sample?.timing.deltaToBestLap),
        unit: "to best",
      },
      {
        label: "Sector",
        value:
          sample?.lap.sectorIndex === null ||
          sample?.lap.sectorIndex === undefined
            ? "-"
            : String(sample.lap.sectorIndex + 1),
        unit: "active",
      },
    ],
    [sample],
  );

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
      <header className="topbar">
        <div className="flex items-center gap-3">
          <div className="brand-mark">SF</div>
          <div>
            <h1 className="brand-title">SectorForge</h1>
            <div className="brand-subtitle">
              {sample?.track.trackName ?? "Local telemetry"}
            </div>
          </div>
        </div>
        <div className="button-row">
          <StatusPill label="SignalR" state={connectionState} />
          <StatusPill
            label="Collector"
            state={isCollectorRunning ? "connected" : "disconnected"}
          />
          <ModePill mode={runMode} isRunning={isCollectorRunning} />
          <button
            className="icon-button primary"
            type="button"
            onClick={() => void startCollector()}
            disabled={isBusy || isLiveRunning}
            title="Start fake telemetry"
          >
            <Play size={17} />
            Start fake
          </button>
          <button
            className="icon-button danger"
            type="button"
            onClick={() => void stopCollector()}
            disabled={isBusy || !isCollectorRunning}
            title={isReplayRunning ? "Stop replay" : "Stop collector"}
          >
            <Pause size={17} />
            Stop
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() =>
              void Promise.all([fetchStatus(), fetchGames(), fetchSessions()])
            }
            title="Refresh API state"
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="dashboard-grid">
        <section className="main-column">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">
                  {runMode === "Replay" ? "Replay dashboard" : "Live dashboard"}
                </div>
                <h2 className="panel-title">
                  {activeSource?.displayName ?? "No active source"}
                </h2>
              </div>
              <div className="status-pill">
                <RadioTower size={16} />
                {activeSource?.inputKind ?? "Waiting"}
              </div>
            </div>
            <div className="panel-body metrics-grid">
              {metricItems.map((item) => (
                <MetricCard key={item.label} {...item} />
              ))}
            </div>
          </div>

          <div className="panel chart-wrap">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Speed trace</div>
                <h2 className="panel-title">
                  Last {speedHistory.length} samples
                </h2>
              </div>
              <div className="status-pill mono">
                <Gauge size={16} />
                {formatNumber(sample?.vehicle.speedKph, 0)} kph
              </div>
            </div>
            <div className="panel-body">
              <SpeedChart values={speedHistory} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Driver input</div>
                <h2 className="panel-title">Pedals and steering</h2>
              </div>
            </div>
            <div className="panel-body inputs-grid">
              <InputMeter
                label="Throttle"
                value={sample?.driverInput.throttle ?? 0}
                accent="#65f089"
              />
              <InputMeter
                label="Brake"
                value={sample?.driverInput.brake ?? 0}
                accent="#ff6b6b"
              />
              <SteeringMeter value={sample?.driverInput.steering ?? 0} />
              <MetricCard
                label="Fuel laps"
                value={formatNumber(sample?.fuel.lapsRemainingEstimate, 0)}
                unit="remaining"
              />
            </div>
          </div>
        </section>

        <aside className="side-column">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Session</div>
                <h2 className="panel-title">
                  {sample?.session.name ?? "Awaiting telemetry"}
                </h2>
              </div>
              <div className="status-pill mono">
                <TimerReset size={16} />
                {formatTime(sample?.timing.sessionElapsed)}
              </div>
            </div>
            <div className="panel-body metrics-grid">
              <MetricCard
                className="wide-metric"
                label="Car"
                value={sample?.vehicle.carName ?? "-"}
                unit={sample?.track.weather ?? "weather"}
              />
              <MetricCard
                label="Track temp"
                value={formatNumber(sample?.track.trackTemperatureC, 1)}
                unit="C"
              />
              <MetricCard
                label="Air temp"
                value={formatNumber(sample?.track.airTemperatureC, 1)}
                unit="C"
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Tyres</div>
                <h2 className="panel-title">Core temperatures</h2>
              </div>
            </div>
            <div className="panel-body temps-grid">
              <TempCell
                label="Front left"
                value={sample?.tyres.frontLeft?.coreC}
              />
              <TempCell
                label="Front right"
                value={sample?.tyres.frontRight?.coreC}
              />
              <TempCell
                label="Rear left"
                value={sample?.tyres.rearLeft?.coreC}
              />
              <TempCell
                label="Rear right"
                value={sample?.tyres.rearRight?.coreC}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Brakes</div>
                <h2 className="panel-title">Disc temperatures</h2>
              </div>
            </div>
            <div className="panel-body temps-grid">
              <TempCell
                label="Front left"
                value={sample?.brakes.frontLeftTemperatureC}
              />
              <TempCell
                label="Front right"
                value={sample?.brakes.frontRightTemperatureC}
              />
              <TempCell
                label="Rear left"
                value={sample?.brakes.rearLeftTemperatureC}
              />
              <TempCell
                label="Rear right"
                value={sample?.brakes.rearRightTemperatureC}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Adapters</div>
                <h2 className="panel-title">Fake telemetry mode</h2>
              </div>
            </div>
            <div className="panel-body session-list">
              {games.map((game) => (
                <div className="session-row" key={game.adapterId}>
                  <div className="session-main">{game.displayName}</div>
                  <div className="muted">{game.inputKind}</div>
                  <div className="mono">{game.status}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Sessions</div>
                <h2 className="panel-title">Recent captures</h2>
              </div>
              <div className="status-pill mono">
                <Activity size={16} />
                {collectorStatus?.samplesPublished ?? 0}
              </div>
            </div>
            <div className="panel-body session-list">
              {sessions.length === 0 && (
                <div className="empty-chart">No saved sessions</div>
              )}
              {sessions.slice(0, 5).map((session) => {
                const isActiveReplay = activeReplaySessionId === session.id;

                return (
                  <div
                    className={`session-row ${isActiveReplay ? "session-row-active" : ""}`}
                    key={session.id}
                  >
                    <div>
                      <div className="session-main">
                        {session.trackName ?? "Unknown track"}
                      </div>
                      <div className="muted">
                        {session.carName ?? session.sourceName ?? session.game}
                      </div>
                    </div>
                    <div>
                      <div className="session-cell-label">Best</div>
                      <div className="mono">
                        {formatTime(session.bestLapTime)}
                      </div>
                    </div>
                    <div>
                      <div className="session-cell-label">Samples</div>
                      <div className="mono">{session.sampleCount}</div>
                    </div>
                    <button
                      className={`session-action ${isActiveReplay ? "active" : ""}`}
                      type="button"
                      onClick={() => void startReplay(session.id)}
                      disabled={isBusy || isActiveReplay}
                    >
                      {isActiveReplay ? "Replaying" : "Replay"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function StatusPill({
  label,
  state,
}: {
  label: string;
  state: ConnectionState;
}) {
  const dotClass =
    state === "connected"
      ? "live"
      : state === "reconnecting" || state === "connecting"
        ? "warn"
        : "stop";
  return (
    <div className="status-pill">
      <span className={`status-dot ${dotClass}`} />
      {label}: {state}
    </div>
  );
}

function ModePill({
  mode,
  isRunning,
}: {
  mode: TelemetryRunMode;
  isRunning: boolean;
}) {
  const dotClass = !isRunning ? "stop" : mode === "Replay" ? "warn" : "live";

  return (
    <div className="status-pill">
      <span className={`status-dot ${dotClass}`} />
      Mode: {isRunning ? mode : "Idle"}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  className,
}: {
  label: string;
  value: string;
  unit: string;
  className?: string;
}) {
  return (
    <div className={`metric-card ${className ?? ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <span className="metric-unit">{unit}</span>
    </div>
  );
}

function SpeedChart({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="empty-chart">Awaiting telemetry</div>;
  }

  const width = 720;
  const height = 220;
  const padding = 16;
  const maxValue = Math.max(330, ...values);
  const minValue = 0;
  const xStep = (width - padding * 2) / Math.max(1, values.length - 1);
  const points = values
    .map((value, index) => {
      const x = padding + index * xStep;
      const y =
        height -
        padding -
        ((value - minValue) / (maxValue - minValue)) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const fillPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

  return (
    <svg
      className="speed-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Live speed chart"
    >
      {[0.25, 0.5, 0.75].map((line) => (
        <line
          key={line}
          className="chart-grid-line"
          x1={padding}
          x2={width - padding}
          y1={padding + (height - padding * 2) * line}
          y2={padding + (height - padding * 2) * line}
        />
      ))}
      <polygon className="chart-fill" points={fillPoints} />
      <polyline className="chart-line" points={points} />
    </svg>
  );
}

function InputMeter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  const percent = clamp(value, 0, 1) * 100;
  return (
    <div className="input-meter">
      <div className="flex items-center justify-between gap-3">
        <div className="small-label">{label}</div>
        <div className="mono">{percent.toFixed(0)}%</div>
      </div>
      <div
        className="meter-track"
        style={
          { "--accent": accent, "--value": `${percent}%` } as CSSProperties
        }
      >
        <span className="meter-fill" />
      </div>
    </div>
  );
}

function SteeringMeter({ value }: { value: number }) {
  const position = ((clamp(value, -1, 1) + 1) / 2) * 100;
  return (
    <div className="input-meter">
      <div className="flex items-center justify-between gap-3">
        <div className="small-label">Steering</div>
        <div className="mono">{value.toFixed(2)}</div>
      </div>
      <div
        className="steering-track"
        style={{ "--position": `${position}%` } as CSSProperties}
      >
        <span className="steering-center" />
        <span className="steering-marker" />
      </div>
    </div>
  );
}

function TempCell({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="temp-cell">
      <div className="small-label">{label}</div>
      <div className="temp-value">{formatNumber(value, 1)}</div>
      <div className="metric-unit">C</div>
    </div>
  );
}

function formatNumber(value: number | null | undefined, decimals: number) {
  return value === null || value === undefined ? "-" : value.toFixed(decimals);
}

function formatGear(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value === 0 ? "N" : String(value);
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const negative = value.startsWith("-");
  const clean = negative ? value.slice(1) : value;
  const daySplit = clean.split(".");
  const timePart =
    daySplit.length === 2 && daySplit[0].includes(":")
      ? clean
      : (daySplit.at(-1) ?? clean);
  const [hours = "0", minutes = "0", secondsRaw = "0"] = timePart.split(":");
  const seconds = Number(secondsRaw);
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  const formatted = `${String(totalMinutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
  return negative ? `-${formatted}` : formatted;
}

function formatDelta(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value.startsWith("-") ? formatTime(value) : `+${formatTime(value)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default App;
