import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTelemetrySample } from "../../test/telemetryFixtures";
import type { CurrentLapTelemetrySeries, TelemetrySample } from "../../types/telemetry";
import { SimplifiedDriveView } from "./SimplifiedDriveView";

vi.mock("./DriverLapCompare", () => ({
  DriverLapCompare: () => <div data-testid="driver-lap-compare" />,
}));

const lapTrace: CurrentLapTelemetrySeries = {
  sessionId: "session-1",
  lapNumber: 4,
  points: [],
};

function renderDriverView(sample: TelemetrySample) {
  return render(
    <SimplifiedDriveView
      activeSource={null}
      runMode="Live"
      sample={sample}
      lapTrace={lapTrace}
      sessions={[]}
    />,
  );
}

function getSectorPip(label: string) {
  return screen.getByText(label);
}

describe("SimplifiedDriveView", () => {
  it("preserves completed sector tones as the active sector advances", () => {
    const sectorOneSample = createTelemetrySample({
      lap: { lapNumber: 7, sectorIndex: 0 },
      timing: { sectorDelta: "-00:00:00.120" },
    });
    const sectorTwoSample = createTelemetrySample({
      lap: { lapNumber: 7, sectorIndex: 1 },
      timing: { sectorDelta: "+00:00:00.090" },
    });

    const { rerender } = renderDriverView(sectorOneSample);
    expect(getSectorPip("S1")).toHaveClass("active", "hud-sector-improving");

    rerender(
      <SimplifiedDriveView
        activeSource={null}
        runMode="Live"
        sample={sectorTwoSample}
        lapTrace={lapTrace}
        sessions={[]}
      />,
    );

    expect(getSectorPip("S1")).toHaveClass("hud-sector-improving");
    expect(getSectorPip("S1")).not.toHaveClass("active");
    expect(getSectorPip("S2")).toHaveClass("active", "hud-sector-losing");
  });

  it("colors completed sectors from available split results", () => {
    const sample = createTelemetrySample({
      lap: {
        sectorIndex: 2,
        sector1Time: "00:00:24.500",
        lastSector1Time: "00:00:24.700",
        sector2Time: "00:00:29.200",
        lastSector2Time: "00:00:28.950",
      },
      timing: { sectorDelta: null },
    });

    renderDriverView(sample);

    expect(getSectorPip("S1")).toHaveClass("hud-sector-improving");
    expect(getSectorPip("S2")).toHaveClass("hud-sector-losing");
    expect(getSectorPip("S3")).toHaveClass("active", "hud-sector-neutral");
  });
});
