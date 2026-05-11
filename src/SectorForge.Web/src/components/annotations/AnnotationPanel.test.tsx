import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AnnotationPanel,
  type AnnotationContextOption,
} from "./AnnotationPanel";
import type { TelemetryAnnotation } from "../../utils/telemetryAnnotations";

const SESSION_CONTEXT: AnnotationContextOption = {
  id: "session:session-1",
  label: "Silverstone session",
  scope: "session",
  sessionId: "session-1",
};

const LAP_CONTEXT: AnnotationContextOption = {
  id: "lap:session-1:3",
  label: "Silverstone lap 3",
  scope: "lap",
  sessionId: "session-1",
  lapNumber: 3,
};

const MOMENT_CONTEXT: AnnotationContextOption = {
  id: "moment:session-1:3:420:12.4",
  label: "T1 braking marker",
  scope: "moment",
  sessionId: "session-1",
  lapNumber: 3,
  startTimeSeconds: 12.4,
  endTimeSeconds: 13.1,
  distanceMeters: 420,
  endDistanceMeters: 455,
};

function createAnnotation(
  override: Partial<TelemetryAnnotation> = {},
): TelemetryAnnotation {
  return {
    id: "ann-1",
    scope: "lap",
    sessionId: "session-1",
    lapNumber: 3,
    note: "Trail brake too late",
    tags: ["braking", "setup"],
    category: "driver feedback",
    createdAt: "2026-05-03T12:00:00.000Z",
    updatedAt: "2026-05-03T12:05:00.000Z",
    startTimeSeconds: null,
    endTimeSeconds: null,
    distanceMeters: null,
    endDistanceMeters: null,
    ...override,
  };
}

function renderPanel(
  override: Partial<React.ComponentProps<typeof AnnotationPanel>> = {},
) {
  const onAddAnnotation = vi.fn();
  const onUpdateAnnotation = vi.fn();
  const onDeleteAnnotation = vi.fn();
  const onSelectAnnotation = vi.fn();
  const onDraftConsumed = vi.fn();

  render(
    <AnnotationPanel
      title="Compare notes"
      annotations={[createAnnotation()]}
      contextOptions={[SESSION_CONTEXT, LAP_CONTEXT, MOMENT_CONTEXT]}
      onAddAnnotation={onAddAnnotation}
      onUpdateAnnotation={onUpdateAnnotation}
      onDeleteAnnotation={onDeleteAnnotation}
      onSelectAnnotation={onSelectAnnotation}
      onDraftConsumed={onDraftConsumed}
      defaultCollapsed={false}
      {...override}
    />,
  );

  return {
    onAddAnnotation,
    onUpdateAnnotation,
    onDeleteAnnotation,
    onSelectAnnotation,
    onDraftConsumed,
  };
}

describe("AnnotationPanel", () => {
  it("adds, edits, filters, selects, and deletes annotations", async () => {
    const user = userEvent.setup();
    const rendered = renderPanel({
      headerAction: <button type="button">Export notes</button>,
      annotations: [
        createAnnotation(),
        createAnnotation({
          id: "ann-2",
          scope: "session",
          lapNumber: null,
          note: "Run lower rear wing",
          tags: ["setup"],
          category: "setup change",
        }),
      ],
    });

    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export notes" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search annotations"), "brake");
    expect(screen.getByText("Trail brake too late")).toBeInTheDocument();
    expect(screen.queryByText("Run lower rear wing")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search annotations"));
    await user.selectOptions(
      screen.getByLabelText("Filter annotations by tag"),
      "setup",
    );
    expect(screen.getByText("Trail brake too late")).toBeInTheDocument();
    expect(screen.getByText("Run lower rear wing")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("Filter annotations by tag"),
      "",
    );
    await user.click(screen.getAllByRole("button", { name: "View" })[0]);
    expect(rendered.onSelectAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ann-1" }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /edit annotation trail brake too late/i,
      }),
    );
    expect(
      screen.getByRole("button", { name: /save note/i }),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Note"));
    await user.type(screen.getByLabelText("Note"), "Brake five meters earlier");
    await user.selectOptions(screen.getByLabelText("Category"), "strategy");
    await user.clear(screen.getByLabelText("Tags"));
    await user.type(screen.getByLabelText("Tags"), "braking, stint");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    expect(rendered.onUpdateAnnotation).toHaveBeenCalledWith(
      "ann-1",
      expect.objectContaining({
        scope: "lap",
        sessionId: "session-1",
        lapNumber: 3,
        note: "Brake five meters earlier",
        tags: ["braking", "stint"],
        category: "strategy",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /delete annotation trail brake too late/i,
      }),
    );
    expect(rendered.onDeleteAnnotation).toHaveBeenCalledWith("ann-1");
  });

  it("handles drafts, collapsed state, empty contexts, and add-note submission", async () => {
    const user = userEvent.setup();
    const rendered = renderPanel({
      annotations: [],
      contextOptions: [],
      defaultCollapsed: true,
      draft: MOMENT_CONTEXT,
    });

    await waitFor(() =>
      expect(rendered.onDraftConsumed).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByRole("button", { name: /hide/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Context")).toHaveValue(MOMENT_CONTEXT.id);

    await user.click(screen.getByRole("button", { name: /hide/i }));
    expect(
      screen.queryByLabelText("Annotation search"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open/i }));
    await user.type(
      screen.getByLabelText("Note"),
      "Mark the braking reference",
    );
    await user.selectOptions(
      screen.getByLabelText("Category"),
      "track condition",
    );
    await user.type(screen.getByLabelText("Tags"), "braking, reference");
    await user.click(screen.getByRole("button", { name: /add note/i }));

    expect(rendered.onAddAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "moment",
        sessionId: "session-1",
        lapNumber: 3,
        note: "Mark the braking reference",
        tags: ["braking", "reference"],
        category: "track condition",
        startTimeSeconds: 12.4,
        endTimeSeconds: 13.1,
        distanceMeters: 420,
        endDistanceMeters: 455,
      }),
    );

    const searchRegion = screen.getByLabelText("Annotation search");
    await user.type(
      within(searchRegion).getByLabelText("Search annotations"),
      "missing",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No annotations match the current filters.",
    );
  });

  it("keeps the editor disabled when no context is available", async () => {
    const user = userEvent.setup();
    renderPanel({
      annotations: [],
      contextOptions: [],
      defaultCollapsed: false,
    });

    expect(screen.getByLabelText("Context")).toHaveValue("");
    expect(screen.getByRole("button", { name: /add note/i })).toBeDisabled();

    await user.type(screen.getByLabelText("Note"), "No context yet");
    expect(screen.getByRole("button", { name: /add note/i })).toBeDisabled();
  });
});
