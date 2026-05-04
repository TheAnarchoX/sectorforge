import { describe, expect, it } from "vitest";
import { buildDeltaTimeModel } from "./lapDelta";

describe("lapDelta", () => {
  it("builds cumulative time delta against a reference lap", () => {
    const model = buildDeltaTimeModel(
      {
        id: "reference",
        label: "Reference lap",
        time: [0, 10, 20],
        lapDistance: [0, 100, 200],
      },
      [
        {
          id: "comparison",
          label: "Comparison lap",
          time: [0, 12, 18],
          lapDistance: [0, 100, 200],
        },
      ],
    );

    expect(model?.referenceId).toBe("reference");
    expect(model?.clippedTraceCount).toBe(0);
    expect(model?.traces[0]?.points).toEqual([
      { distanceMeters: 0, deltaSeconds: 0 },
      { distanceMeters: 100, deltaSeconds: 2 },
      { distanceMeters: 200, deltaSeconds: -2 },
    ]);
  });

  it("clips traces to the shared lap distance range", () => {
    const model = buildDeltaTimeModel(
      {
        id: "reference",
        label: "Reference lap",
        time: [0, 10, 20],
        lapDistance: [0, 100, 200],
      },
      [
        {
          id: "shorter",
          label: "Shorter lap",
          time: [0, 10, 16],
          lapDistance: [0, 100, 150],
        },
      ],
    );

    expect(model?.clippedTraceCount).toBe(1);
    expect(model?.traces[0]).toMatchObject({
      clipEndMeters: 150,
      referenceEndMeters: 200,
      comparisonEndMeters: 150,
      isClipped: true,
    });
    expect(model?.traces[0]?.points.at(-1)).toEqual({
      distanceMeters: 150,
      deltaSeconds: 1,
    });
  });

  it("returns null when distance or time samples are not usable", () => {
    const model = buildDeltaTimeModel(
      {
        id: "reference",
        label: "Reference lap",
        time: [0, 10, 20],
        lapDistance: null,
      },
      [
        {
          id: "comparison",
          label: "Comparison lap",
          time: [0, 11, 21],
          lapDistance: [0, 100, 200],
        },
      ],
    );

    expect(model).toBeNull();
  });
});
