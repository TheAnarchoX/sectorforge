import { memo } from "react";
import { formatNumber } from "../../utils/telemetryFormat";

const CHART_WIDTH = 860;
const CHART_HEIGHT = 248;
const CHART_PADDING = {
  top: 18,
  right: 18,
  bottom: 42,
  left: 56,
};
const GRID_TICK_COUNT = 4;

type LapTelemetryChartProps = {
  points: Array<{ elapsedSeconds: number; value: number }>;
  lapNumber: number | null;
  currentValue: number | null | undefined;
  isActive: boolean;
  referenceTrace?: {
    label: string;
    points: Array<{ elapsedSeconds: number; value: number }>;
  } | null;
};

function formatAxisSeconds(value: number) {
  const totalMinutes = Math.floor(value / 60);
  const seconds = value - totalMinutes * 60;

  return `${String(totalMinutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function formatAxisSpeed(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function getNiceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 2.5) {
    return 2.5 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function buildTicks(step: number) {
  return Array.from(
    { length: GRID_TICK_COUNT + 1 },
    (_, index) => index * step,
  );
}

export const LapTelemetryChart = memo(LapTelemetryChartImpl);

function LapTelemetryChartImpl({
  points,
  lapNumber,
  currentValue,
  isActive,
  referenceTrace = null,
}: LapTelemetryChartProps) {
  if (points.length === 0) {
    return (
      <div className="lap-chart-state" role="status" aria-live="polite">
        <div className="lap-chart-state-title">
          {isActive ? "Awaiting lap timer" : "Chart idle"}
        </div>
        <p className="lap-chart-state-message">
          {isActive
            ? "The chart will lock onto the current lap as soon as live samples report lap timing."
            : "Start fake telemetry or replay a stored capture to draw the current lap speed trace."}
        </p>
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="lap-chart-state" role="status" aria-live="polite">
        <div className="lap-chart-state-title">Collecting live lap samples</div>
        <p className="lap-chart-state-message">
          Building the first speed trace for lap {lapNumber ?? "-"}. Keep the
          run active for a few more samples.
        </p>
      </div>
    );
  }

  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const lastPoint = points[points.length - 1];
  const referencePoints = referenceTrace?.points ?? [];
  const hasReferenceTrace = referencePoints.length > 1;
  let maxElapsedSeconds = Math.max(lastPoint?.elapsedSeconds ?? 0, 5);
  if (hasReferenceTrace) {
    maxElapsedSeconds = Math.max(
      maxElapsedSeconds,
      referencePoints.at(-1)?.elapsedSeconds ?? 0,
    );
  }
  const xStep = getNiceStep(maxElapsedSeconds / GRID_TICK_COUNT);
  const maxX = Math.max(xStep * GRID_TICK_COUNT, maxElapsedSeconds);
  let rawMaxY = currentValue ?? 0;
  for (let i = 0; i < points.length; i += 1) {
    const value = points[i].value;
    if (value > rawMaxY) {
      rawMaxY = value;
    }
  }
  for (let i = 0; i < referencePoints.length; i += 1) {
    const value = referencePoints[i].value;
    if (value > rawMaxY) {
      rawMaxY = value;
    }
  }
  if (rawMaxY < 20) {
    rawMaxY = 20;
  }
  const yStep = getNiceStep(rawMaxY / GRID_TICK_COUNT);
  const maxY = Math.max(yStep * GRID_TICK_COUNT, 20);
  const xTicks = buildTicks(xStep);
  const yTicks = buildTicks(yStep).reverse();

  const toChartX = (elapsedSeconds: number) =>
    CHART_PADDING.left + (elapsedSeconds / maxX) * plotWidth;

  const toChartY = (value: number) =>
    CHART_PADDING.top + (1 - value / maxY) * plotHeight;

  const buildPathData = (
    chartPoints: Array<{ elapsedSeconds: number; value: number }>,
  ) =>
    chartPoints
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command} ${toChartX(point.elapsedSeconds).toFixed(2)} ${toChartY(point.value).toFixed(2)}`;
      })
      .join(" ");

  const pathData = buildPathData(points);
  const referencePathData = hasReferenceTrace
    ? buildPathData(referencePoints)
    : null;

  const latestPoint = points.at(-1)!;

  return (
    <section
      className="lap-chart-shell"
      aria-label="Current lap telemetry chart"
    >
      <div className="lap-chart-meta">
        <div className="lap-chart-legend">
          <span className="lap-chart-legend-swatch" aria-hidden="true" />
          <span>Speed trace</span>
          {referencePathData !== null && referenceTrace !== null && (
            <>
              <span
                className="lap-chart-legend-swatch lap-chart-reference-swatch"
                aria-hidden="true"
              />
              <span>{referenceTrace.label}</span>
            </>
          )}
        </div>
        <div className="lap-chart-caption mono">
          lap {lapNumber ?? "-"} // {points.length} points
        </div>
      </div>

      <div className="lap-chart-grid">
        <div className="lap-chart-y-axis">Speed (kph)</div>

        <div className="lap-chart-stage">
          <svg
            className="lap-chart-svg"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            role="img"
            aria-label={`Current lap speed trace${lapNumber === null ? "" : ` for lap ${lapNumber}`}`}
          >
            {yTicks.map((tick) => {
              const y = toChartY(tick);

              return (
                <g key={`y-${tick}`}>
                  <line
                    className="lap-chart-grid-line"
                    x1={CHART_PADDING.left}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="lap-chart-tick-label"
                    x={CHART_PADDING.left - 10}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {formatAxisSpeed(tick)}
                  </text>
                </g>
              );
            })}

            {xTicks.map((tick, index) => {
              const x = toChartX(tick);

              return (
                <g key={`x-${tick}`}>
                  <line
                    className="lap-chart-grid-line"
                    x1={x}
                    x2={x}
                    y1={CHART_PADDING.top}
                    y2={CHART_HEIGHT - CHART_PADDING.bottom}
                  />
                  <text
                    className="lap-chart-tick-label"
                    x={x}
                    y={CHART_HEIGHT - 12}
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === xTicks.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {formatAxisSeconds(tick)}
                  </text>
                </g>
              );
            })}

            <line
              className="lap-chart-axis-line"
              x1={CHART_PADDING.left}
              x2={CHART_PADDING.left}
              y1={CHART_PADDING.top}
              y2={CHART_HEIGHT - CHART_PADDING.bottom}
            />
            <line
              className="lap-chart-axis-line"
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={CHART_HEIGHT - CHART_PADDING.bottom}
              y2={CHART_HEIGHT - CHART_PADDING.bottom}
            />
            {referencePathData !== null && (
              <path
                className="lap-chart-reference-path"
                d={referencePathData}
              />
            )}
            <path className="lap-chart-path" d={pathData} />
            <circle
              className="lap-chart-point"
              cx={toChartX(latestPoint.elapsedSeconds)}
              cy={toChartY(latestPoint.value)}
              r={3.5}
            />
          </svg>
        </div>
      </div>

      <div className="lap-chart-footer">
        <span className="lap-chart-axis-label">Lap time</span>
        <span className="lap-chart-caption mono">
          {formatAxisSeconds(latestPoint.elapsedSeconds)} //{" "}
          {formatNumber(currentValue, 0)} kph
        </span>
      </div>
    </section>
  );
}
