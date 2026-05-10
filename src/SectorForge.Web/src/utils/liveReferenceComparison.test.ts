import { describe, expect, it } from "vitest";
import {
  buildLiveReferenceComparison,
  buildLiveReferenceSectorDeltas,
  buildReferenceSpeedTrace,
} from "./liveReferenceComparison";
import {
  createLapChannelsResponse,
  createTelemetrySample,
} from "../test/telemetryFixtures";

describe("liveReferenceComparison", () => {
  it("interpolates reference values by lap distance", () => {
    const comparison = buildLiveReferenceComparison(
      createTelemetrySample({
        lap: {
          currentLapTime: "00:00:15.000",
          lapDistanceMeters: 150,
        },
        vehicle: { speedKph: 170, rpm: 7100 },
        driverInput: { throttle: 0.75, brake: 0.1, steering: -0.2 },
      }),
      createLapChannelsResponse({
        channels: {
          time: [0, 10, 20],
          speedKph: [100, 160, 200],
          rpm: [5000, 6500, 7500],
          throttle: [0.2, 0.6, 1],
          brake: [0, 0.05, 0.25],
          steering: [0, -0.1, -0.3],
          lapDistance: [0, 100, 200],
        },
      }),
    );

    expect(comparison?.cursor).toEqual({ kind: "lapDistance", value: 150 });
    expect(comparison?.lapDeltaSeconds).toBeCloseTo(0);
    expect(comparison?.values.speedKph?.referenceValue).toBeCloseTo(180);
    expect(comparison?.values.speedKph?.delta).toBeCloseTo(-10);
    expect(comparison?.values.throttlePct?.referenceValue).toBeCloseTo(80);
    expect(comparison?.values.brakePct?.delta).toBeCloseTo(-5);
    expect(comparison?.values.steeringPct?.delta).toBeCloseTo(0);
  });

  it("falls back to elapsed time for value deltas when distance is unavailable", () => {
    const comparison = buildLiveReferenceComparison(
      createTelemetrySample({
        lap: {
          currentLapTime: "00:00:15.000",
          lapDistanceMeters: null,
        },
        vehicle: { speedKph: 170 },
      }),
      createLapChannelsResponse({
        channels: {
          time: [0, 10, 20],
          speedKph: [100, 160, 200],
          rpm: [5000, 6500, 7500],
          throttle: [0.2, 0.6, 1],
          brake: [0, 0.05, 0.25],
          steering: [0, -0.1, -0.3],
          lapDistance: null,
        },
      }),
    );

    expect(comparison?.cursor).toEqual({ kind: "time", value: 15 });
    expect(comparison?.lapDeltaSeconds).toBeNull();
    expect(comparison?.values.speedKph?.referenceValue).toBeCloseTo(180);
  });

  it("builds downsampled reference speed traces and sector deltas", () => {
    const response = createLapChannelsResponse({
      sector1Time: "00:00:20.000",
      sector2Time: "00:00:21.000",
      sector3Time: "00:00:22.000",
      channels: {
        time: [0, 1, 2, 3, 4],
        speedKph: [120, 130, 140, 150, 160],
        rpm: [],
        throttle: [],
        brake: [],
        steering: [],
        lapDistance: [],
      },
    });

    expect(buildReferenceSpeedTrace(response, 3)).toEqual([
      { elapsedSeconds: 0, value: 120 },
      { elapsedSeconds: 2, value: 140 },
      { elapsedSeconds: 4, value: 160 },
    ]);

    expect(
      buildLiveReferenceSectorDeltas(
        createTelemetrySample({
          lap: {
            sector1Time: "00:00:19.900",
            sector2Time: "00:00:21.400",
            sector3Time: null,
          },
        }),
        response,
      ),
    ).toEqual({
      sector1DeltaSeconds: expect.closeTo(-0.1),
      sector2DeltaSeconds: expect.closeTo(0.4),
      sector3DeltaSeconds: null,
    });
  });
});
