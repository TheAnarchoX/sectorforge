import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LiveStatusPanels } from "./LiveStatusPanels";
import { createTelemetrySample } from "../../test/telemetryFixtures";

describe("LiveStatusPanels", () => {
  it("renders nothing when sample is null", () => {
    const { container } = render(<LiveStatusPanels sample={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides every optional panel when only base channels are present", () => {
    const sample = createTelemetrySample();
    render(<LiveStatusPanels sample={sample} />);

    expect(screen.queryByTestId("driver-flags-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sector-splits-tiles")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("weather-forecast-strip"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("damage-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ers-panel")).not.toBeInTheDocument();
  });

  it("renders the driver flags strip and lap-valid badge when populated", () => {
    const sample = createTelemetrySample({
      driverInput: {
        drsActive: true,
        pitLimiterActive: false,
        absActive: true,
        tcActive: false,
      },
      lap: { isValid: false },
    });

    render(<LiveStatusPanels sample={sample} />);

    expect(screen.getByTestId("driver-flags-strip")).toBeInTheDocument();
    expect(screen.getByText("DRS")).toBeInTheDocument();
    expect(screen.getByText("Pit lim.")).toBeInTheDocument();
    expect(screen.getByText("ABS")).toBeInTheDocument();
    expect(screen.getByText("TC")).toBeInTheDocument();
    const badge = screen.getByTestId("lap-valid-badge");
    expect(badge).toHaveTextContent("INVALID");
  });

  it("renders sector split tiles when at least one split is present", () => {
    const sample = createTelemetrySample({
      lap: {
        sector1Time: "00:00:24.500",
        lastSector1Time: "00:00:24.700",
        sector2Time: null,
        sector3Time: null,
      },
    });

    render(<LiveStatusPanels sample={sample} />);

    const tiles = screen.getByTestId("sector-splits-tiles");
    expect(tiles).toBeInTheDocument();
    expect(tiles).toHaveTextContent("S1");
    expect(tiles).toHaveTextContent("S2");
    expect(tiles).toHaveTextContent("S3");
  });

  it("renders the weather forecast strip when forecast samples exist", () => {
    const sample = createTelemetrySample({
      weatherForecast: {
        samples: [
          {
            minutesAhead: 5,
            weather: "LightRain",
            rainPercent: 30,
            trackTemperatureC: 28,
            airTemperatureC: 18,
          },
        ],
      },
    });

    render(<LiveStatusPanels sample={sample} />);

    const strip = screen.getByTestId("weather-forecast-strip");
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent("+5m");
    expect(strip).toHaveTextContent("LightRain");
  });

  it("renders varied weather forecast conditions", () => {
    const sample = createTelemetrySample({
      weatherForecast: {
        samples: [
          { minutesAhead: 0, weather: "Storm", rainPercent: 90 },
          { minutesAhead: 5, weather: "HeavyRain", rainPercent: 75 },
          { minutesAhead: 10, weather: "Overcast", rainPercent: 20 },
          { minutesAhead: 15, weather: "Clear", rainPercent: 0 },
          { minutesAhead: null, weather: null, rainPercent: null },
        ],
      },
    });

    render(<LiveStatusPanels sample={sample} />);

    const strip = screen.getByTestId("weather-forecast-strip");
    expect(strip).toHaveTextContent("5 samples");
    expect(strip).toHaveTextContent("Storm");
    expect(strip).toHaveTextContent("HeavyRain");
    expect(strip).toHaveTextContent("Overcast");
    expect(strip).toHaveTextContent("Clear");
    expect(strip).toHaveTextContent("+15m");
  });

  it("renders the damage panel collapsed by default and expands on toggle", async () => {
    const user = userEvent.setup();
    const sample = createTelemetrySample({
      damage: {
        frontLeftWingPercent: 12,
        rearWingPercent: 4,
        enginePercent: 1,
        frontLeftTyreDamage: { damagePercent: 3 },
      },
    });

    render(<LiveStatusPanels sample={sample} />);

    const panel = screen.getByTestId("damage-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.queryByText("FL wing")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("FL wing")).toBeInTheDocument();
    expect(screen.getByText("Engine")).toBeInTheDocument();
  });

  it("renders the ERS panel collapsed by default and expands on toggle", async () => {
    const user = userEvent.setup();
    const sample = createTelemetrySample({
      powerUnit: {
        ersStoreJoules: 2_000_000,
        ersDeployedThisLapJoules: 500_000,
        ersHarvestedThisLapMguk: 300_000,
        ersHarvestedThisLapMguh: 100_000,
        ersDeployMode: "Overtake",
      },
    });

    render(<LiveStatusPanels sample={sample} />);

    const panel = screen.getByTestId("ers-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.queryByText("Store")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getByText("Overtake")).toBeInTheDocument();
  });
});
