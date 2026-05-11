import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MainTelemetryColumn } from "./MainTelemetryColumn";
import {
  createLapChannelsResponse,
  createLapTrace,
  createTelemetrySample,
  createTelemetrySource,
  createTraceSeries,
} from "../../test/telemetryFixtures";

describe("MainTelemetryColumn", () => {
  it("preserves completed sector tones in the live speed view", () => {
    const sectorOneSample = createTelemetrySample({
      lap: { lapNumber: 7, sectorIndex: 0 },
      timing: { sectorDelta: "-00:00:00.120" },
    });
    const sectorTwoSample = createTelemetrySample({
      lap: { lapNumber: 7, sectorIndex: 1 },
      timing: { sectorDelta: "+00:00:00.090" },
    });

    const { container, rerender } = render(
      <MainTelemetryColumn
        activeSource={createTelemetrySource()}
        runMode="Live"
        sample={sectorOneSample}
        traceSeries={createTraceSeries()}
        lapTrace={createLapTrace()}
        referenceLap={null}
        referenceChannelsState={{ status: "idle" }}
        onClearReferenceLap={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".sector-bar-pip")[0]).toHaveClass(
      "active",
      "sector-tone-improving",
    );

    rerender(
      <MainTelemetryColumn
        activeSource={createTelemetrySource()}
        runMode="Live"
        sample={sectorTwoSample}
        traceSeries={createTraceSeries()}
        lapTrace={createLapTrace()}
        referenceLap={null}
        referenceChannelsState={{ status: "idle" }}
        onClearReferenceLap={vi.fn()}
      />,
    );

    const sectorPips = container.querySelectorAll(".sector-bar-pip");
    expect(sectorPips[0]).toHaveClass("sector-tone-improving");
    expect(sectorPips[0]).not.toHaveClass("active");
    expect(sectorPips[1]).toHaveClass("active", "sector-tone-losing");
  });

  it("renders subtle live reference comparison hints when a reference is selected", async () => {
    const user = userEvent.setup();
    const onClearReferenceLap = vi.fn();
    const referenceLap = {
      sessionId: "session-1",
      lapNumber: 3,
      label: "Silverstone L3",
    };
    const { container } = render(
      <MainTelemetryColumn
        activeSource={createTelemetrySource()}
        runMode="Live"
        sample={createTelemetrySample({
          lap: {
            currentLapTime: "00:00:15.000",
            lapDistanceMeters: 150,
          },
          vehicle: { speedKph: 170, rpm: 7100 },
          driverInput: { throttle: 0.75, brake: 0.1, steering: -0.2 },
        })}
        traceSeries={createTraceSeries()}
        lapTrace={createLapTrace()}
        referenceLap={referenceLap}
        referenceChannelsState={{
          status: "ready",
          referenceLap,
          response: createLapChannelsResponse({
            lapNumber: 3,
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
        }}
        onClearReferenceLap={onClearReferenceLap}
      />,
    );

    expect(container.querySelector(".live-reference-chip")).toHaveTextContent(
      "REF L3",
    );
    expect(container.querySelector(".lap-chart-reference-path")).not.toBeNull();
    expect(screen.getAllByText(/REF [-+]?[0-9]/).length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: /clear live reference/i }),
    );

    expect(onClearReferenceLap).toHaveBeenCalledTimes(1);
  });
});
