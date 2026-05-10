import { memo, useMemo } from "react";
import type { TelemetrySessionDetails } from "../../types/telemetry";
import {
  buildSessionSummaryModel,
  formatLapSeconds,
  type SessionLapTimeBucket,
  type SessionSummaryModel,
  type SessionTyreUsagePoint,
} from "../../utils/sessionSummary";

type SessionSummaryPanelProps = {
  sessionDetails: TelemetrySessionDetails;
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 128;
const CHART_PADDING_X = 22;
const CHART_PADDING_TOP = 14;
const CHART_PADDING_BOTTOM = 28;

function formatConsistency(value: number | null) {
  return value === null ? "-" : `+/- ${value.toFixed(3)}s`;
}

function formatBucketLabel(bucket: SessionLapTimeBucket) {
  if (Math.abs(bucket.maxSeconds - bucket.minSeconds) < 0.001) {
    return formatLapSeconds(bucket.minSeconds);
  }

  return `${formatLapSeconds(bucket.minSeconds)}-${formatLapSeconds(
    bucket.maxSeconds,
  )}`;
}

function getTyreChartValue(point: SessionTyreUsagePoint, mode: string) {
  return mode === "wear" ? point.wearPercent : point.ageLaps;
}

function buildTyrePath(points: SessionTyreUsagePoint[], mode: string) {
  const values = points
    .map((point) => getTyreChartValue(point, mode))
    .filter(
      (value): value is number =>
        value !== null && value !== undefined && Number.isFinite(value),
    );

  if (values.length === 0) {
    return { path: "", markers: [] as Array<{ x: number; y: number }> };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(0.001, maxValue - minValue);
  const plotWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const lastIndex = Math.max(1, points.length - 1);

  const markers = points.flatMap((point, index) => {
    const value = getTyreChartValue(point, mode);
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return [];
    }

    const x = CHART_PADDING_X + (index / lastIndex) * plotWidth;
    const normalized = (value - minValue) / range;
    const y = CHART_PADDING_TOP + (1 - normalized) * plotHeight;

    return [{ x, y }];
  });

  return {
    path: markers
      .map(
        (marker, index) =>
          `${index === 0 ? "M" : "L"}${marker.x.toFixed(2)} ${marker.y.toFixed(
            2,
          )}`,
      )
      .join(" "),
    markers,
  };
}

function SessionMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="session-summary-metric">
      <div className="detail-label">{label}</div>
      <div className="session-summary-metric-value mono">{value}</div>
      <div className="table-subvalue muted">{note}</div>
    </div>
  );
}

