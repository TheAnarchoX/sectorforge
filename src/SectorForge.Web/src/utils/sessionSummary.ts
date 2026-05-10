import type {
  LapSummary,
  TelemetrySample,
  TelemetrySessionDetails,
  TyreCompound,
} from "../types/telemetry";
import { parseDurationSeconds } from "./telemetryFormat";

export type SessionLapTimePoint = {
  lapNumber: number;
  seconds: number;
};

export type SessionLapTimeBucket = {
  minSeconds: number;
  maxSeconds: number;
  count: number;
};

export type SessionTyreUsagePoint = {
  sampleIndex: number;
  ageLaps: number | null;
  wearPercent: number | null;
  compound: TyreCompound | null;
};

export type SessionTyreUsageMode = "wear" | "age" | "none";

export type SessionSummaryModel = {
  lapCount: number;
  bestLap: SessionLapTimePoint | null;
  averageLapSeconds: number | null;
  lapTimeStdDevSeconds: number | null;
  lapTimeBuckets: SessionLapTimeBucket[];
  tyreUsageMode: SessionTyreUsageMode;
  tyreUsagePoints: SessionTyreUsagePoint[];
  tyreCompounds: TyreCompound[];
};

const HISTOGRAM_BUCKET_LIMIT = 6;

function getLapTimePoints(laps: LapSummary[]) {
  const points: SessionLapTimePoint[] = [];

  for (const lap of laps) {
    const seconds = parseDurationSeconds(lap.lapTime);
    if (seconds === null || !Number.isFinite(seconds)) {
      continue;
    }

    points.push({ lapNumber: lap.lapNumber, seconds });
  }

  return points;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getStandardDeviation(values: number[], average: number | null) {
  if (values.length === 0 || average === null) {
    return null;
  }

  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    values.length;

  return Math.sqrt(variance);
}

function buildLapTimeBuckets(points: SessionLapTimePoint[]) {
  if (points.length === 0) {
    return [];
  }

  const values = points.map((point) => point.seconds);
  const minSeconds = Math.min(...values);
  const maxSeconds = Math.max(...values);

  if (Math.abs(maxSeconds - minSeconds) < 0.001) {
    return [{ minSeconds, maxSeconds, count: points.length }];
  }

  const bucketCount = Math.min(
    HISTOGRAM_BUCKET_LIMIT,
    Math.max(2, Math.ceil(Math.sqrt(points.length))),
  );
  const bucketWidth = (maxSeconds - minSeconds) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    minSeconds: minSeconds + bucketWidth * index,
    maxSeconds:
      index === bucketCount - 1
        ? maxSeconds
        : minSeconds + bucketWidth * (index + 1),
    count: 0,
  }));

  for (const point of points) {
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.floor((point.seconds - minSeconds) / bucketWidth),
    );
    buckets[bucketIndex].count += 1;
  }

  return buckets;
}

function getAverageTyreWear(sample: TelemetrySample) {
  const wearValues = [
    sample.tyres.frontLeftWear?.wearPercent,
    sample.tyres.frontRightWear?.wearPercent,
    sample.tyres.rearLeftWear?.wearPercent,
    sample.tyres.rearRightWear?.wearPercent,
  ].filter(
    (value): value is number =>
      value !== null && value !== undefined && Number.isFinite(value),
  );

  return getAverage(wearValues);
}

function buildTyreUsagePoints(samples: TelemetrySample[]) {
  const points: SessionTyreUsagePoint[] = [];
  const compounds = new Set<TyreCompound>();

  samples.forEach((sample, sampleIndex) => {
    const ageLaps =
      sample.tyres.ageLaps !== null &&
      sample.tyres.ageLaps !== undefined &&
      Number.isFinite(sample.tyres.ageLaps)
        ? sample.tyres.ageLaps
        : null;
    const wearPercent = getAverageTyreWear(sample);
    const compound =
      sample.tyres.compound !== null && sample.tyres.compound !== undefined
        ? sample.tyres.compound
        : null;

    if (compound !== null && compound !== "Unknown") {
      compounds.add(compound);
    }

    if (ageLaps === null && wearPercent === null) {
      return;
    }

    points.push({ sampleIndex, ageLaps, wearPercent, compound });
  });

  return {
    points,
    compounds: Array.from(compounds),
  };
}

export function formatLapSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;

  return `${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(3)
    .padStart(6, "0")}`;
}

export function buildSessionSummaryModel(
  sessionDetails: TelemetrySessionDetails,
): SessionSummaryModel {
  const lapTimePoints = getLapTimePoints(sessionDetails.laps);
  const lapSeconds = lapTimePoints.map((point) => point.seconds);
  const averageLapSeconds = getAverage(lapSeconds);
  const tyreUsage = buildTyreUsagePoints(sessionDetails.samples);
  const hasWear = tyreUsage.points.some((point) => point.wearPercent !== null);
  const hasAge = tyreUsage.points.some((point) => point.ageLaps !== null);

  return {
    lapCount: lapTimePoints.length,
    bestLap:
      lapTimePoints.length === 0
        ? null
        : lapTimePoints.reduce((best, point) =>
            point.seconds < best.seconds ? point : best,
          ),
    averageLapSeconds,
    lapTimeStdDevSeconds: getStandardDeviation(lapSeconds, averageLapSeconds),
    lapTimeBuckets: buildLapTimeBuckets(lapTimePoints),
    tyreUsageMode: hasWear ? "wear" : hasAge ? "age" : "none",
    tyreUsagePoints: tyreUsage.points,
    tyreCompounds: tyreUsage.compounds,
  };
}
