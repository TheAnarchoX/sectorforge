import { describe, expect, it } from "vitest";
import {
  clamp,
  formatDelta,
  formatGear,
  formatNumber,
  formatShortTimestamp,
  formatTime,
  parseDurationSeconds,
} from "./telemetryFormat";

describe("telemetryFormat", () => {
  it("formats numeric values and gears with fallbacks", () => {
    expect(formatNumber(123.456, 1)).toBe("123.5");
    expect(formatNumber(null, 1)).toBe("-");
    expect(formatGear(null)).toBe("-");
    expect(formatGear(0)).toBe("N");
    expect(formatGear(5)).toBe("5");
  });

  it("formats lap times and deltas", () => {
    expect(formatTime("00:01:02.500")).toBe("01:02.500");
    expect(formatTime("-00:00:00.250")).toBe("-00:00.250");
    expect(formatTime(null)).toBe("-");
    expect(formatDelta("00:00:00.333")).toBe("+00:00.333");
    expect(formatDelta("-00:00:00.333")).toBe("-00:00.333");
    expect(formatDelta(undefined)).toBe("-");
  });

  it("parses duration strings into seconds", () => {
    expect(parseDurationSeconds("01:02.500")).toBe(62.5);
    expect(parseDurationSeconds("00:01:02.500")).toBe(62.5);
    expect(parseDurationSeconds("-00:00:10.250")).toBe(-10.25);
    expect(parseDurationSeconds("not-a-duration")).toBeNull();
    expect(parseDurationSeconds(null)).toBeNull();
  });

  it("formats timestamps and clamps numeric ranges", () => {
    expect(formatShortTimestamp("not-a-date")).toBe("-");
    expect(formatShortTimestamp("2026-05-03T13:45:00")).toContain("13:45");
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
