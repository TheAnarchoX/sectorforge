import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionSummaryPanel } from "./SessionSummaryPanel";
import {
  createSessionDetails,
  createTelemetrySample,
} from "../../test/telemetryFixtures";

describe("SessionSummaryPanel", () => {
  it("renders completed-session metrics and visualizations from stored data", () => {
    render(
      <SessionSummaryPanel
        sessionDetails={createSessionDetails({
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
          samples: [
            createTelemetrySample({
              tyres: {
                compound: "Soft",
                ageLaps: 1,
                frontLeftWear: { wearPercent: 7 },
                frontRightWear: { wearPercent: 9 },
                rearLeftWear: { wearPercent: 11 },
                rearRightWear: { wearPercent: 13 },
              },
            }),
            createTelemetrySample({
              tyres: {
                compound: "Soft",
                ageLaps: 2,
                frontLeftWear: { wearPercent: 17 },
                frontRightWear: { wearPercent: 19 },
                rearLeftWear: { wearPercent: 21 },
                rearRightWear: { wearPercent: 23 },
              },
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Session Summary")).toBeInTheDocument();
    expect(screen.getByText("Performance snapshot")).toBeInTheDocument();
    expect(screen.getByText("01:01.900")).toBeInTheDocument();
    expect(screen.getByText("01:02.150")).toBeInTheDocument();
    expect(screen.getByText("+/- 0.250s")).toBeInTheDocument();
    expect(screen.getByText("Lap time distribution")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /completed lap times/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tyre usage over time")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /tyre wear over 2 stored samples/i }),
    ).toBeInTheDocument();
  });

  it("updates when a different session is rendered", () => {
    const { rerender } = render(
      <SessionSummaryPanel
        sessionDetails={createSessionDetails({
          session: { trackName: "Silverstone" },
          laps: [
            {
              sessionId: "session-1",
              lapNumber: 1,
              lapTime: "00:01:10.000",
              bestLapTime: "00:01:10.000",
              updatedAt: "2026-05-03T12:01:10.000Z",
            },
          ],
          samples: [],
        })}
      />,
    );

    expect(screen.getByText("Silverstone")).toBeInTheDocument();
    expect(screen.getAllByText("01:10.000").length).toBeGreaterThan(0);

    rerender(
      <SessionSummaryPanel
        sessionDetails={createSessionDetails({
          session: { trackName: "Suzuka" },
          laps: [
            {
              sessionId: "session-2",
              lapNumber: 5,
              lapTime: "00:01:45.500",
              bestLapTime: "00:01:45.500",
              updatedAt: "2026-05-03T13:01:10.000Z",
            },
          ],
          samples: [],
        })}
      />,
    );

    expect(screen.getByText("Suzuka")).toBeInTheDocument();
    expect(screen.getAllByText("01:45.500").length).toBeGreaterThan(0);
    expect(screen.queryByText("Silverstone")).toBeNull();
  });
});
