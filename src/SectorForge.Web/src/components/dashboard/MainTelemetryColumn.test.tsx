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
