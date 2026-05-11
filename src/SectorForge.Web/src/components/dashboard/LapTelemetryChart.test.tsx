import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("renders and updates the synchronized cursor within the plot area", () => {
    const onCursorRatioChange = vi.fn();
    const onCursorClear = vi.fn();
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
        cursorRatio={0.5}
        onCursorRatioChange={onCursorRatioChange}
        onCursorClear={onCursorClear}
      />,
    );

    const chart = screen.getByRole("img", {
      name: "Current lap speed trace for lap 4",
    });

    expect(container.querySelector(".lap-chart-cursor-line")).not.toBeNull();
    expect(
      container.querySelector(".lap-chart-cursor-line")?.getAttribute("x1"),
    ).toBe("449");

    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      width: 860,
      height: 248,
      top: 0,
      right: 960,
      bottom: 248,
      left: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(chart, { clientX: 352.5 });
    fireEvent.pointerLeave(chart);

    expect(onCursorRatioChange).toHaveBeenCalledWith(expect.closeTo(0.25));
    expect(onCursorClear).toHaveBeenCalledTimes(1);
  });
});
