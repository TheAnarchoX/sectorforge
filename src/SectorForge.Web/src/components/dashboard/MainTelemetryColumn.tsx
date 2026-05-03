import { memo } from "react";
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
import { SectorBar, StripCell, TraceLane } from "./DashboardPrimitives";

type MainTelemetryColumnProps = {
  activeSource: TelemetrySource | null;
  runMode: TelemetryRunMode;
  sample: TelemetrySample | null;
  traceSeries: TelemetryTraceSeries;
  lapTrace: CurrentLapTelemetrySeries;
};

type SectorTone = "neutral" | "improving" | "losing";

function maxValue(values: readonly number[], floor: number) {
  let max = floor;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value > max) {
      max = value;
    }
  }
  return max;
}

function MainTelemetryColumnComponent({
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

  const speedMax = maxValue(traceSeries.speed, 320);
  const rpmMax = maxValue(traceSeries.rpm, 9000);
  const steeringValue =
    sample?.driverInput.steering === null ||
    sample?.driverInput.steering === undefined
      ? "-"
      : `${(sample.driverInput.steering * 100).toFixed(0)}`;
  const lapTracePointCount = lapTrace.points.length;
  const activeLapNumber = lapTrace.lapNumber ?? sample?.lap.lapNumber ?? null;
  const lapTraceStatusLabel =
    lapTracePointCount > 0
      ? `${lapTracePointCount} pts`
      : runMode === "Idle"
        ? "Standby"
        : "Priming";

  const sourceLabel =
    activeSource?.displayName ??
    sample?.source.displayName ??
    "Telemetry bus idle";

  const sectorIndex = sample?.lap.sectorIndex ?? null;
  const sectorDelta = sample?.timing.sectorDelta;
  const liveSectorTone: SectorTone =
    sectorDelta && sectorDelta.startsWith("-")
      ? "improving"
      : sectorDelta && sectorDelta !== "0:00.000" && sectorDelta !== "+0:00.000"
        ? "losing"
        : "neutral";
  const sectorTones: [SectorTone, SectorTone, SectorTone] = [
    sectorIndex === 0 ? liveSectorTone : "neutral",
    sectorIndex === 1 ? liveSectorTone : "neutral",
    sectorIndex === 2 ? liveSectorTone : "neutral",
  ];

  return (
    <section className="main-column" aria-label="Live telemetry">
      <div className="zone zone-live">
        <div className="zone-bar">
          <div className="zone-bar-title">
            <span className="zone-kicker">
              {runMode === "Replay" ? "Replay feed" : "Live feed"}
            </span>
            <span className="zone-source">{sourceLabel}</span>
          </div>
          <div className="zone-bar-meta mono">
            <SectorBar activeIndex={sectorIndex} sectorTones={sectorTones} />
            <span className="zone-bar-input">
              {activeSource?.inputKind ?? "—"}
            </span>
          </div>
        </div>

        <div className="timing-strip">
          {stripItems.map((item) => (
            <StripCell key={item.label} {...item} />
          ))}
        </div>
      </div>

      <div className="zone zone-lap">
        <div className="zone-bar">
          <div className="zone-bar-title">
            <span className="zone-kicker">Lap telemetry</span>
            <span className="zone-source">Current lap speed trace</span>
          </div>
          <div className="zone-bar-meta mono">
            lap {activeLapNumber ?? "-"} · {lapTraceStatusLabel}
          </div>
        </div>
        <div className="zone-body">
          <LapTelemetryChart
            points={lapTrace.points}
            lapNumber={activeLapNumber}
            currentValue={sample?.vehicle.speedKph}
            isActive={runMode !== "Idle"}
          />
        </div>
      </div>

      <div className="zone zone-traces">
        <div className="zone-bar">
          <div className="zone-bar-title">
            <span className="zone-kicker">Channel scope</span>
            <span className="zone-source">
              Synchronized live channels — speed · rpm · throttle · brake ·
              steer
            </span>
          </div>
          <div className="zone-bar-meta mono">
            {traceSeries.speed.length} samples
          </div>
        </div>
        <div className="zone-body trace-stack">
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
    </section>
  );
}

export const MainTelemetryColumn = memo(MainTelemetryColumnComponent);
