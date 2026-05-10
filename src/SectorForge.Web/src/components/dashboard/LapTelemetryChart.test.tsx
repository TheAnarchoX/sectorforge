import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LapTelemetryChart } from "./LapTelemetryChart";

describe("LapTelemetryChart", () => {
  it("renders the idle and priming chart states", () => {
    const { rerender } = render(
      <LapTelemetryChart
        points={[]}
        lapNumber={null}
        currentValue={null}
        isActive={false}
      />,
    );

    expect(screen.getByText("Chart idle")).toBeInTheDocument();

    rerender(
      <LapTelemetryChart
        points={[{ elapsedSeconds: 0.5, value: 148 }]}
        lapNumber={4}
        currentValue={148}
        isActive
      />,
    );

    expect(screen.getByText("Collecting live lap samples")).toBeInTheDocument();
  });

  it("renders a populated lap telemetry chart", () => {
    render(
      <LapTelemetryChart
        points={[
          { elapsedSeconds: 0.5, value: 148 },
          { elapsedSeconds: 1, value: 152 },
          { elapsedSeconds: 1.5, value: 156 },
        ]}
        lapNumber={4}
        currentValue={156}
        isActive
      />,
    );

    expect(
      screen.getByRole("img", { name: "Current lap speed trace for lap 4" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lap 4 \/\//i)).toBeInTheDocument();
    expect(screen.getByText(/01\.5 \/\//i)).toBeInTheDocument();
  });

  it("renders a reference speed trace without changing the current chart role", () => {
    const { container } = render(
      <LapTelemetryChart
        points={[
          { elapsedSeconds: 0.5, value: 148 },
          { elapsedSeconds: 1, value: 152 },
          { elapsedSeconds: 1.5, value: 156 },
        ]}
        lapNumber={4}
        currentValue={156}
        isActive
        referenceTrace={{
          label: "Ref L3",
          points: [
            { elapsedSeconds: 0.5, value: 140 },
            { elapsedSeconds: 1, value: 151 },
            { elapsedSeconds: 1.5, value: 159 },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Current lap speed trace for lap 4" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ref L3")).toBeInTheDocument();
    expect(container.querySelector(".lap-chart-reference-path")).not.toBeNull();
  });
});
