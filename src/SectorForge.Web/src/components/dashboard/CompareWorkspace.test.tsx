import { render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByText("Reference / Practice lap 4")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Error")).toHaveAttribute(
        "title",
        "lap samples pruned",
      );
    });
  });
});
