import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdapterSetupTable } from "./AdapterSetupTable";
import { createTelemetrySource } from "../../test/telemetryFixtures";

function renderTable(
  overrides: Partial<React.ComponentProps<typeof AdapterSetupTable>> = {},
) {
  const props: React.ComponentProps<typeof AdapterSetupTable> = {
    adapters: [createTelemetrySource()],
    activeAdapterId: "fake",
    isCollectorRunning: false,
    isBusy: false,
    onStartAdapter: vi.fn(),
    onStopAdapter: vi.fn(),
    ...overrides,
  };
  render(<AdapterSetupTable {...props} />);
  return props;
}

describe("AdapterSetupTable", () => {
  it("renders rows and reveals F1 25 setup steps when expanded", async () => {
    const user = userEvent.setup();
    const adapters = [
      createTelemetrySource(),
      createTelemetrySource({
        adapterId: "f1-25-udp",
        displayName: "EA Sports F1 25",
        inputKind: "UDP",
        isSimulated: false,
        status: "Available",
        game: "F1 25",
        notes: null,
      }),
    ];

    renderTable({ adapters, activeAdapterId: "fake" });

    expect(screen.getByText("Fake telemetry")).toBeInTheDocument();
    expect(screen.getByText("EA Sports F1 25")).toBeInTheDocument();

    expect(
      screen.queryByTestId("adapter-detail-f1-25-udp"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /EA Sports F1 25/i }));

    const detail = screen.getByTestId("adapter-detail-f1-25-udp");
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent("UDP Telemetry");
    expect(detail).toHaveTextContent("Adapters:f1-25-udp:Enabled");
    expect(detail).toHaveTextContent("Requirements");
  });

  it("shows fake adapter notes with no firewall requirements", async () => {
    const user = userEvent.setup();
    const adapters = [createTelemetrySource()];

    renderTable({ adapters, activeAdapterId: "fake" });

    await user.click(screen.getByRole("button", { name: /Fake telemetry/i }));

    const detail = screen.getByTestId("adapter-detail-fake");
    expect(detail).toHaveTextContent("No game required");
    expect(detail).toHaveTextContent("Adapters:fake:Enabled");
    expect(detail).toHaveTextContent("No external ports");
  });

  it("invokes onStartAdapter with the adapter id when the row Start button is clicked", async () => {
    const user = userEvent.setup();
    const adapters = [
      createTelemetrySource(),
      createTelemetrySource({
        adapterId: "f1-25-udp",
        displayName: "EA Sports F1 25",
        inputKind: "UDP",
        isSimulated: false,
        status: "Available",
        game: "F1 25",
        notes: null,
      }),
    ];
    const onStartAdapter = vi.fn();

    renderTable({
      adapters,
      activeAdapterId: null,
      isCollectorRunning: false,
      onStartAdapter,
    });

    await user.click(screen.getByTestId("adapter-start-f1-25-udp"));

    expect(onStartAdapter).toHaveBeenCalledWith("f1-25-udp");
  });

  it("shows a Stop button for the active adapter and calls onStopAdapter", async () => {
    const user = userEvent.setup();
    const adapters = [
      createTelemetrySource({
        adapterId: "f1-25-udp",
        displayName: "EA Sports F1 25",
        inputKind: "UDP",
        isSimulated: false,
        status: "Available",
        game: "F1 25",
        notes: null,
      }),
    ];
    const onStopAdapter = vi.fn();

    renderTable({
      adapters,
      activeAdapterId: "f1-25-udp",
      isCollectorRunning: true,
      onStopAdapter,
    });

    await user.click(screen.getByTestId("adapter-stop-f1-25-udp"));

    expect(onStopAdapter).toHaveBeenCalledTimes(1);
  });

  it("folds the active adapter into the State column", () => {
    const adapters = [
      createTelemetrySource({ status: "Available" }),
      createTelemetrySource({
        adapterId: "f1-25-udp",
        displayName: "EA Sports F1 25",
        inputKind: "UDP",
        isSimulated: false,
        status: "Available",
        game: "F1 25",
        notes: null,
      }),
    ];

    renderTable({
      adapters,
      activeAdapterId: "f1-25-udp",
      isCollectorRunning: true,
    });

    expect(
      screen.queryByRole("columnheader", { name: "Active" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("adapter-row-f1-25-udp")).getByText("Active"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("adapter-row-fake")).getByText("Available"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("adapter-start-fake")).toHaveTextContent(
      "Switch",
    );
  });

  it("disables the Start button for unavailable (NotImplemented) adapters", () => {
    const adapters = [
      createTelemetrySource({
        adapterId: "acc-shared-memory",
        displayName: "Assetto Corsa Competizione",
        status: "NotImplemented",
      }),
    ];

    renderTable({
      adapters,
      activeAdapterId: null,
      isCollectorRunning: false,
    });

    expect(
      screen.getByTestId("adapter-start-acc-shared-memory"),
    ).toBeDisabled();
  });
});
