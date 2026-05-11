import { memo, useMemo, useState, type CSSProperties } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { ReferenceLapChannelsState } from "../../hooks/useReferenceLapChannels";
import type {
  CurrentLapTelemetrySeries,
  ReferenceLapSelection,
  TelemetryRunMode,
  TelemetrySample,
  TelemetrySource,
  TelemetryTraceSeries,
} from "../../types/telemetry";
import {
  formatDelta,
  formatDeltaSeconds,
  formatGear,
  formatNumber,
  formatTime,
} from "../../utils/telemetryFormat";
import {
  buildLiveReferenceComparison,
  buildReferenceSpeedTrace,
  type LiveReferenceComparison,
  type LiveReferenceValueComparison,
} from "../../utils/liveReferenceComparison";
import { useSectorTones } from "../../hooks/useSectorTones";
import { LapTelemetryChart } from "./LapTelemetryChart";
import { SectorBar, StripCell, TraceLane } from "./DashboardPrimitives";

type MainTelemetryColumnProps = {
  activeSource: TelemetrySource | null;
  runMode: TelemetryRunMode;
  sample: TelemetrySample | null;
  traceSeries: TelemetryTraceSeries;
  lapTrace: CurrentLapTelemetrySeries;
  referenceLap: ReferenceLapSelection | null;
  referenceChannelsState: ReferenceLapChannelsState;
  onClearReferenceLap: () => void;
};

const GRID_TICK_COUNT = 4;

type TraceChannel = {
  key: keyof TelemetryTraceSeries;
  label: string;
  unit: string;
  color: string;
};

const TRACE_CHANNELS: TraceChannel[] = [
  { key: "speed", label: "Speed", unit: "kph", color: "var(--accent-cyan)" },
  { key: "rpm", label: "RPM", unit: "rpm", color: "var(--ink-strong)" },
  { key: "gear", label: "Gear", unit: "gear", color: "var(--accent-violet)" },
  {
    key: "throttle",
    label: "Throttle",
    unit: "%",
    color: "var(--accent-green)",
  },
  { key: "brake", label: "Brake", unit: "%", color: "var(--accent-amber)" },
  {
    key: "steering",
    label: "Steer",
    unit: "%",
    color: "var(--accent-magenta)",
  },
];

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

function getNiceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function getLapTraceXMax(points: CurrentLapTelemetrySeries["points"]) {
  const lastPoint = points.at(-1);
  const maxElapsedSeconds = Math.max(lastPoint?.elapsedSeconds ?? 0, 5);
  const xStep = getNiceStep(maxElapsedSeconds / GRID_TICK_COUNT);

  return Math.max(xStep * GRID_TICK_COUNT, maxElapsedSeconds);
}

function getReferenceLapLabel(referenceLap: ReferenceLapSelection) {
  return referenceLap.label || `Lap ${referenceLap.lapNumber}`;
}

