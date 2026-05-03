import {
  AlertTriangle,
  GitCompareArrows,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getLapChannelsForBasketEntry } from "../../api/telemetryApi";
import type {
  LapBasketEntry,
  LapChannelsResponse,
} from "../../types/telemetry";

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
  basketEntries?: LapBasketEntry[];
  onRemoveLap?: (sessionId: string, lapNumber: number) => void;
  onClearBasket?: () => void;
  onOpenSessions: () => void;
};

type LapChannelLoadState =
  | { status: "loading" }
  | { status: "ready"; response: LapChannelsResponse }
  | { status: "error"; message: string };

const DEFAULT_EMPTY_TITLE = "No comparison set loaded";
const DEFAULT_EMPTY_MESSAGE =
  "Pinned laps will appear here with reusable compare frames for overlays, deltas, and sector tables.";

export function CompareWorkspace({
  frame,
  basketEntries = [],
  onRemoveLap,
  onClearBasket,
  onOpenSessions,
}: CompareWorkspaceProps) {
  if (basketEntries.length > 0 && frame === undefined) {
    return (
      <CompareBasketView
        entries={basketEntries}
        onRemoveLap={onRemoveLap}
        onClearBasket={onClearBasket}
      />
    );
  }

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

function CompareBasketView({
  entries,
  onRemoveLap,
  onClearBasket,
}: {
  entries: LapBasketEntry[];
  onRemoveLap?: (sessionId: string, lapNumber: number) => void;
  onClearBasket?: () => void;
}) {
  const [channelStates, setChannelStates] = useState<
    Record<string, LapChannelLoadState>
  >({});

  useEffect(() => {
    let isCancelled = false;
    const keys = new Set(entries.map(getEntryKey));

    for (const entry of entries) {
      const key = getEntryKey(entry);
      void getLapChannelsForBasketEntry(entry)
        .then((response) => {
          if (isCancelled) {
            return;
          }

          setChannelStates((currentStates) => {
            if (!keys.has(key)) {
              return currentStates;
            }

            return {
              ...currentStates,
              [key]: { status: "ready", response },
            };
          });
        })
        .catch((error: unknown) => {
          if (isCancelled) {
            return;
          }

          setChannelStates((currentStates) => ({
            ...currentStates,
            [key]: { status: "error", message: getErrorMessage(error) },
          }));
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [entries]);

  return (
    <section className="compare-workspace" aria-label="Lap compare">
      <header className="zone-bar">
        <div className="zone-bar-title">
          <span className="zone-kicker">Compare</span>
          <span className="zone-source">
            <GitCompareArrows size={13} /> {entries.length} pinned{" "}
            {entries.length === 1 ? "lap" : "laps"}
          </span>
        </div>
        <div className="zone-bar-meta">
          <span className="mono">reference {entries[0].label}</span>
          <button
            type="button"
            className="icon-button danger"
            disabled={onClearBasket === undefined}
            onClick={onClearBasket}
          >
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </header>
      <div className="compare-basket-list">
        {entries.map((entry, index) => {
          const key = getEntryKey(entry);
          return (
            <article className="compare-basket-row" key={key}>
              <span
                className="compare-lap-swatch"
                style={{ "--lap-color": entry.color } as CSSProperties}
                aria-hidden="true"
              />
              <div className="compare-lap-main">
                <span className="compare-lap-label">
                  {index === 0 ? "Reference" : `Compare ${index}`} /{" "}
                  {entry.label}
                </span>
                <span className="compare-lap-meta mono">
                  session {entry.sessionId.slice(0, 8)} / lap {entry.lapNumber}
                </span>
              </div>
              {renderChannelStatus(channelStates[key])}
              <button
                type="button"
                className="icon-button compare-row-action"
                aria-label={`Remove ${entry.label}`}
                title={`Remove ${entry.label}`}
                disabled={onRemoveLap === undefined}
                onClick={() => onRemoveLap?.(entry.sessionId, entry.lapNumber)}
              >
                <X size={13} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function renderChannelStatus(state: LapChannelLoadState | undefined) {
  if (state === undefined || state.status === "loading") {
    return (
      <span className="compare-channel-status loading">
        <LoaderCircle size={13} /> Loading
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="compare-channel-status error" title={state.message}>
        <AlertTriangle size={13} /> Error
      </span>
    );
  }

  return (
    <span className="compare-channel-status ready">
      {state.response.sampleCount.toLocaleString()} samples
    </span>
  );
}

function getEntryKey(entry: Pick<LapBasketEntry, "sessionId" | "lapNumber">) {
  return `${entry.sessionId}:${entry.lapNumber}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Lap channels unavailable";
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
