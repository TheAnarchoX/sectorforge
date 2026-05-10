import type { LapChannelsResponse, TelemetrySample } from "../types/telemetry";
import { parseDurationSeconds } from "./telemetryFormat";

type ReferenceCursor =
  | { kind: "lapDistance"; value: number }
  | { kind: "time"; value: number };

export type LiveReferenceValueComparison = {
  referenceValue: number;
  delta: number;
};

export type LiveReferenceComparison = {
  cursor: ReferenceCursor;
  lapDeltaSeconds: number | null;
  values: {
    speedKph: LiveReferenceValueComparison | null;
    rpm: LiveReferenceValueComparison | null;
    throttlePct: LiveReferenceValueComparison | null;
    brakePct: LiveReferenceValueComparison | null;
    steeringPct: LiveReferenceValueComparison | null;
  };
};

export type LiveReferenceSectorDeltas = {
  sector1DeltaSeconds: number | null;
  sector2DeltaSeconds: number | null;
  sector3DeltaSeconds: number | null;
};

export type ReferenceSpeedTracePoint = {
  elapsedSeconds: number;
  value: number;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasFiniteNumber(values: Array<number | null> | null | undefined) {
  return Array.isArray(values) && values.some(isFiniteNumber);
}

function getReferenceCursor(
  sample: TelemetrySample,
  response: LapChannelsResponse,
): ReferenceCursor | null {
  const lapDistance = sample.lap.lapDistanceMeters;
  if (
    isFiniteNumber(lapDistance) &&
    hasFiniteNumber(response.channels.lapDistance)
  ) {
    return { kind: "lapDistance", value: lapDistance };
  }

  const elapsedSeconds = parseDurationSeconds(sample.lap.currentLapTime);
  return isFiniteNumber(elapsedSeconds)
    ? { kind: "time", value: elapsedSeconds }
    : null;
}

function interpolateAtCursor(
  cursors: Array<number | null> | null | undefined,
  values: Array<number | null> | null | undefined,
  cursorValue: number,
) {
  if (!Array.isArray(cursors) || !Array.isArray(values)) {
    return null;
  }

  const count = Math.min(cursors.length, values.length);
  let previous: { cursor: number; value: number } | null = null;

  for (let index = 0; index < count; index += 1) {
    const cursor = cursors[index];
    const value = values[index];
    if (!isFiniteNumber(cursor) || !isFiniteNumber(value)) {
      continue;
    }

    if (Math.abs(cursor - cursorValue) < 0.0005) {
      return value;
    }

    if (cursor < cursorValue) {
      previous = { cursor, value };
      continue;
    }

    if (previous === null) {
      return value;
    }

    const span = cursor - previous.cursor;
    if (span <= 0) {
      return value;
    }

    const ratio = (cursorValue - previous.cursor) / span;
    return previous.value + (value - previous.value) * ratio;
  }

  return previous?.value ?? null;
}

function compareValue(
  currentValue: number | null | undefined,
  referenceValue: number | null,
): LiveReferenceValueComparison | null {
  if (!isFiniteNumber(currentValue) || !isFiniteNumber(referenceValue)) {
    return null;
  }

  return {
    referenceValue,
    delta: currentValue - referenceValue,
  };
}

function getReferenceValue(
  response: LapChannelsResponse,
  cursor: ReferenceCursor,
  values: Array<number | null> | null | undefined,
) {
  const cursors =
    cursor.kind === "lapDistance"
      ? response.channels.lapDistance
      : response.channels.time;

  return interpolateAtCursor(cursors, values, cursor.value);
}

export function buildLiveReferenceComparison(
  sample: TelemetrySample,
  response: LapChannelsResponse,
): LiveReferenceComparison | null {
  const cursor = getReferenceCursor(sample, response);
  if (cursor === null) {
    return null;
  }

  const currentElapsedSeconds = parseDurationSeconds(sample.lap.currentLapTime);
  const referenceElapsedSeconds =
    cursor.kind === "lapDistance"
      ? getReferenceValue(response, cursor, response.channels.time)
      : null;
  const lapDeltaSeconds =
    isFiniteNumber(currentElapsedSeconds) &&
    isFiniteNumber(referenceElapsedSeconds)
      ? currentElapsedSeconds - referenceElapsedSeconds
      : null;

  const referenceThrottle = getReferenceValue(
    response,
    cursor,
    response.channels.throttle,
  );
  const referenceBrake = getReferenceValue(
    response,
    cursor,
    response.channels.brake,
  );
  const referenceSteering = getReferenceValue(
    response,
    cursor,
    response.channels.steering,
  );
  const currentThrottle = sample.driverInput.throttle;
  const currentBrake = sample.driverInput.brake;
  const currentSteering = sample.driverInput.steering;

  return {
    cursor,
    lapDeltaSeconds,
    values: {
      speedKph: compareValue(
        sample.vehicle.speedKph,
        getReferenceValue(response, cursor, response.channels.speedKph),
      ),
      rpm: compareValue(
        sample.vehicle.rpm,
        getReferenceValue(response, cursor, response.channels.rpm),
      ),
      throttlePct: compareValue(
        isFiniteNumber(currentThrottle) ? currentThrottle * 100 : null,
        isFiniteNumber(referenceThrottle) ? referenceThrottle * 100 : null,
      ),
      brakePct: compareValue(
        isFiniteNumber(currentBrake) ? currentBrake * 100 : null,
        isFiniteNumber(referenceBrake) ? referenceBrake * 100 : null,
      ),
      steeringPct: compareValue(
        isFiniteNumber(currentSteering) ? currentSteering * 100 : null,
        isFiniteNumber(referenceSteering) ? referenceSteering * 100 : null,
      ),
    },
  };
}

export function buildReferenceSpeedTrace(
  response: LapChannelsResponse,
  maxPoints = 600,
): ReferenceSpeedTracePoint[] {
  const sourcePoints: ReferenceSpeedTracePoint[] = [];
  const count = Math.min(
    response.channels.time.length,
    response.channels.speedKph.length,
  );

  for (let index = 0; index < count; index += 1) {
    const elapsedSeconds = response.channels.time[index];
    const value = response.channels.speedKph[index];
    if (isFiniteNumber(elapsedSeconds) && isFiniteNumber(value)) {
      sourcePoints.push({ elapsedSeconds, value });
    }
  }

  if (sourcePoints.length <= maxPoints || maxPoints < 2) {
    return sourcePoints;
  }

  const downsampled: ReferenceSpeedTracePoint[] = [];
  const step = (sourcePoints.length - 1) / (maxPoints - 1);
  let previousIndex = -1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * step);
    if (sourceIndex !== previousIndex) {
      downsampled.push(sourcePoints[sourceIndex]);
      previousIndex = sourceIndex;
    }
  }

  return downsampled;
}

function getSectorDelta(
  current: string | null | undefined,
  reference: string | null | undefined,
) {
  const currentSeconds = parseDurationSeconds(current);
  const referenceSeconds = parseDurationSeconds(reference);

  return isFiniteNumber(currentSeconds) && isFiniteNumber(referenceSeconds)
    ? currentSeconds - referenceSeconds
    : null;
}

export function buildLiveReferenceSectorDeltas(
  sample: TelemetrySample,
  response: LapChannelsResponse,
): LiveReferenceSectorDeltas {
  return {
    sector1DeltaSeconds: getSectorDelta(
      sample.lap.sector1Time,
      response.sector1Time,
    ),
    sector2DeltaSeconds: getSectorDelta(
      sample.lap.sector2Time,
      response.sector2Time,
    ),
    sector3DeltaSeconds: getSectorDelta(
      sample.lap.sector3Time,
      response.sector3Time,
    ),
  };
}