function formatSignedValue(value: number, decimals: number, unit: string) {
  const threshold = decimals === 0 ? 0.5 : 0.5 / 10 ** decimals;
  if (Math.abs(value) < threshold) {
    return `0${unit}`;
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(decimals)}${unit}`;
}

function formatReferenceDelta(
  comparison: LiveReferenceValueComparison | null | undefined,
  decimals: number,
  unit: string,
) {
  return comparison === null || comparison === undefined
    ? null
    : `REF ${formatSignedValue(comparison.delta, decimals, unit)}`;
}

function formatReferenceLapDelta(comparison: LiveReferenceComparison | null) {
  return comparison?.lapDeltaSeconds === null ||
    comparison?.lapDeltaSeconds === undefined
    ? null
    : `REF ${formatDeltaSeconds(comparison.lapDeltaSeconds)}`;
}

function getReferenceStatusLabel(state: ReferenceLapChannelsState) {
  switch (state.status) {
    case "loading":
      return "loading";
    case "error":
      return "unavailable";
    case "idle":
    case "ready":
    default:
      return null;
  }
}

function getTraceReference(
  comparison: LiveReferenceComparison | null,
  channel: keyof TelemetryTraceSeries,
) {
  switch (channel) {
    case "speed":
      return formatReferenceDelta(comparison?.values.speedKph, 0, " kph");
    case "rpm":
      return formatReferenceDelta(comparison?.values.rpm, 0, " rpm");
    case "gear":
      return null;
    case "throttle":
      return formatReferenceDelta(comparison?.values.throttlePct, 0, "%");
    case "brake":
      return formatReferenceDelta(comparison?.values.brakePct, 0, "%");
    case "steering":
      return formatReferenceDelta(comparison?.values.steeringPct, 0, "%");
  }
}

function MainTelemetryColumnComponent({
  activeSource,
  runMode,
  sample,
  traceSeries,
  lapTrace,
  referenceLap,
  referenceChannelsState,
  onClearReferenceLap,
}: MainTelemetryColumnProps) {
  const [isChannelScopeExpanded, setIsChannelScopeExpanded] = useState(false);
  const [traceCursorRatio, setTraceCursorRatio] = useState<number | null>(null);
  const referenceResponse =
    referenceChannelsState.status === "ready"
      ? referenceChannelsState.response
      : null;
  const { sectorTones } = useSectorTones(sample);
  const liveReferenceComparison = useMemo(
    () =>
      sample === null || referenceResponse === null
        ? null
        : buildLiveReferenceComparison(sample, referenceResponse),
    [referenceResponse, sample],
  );
  const referenceSpeedTrace = useMemo(
    () =>
      referenceLap === null || referenceResponse === null
        ? null
        : {
            label: `Ref L${referenceLap.lapNumber}`,
            points: buildReferenceSpeedTrace(referenceResponse),
          },
    [referenceLap, referenceResponse],
  );
  const referenceStatusLabel = getReferenceStatusLabel(referenceChannelsState);
  const traceElapsedSeconds = useMemo(
    () => lapTrace.points.map((point) => point.elapsedSeconds),
    [lapTrace.points],
  );
  const traceXMax = getLapTraceXMax(lapTrace.points);
  const hasAlignedTraceDomain =
    traceElapsedSeconds.length === traceSeries.speed.length;
  const stripItems = [
    {
      label: "Lap",
      value: formatTime(sample?.lap.currentLapTime),
      unit: `lap ${sample?.lap.lapNumber ?? "-"}`,
      reference: formatReferenceLapDelta(liveReferenceComparison),
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
      reference: formatReferenceDelta(
        liveReferenceComparison?.values.speedKph,
        0,
        " kph",
      ),
      tone: "accent" as const,
    },
    {
      label: "RPM",
      value: formatNumber(sample?.vehicle.rpm, 0),
      unit: "rev/min",
      reference: formatReferenceDelta(
        liveReferenceComparison?.values.rpm,
        0,
        " rpm",
      ),
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
  const gearMax = maxValue(traceSeries.gear, 8);
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
            {referenceLap !== null && (
              <span
                className={`live-reference-chip live-reference-chip-${referenceStatusLabel ?? "idle"}`}
              >
                <span>REF L{referenceLap.lapNumber}</span>
                {referenceStatusLabel !== null && (
                  <span className="live-reference-chip-status">
                    {referenceStatusLabel}
                  </span>
                )}
                <button
                  type="button"
                  className="live-reference-clear"
                  aria-label={`Clear live reference ${getReferenceLapLabel(referenceLap)}`}
                  title="Clear live reference"
                  onClick={onClearReferenceLap}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            )}
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
            referenceTrace={referenceSpeedTrace}
            cursorRatio={traceCursorRatio}
            onCursorRatioChange={setTraceCursorRatio}
            onCursorClear={() => setTraceCursorRatio(null)}
          />
        </div>
      </div>

      <div className="zone zone-traces">
        <div className="zone-bar">
          <div className="zone-bar-title">
            <span className="zone-kicker">Channel scope</span>
            <span className="zone-source">
              Synchronized live channels — speed · rpm · gear · throttle · brake
              · steer
            </span>
          </div>
          <div className="zone-bar-meta mono">
            <span>{traceSeries.speed.length} samples</span>
            <button
              type="button"
              className={`icon-button trace-expand-button${isChannelScopeExpanded ? " active" : ""}`}
              aria-pressed={isChannelScopeExpanded}
              title={
                isChannelScopeExpanded
                  ? "Collapse channel scope graphs"
                  : "Expand channel scope graphs"
              }
              onClick={() => setIsChannelScopeExpanded((current) => !current)}
            >
              {isChannelScopeExpanded ? (
                <Minimize2 size={13} aria-hidden="true" />
              ) : (
                <Maximize2 size={13} aria-hidden="true" />
              )}
              {isChannelScopeExpanded ? "Compact" : "Expand"}
            </button>
          </div>
        </div>
        <div
          className={`zone-body trace-scope-body${isChannelScopeExpanded ? " trace-scope-body-expanded" : ""}`}
        >
          {isChannelScopeExpanded && (
            <ul
              className="trace-channel-legend"
              aria-label="Channel scope legend"
            >
              {TRACE_CHANNELS.map((channel) => (
                <li className="trace-channel-legend-item" key={channel.key}>
                  <span
                    className="trace-channel-legend-swatch"
                    style={{ "--trace-color": channel.color } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span>{channel.label}</span>
                  <span className="mono">{channel.unit}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="trace-stack">
            <TraceLane
              label="Speed"
              value={formatNumber(sample?.vehicle.speedKph, 0)}
              unit="kph"
              values={traceSeries.speed}
              xValues={hasAlignedTraceDomain ? traceElapsedSeconds : undefined}
              xMax={hasAlignedTraceDomain ? traceXMax : null}
              min={0}
              max={speedMax}
              color="var(--accent-cyan)"
              reference={getTraceReference(liveReferenceComparison, "speed")}
              cursorRatio={traceCursorRatio}
              onCursorRatioChange={setTraceCursorRatio}
              onCursorClear={() => setTraceCursorRatio(null)}
              expanded={isChannelScopeExpanded}
            />
            <TraceLane
              label="RPM"
              value={formatNumber(sample?.vehicle.rpm, 0)}
              unit="rpm"
              values={traceSeries.rpm}
              xValues={hasAlignedTraceDomain ? traceElapsedSeconds : undefined}
              xMax={hasAlignedTraceDomain ? traceXMax : null}
              min={0}
              max={rpmMax}
              color="var(--ink-strong)"
              reference={getTraceReference(liveReferenceComparison, "rpm")}
              cursorRatio={traceCursorRatio}
              onCursorRatioChange={setTraceCursorRatio}
              onCursorClear={() => setTraceCursorRatio(null)}
              expanded={isChannelScopeExpanded}
            />
            <TraceLane
              label="Gear"
              value={formatGear(sample?.vehicle.gear)}
              unit="gear"
              values={traceSeries.gear}
              xValues={hasAlignedTraceDomain ? traceElapsedSeconds : undefined}
              xMax={hasAlignedTraceDomain ? traceXMax : null}
              min={0}
              max={gearMax}
              color="var(--accent-violet)"
              reference={getTraceReference(liveReferenceComparison, "gear")}
              cursorRatio={traceCursorRatio}
              onCursorRatioChange={setTraceCursorRatio}
              onCursorClear={() => setTraceCursorRatio(null)}
              expanded={isChannelScopeExpanded}
            />
            <TraceLane
              label="Throttle"
              value={formatNumber((sample?.driverInput.throttle ?? 0) * 100, 0)}
              unit="%"
              values={traceSeries.throttle}
              xValues={hasAlignedTraceDomain ? traceElapsedSeconds : undefined}
              xMax={hasAlignedTraceDomain ? traceXMax : null}
              min={0}
              max={100}
              color="var(--accent-green)"
              reference={getTraceReference(liveReferenceComparison, "throttle")}
              cursorRatio={traceCursorRatio}
              onCursorRatioChange={setTraceCursorRatio}
              onCursorClear={() => setTraceCursorRatio(null)}
              expanded={isChannelScopeExpanded}
            />
            <TraceLane
              label="Brake"
              value={formatNumber((sample?.driverInput.brake ?? 0) * 100, 0)}
              unit="%"
              values={traceSeries.brake}
              xValues={hasAlignedTraceDomain ? traceElapsedSeconds : undefined}
              xMax={hasAlignedTraceDomain ? traceXMax : null}
              min={0}
              max={100}
              color="var(--accent-amber)"
              reference={getTraceReference(liveReferenceComparison, "brake")}
              cursorRatio={traceCursorRatio}
              onCursorRatioChange={setTraceCursorRatio}
              onCursorClear={() => setTraceCursorRatio(null)}
              expanded={isChannelScopeExpanded}
            />
            <TraceLane
              label="Steer"
              value={steeringValue}
              unit="%"
              values={traceSeries.steering}
              xValues={hasAlignedTraceDomain ? traceElapsedSeconds : undefined}
              xMax={hasAlignedTraceDomain ? traceXMax : null}
              min={-100}
              max={100}
              centerValue={0}
              color="var(--accent-magenta)"
              reference={getTraceReference(liveReferenceComparison, "steering")}
              cursorRatio={traceCursorRatio}
              onCursorRatioChange={setTraceCursorRatio}
              onCursorClear={() => setTraceCursorRatio(null)}
              expanded={isChannelScopeExpanded}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export const MainTelemetryColumn = memo(MainTelemetryColumnComponent);
