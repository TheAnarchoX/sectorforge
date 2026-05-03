import { AlertTriangle, GitCompareArrows, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export type CompareWorkspaceFrame =
  | {
      kind: "empty";
      title?: string;
      message?: string;
      actionLabel?: string;
      onAction?: () => void;
    }
  | {
      kind: "loading";
      title?: string;
      message?: string;
    }
  | {
      kind: "error";
      title?: string;
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    };

type CompareWorkspaceProps = {
  frame?: CompareWorkspaceFrame;
  onOpenSessions: () => void;
};

const DEFAULT_EMPTY_TITLE = "No comparison set loaded";
const DEFAULT_EMPTY_MESSAGE =
  "Pinned laps will appear here with reusable compare frames for overlays, deltas, and sector tables.";

export function CompareWorkspace({
  frame,
  onOpenSessions,
}: CompareWorkspaceProps) {
  const resolvedFrame =
    frame ??
    ({
      kind: "empty",
      title: DEFAULT_EMPTY_TITLE,
      message: DEFAULT_EMPTY_MESSAGE,
      actionLabel: "Open Sessions",
      onAction: onOpenSessions,
    } satisfies CompareWorkspaceFrame);

  return <CompareWorkspaceFrameView frame={resolvedFrame} />;
}

function CompareWorkspaceFrameView({
  frame,
}: {
  frame: CompareWorkspaceFrame;
}) {
  const icon = getFrameIcon(frame.kind);
  const kicker = frame.kind === "error" ? "Compare error" : "Compare";
  const title = frame.title ?? getDefaultTitle(frame.kind);
  const message = frame.message ?? getDefaultMessage(frame.kind);
  const role = frame.kind === "error" ? "alert" : "status";

  return (
    <section
      className={`workspace-empty workspace-empty-${frame.kind}`}
      aria-label={title}
      aria-busy={frame.kind === "loading" ? "true" : undefined}
      role={role}
    >
      <div className="workspace-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <span className="workspace-empty-kicker">{kicker}</span>
      <h2 className="workspace-empty-title">{title}</h2>
      <p className="workspace-empty-body">{message}</p>
      {"actionLabel" in frame && frame.actionLabel && frame.onAction && (
        <button
          type="button"
          className="icon-button primary"
          onClick={frame.onAction}
        >
          {frame.actionLabel}
        </button>
      )}
    </section>
  );
}

function getFrameIcon(kind: CompareWorkspaceFrame["kind"]): ReactNode {
  switch (kind) {
    case "loading":
      return <LoaderCircle size={20} />;
    case "error":
      return <AlertTriangle size={20} />;
    default:
      return <GitCompareArrows size={20} />;
  }
}

function getDefaultTitle(kind: CompareWorkspaceFrame["kind"]) {
  switch (kind) {
    case "loading":
      return "Loading comparison data";
    case "error":
      return "Comparison data unavailable";
    default:
      return DEFAULT_EMPTY_TITLE;
  }
}

function getDefaultMessage(kind: CompareWorkspaceFrame["kind"]) {
  switch (kind) {
    case "loading":
      return "Lap channels are being prepared.";
    case "error":
      return "SectorForge could not prepare this comparison.";
    default:
      return DEFAULT_EMPTY_MESSAGE;
  }
}
