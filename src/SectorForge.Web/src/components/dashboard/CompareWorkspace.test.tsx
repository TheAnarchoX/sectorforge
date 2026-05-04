import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompareWorkspace } from "./CompareWorkspace";
import { createLapChannelsResponse } from "../../test/telemetryFixtures";

const getLapChannelsForBasketEntryMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/telemetryApi", () => ({
  getLapChannelsForBasketEntry: getLapChannelsForBasketEntryMock,
}));

describe("CompareWorkspace", () => {
  beforeEach(() => {
    getLapChannelsForBasketEntryMock.mockReset();
  });

  it("renders the empty compare frame with a Sessions action", async () => {
    const user = userEvent.setup();
    const onOpenSessions = vi.fn();

    render(<CompareWorkspace onOpenSessions={onOpenSessions} />);

    expect(screen.getByText("No comparison set loaded")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "No comparison set loaded",
    );

    await user.click(screen.getByRole("button", { name: "Open Sessions" }));

    expect(onOpenSessions).toHaveBeenCalledTimes(1);
  });

  it("renders the loading frame for future channel fetches", () => {
    render(
      <CompareWorkspace frame={{ kind: "loading" }} onOpenSessions={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Loading comparison data",
    );
    expect(
      screen.getByText("Lap channels are being prepared."),
    ).toBeInTheDocument();
  });

  it("uses default copy for explicit empty and fallback error frames", () => {
    const { rerender } = render(
      <CompareWorkspace frame={{ kind: "empty" }} onOpenSessions={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveAccessibleName(
      "No comparison set loaded",
    );
    expect(
      screen.getByText(/Pinned laps will appear here/i),
    ).toBeInTheDocument();

    rerender(
      <CompareWorkspace
        frame={{ kind: "error", message: undefined as unknown as string }}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "SectorForge could not prepare this comparison.",
    );
  });

  it("renders the error frame with a recoverable action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <CompareWorkspace
        frame={{
          kind: "error",
          message: "Lap channels are no longer retained.",
          actionLabel: "Retry",
          onAction: onRetry,
        }}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveAccessibleName(
      "Comparison data unavailable",
    );
    expect(
      screen.getByText("Lap channels are no longer retained."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders pinned laps and warms lap channel requests", async () => {
    const user = userEvent.setup();
    const onClearBasket = vi.fn();
    const onRemoveLap = vi.fn();
    getLapChannelsForBasketEntryMock.mockResolvedValue(
      createLapChannelsResponse({ sampleCount: 3 }),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 5,
            label: "Practice lap 5",
            color: "#d9b04a",
          },
        ]}
        onRemoveLap={onRemoveLap}
        onClearBasket={onClearBasket}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Lap compare" }),
    ).toHaveTextContent("2 pinned laps");
    expect(screen.getByText("Reference / Practice lap 4")).toBeInTheDocument();
    expect(screen.getByText("Compare 1 / Practice lap 5")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("3 samples")).toHaveLength(2);
    });
    expect(getLapChannelsForBasketEntryMock).toHaveBeenCalledTimes(2);

    await user.click(
      screen.getByRole("button", { name: "Remove Practice lap 4" }),
    );
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onRemoveLap).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      4,
    );
    expect(onClearBasket).toHaveBeenCalledTimes(1);
  });

  it("allows a comparison lap to be reassigned as the reference from the legend", async () => {
    const user = userEvent.setup();
    const onSetReferenceLap = vi.fn();
    getLapChannelsForBasketEntryMock.mockResolvedValue(
      createLapChannelsResponse({ sampleCount: 3 }),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 5,
            label: "Practice lap 5",
            color: "#d9b04a",
          },
        ]}
        onSetReferenceLap={onSetReferenceLap}
        onOpenSessions={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Set Practice lap 5 as reference lap",
      }),
    );

    expect(onSetReferenceLap).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222",
      5,
    );
  });

  it("surfaces per-lap channel errors without replacing the basket", async () => {
    getLapChannelsForBasketEntryMock.mockRejectedValue(
      new Error("lap samples pruned"),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    const basketRow = screen
      .getByText("Reference / Practice lap 4")
      .closest("article");
    if (basketRow === null) {
      throw new Error("Expected pinned lap row to render.");
    }
    await waitFor(() => {
      expect(within(basketRow).getByText("Error")).toHaveAttribute(
        "title",
        "lap samples pruned",
      );
    });
  });

  it("renders an overlay chart with one trace per ready lap and a reference badge", async () => {
    getLapChannelsForBasketEntryMock.mockImplementation(
      ({ lapNumber }: { lapNumber: number }) =>
        Promise.resolve(
          createLapChannelsResponse({
            lapNumber,
            sampleCount: 3,
            channels: {
              time: [0, 1, 2],
              speedKph: [120, 150 + lapNumber, 200],
              rpm: [5000, 6000, 7000],
              throttle: [0.2, 0.6, 0.9],
              brake: [0.0, 0.1, 0.2],
              steering: [0.0, 0.1, -0.1],
            },
          }),
        ),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 5,
            label: "Practice lap 5",
            color: "#d9b04a",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    const overlay = await screen.findByRole("img", {
      name: /Lap overlay chart for Speed/i,
    });
    await waitFor(() => {
      expect(
        overlay.querySelectorAll("path.compare-overlay-trace").length,
      ).toBe(2);
    });
    expect(screen.getByLabelText("Reference lap")).toBeInTheDocument();
  });

  it("switches the overlay channel via the channel selector", async () => {
    const user = userEvent.setup();
    getLapChannelsForBasketEntryMock.mockResolvedValue(
      createLapChannelsResponse({ sampleCount: 3 }),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    await screen.findByRole("img", { name: /Lap overlay chart for Speed/i });
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Channel/i }),
      "throttle",
    );
    expect(
      await screen.findByRole("img", {
        name: /Lap overlay chart for Throttle/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders a delta time plot with losing and gaining segments", async () => {
    getLapChannelsForBasketEntryMock.mockImplementation(
      ({ lapNumber }: { lapNumber: number }) =>
        Promise.resolve(
          createLapChannelsResponse({
            lapNumber,
            sampleCount: 3,
            channels: {
              time: lapNumber === 4 ? [0, 10, 20] : [0, 12, 18],
              speedKph: [120, 150, 200],
              rpm: [5000, 6000, 7000],
              throttle: [0.2, 0.6, 0.9],
              brake: [0.0, 0.1, 0.2],
              steering: [0.0, 0.1, -0.1],
              lapDistance: [0, 100, 200],
            },
          }),
        ),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 5,
            label: "Practice lap 5",
            color: "#d9b04a",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    const deltaPlot = await screen.findByRole("img", {
      name: /Delta time plot vs Practice lap 4/i,
    });

    expect(deltaPlot.querySelector(".compare-delta-zero-line")).not.toBeNull();
    expect(
      deltaPlot.querySelectorAll(".compare-delta-segment-loss").length,
    ).toBeGreaterThan(0);
    expect(
      deltaPlot.querySelectorAll(".compare-delta-segment-gain").length,
    ).toBeGreaterThan(0);
  });

  it("shows a clipping notice when compared laps have different lengths", async () => {
    getLapChannelsForBasketEntryMock.mockImplementation(
      ({ lapNumber }: { lapNumber: number }) =>
        Promise.resolve(
          createLapChannelsResponse({
            lapNumber,
            sampleCount: 3,
            channels: {
              time: lapNumber === 4 ? [0, 10, 20] : [0, 10, 16],
              speedKph: [120, 150, 200],
              rpm: [5000, 6000, 7000],
              throttle: [0.2, 0.6, 0.9],
              brake: [0.0, 0.1, 0.2],
              steering: [0.0, 0.1, -0.1],
              lapDistance: lapNumber === 4 ? [0, 100, 200] : [0, 100, 150],
            },
          }),
        ),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 5,
            label: "Practice lap 5",
            color: "#d9b04a",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        "Delta traces clipped to shortest lap distance for 1 comparison.",
      ),
    ).toBeInTheDocument();
  });

  it("renders sector splits with reference deltas and best sector highlights", async () => {
    getLapChannelsForBasketEntryMock.mockImplementation(
      ({ lapNumber }: { lapNumber: number }) =>
        Promise.resolve(
          createLapChannelsResponse({
            lapNumber,
            lapTime: lapNumber === 4 ? "00:01:01.9000000" : "00:01:02.0000000",
            sector1Time:
              lapNumber === 4 ? "00:00:20.1000000" : "00:00:20.0000000",
            sector2Time:
              lapNumber === 4 ? "00:00:20.7000000" : "00:00:20.9000000",
            sector3Time: "00:00:21.1000000",
            sampleCount: 3,
          }),
        ),
    );

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 5,
            label: "Practice lap 5",
            color: "#d9b04a",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    const table = await screen.findByRole("table", {
      name: /Sector split comparison vs Practice lap 4/i,
    });
    const tableRegion = screen.getByRole("region", {
      name: "Sector split table",
    });
    const tableRows = within(table).getAllByRole("row");
    const lap5Header = within(table).getByRole("rowheader", {
      name: /Lap 5\s*Practice lap 5/i,
    });
    const lap5Row = lap5Header.closest("tr");

    expect(tableRegion).toHaveAttribute("tabindex", "0");
    expect(tableRows[1]).toHaveAttribute("tabindex", "0");
    expect(
      within(table).getByRole("columnheader", { name: "S1" }),
    ).toBeInTheDocument();
    if (lap5Row === null) {
      throw new Error("Expected Practice lap 5 row to render.");
    }
    expect(within(lap5Row).getByText("01:02.000")).toBeInTheDocument();
    expect(within(lap5Row).getByText("+0.100s")).toBeInTheDocument();
    expect(within(lap5Row).getByText("-0.100s")).toBeInTheDocument();
    expect(within(lap5Row).getByText("+0.200s")).toBeInTheDocument();
    expect(
      within(lap5Row).getByRole("cell", {
        name: /Practice lap 5 S1, 00:20.000, delta -0.100s, best sector across pinned laps/i,
      }),
    ).toHaveClass("compare-sector-best");
  });

  it("shows a placeholder when every pinned lap fails to load", async () => {
    getLapChannelsForBasketEntryMock.mockRejectedValue(new Error("blob gone"));

    render(
      <CompareWorkspace
        basketEntries={[
          {
            sessionId: "11111111-1111-1111-1111-111111111111",
            lapNumber: 4,
            label: "Practice lap 4",
            color: "#63b8d6",
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Lap channels could not be loaded for any pinned lap.",
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("img", { name: /Lap overlay chart/i }),
    ).not.toBeInTheDocument();
  });
});
