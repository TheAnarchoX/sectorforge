import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompareWorkspace } from "./CompareWorkspace";

describe("CompareWorkspace", () => {
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
});
