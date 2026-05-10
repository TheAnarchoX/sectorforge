import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ErrorBanner,
  ModePill,
  SectorBar,
  SessionBand,
  StateNotice,
  StatusPill,
  StripCell,
  TraceLane,
} from "./DashboardPrimitives";

describe("DashboardPrimitives", () => {
  it("renders alert, notice, pill, strip, and session chrome", () => {
    render(
      <>
        <ErrorBanner
          title="Collector warning"
          message="A local runtime issue was reported."
          tone="warning"
        />
        <StateNotice
          title="Collector idle"
          message="Start fake telemetry to resume the dashboard."
          tone="warning"
        />
        <StatusPill label="Signal" state="reconnecting" />
        <ModePill mode="Replay" isRunning />
        <StripCell label="Fuel" value="42.4" unit="liters" tone="warning" />
        <SessionBand
          sessionType="Practice"
          sessionName="P1"
          trackName="Silverstone"
          weather="Dry"
          trackTempC={31.2}
          airTempC={22.4}
          elapsed="00:12:15.000"
          remaining="00:17:45.000"
          lapNumber={4}
          lapTotal={12}
          flag="yellow"
        />
        <SectorBar
          activeIndex={1}
          sectorTones={["neutral", "improving", "personal"]}
        />
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Collector warning");
    expect(screen.getByRole("status")).toHaveTextContent("Collector idle");
    expect(screen.getByText("reconnecting")).toBeInTheDocument();
    expect(screen.getByText("Replay")).toBeInTheDocument();
    expect(screen.getByText("42.4")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Session conditions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 / 12")).toBeInTheDocument();
    expect(screen.getByText("S2")).toHaveClass("active");
  });

  it("renders empty and active trace lanes", () => {
    const onCursorRatioChange = vi.fn();
    const onCursorClear = vi.fn();
    const { rerender, container } = render(
      <TraceLane
        label="Throttle"
        value="0"
        unit="%"
        values={[]}
        min={0}
        max={100}
        color="var(--accent-green)"
      />,
    );

    expect(screen.getByText("Awaiting trace data")).toBeInTheDocument();

    rerender(
      <TraceLane
        label="Throttle"
        value="72"
        unit="%"
        values={[0, 35, 72, 90]}
        xValues={[20, 25, 30, 40]}
        xMax={40}
        min={0}
        max={100}
        centerValue={50}
        color="var(--accent-green)"
        cursorRatio={0.5}
        onCursorRatioChange={onCursorRatioChange}
        onCursorClear={onCursorClear}
        expanded
      />,
    );

    const traceImage = screen.getByRole("img", { name: "Throttle trace" });

    expect(traceImage).toBeInTheDocument();
    expect(traceImage).toHaveAttribute("preserveAspectRatio", "none");
    expect(container.querySelector(".trace-center-line")).not.toBeNull();
    expect(container.querySelector(".trace-cursor-line")).not.toBeNull();
    expect(
      container.querySelector(".trace-cursor-line")?.getAttribute("x1"),
    ).toBe("380");
    expect(container.querySelector(".trace-lane-expanded")).not.toBeNull();
    expect(
      container.querySelector(".trace-grid-line")?.getAttribute("x1"),
    ).toBe("0");
    expect(
      container.querySelector(".trace-grid-line")?.getAttribute("x2"),
    ).toBe("760");
    expect(
      container.querySelector(".trace-line")?.getAttribute("points"),
    ).toMatch(/^380,/);

    vi.spyOn(traceImage, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      width: 200,
      height: 50,
      top: 0,
      right: 300,
      bottom: 50,
      left: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(traceImage, { clientX: 150 });
    fireEvent.pointerLeave(traceImage);

    expect(onCursorRatioChange).toHaveBeenCalledWith(0.25);
    expect(onCursorClear).toHaveBeenCalledTimes(1);
  });
});
