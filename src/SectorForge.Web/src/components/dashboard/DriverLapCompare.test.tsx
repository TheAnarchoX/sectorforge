import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverLapCompare } from "./DriverLapCompare";
import {
  createLapChannelsResponse,
  createLapTrace,
  createSessionDetails,
  createSessionSummary,
  createTelemetrySample,
} from "../../test/telemetryFixtures";

const telemetryApiMock = vi.hoisted(() => ({
  getLapChannelsForBasketEntry: vi.fn(),
  getSessionDetails: vi.fn(),
}));

vi.mock("../../api/telemetryApi", () => ({
  getLapChannelsForBasketEntry: telemetryApiMock.getLapChannelsForBasketEntry,
  getSessionDetails: telemetryApiMock.getSessionDetails,
}));

describe("DriverLapCompare", () => {
  beforeEach(() => {
    telemetryApiMock.getLapChannelsForBasketEntry.mockReset();
    telemetryApiMock.getSessionDetails.mockReset();
    telemetryApiMock.getSessionDetails.mockResolvedValue(
      createSessionDetails({
        laps: [
          {
            sessionId: "session-1",
            lapNumber: 2,
            lapTime: "00:01:03.100",
            bestLapTime: "00:01:01.900",
            updatedAt: "2026-05-03T12:00:05.000Z",
          },
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
      }),
    );
    telemetryApiMock.getLapChannelsForBasketEntry.mockImplementation(
      (entry: { sessionId: string; lapNumber: number }) =>
        Promise.resolve(
          createLapChannelsResponse({
            sessionId: entry.sessionId,
            lapNumber: entry.lapNumber,
            channels: {
              time: [0.4, 0.9, 1.4],
              speedKph: [146, 151, 155],
              lapDistance: [120, 240, 360],
            },
          }),
        ),
    );
  });

  it("loads the fastest historical lap and renders live overlay and delta plots", async () => {
    render(
      <DriverLapCompare
        sample={createTelemetrySample()}
        lapTrace={createLapTrace()}
        sessions={[createSessionSummary()]}
      />,
    );

    expect(screen.getByText("Loading session laps")).toBeInTheDocument();

    expect(
      await screen.findByRole("img", {
        name: /driver view live speed overlay/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /driver view delta time plot/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reference lap 3")).toBeInTheDocument();
    expect(screen.getByText("Current lap 4")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        telemetryApiMock.getLapChannelsForBasketEntry,
      ).toHaveBeenCalledWith({
        sessionId: "session-1",
        lapNumber: 3,
      }),
    );
  });

  it("lets the driver switch reference laps during a live lap", async () => {
    const user = userEvent.setup();

    render(
      <DriverLapCompare
        sample={createTelemetrySample()}
        lapTrace={createLapTrace()}
        sessions={[createSessionSummary()]}
      />,
    );

    const referenceSelect = await screen.findByRole("combobox", {
      name: "Reference lap",
    });
    await user.selectOptions(referenceSelect, "2");

    await waitFor(() =>
      expect(
        telemetryApiMock.getLapChannelsForBasketEntry,
      ).toHaveBeenLastCalledWith({
        sessionId: "session-1",
        lapNumber: 2,
      }),
    );

    const compareRegion = screen.getByRole("region", {
      name: "Driver lap comparison",
    });
    expect(within(compareRegion).getByText(/ref 2/i)).toBeInTheDocument();
  });

  it("keeps the overlay visible and explains when delta distance is unavailable", async () => {
    telemetryApiMock.getLapChannelsForBasketEntry.mockResolvedValue(
      createLapChannelsResponse({
        channels: {
          time: [0.4, 0.9, 1.4],
          speedKph: [146, 151, 155],
          lapDistance: null,
        },
      }),
    );

    render(
      <DriverLapCompare
        sample={createTelemetrySample()}
        lapTrace={createLapTrace({
          points: [
            { elapsedSeconds: 0.5, value: 148, lapDistanceMeters: null },
            { elapsedSeconds: 1, value: 152, lapDistanceMeters: null },
            { elapsedSeconds: 1.5, value: 156, lapDistanceMeters: null },
          ],
        })}
        sessions={[createSessionSummary()]}
      />,
    );

    expect(
      await screen.findByRole("img", {
        name: /driver view live speed overlay/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Delta time needs lap distance on both the live lap and reference lap.",
      ),
    ).toBeInTheDocument();
  });
});
