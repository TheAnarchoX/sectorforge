import { Activity, RadioTower } from "lucide-react";
import type {
  CurrentLapTelemetrySeries,
  TelemetryRunMode,
  TelemetrySample,
  TelemetrySource,
  TelemetryTraceSeries,
} from "../../types/telemetry";
import {
  formatDelta,
  formatGear,
  formatNumber,
  formatTime,
} from "../../utils/telemetryFormat";
import { LapTelemetryChart } from "./LapTelemetryChart";
import { StripCell, TraceLane } from "./DashboardPrimitives";

type MainTelemetryColumnProps = {
  activeSource: TelemetrySource | null;
  runMode: TelemetryRunMode;
  sample: TelemetrySample | null;
  traceSeries: TelemetryTraceSeries;
  lapTrace: CurrentLapTelemetrySeries;
};

export function MainTelemetryColumn({
  activeSource,
  runMode,
  sample,
  traceSeries,
  lapTrace,
}: MainTelemetryColumnProps) {
  const stripItems = [
    {
      label: "Lap",
      value: formatTime(sample?.lap.currentLapTime),
      unit: `lap ${sample?.lap.lapNumber ?? "-"}`,
      tone: "neutral" as const,
    },
    {
      label: "Best",
      value: formatTime(sample?.lap.bestLapTime),
      unit: "session",
      tone: "success" as const,
    },
    {
      label: "Delta",
      value: formatDelta(sample?.timing.deltaToBestLap),
      unit: "to best",
      tone:
        sample?.timing.deltaToBestLap?.startsWith("-") === true
          ? ("success" as const)
          : ("warning" as const),
    },
    {
      label: "Sector",
      value:
        sample?.lap.sectorIndex === null ||
        sample?.lap.sectorIndex === undefined
          ? "-"
          : String(sample.lap.sectorIndex + 1),
      unit: "active",
      tone: "neutral" as const,
    },
    {
      label: "Speed",
      value: formatNumber(sample?.vehicle.speedKph, 0),
      unit: "kph",
      tone: "accent" as const,
    },
    {
      label: "RPM",
      value: formatNumber(sample?.vehicle.rpm, 0),
      unit: "rev/min",
      tone: "neutral" as const,
    },
    {
      label: "Gear",
      value: formatGear(sample?.vehicle.gear),
      unit: "current",
      tone: "success" as const,
    },
    {
      label: "Fuel",
      value: formatNumber(sample?.fuel.remainingLiters, 1),
      unit: "liters",
      tone: "warning" as const,
    },
  ];

  const speedMax = Math.max(320, ...traceSeries.speed, 1);
  const rpmMax = Math.max(9000, ...traceSeries.rpm, 1);
  const steeringValue =
    sample?.driverInput.steering === null ||
    sample?.driverInput.steering === undefined
      ? "-"
      : `${(sample.driverInput.steering * 100).toFixed(0)}`;
  const lapTracePointCount = lapTrace.points.length;
  const activeLapNumber = lapTrace.lapNumber ?? sample?.lap.lapNumber ?? null;
  const lapTraceStatusLabel =
    lapTracePointCount > 0
      ? `${lapTracePointCount} points`
      : runMode === "Idle"
        ? "Standby"
        : "Priming";

  return (
    <section className="main-column">
      <div className="panel telemetry-stage">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">
              {runMode === "Replay"
                ? "Replay command feed"
                : "Pitwall live feed"}
            </div>
            <h2 className="panel-title">
              {activeSource?.displayName ?? "Telemetry bus idle"}
            </h2>
          </div>
          <div className="status-pill">
            <RadioTower size={16} />
            <span className="status-pill-value">
              {activeSource?.inputKind ?? "Awaiting signal"}
            </span>
          </div>
        </div>

        <div className="timing-strip">
          {stripItems.map((item) => (
            <StripCell key={item.label} {...item} />
          ))}
        </div>
      </div>

      <div className="panel lap-chart-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Lap telemetry</div>
            <h2 className="panel-title">Current lap speed</h2>
          </div>
          <div className="status-pill mono">
            <Activity size={16} />
            <span className="status-pill-value">
              lap {activeLapNumber ?? "-"} // {lapTraceStatusLabel}
            </span>
          </div>
        </div>
        <div className="panel-body">
          <LapTelemetryChart
            points={lapTrace.points}
            lapNumber={activeLapNumber}
            currentValue={sample?.vehicle.speedKph}
            isActive={runMode !== "Idle"}
          />
        </div>
      </div>

      <div className="panel trace-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Analysis workspace</div>
            <h2 className="panel-title">Synchronized live channels</h2>
          </div>
          <div className="status-pill mono">
            <Activity size={16} />
            {traceSeries.speed.length} samples
          </div>
        </div>
        <div className="panel-body trace-stack">
          <TraceLane
            label="Speed"
            value={formatNumber(sample?.vehicle.speedKph, 0)}
            unit="kph"
            values={traceSeries.speed}
            min={0}
            max={speedMax}
            color="var(--accent-cyan)"
          />
          <TraceLane
            label="RPM"
            value={formatNumber(sample?.vehicle.rpm, 0)}
            unit="rpm"
            values={traceSeries.rpm}
            min={0}
            max={rpmMax}
            color="var(--ink-strong)"
          />
          <TraceLane
            label="Throttle"
            value={formatNumber((sample?.driverInput.throttle ?? 0) * 100, 0)}
            unit="%"
            values={traceSeries.throttle}
            min={0}
            max={100}
            color="var(--accent-green)"
          />
          <TraceLane
            label="Brake"
            value={formatNumber((sample?.driverInput.brake ?? 0) * 100, 0)}
            unit="%"
            values={traceSeries.brake}
            min={0}
            max={100}
            color="var(--accent-amber)"
          />
          <TraceLane
            label="Steer"
            value={steeringValue}
            unit="%"
            values={traceSeries.steering}
            min={-100}
            max={100}
            centerValue={0}
            color="var(--accent-magenta)"
          />
        </div>
      </div>

      <div className="panel operator-context-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Operator context</div>
            <h2 className="panel-title">Current feed envelope</h2>
          </div>
        </div>
        <div className="panel-body operator-context-grid">
          <div className="context-line">
            <span className="panel-kicker">Track</span>
            <span>{sample?.track.trackName ?? "No circuit lock"}</span>
          </div>
          <div className="context-line">
            <span className="panel-kicker">Weather</span>
            <span>{sample?.track.weather ?? "No weather feed"}</span>
          </div>
          <div className="context-line">
            <span className="panel-kicker">Elapsed</span>
            <span className="mono">
              {formatTime(sample?.timing.sessionElapsed)}
            </span>
          </div>
          <div className="context-line">
            <span className="panel-kicker">Remaining</span>
            <span className="mono">
              {formatTime(sample?.timing.sessionRemaining)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
