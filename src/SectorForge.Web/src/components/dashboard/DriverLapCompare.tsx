import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { GitCompareArrows, LoaderCircle } from "lucide-react";
import {
  getLapChannelsForBasketEntry,
  getSessionDetails,
} from "../../api/telemetryApi";
import type {
  CurrentLapTelemetrySeries,
  LapChannelsResponse,
  LapSummary,
  TelemetrySample,
  TelemetrySessionDetails,
  TelemetrySessionSummary,
} from "../../types/telemetry";
import {
  buildDeltaTimeModel,
  type DeltaSeriesInput,
  type DeltaTimePoint,
  type DeltaTimeTrace,
} from "../../utils/lapDelta";
import {
  formatDeltaSeconds,
  formatShortTimestamp,
  formatTime,
  parseDurationSeconds,
} from "../../utils/telemetryFormat";

type DriverLapCompareProps = {
  sample: TelemetrySample;
  lapTrace: CurrentLapTelemetrySeries;
  sessions: TelemetrySessionSummary[];
};

type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

type DriverCompareSeries = {
  id: string;
  label: string;
  color: string;
  time: Array<number | null>;
  speedKph: Array<number | null>;
  lapDistance?: Array<number | null> | null;
};

type OverlayTrace = {
  id: string;
  label: string;
  color: string;
  pathData: string;
};

type OverlayChartModel = {
  traces: OverlayTrace[];
  xAxisLabel: string;
  xTicks: number[];
  yTicks: number[];
  formatXTick: (value: number) => string;
  toChartX: (value: number) => number;
  toChartY: (value: number) => number;
};

type DeltaSegmentTone = "gain" | "loss" | "neutral";

type DeltaSegment = {
  from: DeltaTimePoint;
  to: DeltaTimePoint;
  tone: DeltaSegmentTone;
};

type DriverDeltaChartModel = {
  trace: DeltaTimeTrace;
  segments: DeltaSegment[];
  xTicks: number[];
  yTicks: number[];
  toChartX: (value: number) => number;
  toChartY: (value: number) => number;
};

const LIVE_SERIES_ID = "current-live-lap";
const REFERENCE_COLOR = "#63b8d6";
const LIVE_COLOR = "#d9b04a";
const CHART_WIDTH = 860;
const OVERLAY_HEIGHT = 220;
const DELTA_HEIGHT = 180;
const CHART_PADDING = {
  top: 20,
  right: 20,
  bottom: 42,
  left: 58,
};
const GRID_TICK_COUNT = 4;
const DELTA_TONE_EPSILON = 0.0005;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Reference lap unavailable";
}

function getSessionOptionLabel(session: TelemetrySessionSummary) {
  const title = session.trackName ?? session.game;
  return `${title} / ${formatShortTimestamp(session.startedAt)}`;
}

function getCurrentSessionSummary(
  sample: TelemetrySample,
): TelemetrySessionSummary {
  return {
    id: sample.session.id,
    game: sample.source.game,
    sourceName: sample.source.displayName,
    trackName: sample.track.trackName ?? null,
    carName: sample.vehicle.carName ?? null,
    startedAt: sample.session.startedAt,
    lastSeenAt: sample.timestamp,
    bestLapTime: sample.lap.bestLapTime ?? null,
    sampleCount: 0,
  };
}

function buildSessionOptions(
  sample: TelemetrySample,
  sessions: TelemetrySessionSummary[],
) {
  const seen = new Set<string>();
  const options: TelemetrySessionSummary[] = [];

  for (const session of [getCurrentSessionSummary(sample), ...sessions]) {
    if (seen.has(session.id)) {
      continue;
    }

    options.push(session);
    seen.add(session.id);
  }

  return options;
}

function getLapSeconds(lap: LapSummary) {
  return parseDurationSeconds(lap.lapTime);
}

