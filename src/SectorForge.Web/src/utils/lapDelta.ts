export type DeltaSeriesInput = {
  id: string;
  label: string;
  color?: string;
  time: Array<number | null>;
  lapDistance?: Array<number | null> | null;
};

export type DeltaTimePoint = {
  distanceMeters: number;
  deltaSeconds: number;
};

export type DeltaTimeTrace = {
  id: string;
  label: string;
  color?: string;
  points: DeltaTimePoint[];
  clipStartMeters: number;
  clipEndMeters: number;
  referenceEndMeters: number;
  comparisonEndMeters: number;
  isClipped: boolean;
};

export type DeltaTimeModel = {
  referenceId: string;
  traces: DeltaTimeTrace[];
  clippedTraceCount: number;
};

type DistanceTimePoint = {
  distanceMeters: number;
  elapsedSeconds: number;
};

const MIN_POINTS = 2;
const DISTANCE_EPSILON = 0.001;

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSeries(input: DeltaSeriesInput) {
  const distance = input.lapDistance;
  if (!Array.isArray(distance)) {
    return [];
  }

  const count = Math.min(input.time.length, distance.length);
  const points: DistanceTimePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const distanceMeters = distance[index];
    const elapsedSeconds = input.time[index];
    if (!isFiniteNumber(distanceMeters) || !isFiniteNumber(elapsedSeconds)) {
      continue;
    }

    points.push({ distanceMeters, elapsedSeconds });
  }

  points.sort((first, second) => first.distanceMeters - second.distanceMeters);

  const byDistance = new Map<number, DistanceTimePoint>();
  for (const point of points) {
    byDistance.set(point.distanceMeters, point);
  }

  return Array.from(byDistance.values());
}

function getSeriesStart(points: DistanceTimePoint[]) {
  return points[0]?.distanceMeters ?? 0;
}

function getSeriesEnd(points: DistanceTimePoint[]) {
  return points[points.length - 1]?.distanceMeters ?? 0;
}

function interpolateElapsedSeconds(
  points: DistanceTimePoint[],
  distanceMeters: number,
) {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }

  if (distanceMeters <= first.distanceMeters) {
    return first.elapsedSeconds;
  }
  if (distanceMeters >= last.distanceMeters) {
    return last.elapsedSeconds;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (previous === undefined || next === undefined) {
      continue;
    }

    if (distanceMeters > next.distanceMeters) {
      continue;
    }

    const distanceSpan = next.distanceMeters - previous.distanceMeters;
    if (distanceSpan <= 0) {
      return next.elapsedSeconds;
    }

    const ratio = (distanceMeters - previous.distanceMeters) / distanceSpan;
    return (
      previous.elapsedSeconds +
      (next.elapsedSeconds - previous.elapsedSeconds) * ratio
    );
  }

  return null;
}

function collectSampleDistances(
  reference: DistanceTimePoint[],
  comparison: DistanceTimePoint[],
  startMeters: number,
  endMeters: number,
) {
  const distances = new Set<number>([startMeters, endMeters]);
  for (const point of [...reference, ...comparison]) {
    if (
      point.distanceMeters >= startMeters &&
      point.distanceMeters <= endMeters
    ) {
      distances.add(point.distanceMeters);
    }
  }

  return Array.from(distances).sort((first, second) => first - second);
}

function buildTrace(
  referenceInput: DeltaSeriesInput,
  comparisonInput: DeltaSeriesInput,
) {
  const reference = normalizeSeries(referenceInput);
  const comparison = normalizeSeries(comparisonInput);

  if (reference.length < MIN_POINTS || comparison.length < MIN_POINTS) {
    return null;
  }

  const referenceStart = getSeriesStart(reference);
  const comparisonStart = getSeriesStart(comparison);
  const referenceEnd = getSeriesEnd(reference);
  const comparisonEnd = getSeriesEnd(comparison);
  const clipStart = Math.max(referenceStart, comparisonStart);
  const clipEnd = Math.min(referenceEnd, comparisonEnd);

  if (clipEnd <= clipStart) {
    return null;
  }

  const points: DeltaTimePoint[] = [];
  for (const distanceMeters of collectSampleDistances(
    reference,
    comparison,
    clipStart,
    clipEnd,
  )) {
    const referenceTime = interpolateElapsedSeconds(reference, distanceMeters);
    const comparisonTime = interpolateElapsedSeconds(
      comparison,
      distanceMeters,
    );
    if (referenceTime === null || comparisonTime === null) {
      continue;
    }

    points.push({
      distanceMeters,
      deltaSeconds: comparisonTime - referenceTime,
    });
  }

  if (points.length < MIN_POINTS) {
    return null;
  }

  const isClipped =
    Math.abs(clipStart - Math.min(referenceStart, comparisonStart)) >
      DISTANCE_EPSILON ||
    Math.abs(clipEnd - Math.max(referenceEnd, comparisonEnd)) >
      DISTANCE_EPSILON;

  const trace: DeltaTimeTrace = {
    id: comparisonInput.id,
    label: comparisonInput.label,
    points,
    clipStartMeters: clipStart,
    clipEndMeters: clipEnd,
    referenceEndMeters: referenceEnd,
    comparisonEndMeters: comparisonEnd,
    isClipped,
  };

  if (comparisonInput.color !== undefined) {
    trace.color = comparisonInput.color;
  }

  return trace;
}

export function buildDeltaTimeModel(
  reference: DeltaSeriesInput,
  comparisons: DeltaSeriesInput[],
): DeltaTimeModel | null {
  const traces = comparisons
    .map((comparison) => buildTrace(reference, comparison))
    .filter((trace): trace is DeltaTimeTrace => trace !== null);

  if (traces.length === 0) {
    return null;
  }

  return {
    referenceId: reference.id,
    traces,
    clippedTraceCount: traces.filter((trace) => trace.isClipped).length,
  };
}
