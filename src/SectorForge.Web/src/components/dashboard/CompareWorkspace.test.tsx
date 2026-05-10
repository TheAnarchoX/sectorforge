import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompareWorkspace } from "./CompareWorkspace";
import { createLapChannelsResponse } from "../../test/telemetryFixtures";
import { DEFAULT_COMPARE_PANEL_ID } from "../../types/telemetry";

const getLapChannelsForBasketEntryMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/telemetryApi", () => ({
  getLapChannelsForBasketEntry: getLapChannelsForBasketEntryMock,
}));

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Blob read failed."));
    reader.readAsText(blob);
  });
}

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

  it("exports pinned laps as a JSON comparison set", async () => {
    const user = userEvent.setup();
    const createObjectURLMock = vi.fn((blob: Blob) => {
      void blob;
      return "blob:sectorforge-compare";
    });
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
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
        onImportComparisonSet={vi.fn()}
        onOpenSessions={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith(
      "blob:sectorforge-compare",
    );
    const exportedBlob = createObjectURLMock.mock.calls[0][0] as Blob;
    await expect(readBlobText(exportedBlob)).resolves.toContain(
      '"schema": "sectorforge.lapComparisonSet"',
    );
    await expect(readBlobText(exportedBlob)).resolves.toContain(
      '"role": "reference"',
    );
    expect(screen.getByText("Exported 2 laps to JSON.")).toBeInTheDocument();
  });

  it("imports a valid comparison set and reports invalid files", async () => {
    const user = userEvent.setup();
    const onImportComparisonSet = vi.fn();
    render(
      <CompareWorkspace
        onImportComparisonSet={onImportComparisonSet}
        maxBasketEntries={6}
        onOpenSessions={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText("Import comparison JSON"),
      new File(
        [
          JSON.stringify({
            version: 1,
            reference: {
              sessionId: "22222222-2222-2222-2222-222222222222",
              lapNumber: 5,
            },
            entries: [
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
            ],
          }),
        ],
        "compare.json",
        { type: "application/json" },
      ),
    );

    await waitFor(() => {
      expect(onImportComparisonSet).toHaveBeenCalledTimes(1);
    });
    expect(onImportComparisonSet.mock.calls[0][0]).toMatchObject([
      { label: "Practice lap 5", lapNumber: 5 },
      { label: "Practice lap 4", lapNumber: 4 },
    ]);
    expect(onImportComparisonSet.mock.calls[0][1]).toEqual({
      sessionId: "22222222-2222-2222-2222-222222222222",
      lapNumber: 5,
    });
    expect(screen.getByText("Imported 2 laps from JSON.")).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("Import comparison JSON"),
      new File(["not-json"], "broken.json", { type: "application/json" }),
    );

    expect(
      await screen.findByText(
        "Import failed: The selected file is not valid JSON.",
      ),
    ).toHaveAttribute("role", "alert");
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

  it("keeps overlay and delta charts working for laps from different sessions", async () => {
    getLapChannelsForBasketEntryMock.mockImplementation(
      ({ sessionId }: { sessionId: string }) =>
        Promise.resolve(
          createLapChannelsResponse({
            sessionId,
            lapNumber: 4,
            sampleCount: 3,
            channels: {
              time:
                sessionId === "11111111-1111-1111-1111-111111111111"
                  ? [0, 10, 20]
                  : [0, 11, 19],
              speedKph:
                sessionId === "11111111-1111-1111-1111-111111111111"
                  ? [120, 150, 200]
                  : [118, 152, 204],
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
            label: "Silverstone L4",
            color: "#63b8d6",
            session: {
              game: "SectorForge Sim",
              sourceName: "Fake telemetry",
              trackName: "Silverstone",
              carName: "GT3 Evo",
              startedAt: "2026-05-03T11:45:00.000Z",
              weather: "Dry",
              trackTemperatureC: 31.2,
              airTemperatureC: 22.4,
            },
          },
          {
            sessionId: "22222222-2222-2222-2222-222222222222",
            lapNumber: 4,
            label: "Spa L4",
            color: "#d9b04a",
            session: {
              game: "SectorForge Sim",
              sourceName: "Fake telemetry",
              trackName: "Spa-Francorchamps",
              carName: "GT3 Evo",
              startedAt: "2026-05-04T14:15:00.000Z",
              weather: "Light rain",
              trackTemperatureC: 24.8,
              airTemperatureC: 18.1,
            },
          },
        ]}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByText("2 sessions")).toBeInTheDocument();
    const contextStrip = screen.getByRole("region", {
      name: "Compared session context",
    });
    expect(within(contextStrip).getByText("Silverstone")).toBeInTheDocument();
    expect(
      within(contextStrip).getByText("Spa-Francorchamps"),
    ).toBeInTheDocument();
    expect(within(contextStrip).getByText(/Dry/)).toBeInTheDocument();
    expect(within(contextStrip).getByText(/Light rain/)).toBeInTheDocument();

    const overlay = await screen.findByRole("img", {
      name: /Lap overlay chart for Speed/i,
    });
    const deltaPlot = await screen.findByRole("img", {
      name: /Delta time plot vs Silverstone L4/i,
    });

    await waitFor(() => {
      expect(
        overlay.querySelectorAll("path.compare-overlay-trace").length,
      ).toBe(2);
      expect(
        deltaPlot.querySelectorAll(".compare-delta-segment").length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByText(/Silverstone \/ 11111111/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Spa-Francorchamps \/ 22222222/).length,
    ).toBeGreaterThan(0);
  });

  it("uses basket panel channel selection and forwards selector changes", async () => {
    const user = userEvent.setup();
    const onSetPanelChannel = vi.fn();
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
            channelSelections: [
              { panelId: DEFAULT_COMPARE_PANEL_ID, channelKey: "rpm" },
            ],
          },
        ]}
        onSetPanelChannel={onSetPanelChannel}
        onOpenSessions={vi.fn()}
      />,
    );

    await screen.findByRole("img", { name: /Lap overlay chart for RPM/i });
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Channel/i }),
      "throttle",
    );
    expect(
      await screen.findByRole("img", {
        name: /Lap overlay chart for Throttle/i,
      }),
    ).toBeInTheDocument();
    expect(onSetPanelChannel).toHaveBeenCalledWith(
      DEFAULT_COMPARE_PANEL_ID,
      "throttle",
    );
  });

  it("adds, updates, and removes an independent overlay chart", async () => {
    const user = userEvent.setup();
    const onSetPanelChannel = vi.fn();
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
        onSetPanelChannel={onSetPanelChannel}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("img", {
        name: /Lap overlay chart for Speed overlay 1/i,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add chart" }));

    expect(onSetPanelChannel).toHaveBeenCalledWith("overlay-2", "rpm");
    expect(
      await screen.findByRole("img", {
        name: /Lap overlay chart for RPM overlay 2/i,
      }),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Overlay 2 channel/i }),
      "throttle",
    );

    expect(onSetPanelChannel).toHaveBeenCalledWith("overlay-2", "throttle");
    expect(
      await screen.findByRole("img", {
        name: /Lap overlay chart for Throttle overlay 2/i,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove overlay 2" }));

    expect(
      screen.queryByRole("img", {
        name: /Lap overlay chart for Throttle overlay 2/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Reference / Practice lap 4")).toBeInTheDocument();
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

  it("shares a distance cursor between overlay and delta panels", async () => {
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

    const overlay = await screen.findByRole("img", {
      name: /Lap overlay chart for Speed/i,
    });
    const deltaPlot = await screen.findByRole("img", {
      name: /Delta time plot vs Practice lap 4/i,
    });
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 860,
      bottom: 280,
      width: 860,
      height: 280,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerMove(overlay, { clientX: 450 });

    await waitFor(() => {
      expect(
        overlay.querySelector(".compare-distance-cursor-line"),
      ).not.toBeNull();
      expect(
        deltaPlot.querySelector(".compare-distance-cursor-line"),
      ).not.toBeNull();
    });

    const cursorTable = await screen.findByRole("table", {
      name: /Cursor values at 100 m/i,
    });
    const lap4Header = within(cursorTable).getByRole("rowheader", {
      name: /Lap 4\s*Practice lap 4/i,
    });
    const lap5Header = within(cursorTable).getByRole("rowheader", {
      name: /Lap 5\s*Practice lap 5/i,
    });
    const lap4Row = lap4Header.closest("tr");
    const lap5Row = lap5Header.closest("tr");
    if (lap4Row === null || lap5Row === null) {
      throw new Error("Expected cursor readout rows to render.");
    }

    expect(within(lap4Row).getByText("150 kph")).toBeInTheDocument();
    expect(within(lap4Row).getByText("REF")).toBeInTheDocument();
    expect(within(lap4Row).getByText("S1")).toBeInTheDocument();
    expect(within(lap5Row).getByText("150 kph")).toBeInTheDocument();
    expect(within(lap5Row).getByText("+2.000s")).toBeInTheDocument();
    expect(within(lap5Row).getByText("S1")).toBeInTheDocument();

    fireEvent.pointerLeave(overlay);
    await waitFor(() => {
      expect(
        screen.queryByRole("table", { name: /Cursor values at 100 m/i }),
      ).not.toBeInTheDocument();
    });

    fireEvent.focus(deltaPlot);
    expect(
      await screen.findByRole("table", { name: /Cursor values at 100 m/i }),
    ).toBeInTheDocument();
  });

  it("keeps the distance cursor synchronized across multiple overlay charts", async () => {
    const user = userEvent.setup();
    getLapChannelsForBasketEntryMock.mockResolvedValue(
      createLapChannelsResponse({
        sampleCount: 3,
        channels: {
          time: [0, 10, 20],
          speedKph: [120, 150, 200],
          rpm: [5000, 6000, 7000],
          throttle: [0.2, 0.6, 0.9],
          brake: [0.0, 0.1, 0.2],
          steering: [0.0, 0.1, -0.1],
          lapDistance: [0, 100, 200],
        },
      }),
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

    const primaryOverlay = await screen.findByRole("img", {
      name: /Lap overlay chart for Speed overlay 1/i,
    });

    await user.click(screen.getByRole("button", { name: "Add chart" }));
    const secondaryOverlay = await screen.findByRole("img", {
      name: /Lap overlay chart for RPM overlay 2/i,
    });
    vi.spyOn(primaryOverlay, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 860,
      bottom: 280,
      width: 860,
      height: 280,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerMove(primaryOverlay, { clientX: 450 });

    await waitFor(() => {
      expect(
        primaryOverlay.querySelector(".compare-distance-cursor-line"),
      ).not.toBeNull();
      expect(
        secondaryOverlay.querySelector(".compare-distance-cursor-line"),
      ).not.toBeNull();
    });
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
