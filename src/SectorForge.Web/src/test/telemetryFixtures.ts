import type {
  CollectorStatus,
  CurrentLapTelemetrySeries,
  ParticipantState,
  TelemetrySample,
  TelemetrySessionDetails,
  TelemetrySessionSummary,
  TelemetrySource,
  TelemetryTraceSeries,
} from "../types/telemetry";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function applyOverride(
  target: Record<string, unknown>,
  override: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    const current = target[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      applyOverride(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    target[key] = value;
  }
}

function mergeFixture<T>(base: T, override?: DeepPartial<T>) {
  if (override === undefined) {
    return structuredClone(base);
  }

  const next = structuredClone(base) as T;
  applyOverride(
    next as Record<string, unknown>,
    override as Record<string, unknown>,
  );
  return next;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

export function createTelemetrySource(
  override?: DeepPartial<TelemetrySource>,
): TelemetrySource {
  return mergeFixture(
    {
      adapterId: "fake",
      game: "SectorForge Sim",
      displayName: "Fake telemetry",
      inputKind: "Simulated",
      isSimulated: true,
      status: "Running",
      notes: null,
    } satisfies TelemetrySource,
    override,
  );
}

export function createParticipantState(
  override?: DeepPartial<ParticipantState>,
): ParticipantState {
  return mergeFixture(
    {
      driverName: "J. Driver",
      teamName: "SectorForge Works",
      carName: "GT3 Evo",
      position: 1,
      isPlayer: true,
      isInPit: false,
      lapNumber: 4,
      currentLapTime: "00:01:02.500",
      lastLapTime: "00:01:02.950",
      bestLapTime: "00:01:02.100",
      gapToLeader: null,
      intervalToAhead: null,
    } satisfies ParticipantState,
    override,
  );
}

export function createTelemetrySample(
  override?: DeepPartial<TelemetrySample>,
): TelemetrySample {
  return mergeFixture(
    {
      sessionId: "session-1",
      sequence: 1,
      timestamp: "2026-05-03T12:00:00.000Z",
      source: createTelemetrySource(),
      session: {
        id: "session-1",
        name: "Practice 1",
        sessionType: "Practice",
        startedAt: "2026-05-03T11:45:00.000Z",
        isActive: true,
      },
      lap: {
        lapNumber: 4,
        currentLapTime: "00:01:02.500",
        lastLapTime: "00:01:03.100",
        bestLapTime: "00:01:01.900",
        sectorIndex: 1,
      },
      vehicle: {
        carName: "GT3 Evo",
        speedKph: 156,
        rpm: 6450,
        gear: 4,
        engineTemperatureC: 101,
      },
      tyres: {
        frontLeft: { coreC: 86 },
        frontRight: { coreC: 88 },
        rearLeft: { coreC: 91 },
        rearRight: { coreC: 90 },
        frontLeftPressurePsi: 27.2,
        frontRightPressurePsi: 27.1,
        rearLeftPressurePsi: 26.8,
        rearRightPressurePsi: 26.9,
      },
      brakes: {
        frontLeftTemperatureC: 420,
        frontRightTemperatureC: 425,
        rearLeftTemperatureC: 360,
        rearRightTemperatureC: 365,
      },
      fuel: {
        remainingLiters: 42.4,
        capacityLiters: 95,
        litersPerLapEstimate: 2.65,
        lapsRemainingEstimate: 16,
      },
      track: {
        trackName: "Silverstone",
        trackTemperatureC: 31.2,
        airTemperatureC: 22.4,
        weather: "Dry",
      },
      driverInput: {
        throttle: 0.72,
        brake: 0.08,
        steering: 0.12,
        clutch: 0,
      },
      timing: {
        sessionElapsed: "00:12:15.000",
        sessionRemaining: "00:17:45.000",
        deltaToBestLap: "-00:00:00.120",
        sectorDelta: "+00:00:00.050",
      },
      participants: [
        createParticipantState(),
        createParticipantState({
          driverName: "M. Rossi",
          teamName: "Apex Motorsport",
          position: 2,
          isPlayer: false,
          gapToLeader: "+00:00:01.400",
          intervalToAhead: "+00:00:01.400",
        }),
      ],
    } satisfies TelemetrySample,
    override,
  );
}

export function createTelemetrySamples(
  count: number,
  override?: DeepPartial<TelemetrySample>,
) {
  return Array.from({ length: count }, (_, index) =>
    createTelemetrySample(
      mergeFixture<DeepPartial<TelemetrySample>>(
        {
          sequence: index + 1,
          timestamp: new Date(
            Date.UTC(2026, 4, 3, 12, 0, 0, index * 500),
          ).toISOString(),
          lap: {
            lapNumber: 4,
            currentLapTime: formatDuration((index + 1) * 0.5),
          },
          vehicle: {
            speedKph: 148 + index * 4,
            rpm: 6200 + index * 120,
            gear: 4,
          },
          driverInput: {
            throttle: 0.55 + index * 0.02,
            brake: index % 2 === 0 ? 0.03 : 0.08,
            steering: index % 2 === 0 ? 0.12 : -0.16,
          },
        } satisfies DeepPartial<TelemetrySample>,
        override,
      ),
    ),
  );
}

export function createSessionSummary(
  override?: DeepPartial<TelemetrySessionSummary>,
): TelemetrySessionSummary {
  return mergeFixture(
    {
      id: "session-1",
      game: "SectorForge Sim",
      sourceName: "Fake telemetry",
      trackName: "Silverstone",
      carName: "GT3 Evo",
      startedAt: "2026-05-03T11:45:00.000Z",
      lastSeenAt: "2026-05-03T12:05:00.000Z",
      bestLapTime: "00:01:01.900",
      sampleCount: 180,
    } satisfies TelemetrySessionSummary,
    override,
  );
}

export function createSessionDetails(
  override?: DeepPartial<TelemetrySessionDetails>,
): TelemetrySessionDetails {
  return mergeFixture(
    {
      session: createSessionSummary(),
      laps: [
        {
          sessionId: "session-1",
          lapNumber: 3,
          lapTime: "00:01:02.400",
          bestLapTime: "00:01:01.900",
          updatedAt: "2026-05-03T12:01:10.000Z",
        },
        {
          sessionId: "session-1",
          lapNumber: 4,
          lapTime: "00:01:01.900",
          bestLapTime: "00:01:01.900",
          updatedAt: "2026-05-03T12:02:15.000Z",
        },
      ],
      samples: createTelemetrySamples(3),
    } satisfies TelemetrySessionDetails,
    override,
  );
}

export function createCollectorStatus(
  override?: DeepPartial<CollectorStatus>,
): CollectorStatus {
  return mergeFixture(
    {
      isRunning: true,
      runMode: "Live",
      activeAdapterId: "fake",
      source: createTelemetrySource(),
      startedAt: "2026-05-03T11:45:00.000Z",
      lastSampleAt: "2026-05-03T12:00:00.000Z",
      samplesPublished: 180,
      lastError: null,
      latestSample: createTelemetrySample(),
    } satisfies CollectorStatus,
    override,
  );
}

export function createTraceSeries(
  override?: DeepPartial<TelemetryTraceSeries>,
): TelemetryTraceSeries {
  return mergeFixture(
    {
      speed: [148, 152, 156],
      rpm: [6200, 6320, 6450],
      throttle: [55, 61, 72],
      brake: [3, 5, 8],
      steering: [12, -4, 12],
    } satisfies TelemetryTraceSeries,
    override,
  );
}

export function createLapTrace(
  override?: DeepPartial<CurrentLapTelemetrySeries>,
): CurrentLapTelemetrySeries {
  return mergeFixture(
    {
      sessionId: "session-1",
      lapNumber: 4,
      points: [
        { elapsedSeconds: 0.5, value: 148 },
        { elapsedSeconds: 1, value: 152 },
        { elapsedSeconds: 1.5, value: 156 },
      ],
    } satisfies CurrentLapTelemetrySeries,
    override,
  );
}
