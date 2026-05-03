import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardHeader } from "./DashboardHeader";
import { createTelemetrySource } from "../../test/telemetryFixtures";

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof DashboardHeader>> = {},
) {
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
  const props: React.ComponentProps<typeof DashboardHeader> = {
    connectionState: "connected",
    runMode: "Live",
    isCollectorRunning: true,
    isReplayRunning: false,
    isBusy: false,
    trackName: null,
    sessionName: null,
    sourceName: null,
    samplesPublished: 0,
    adapters,
    activeAdapterId: "f1-25-udp",
    onStartAdapter: vi.fn(),
    onStopCollector: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  const result = render(<DashboardHeader {...props} />);
  return { ...result, props };
}

function getAdapterSelect(): HTMLSelectElement {
  return screen.getByLabelText(
    "Telemetry adapter to start",
  ) as HTMLSelectElement;
}

describe("DashboardHeader adapter picker", () => {
  it("defaults the adapter dropdown to the active adapter on mount", () => {
    renderHeader({ activeAdapterId: "f1-25-udp" });
    expect(getAdapterSelect().value).toBe("f1-25-udp");
  });

  it("syncs the dropdown when activeAdapterId changes after mount", () => {
    const { rerender, props } = renderHeader({ activeAdapterId: "fake" });
    expect(getAdapterSelect().value).toBe("fake");

    rerender(<DashboardHeader {...props} activeAdapterId="f1-25-udp" />);

    expect(getAdapterSelect().value).toBe("f1-25-udp");
  });
});
