import { describe, expect, it } from "vitest";
import { buildSessionSummaryModel, formatLapSeconds } from "./sessionSummary";
import {
  createSessionDetails,
  createTelemetrySample,
} from "../test/telemetryFixtures";

describe("sessionSummary", () => {
  it("calculates lap metrics, distribution buckets, and tyre usage", () => {
    const model = buildSessionSummaryModel(
      createSessionDetails({
        laps: [
          {
            sessionId: "session-1",
            lapNumber: 1,
            lapTime: "00:01:03.000",
            bestLapTime: "00:01:01.000",
            updatedAt: "2026-05-03T12:01:00.000Z",
          },
          {
            sessionId: "session-1",
            lapNumber: 2,
            lapTime: "00:01:01.000",
            bestLapTime: "00:01:01.000",
            updatedAt: "2026-05-03T12:02:00.000Z",
          },
          {
            sessionId: "session-1",
            lapNumber: 3,
            lapTime: "00:01:02.000",
            bestLapTime: "00:01:01.000",
            updatedAt: "2026-05-03T12:03:00.000Z",
          },
        ],
        samples: [
          createTelemetrySample({
            tyres: {
              compound: "Medium",
              ageLaps: 1,
              frontLeftWear: { wearPercent: 8 },
              frontRightWear: { wearPercent: 10 },
              rearLeftWear: { wearPercent: 12 },
              rearRightWear: { wearPercent: 14 },
            },
          }),
          createTelemetrySample({
            tyres: {
              compound: "Medium",
              ageLaps: 2,
              frontLeftWear: { wearPercent: 18 },
              frontRightWear: { wearPercent: 20 },
              rearLeftWear: { wearPercent: 22 },
              rearRightWear: { wearPercent: 24 },
            },
          }),
        ],
      }),
    );

    expect(model.lapCount).toBe(3);
    expect(model.bestLap).toEqual({ lapNumber: 2, seconds: 61 });
    expect(model.averageLapSeconds).toBe(62);
    expect(model.lapTimeStdDevSeconds).toBeCloseTo(0.816, 3);
    expect(
      model.lapTimeBuckets.reduce((total, bucket) => total + bucket.count, 0),
    ).toBe(3);
    expect(model.tyreUsageMode).toBe("wear");
    expect(model.tyreUsagePoints).toHaveLength(2);
    expect(model.tyreUsagePoints[0]?.wearPercent).toBe(11);
    expect(model.tyreCompounds).toEqual(["Medium"]);
  });

  it("formats lap seconds for display", () => {
    expect(formatLapSeconds(62.5)).toBe("01:02.500");
    expect(formatLapSeconds(null)).toBe("-");
  });
});