function getReferenceCandidates(
  details: TelemetrySessionDetails | null,
  currentLapNumber: number | null,
) {
  const laps = details?.laps ?? [];
  const completeLaps = laps.filter((lap) => getLapSeconds(lap) !== null);
  const historicalLaps = completeLaps.filter(
    (lap) => lap.lapNumber !== currentLapNumber,
  );

  return historicalLaps.length > 0 ? historicalLaps : completeLaps;
}

function pickDefaultReferenceLap(laps: LapSummary[]) {
  let bestLap: LapSummary | null = null;
  let bestSeconds = Number.POSITIVE_INFINITY;

  for (const lap of laps) {
    const seconds = getLapSeconds(lap);
    if (seconds !== null && seconds < bestSeconds) {
      bestLap = lap;
      bestSeconds = seconds;
    }
  }

  return bestLap ?? laps[0] ?? null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasUsableDistance(values: Array<number | null> | null | undefined) {
  return Array.isArray(values) && values.some(isFiniteNumber);
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

function buildAxisTicks(min: number, max: number) {
  const span = Math.max(max - min, Number.EPSILON);
  const step = getNiceStep(span / GRID_TICK_COUNT);
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];

  for (let index = 0; index <= GRID_TICK_COUNT + 1; index += 1) {
    const tick = start + index * step;
    if (tick > max + step / 2) {
      break;
    }

    ticks.push(tick);
  }

  return ticks;
}

function formatChartSeconds(value: number) {
  const totalMinutes = Math.floor(value / 60);
  const seconds = value - totalMinutes * 60;
  return `${String(totalMinutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function buildReferenceSeries(response: LapChannelsResponse) {
  return {
    id: "reference-lap",
    label: `Reference lap ${response.lapNumber}`,
    color: REFERENCE_COLOR,
    time: response.channels.time,
    speedKph: response.channels.speedKph,
    lapDistance: response.channels.lapDistance,
  } satisfies DriverCompareSeries;
}

function buildLiveSeries(
  sample: TelemetrySample,
  lapTrace: CurrentLapTelemetrySeries,
) {
  return {
    id: LIVE_SERIES_ID,
    label: `Current lap ${sample.lap.lapNumber ?? "-"}`,
    color: LIVE_COLOR,
    time: lapTrace.points.map((point) => point.elapsedSeconds),
    speedKph: lapTrace.points.map((point) => point.value),
    lapDistance: lapTrace.points.map(
      (point) => point.lapDistanceMeters ?? null,
    ),
  } satisfies DriverCompareSeries;
}

function buildOverlayChartModel(
  series: DriverCompareSeries[],
): OverlayChartModel | null {
  const allHaveDistance = series.every((candidate) =>
    hasUsableDistance(candidate.lapDistance),
  );
  const xAxis = allHaveDistance ? "lapDistance" : "time";
  const chartSeries: Array<{
    id: string;
    label: string;
    color: string;
    points: Array<{ x: number; y: number }>;
  }> = [];
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (const candidate of series) {
    const xValues =
      xAxis === "lapDistance" ? (candidate.lapDistance ?? []) : candidate.time;
    const yValues = candidate.speedKph;
    const sampleCount = Math.min(xValues.length, yValues.length);
    const points: Array<{ x: number; y: number }> = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const x = xValues[index];
      const y = yValues[index];
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        continue;
      }

      points.push({ x, y });
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }

    if (points.length >= 2) {
      chartSeries.push({
        id: candidate.id,
        label: candidate.label,
        color: candidate.color,
        points,
      });
    }
  }

  if (
    chartSeries.length === 0 ||
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  ) {
    return null;
  }

  if (xMin === xMax) {
    xMax = xMin + 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  } else {
    const yPad = (yMax - yMin) * 0.05;
    yMin -= yPad;
    yMax += yPad;
  }

  const xTicks = buildAxisTicks(xMin, xMax);
  const yTicks = buildAxisTicks(yMin, yMax);
  const finalXMin = Math.min(xMin, xTicks[0] ?? xMin);
  const finalXMax = Math.max(xMax, xTicks[xTicks.length - 1] ?? xMax);
  const finalYMin = Math.min(yMin, yTicks[0] ?? yMin);
  const finalYMax = Math.max(yMax, yTicks[yTicks.length - 1] ?? yMax);
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = OVERLAY_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const xRange = Math.max(finalXMax - finalXMin, Number.EPSILON);
  const yRange = Math.max(finalYMax - finalYMin, Number.EPSILON);
  const toChartX = (value: number) =>
    CHART_PADDING.left + ((value - finalXMin) / xRange) * plotWidth;
  const toChartY = (value: number) =>
    CHART_PADDING.top + (1 - (value - finalYMin) / yRange) * plotHeight;

  return {
    traces: chartSeries.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      color: candidate.color,
      pathData: candidate.points
        .map((point, index) => {
          const command = index === 0 ? "M" : "L";
          return `${command} ${toChartX(point.x).toFixed(2)} ${toChartY(point.y).toFixed(2)}`;
        })
        .join(" "),
    })),
    xAxisLabel: xAxis === "lapDistance" ? "Lap distance (m)" : "Lap time",
    xTicks,
    yTicks: [...yTicks].reverse(),
    formatXTick:
      xAxis === "lapDistance"
        ? (value: number) => `${Math.round(value)}`
        : formatChartSeconds,
    toChartX,
    toChartY,
  };
}

function toDeltaSeriesInput(series: DriverCompareSeries): DeltaSeriesInput {
  return {
    id: series.id,
    label: series.label,
    color: series.color,
    time: series.time,
    lapDistance: series.lapDistance,
  };
}

function getDeltaTone(deltaSeconds: number): DeltaSegmentTone {
  if (deltaSeconds > DELTA_TONE_EPSILON) return "loss";
  if (deltaSeconds < -DELTA_TONE_EPSILON) return "gain";
  return "neutral";
}

function createZeroCrossingPoint(
  first: DeltaTimePoint,
  second: DeltaTimePoint,
) {
  const denominator =
    Math.abs(first.deltaSeconds) + Math.abs(second.deltaSeconds);
  const ratio =
    denominator === 0 ? 0 : Math.abs(first.deltaSeconds) / denominator;

  return {
    distanceMeters:
      first.distanceMeters +
      (second.distanceMeters - first.distanceMeters) * ratio,
    deltaSeconds: 0,
  } satisfies DeltaTimePoint;
}

function buildDeltaSegments(points: DeltaTimePoint[]) {
  const segments: DeltaSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (previous === undefined || next === undefined) {
      continue;
    }

    const previousTone = getDeltaTone(previous.deltaSeconds);
    const nextTone = getDeltaTone(next.deltaSeconds);
    if (
      previousTone !== nextTone &&
      previousTone !== "neutral" &&
      nextTone !== "neutral"
    ) {
      const zeroPoint = createZeroCrossingPoint(previous, next);
      segments.push({ from: previous, to: zeroPoint, tone: previousTone });
      segments.push({ from: zeroPoint, to: next, tone: nextTone });
      continue;
    }

    segments.push({
      from: previous,
      to: next,
      tone: nextTone === "neutral" ? previousTone : nextTone,
    });
  }

  return segments;
}

function buildDeltaChartModel(
  reference: DriverCompareSeries,
  live: DriverCompareSeries,
): DriverDeltaChartModel | null {
  if (!hasUsableDistance(reference.lapDistance)) {
    return null;
  }

  if (!hasUsableDistance(live.lapDistance)) {
    return null;
  }

  const deltaModel = buildDeltaTimeModel(toDeltaSeriesInput(reference), [
    toDeltaSeriesInput(live),
  ]);
  const trace = deltaModel?.traces[0] ?? null;
  if (trace === null || trace.points.length < 2) {
    return null;
  }

  const maxDistance = Math.max(
    1,
    ...trace.points.map((point) => point.distanceMeters),
  );
  const maxAbsDelta = Math.max(
    0.1,
    ...trace.points.map((point) => Math.abs(point.deltaSeconds)),
  );
  const yStep = getNiceStep(maxAbsDelta / 2);
  const yMax = Math.max(yStep * 2, maxAbsDelta);
  const yTicks = [yMax, yStep, 0, -yStep, -yMax];
  const xTicks = buildAxisTicks(0, maxDistance);
  const finalXMax = Math.max(maxDistance, xTicks[xTicks.length - 1] ?? 1);
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = DELTA_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const yRange = Math.max(yMax * 2, Number.EPSILON);

  return {
    trace,
    segments: buildDeltaSegments(trace.points),
    xTicks,
    yTicks,
    toChartX: (value: number) =>
      CHART_PADDING.left + (value / finalXMax) * plotWidth,
    toChartY: (value: number) =>
      CHART_PADDING.top + ((yMax - value) / yRange) * plotHeight,
  };
}

function getLatestDelta(model: DriverDeltaChartModel | null) {
  const points = model?.trace.points;
  return points === undefined ? null : (points[points.length - 1] ?? null);
}

export function DriverLapCompare({
  sample,
  lapTrace,
  sessions,
}: DriverLapCompareProps) {
  const sessionOptions = useMemo(
    () => buildSessionOptions(sample, sessions),
    [sample, sessions],
  );
  const currentLapNumber = sample.lap.lapNumber ?? null;
  const [selectedSessionId, setSelectedSessionId] = useState(
    () => sample.session.id,
  );
  const [detailsState, setDetailsState] = useState<
    LoadState<TelemetrySessionDetails>
  >({ status: "idle" });
  const [selectedReferenceLapNumber, setSelectedReferenceLapNumber] = useState<
    number | null
  >(null);
  const [channelsState, setChannelsState] = useState<
    LoadState<LapChannelsResponse>
  >({ status: "idle" });

  useEffect(() => {
    const abortController = new AbortController();
    // Syncs request lifecycle into the view state for the selected session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailsState({ status: "loading" });

    getSessionDetails(selectedSessionId, { signal: abortController.signal })
      .then((details) => {
        setDetailsState({ status: "ready", value: details });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setDetailsState({ status: "error", message: getErrorMessage(error) });
      });

    return () => abortController.abort();
  }, [selectedSessionId]);

  const details = detailsState.status === "ready" ? detailsState.value : null;
  const referenceCandidates = useMemo(
    () => getReferenceCandidates(details, currentLapNumber),
    [currentLapNumber, details],
  );
  const referenceLapNumber = useMemo(() => {
    if (referenceCandidates.length === 0) {
      return null;
    }

    const selectedReferenceExists = referenceCandidates.some(
      (lap) => lap.lapNumber === selectedReferenceLapNumber,
    );
    if (selectedReferenceExists) {
      return selectedReferenceLapNumber;
    }

    return pickDefaultReferenceLap(referenceCandidates)?.lapNumber ?? null;
  }, [referenceCandidates, selectedReferenceLapNumber]);

  useEffect(() => {
    if (referenceLapNumber === null) {
      // Keeps channel status aligned when the selected session has no laps.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChannelsState({ status: "idle" });
      return;
    }

    let isCancelled = false;
    setChannelsState({ status: "loading" });

    void getLapChannelsForBasketEntry({
      sessionId: selectedSessionId,
      lapNumber: referenceLapNumber,
    })
      .then((response) => {
        if (!isCancelled) {
          setChannelsState({ status: "ready", value: response });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setChannelsState({
            status: "error",
            message: getErrorMessage(error),
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [referenceLapNumber, selectedSessionId]);

  const referenceResponse =
    channelsState.status === "ready" ? channelsState.value : null;
  const referenceSeries = useMemo(
    () =>
      referenceResponse === null
        ? null
        : buildReferenceSeries(referenceResponse),
    [referenceResponse],
  );
  const liveSeries = useMemo(
    () => buildLiveSeries(sample, lapTrace),
    [lapTrace, sample],
  );
  const overlayModel = useMemo(
    () =>
      referenceSeries === null
        ? null
        : buildOverlayChartModel([referenceSeries, liveSeries]),
    [liveSeries, referenceSeries],
  );
  const deltaModel = useMemo(
    () =>
      referenceSeries === null
        ? null
        : buildDeltaChartModel(referenceSeries, liveSeries),
    [liveSeries, referenceSeries],
  );
  const latestDelta = getLatestDelta(deltaModel);
  const selectedSession = sessionOptions.find(
    (session) => session.id === selectedSessionId,
  );

  const handleSessionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSessionId(event.target.value);
    setSelectedReferenceLapNumber(null);
  };

  const handleReferenceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLapNumber = Number(event.target.value);
    setSelectedReferenceLapNumber(
      Number.isInteger(nextLapNumber) && nextLapNumber > 0
        ? nextLapNumber
        : null,
    );
  };

  return (
    <section className="hud-compare" aria-label="Driver lap comparison">
      <header className="zone-bar hud-compare-bar">
        <div className="zone-bar-title">
          <span className="zone-kicker">Lap compare</span>
          <span className="zone-source">
            <GitCompareArrows size={13} /> Live vs reference
          </span>
        </div>
        <div className="zone-bar-meta mono">
          {latestDelta === null
            ? `${lapTrace.points.length} live pts`
            : `${formatDeltaSeconds(latestDelta.deltaSeconds)} at ${Math.round(
                latestDelta.distanceMeters,
              ).toLocaleString()} m`}
        </div>
      </header>

      <div className="hud-compare-controls">
        <label className="compare-overlay-channel-control">
          <span className="compare-overlay-channel-control-label">Session</span>
          <select
            className="compare-overlay-channel-select"
            aria-label="Reference session"
            value={selectedSessionId}
            onChange={handleSessionChange}
          >
            {sessionOptions.map((session) => (
              <option key={session.id} value={session.id}>
                {getSessionOptionLabel(session)}
              </option>
            ))}
          </select>
        </label>
        <label className="compare-overlay-channel-control">
          <span className="compare-overlay-channel-control-label">
            Reference
          </span>
          <select
            className="compare-overlay-channel-select"
            aria-label="Reference lap"
            value={referenceLapNumber ?? ""}
            onChange={handleReferenceChange}
            disabled={referenceCandidates.length === 0}
          >
            {referenceCandidates.length === 0 && (
              <option value="">No completed laps</option>
            )}
            {referenceCandidates.map((lap) => (
              <option key={lap.lapNumber} value={lap.lapNumber}>
                Lap {lap.lapNumber} / {formatTime(lap.lapTime)}
              </option>
            ))}
          </select>
        </label>
        <div className="hud-compare-context">
          <span>
            {selectedSession?.trackName ??
              sample.track.trackName ??
              "Track pending"}
          </span>
          <span className="mono">
            current lap {sample.lap.lapNumber ?? "-"} / ref{" "}
            {referenceLapNumber ?? "-"}
          </span>
        </div>
      </div>

      {detailsState.status === "loading" && (
        <DriverCompareStatus message="Loading session laps" busy />
      )}
      {detailsState.status === "error" && (
        <DriverCompareStatus message={detailsState.message} />
      )}
      {detailsState.status === "ready" && referenceCandidates.length === 0 && (
        <DriverCompareStatus message="Complete a lap in the selected session before using it as a reference." />
      )}
      {channelsState.status === "loading" && referenceCandidates.length > 0 && (
        <DriverCompareStatus message="Loading reference lap channels" busy />
      )}
      {channelsState.status === "error" && (
        <DriverCompareStatus message={channelsState.message} />
      )}

      {referenceSeries !== null && (
        <>
          <DriverSpeedOverlayChart model={overlayModel} />
          <DriverDeltaPlot
            model={deltaModel}
            referenceLabel={referenceSeries.label}
          />
        </>
      )}
    </section>
  );
}

function DriverCompareStatus({
  message,
  busy = false,
}: {
  message: string;
  busy?: boolean;
}) {
  return (
    <div
      className="compare-overlay-placeholder hud-compare-status"
      role="status"
    >
      {busy && <LoaderCircle size={13} aria-hidden="true" />}
      {message}
    </div>
  );
}

function DriverSpeedOverlayChart({
  model,
}: {
  model: OverlayChartModel | null;
}) {
  if (model === null) {
    return (
      <section
        className="compare-overlay-chart"
        aria-label="Driver speed overlay"
      >
        <header className="compare-overlay-header">
          <div className="compare-overlay-title">
            <span className="zone-kicker">Overlay</span>
            <span className="compare-overlay-channel-label">Speed</span>
          </div>
        </header>
        <div className="compare-overlay-placeholder" role="status">
          Live and reference speed need at least two samples before the overlay
          can draw.
        </div>
      </section>
    );
  }

  return (
    <section
      className="compare-overlay-chart"
      aria-label="Driver speed overlay"
    >
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Overlay</span>
          <span className="compare-overlay-channel-label">Speed</span>
        </div>
        <span className="compare-delta-reference mono">{model.xAxisLabel}</span>
      </header>
      <div className="compare-overlay-stage">
        <svg
          className="compare-overlay-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${OVERLAY_HEIGHT}`}
          role="img"
          aria-label="Driver View live speed overlay against reference lap"
        >
          {model.yTicks.map((tick) => {
            const y = model.toChartY(tick);
            return (
              <g key={`driver-y-${tick}`}>
                <line
                  className="compare-overlay-grid-line"
                  x1={CHART_PADDING.left}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y1={y}
                  y2={y}
                />
                <text
                  className="compare-overlay-tick"
                  x={CHART_PADDING.left - 10}
                  y={y + 4}
                  textAnchor="end"
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}
          {model.xTicks.map((tick, index) => {
            const x = model.toChartX(tick);
            return (
              <g key={`driver-x-${tick}-${index}`}>
                <line
                  className="compare-overlay-grid-line"
                  x1={x}
                  x2={x}
                  y1={CHART_PADDING.top}
                  y2={OVERLAY_HEIGHT - CHART_PADDING.bottom}
                />
                <text
                  className="compare-overlay-tick"
                  x={x}
                  y={OVERLAY_HEIGHT - 14}
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === model.xTicks.length - 1
                        ? "end"
                        : "middle"
                  }
                >
                  {model.formatXTick(tick)}
                </text>
              </g>
            );
          })}
          <line
            className="compare-overlay-axis-line"
            x1={CHART_PADDING.left}
            x2={CHART_PADDING.left}
            y1={CHART_PADDING.top}
            y2={OVERLAY_HEIGHT - CHART_PADDING.bottom}
          />
          <line
            className="compare-overlay-axis-line"
            x1={CHART_PADDING.left}
            x2={CHART_WIDTH - CHART_PADDING.right}
            y1={OVERLAY_HEIGHT - CHART_PADDING.bottom}
            y2={OVERLAY_HEIGHT - CHART_PADDING.bottom}
          />
          {model.traces.map((trace) => (
            <path
              key={trace.id}
              className="compare-overlay-trace"
              style={{ "--lap-color": trace.color } as CSSProperties}
              d={trace.pathData}
            />
          ))}
          <text
            className="compare-overlay-axis-label"
            x={CHART_PADDING.left}
            y={OVERLAY_HEIGHT - 2}
          >
            {model.xAxisLabel}
          </text>
          <text
            className="compare-overlay-axis-label"
            x={CHART_PADDING.left - 10}
            y={CHART_PADDING.top - 6}
            textAnchor="end"
          >
            Speed (kph)
          </text>
        </svg>
      </div>
      <ul className="compare-overlay-legend" aria-label="Driver overlay legend">
        {model.traces.map((trace) => (
          <li className="compare-overlay-legend-item" key={trace.id}>
            <span
              className="compare-overlay-legend-swatch"
              style={{ "--lap-color": trace.color } as CSSProperties}
              aria-hidden="true"
            />
            <span className="compare-overlay-legend-label">{trace.label}</span>
            {trace.id !== LIVE_SERIES_ID && (
              <span className="compare-overlay-legend-badge">REF</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DriverDeltaPlot({
  model,
  referenceLabel,
}: {
  model: DriverDeltaChartModel | null;
  referenceLabel: string;
}) {
  if (model === null) {
    return (
      <section className="compare-delta-chart" aria-label="Driver delta time">
        <header className="compare-overlay-header">
          <div className="compare-overlay-title">
            <span className="zone-kicker">Delta</span>
            <span className="compare-overlay-channel-label">Time variance</span>
          </div>
          <span className="compare-delta-reference mono">
            vs {referenceLabel}
          </span>
        </header>
        <div className="compare-overlay-placeholder" role="status">
          Delta time needs lap distance on both the live lap and reference lap.
        </div>
      </section>
    );
  }

  return (
    <section className="compare-delta-chart" aria-label="Driver delta time">
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Delta</span>
          <span className="compare-overlay-channel-label">Time variance</span>
        </div>
        <span className="compare-delta-reference mono">
          vs {referenceLabel}
        </span>
      </header>
      <div className="compare-overlay-stage">
        <svg
          className="compare-overlay-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${DELTA_HEIGHT}`}
          role="img"
          aria-label={`Driver View delta time plot vs ${referenceLabel}`}
        >
          {model.yTicks.map((tick) => {
            const y = model.toChartY(tick);
            return (
              <g key={`driver-delta-y-${tick}`}>
                <line
                  className={
                    tick === 0
                      ? "compare-delta-zero-line"
                      : "compare-overlay-grid-line"
                  }
                  x1={CHART_PADDING.left}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y1={y}
                  y2={y}
                />
                <text
                  className="compare-overlay-tick"
                  x={CHART_PADDING.left - 10}
                  y={y + 4}
                  textAnchor="end"
                >
                  {formatDeltaSeconds(tick)}
                </text>
              </g>
            );
          })}
          {model.xTicks.map((tick, index) => {
            const x = model.toChartX(tick);
            return (
              <g key={`driver-delta-x-${tick}-${index}`}>
                <line
                  className="compare-overlay-grid-line"
                  x1={x}
                  x2={x}
                  y1={CHART_PADDING.top}
                  y2={DELTA_HEIGHT - CHART_PADDING.bottom}
                />
                <text
                  className="compare-overlay-tick"
                  x={x}
                  y={DELTA_HEIGHT - 14}
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === model.xTicks.length - 1
                        ? "end"
                        : "middle"
                  }
                >
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}
          <line
            className="compare-overlay-axis-line"
            x1={CHART_PADDING.left}
            x2={CHART_PADDING.left}
            y1={CHART_PADDING.top}
            y2={DELTA_HEIGHT - CHART_PADDING.bottom}
          />
          {model.segments.map((segment, index) => (
            <line
              key={`driver-delta-underlay-${index}`}
              className="compare-delta-segment-underlay"
              style={{ "--lap-color": LIVE_COLOR } as CSSProperties}
              x1={model.toChartX(segment.from.distanceMeters)}
              x2={model.toChartX(segment.to.distanceMeters)}
              y1={model.toChartY(segment.from.deltaSeconds)}
              y2={model.toChartY(segment.to.deltaSeconds)}
            />
          ))}
          {model.segments.map((segment, index) => (
            <line
              key={`driver-delta-${index}`}
              className={`compare-delta-segment compare-delta-segment-${segment.tone}`}
              x1={model.toChartX(segment.from.distanceMeters)}
              x2={model.toChartX(segment.to.distanceMeters)}
              y1={model.toChartY(segment.from.deltaSeconds)}
              y2={model.toChartY(segment.to.deltaSeconds)}
            />
          ))}
          <text
            className="compare-overlay-axis-label"
            x={CHART_PADDING.left}
            y={DELTA_HEIGHT - 2}
          >
            Lap distance (m)
          </text>
          <text
            className="compare-overlay-axis-label"
            x={CHART_PADDING.left - 10}
            y={CHART_PADDING.top - 6}
            textAnchor="end"
          >
            Delta (s)
          </text>
        </svg>
      </div>
    </section>
  );
}