function LapTimeHistogram({ model }: { model: SessionSummaryModel }) {
  const maxBucketCount = Math.max(
    1,
    ...model.lapTimeBuckets.map((bucket) => bucket.count),
  );

  if (model.lapTimeBuckets.length === 0) {
    return <div className="empty-chart compact">No completed lap times</div>;
  }

  return (
    <div
      className="session-summary-histogram"
      role="img"
      aria-label={`${model.lapCount} completed lap times grouped by pace`}
    >
      {model.lapTimeBuckets.map((bucket) => (
        <div
          className="session-summary-histogram-bucket"
          key={`${bucket.minSeconds}-${bucket.maxSeconds}`}
        >
          <div className="session-summary-histogram-bar-shell">
            <div
              className="session-summary-histogram-bar"
              style={{
                height: `${Math.max(12, (bucket.count / maxBucketCount) * 100)}%`,
              }}
            >
              <span className="mono">{bucket.count}</span>
            </div>
          </div>
          <div className="session-summary-histogram-label mono">
            {formatBucketLabel(bucket)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TyreUsageChart({ model }: { model: SessionSummaryModel }) {
  if (model.tyreUsageMode === "none" || model.tyreUsagePoints.length === 0) {
    return <div className="empty-chart compact">No tyre usage channel</div>;
  }

  const chart = buildTyrePath(model.tyreUsagePoints, model.tyreUsageMode);
  const label = model.tyreUsageMode === "wear" ? "Tyre wear" : "Tyre age";
  const unit = model.tyreUsageMode === "wear" ? "%" : "laps";

  return (
    <div className="session-summary-line-chart">
      <svg
        className="session-summary-line-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`${label} over ${model.tyreUsagePoints.length} stored samples`}
      >
        <line
          className="session-summary-chart-grid"
          x1={CHART_PADDING_X}
          x2={CHART_WIDTH - CHART_PADDING_X}
          y1={CHART_PADDING_TOP}
          y2={CHART_PADDING_TOP}
        />
        <line
          className="session-summary-chart-grid"
          x1={CHART_PADDING_X}
          x2={CHART_WIDTH - CHART_PADDING_X}
          y1={CHART_HEIGHT - CHART_PADDING_BOTTOM}
          y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
        />
        <path className="session-summary-line-path" d={chart.path} />
        {chart.markers.map((marker, index) => (
          <circle
            className="session-summary-line-marker"
            cx={marker.x}
            cy={marker.y}
            key={`${marker.x}-${marker.y}-${index}`}
            r={2.8}
          />
        ))}
        <text
          className="session-summary-chart-axis"
          x={CHART_PADDING_X}
          y={118}
        >
          Start
        </text>
        <text
          className="session-summary-chart-axis"
          x={CHART_WIDTH - CHART_PADDING_X}
          y={118}
          textAnchor="end"
        >
          Finish
        </text>
      </svg>
      <div className="session-summary-chart-caption">
        <span>{label}</span>
        <span className="mono">{unit}</span>
      </div>
    </div>
  );
}

export const SessionSummaryPanel = memo(function SessionSummaryPanel({
  sessionDetails,
}: SessionSummaryPanelProps) {
  const model = useMemo(
    () => buildSessionSummaryModel(sessionDetails),
    [sessionDetails],
  );
  const sessionLabel =
    sessionDetails.session.trackName ??
    sessionDetails.session.sourceName ??
    sessionDetails.session.game;
  const compoundLabel =
    model.tyreCompounds.length === 0
      ? "compound unknown"
      : model.tyreCompounds.join(" / ");

  return (
    <section className="session-detail-section session-summary-panel">
      <div className="session-detail-heading">
        <div>
          <div className="panel-kicker">Session Summary</div>
          <h3 className="panel-title">Performance snapshot</h3>
        </div>
        <div className="session-detail-note mono">{sessionLabel}</div>
      </div>

      <div className="session-summary-metric-grid">
        <SessionMetric
          label="Best lap"
          value={formatLapSeconds(model.bestLap?.seconds)}
          note={
            model.bestLap === null
              ? "No completed laps"
              : `Lap ${model.bestLap.lapNumber}`
          }
        />
        <SessionMetric
          label="Average lap"
          value={formatLapSeconds(model.averageLapSeconds)}
          note={`${model.lapCount} timed laps`}
        />
        <SessionMetric
          label="Consistency"
          value={formatConsistency(model.lapTimeStdDevSeconds)}
          note="lap time std dev"
        />
        <SessionMetric
          label="Tyres"
          value={
            model.tyreUsageMode === "wear"
              ? "Wear"
              : model.tyreUsageMode === "age"
                ? "Age"
                : "-"
          }
          note={compoundLabel}
        />
      </div>

      <div className="session-summary-visual-grid">
        <div className="session-summary-visual">
          <div className="session-summary-visual-heading">
            <span>Lap time distribution</span>
            <span className="mono">{model.lapCount} laps</span>
          </div>
          <LapTimeHistogram model={model} />
        </div>
        <div className="session-summary-visual">
          <div className="session-summary-visual-heading">
            <span>Tyre usage over time</span>
            <span className="mono">{model.tyreUsagePoints.length} samples</span>
          </div>
          <TyreUsageChart model={model} />
        </div>
      </div>
    </section>
  );
});
