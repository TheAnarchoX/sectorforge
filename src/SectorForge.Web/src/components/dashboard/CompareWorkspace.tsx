import {
  AlertTriangle,
  GitCompareArrows,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getLapChannelsForBasketEntry } from "../../api/telemetryApi";
import type {
  LapBasketEntry,
  LapChannelsResponse,
} from "../../types/telemetry";
import {
  buildDeltaTimeModel,
  type DeltaSeriesInput,
  type DeltaTimePoint,
  type DeltaTimeTrace,
} from "../../utils/lapDelta";
import {
  formatDeltaSeconds,
  formatTime,
  parseDurationSeconds,
} from "../../utils/telemetryFormat";

type OverlayChannelKey = "speedKph" | "rpm" | "throttle" | "brake" | "steering";

type OverlayChannelOption = {
  key: OverlayChannelKey;
  label: string;
  axisLabel: string;
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
};

const OVERLAY_CHANNEL_OPTIONS: OverlayChannelOption[] = [
  {
    key: "speedKph",
    label: "Speed",
    axisLabel: "Speed (kph)",
    formatTick: (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)),
    formatValue: (value) => `${value.toFixed(0)} kph`,
  },
  {
    key: "rpm",
    label: "RPM",
    axisLabel: "RPM",
    formatTick: (value) => value.toFixed(0),
    formatValue: (value) => `${value.toFixed(0)} rpm`,
  },
  {
    key: "throttle",
    label: "Throttle",
    axisLabel: "Throttle (%)",
    formatTick: (value) => `${(value * 100).toFixed(0)}`,
    formatValue: (value) => `${(value * 100).toFixed(0)}%`,
  },
  {
    key: "brake",
    label: "Brake",
    axisLabel: "Brake (%)",
    formatTick: (value) => `${(value * 100).toFixed(0)}`,
    formatValue: (value) => `${(value * 100).toFixed(0)}%`,
  },
  {
    key: "steering",
    label: "Steering",
    axisLabel: "Steering",
    formatTick: (value) => value.toFixed(2),
    formatValue: (value) => value.toFixed(2),
  },
];

const DEFAULT_OVERLAY_CHANNEL: OverlayChannelKey = "speedKph";

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
  onSetReferenceLap?: (sessionId: string, lapNumber: number) => void;
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
  onSetReferenceLap,
  onClearBasket,
  onOpenSessions,
}: CompareWorkspaceProps) {
  if (basketEntries.length > 0 && frame === undefined) {
    return (
      <CompareBasketView
        entries={basketEntries}
        onRemoveLap={onRemoveLap}
        onSetReferenceLap={onSetReferenceLap}
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
  onSetReferenceLap,
  onClearBasket,
}: {
  entries: LapBasketEntry[];
  onRemoveLap?: (sessionId: string, lapNumber: number) => void;
  onSetReferenceLap?: (sessionId: string, lapNumber: number) => void;
  onClearBasket?: () => void;
}) {
  const [channelStates, setChannelStates] = useState<
    Record<string, LapChannelLoadState>
  >({});
  const [selectedChannel, setSelectedChannel] = useState<OverlayChannelKey>(
    DEFAULT_OVERLAY_CHANNEL,
  );

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
      <CompareOverlayChart
        entries={entries}
        channelStates={channelStates}
        selectedChannel={selectedChannel}
        onSelectChannel={setSelectedChannel}
        onSetReferenceLap={onSetReferenceLap}
      />
      <CompareSectorSplitTable
        entries={entries}
        channelStates={channelStates}
      />
      <CompareDeltaTimeChart entries={entries} channelStates={channelStates} />
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

const SECTOR_SPLIT_COLUMNS = [
  { key: "sector1Time", label: "S1" },
  { key: "sector2Time", label: "S2" },
  { key: "sector3Time", label: "S3" },
] as const;

type SectorSplitKey = (typeof SECTOR_SPLIT_COLUMNS)[number]["key"];

type SectorSplitCell = {
  key: SectorSplitKey;
  label: string;
  value: string | null | undefined;
  seconds: number | null;
  deltaSeconds: number | null;
  isBest: boolean;
};

type SectorSplitRow = {
  entry: LapBasketEntry;
  state: LapChannelLoadState | undefined;
  response: LapChannelsResponse | null;
  lapDeltaSeconds: number | null;
  cells: SectorSplitCell[];
};

const SECTOR_SPLIT_EPSILON = 0.001;

function getReadyResponse(state: LapChannelLoadState | undefined) {
  return state?.status === "ready" ? state.response : null;
}

function getSectorSeconds(response: LapChannelsResponse, key: SectorSplitKey) {
  return parseDurationSeconds(response[key]);
}

function getBestSectorSeconds(
  entries: LapBasketEntry[],
  channelStates: Record<string, LapChannelLoadState>,
) {
  const bestBySector: Record<SectorSplitKey, number | null> = {
    sector1Time: null,
    sector2Time: null,
    sector3Time: null,
  };

  for (const entry of entries) {
    const response = getReadyResponse(channelStates[getEntryKey(entry)]);
    if (response === null) {
      continue;
    }

    for (const column of SECTOR_SPLIT_COLUMNS) {
      const seconds = getSectorSeconds(response, column.key);
      if (seconds === null) {
        continue;
      }

      const bestSeconds = bestBySector[column.key];
      if (bestSeconds === null || seconds < bestSeconds) {
        bestBySector[column.key] = seconds;
      }
    }
  }

  return bestBySector;
}

function buildSectorSplitRows(
  entries: LapBasketEntry[],
  channelStates: Record<string, LapChannelLoadState>,
): SectorSplitRow[] {
  const reference = entries[0];
  const referenceResponse =
    reference === undefined
      ? null
      : getReadyResponse(channelStates[getEntryKey(reference)]);
  const referenceLapSeconds = parseDurationSeconds(referenceResponse?.lapTime);
  const referenceSectors: Record<SectorSplitKey, number | null> = {
    sector1Time:
      referenceResponse === null
        ? null
        : getSectorSeconds(referenceResponse, "sector1Time"),
    sector2Time:
      referenceResponse === null
        ? null
        : getSectorSeconds(referenceResponse, "sector2Time"),
    sector3Time:
      referenceResponse === null
        ? null
        : getSectorSeconds(referenceResponse, "sector3Time"),
  };
  const bestBySector = getBestSectorSeconds(entries, channelStates);

  return entries.map((entry) => {
    const state = channelStates[getEntryKey(entry)];
    const response = getReadyResponse(state);
    const lapSeconds = parseDurationSeconds(response?.lapTime);
    const lapDeltaSeconds =
      lapSeconds === null || referenceLapSeconds === null
        ? null
        : lapSeconds - referenceLapSeconds;
    const cells = SECTOR_SPLIT_COLUMNS.map((column) => {
      const seconds =
        response === null ? null : getSectorSeconds(response, column.key);
      const referenceSeconds = referenceSectors[column.key];
      const bestSeconds = bestBySector[column.key];
      return {
        key: column.key,
        label: column.label,
        value: response?.[column.key],
        seconds,
        deltaSeconds:
          seconds === null || referenceSeconds === null
            ? null
            : seconds - referenceSeconds,
        isBest:
          seconds !== null &&
          bestSeconds !== null &&
          Math.abs(seconds - bestSeconds) < SECTOR_SPLIT_EPSILON,
      } satisfies SectorSplitCell;
    });

    return { entry, state, response, lapDeltaSeconds, cells };
  });
}

function CompareSectorSplitTable({
  entries,
  channelStates,
}: {
  entries: LapBasketEntry[];
  channelStates: Record<string, LapChannelLoadState>;
}) {
  const headingId = useId();
  const statusId = useId();
  const rows = useMemo(
    () => buildSectorSplitRows(entries, channelStates),
    [channelStates, entries],
  );
  const referenceEntry = entries[0] ?? null;
  const readyCount = rows.filter((row) => row.response !== null).length;
  const tableLabel = `Sector split comparison vs ${
    referenceEntry?.label ?? "reference lap"
  }`;

  return (
    <section className="compare-sector-panel" aria-labelledby={headingId}>
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Sectors</span>
          <span id={headingId} className="compare-overlay-channel-label">
            Split compare
          </span>
        </div>
        <span className="compare-delta-reference mono">
          vs {referenceEntry?.label ?? "reference"}
        </span>
      </header>
      <div
        id={statusId}
        className="compare-sector-status mono"
        aria-live="polite"
      >
        {readyCount === entries.length
          ? `${readyCount} laps ready`
          : `${readyCount}/${entries.length} laps ready`}
      </div>
      <div
        className="table-panel-body compare-sector-table-region"
        role="region"
        aria-label="Sector split table"
        aria-describedby={statusId}
        tabIndex={0}
      >
        <table className="dense-table compare-sector-table">
          <caption className="compare-sector-caption">{tableLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Lap</th>
              <th scope="col">Lap time</th>
              {SECTOR_SPLIT_COLUMNS.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <CompareSectorSplitRow
                key={getEntryKey(row.entry)}
                row={row}
                isReference={index === 0}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompareSectorSplitRow({
  row,
  isReference,
}: {
  row: SectorSplitRow;
  isReference: boolean;
}) {
  const state = row.state;
  const statusText =
    state === undefined || state.status === "loading"
      ? "Loading"
      : state.status === "error"
        ? "Error"
        : null;
  const statusTitle = state?.status === "error" ? state.message : undefined;

  return (
    <tr
      tabIndex={0}
      className={isReference ? "compare-sector-reference-row" : undefined}
    >
      <th scope="row">
        <span className="compare-sector-lap">
          <span
            className="compare-sector-lap-swatch"
            style={{ "--lap-color": row.entry.color } as CSSProperties}
            aria-hidden="true"
          />
          <span className="compare-sector-lap-text">
            <span className="compare-sector-lap-number mono">
              Lap {row.entry.lapNumber}
            </span>
            <span className="compare-sector-lap-label">{row.entry.label}</span>
          </span>
        </span>
      </th>
      <td className="mono" title={statusTitle}>
        {row.response === null ? (
          <span className="compare-sector-unavailable">{statusText}</span>
        ) : (
          <span className="compare-sector-cell-stack">
            <span>{formatTime(row.response.lapTime)}</span>
            <span className={getSectorDeltaClass(row.lapDeltaSeconds)}>
              {isReference ? "REF" : formatDeltaSeconds(row.lapDeltaSeconds)}
            </span>
          </span>
        )}
      </td>
      {row.cells.map((cell) => (
        <td
          key={cell.key}
          className={cell.isBest ? "compare-sector-best" : undefined}
          aria-label={getSectorCellAriaLabel(row.entry, cell, isReference)}
        >
          {row.response === null ? (
            <span className="compare-sector-unavailable">-</span>
          ) : (
            <span className="compare-sector-cell-stack">
              <span className="mono compare-sector-time">
                {formatTime(cell.value)}
              </span>
              <span className={getSectorDeltaClass(cell.deltaSeconds)}>
                {isReference ? "REF" : formatDeltaSeconds(cell.deltaSeconds)}
              </span>
              {cell.isBest && (
                <span className="compare-sector-best-badge">Best</span>
              )}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}

function getSectorDeltaClass(deltaSeconds: number | null) {
  if (deltaSeconds === null || Math.abs(deltaSeconds) < 0.0005) {
    return "mono compare-sector-delta compare-sector-delta-neutral";
  }

  return deltaSeconds < 0
    ? "mono compare-sector-delta compare-sector-delta-gain"
    : "mono compare-sector-delta compare-sector-delta-loss";
}

function getSectorCellAriaLabel(
  entry: LapBasketEntry,
  cell: SectorSplitCell,
  isReference: boolean,
) {
  const time = formatTime(cell.value);
  const delta =
    cell.deltaSeconds === null
      ? "delta unavailable"
      : isReference
        ? "reference delta"
        : `delta ${formatDeltaSeconds(cell.deltaSeconds)}`;
  const best = cell.isBest ? ", best sector across pinned laps" : "";
  return `${entry.label} ${cell.label}, ${time}, ${delta}${best}`;
}

const OVERLAY_CHART_WIDTH = 860;
const OVERLAY_CHART_HEIGHT = 280;
const OVERLAY_CHART_PADDING = {
  top: 20,
  right: 20,
  bottom: 44,
  left: 60,
};
const OVERLAY_GRID_TICK_COUNT = 4;

type OverlayTrace = {
  entry: LapBasketEntry;
  pathData: string;
};

type OverlayChartModel = {
  traces: OverlayTrace[];
  xAxis: "lapDistance" | "time";
  xAxisLabel: string;
  xTicks: number[];
  yTicks: number[];
  formatXTick: (value: number) => string;
  formatYTick: (value: number) => string;
  toChartX: (value: number) => number;
  toChartY: (value: number) => number;
};

function getNiceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 2.5) {
    return 2.5 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function buildAxisTicks(min: number, max: number) {
  const span = Math.max(max - min, Number.EPSILON);
  const step = getNiceStep(span / OVERLAY_GRID_TICK_COUNT);
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i <= OVERLAY_GRID_TICK_COUNT + 1; i += 1) {
    const tick = start + i * step;
    if (tick > max + step / 2) {
      break;
    }
    ticks.push(tick);
  }
  return ticks;
}

function pickReadyEntries(
  entries: LapBasketEntry[],
  channelStates: Record<string, LapChannelLoadState>,
): Array<{ entry: LapBasketEntry; response: LapChannelsResponse }> {
  const ready: Array<{
    entry: LapBasketEntry;
    response: LapChannelsResponse;
  }> = [];
  for (const entry of entries) {
    const state = channelStates[getEntryKey(entry)];
    if (state?.status === "ready") {
      ready.push({ entry, response: state.response });
    }
  }
  return ready;
}

function buildOverlayChartModel(
  ready: Array<{ entry: LapBasketEntry; response: LapChannelsResponse }>,
  channelKey: OverlayChannelKey,
): OverlayChartModel | null {
  const allHaveDistance =
    ready.length > 0 &&
    ready.every(({ response }) => {
      const distance = response.channels.lapDistance;
      return (
        Array.isArray(distance) &&
        distance.some((value) => value !== null && Number.isFinite(value))
      );
    });

  const xAxis: OverlayChartModel["xAxis"] = allHaveDistance
    ? "lapDistance"
    : "time";

  const series: Array<{
    entry: LapBasketEntry;
    points: Array<{ x: number; y: number }>;
  }> = [];

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (const { entry, response } of ready) {
    const xs =
      xAxis === "lapDistance"
        ? (response.channels.lapDistance ?? [])
        : response.channels.time;
    const ys = response.channels[channelKey];
    if (!Array.isArray(xs) || !Array.isArray(ys)) {
      continue;
    }

    const sampleCount = Math.min(xs.length, ys.length);
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const x = xs[i];
      const y = ys[i];
      if (
        x === null ||
        y === null ||
        x === undefined ||
        y === undefined ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        continue;
      }

      points.push({ x: x as number, y: y as number });
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }

    if (points.length >= 2) {
      series.push({ entry, points });
    }
  }

  if (
    series.length === 0 ||
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  ) {
    return null;
  }

  if (xMin === xMax) {
    xMax = xMin + 1;
  }
  if (yMin === yMax) {
    const pad = Math.abs(yMin) > 1 ? Math.abs(yMin) * 0.05 : 1;
    yMin -= pad;
    yMax += pad;
  } else {
    const yPad = (yMax - yMin) * 0.05;
    yMin -= yPad;
    yMax += yPad;
  }

  const xTicks = buildAxisTicks(xMin, xMax);
  const yTicks = buildAxisTicks(yMin, yMax);
  const finalXMin = Math.min(xMin, xTicks[0] ?? xMin);
  const finalXMax = Math.max(xMax, xTicks[xTicks.length - 1] ?? xMax);
  const finalYMin = Math.min(yMin, yTicks[0] ?? yMin);
  const finalYMax = Math.max(yMax, yTicks[yTicks.length - 1] ?? yMax);
  const xRange = Math.max(finalXMax - finalXMin, Number.EPSILON);
  const yRange = Math.max(finalYMax - finalYMin, Number.EPSILON);
  const plotWidth =
    OVERLAY_CHART_WIDTH -
    OVERLAY_CHART_PADDING.left -
    OVERLAY_CHART_PADDING.right;
  const plotHeight =
    OVERLAY_CHART_HEIGHT -
    OVERLAY_CHART_PADDING.top -
    OVERLAY_CHART_PADDING.bottom;

  const toChartX = (value: number) =>
    OVERLAY_CHART_PADDING.left + ((value - finalXMin) / xRange) * plotWidth;

  const toChartY = (value: number) =>
    OVERLAY_CHART_PADDING.top + (1 - (value - finalYMin) / yRange) * plotHeight;

  const traces: OverlayTrace[] = series.map(({ entry, points }) => {
    const pathData = points
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command} ${toChartX(point.x).toFixed(2)} ${toChartY(point.y).toFixed(2)}`;
      })
      .join(" ");
    return { entry, pathData };
  });

  const channelOption =
    OVERLAY_CHANNEL_OPTIONS.find((option) => option.key === channelKey) ??
    OVERLAY_CHANNEL_OPTIONS[0];

  const formatXTick =
    xAxis === "lapDistance"
      ? (value: number) => `${Math.round(value)}`
      : (value: number) => formatChartSeconds(value);

  const xAxisLabel = xAxis === "lapDistance" ? "Lap distance (m)" : "Lap time";

  return {
    traces,
    xAxis,
    xAxisLabel,
    xTicks,
    yTicks: [...yTicks].reverse(),
    formatXTick,
    formatYTick: channelOption.formatTick,
    toChartX,
    toChartY,
  };
}

function formatChartSeconds(value: number) {
  const totalMinutes = Math.floor(value / 60);
  const seconds = value - totalMinutes * 60;
  return `${String(totalMinutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function CompareOverlayChart({
  entries,
  channelStates,
  selectedChannel,
  onSelectChannel,
  onSetReferenceLap,
}: {
  entries: LapBasketEntry[];
  channelStates: Record<string, LapChannelLoadState>;
  selectedChannel: OverlayChannelKey;
  onSelectChannel: (channel: OverlayChannelKey) => void;
  onSetReferenceLap?: (sessionId: string, lapNumber: number) => void;
}) {
  const selectId = useId();
  const ready = useMemo(
    () => pickReadyEntries(entries, channelStates),
    [entries, channelStates],
  );
  const channelOption =
    OVERLAY_CHANNEL_OPTIONS.find((option) => option.key === selectedChannel) ??
    OVERLAY_CHANNEL_OPTIONS[0];
  const model = useMemo(
    () => buildOverlayChartModel(ready, selectedChannel),
    [ready, selectedChannel],
  );

  const totalLaps = entries.length;
  const readyLaps = ready.length;
  const errorLaps = entries.filter(
    (entry) => channelStates[getEntryKey(entry)]?.status === "error",
  ).length;
  const loadingLaps = totalLaps - readyLaps - errorLaps;

  let placeholderMessage: string;
  if (loadingLaps > 0 && readyLaps === 0 && errorLaps === 0) {
    placeholderMessage = "Loading lap channels…";
  } else if (errorLaps === totalLaps && totalLaps > 0) {
    placeholderMessage = "Lap channels could not be loaded for any pinned lap.";
  } else {
    placeholderMessage = `No samples available for ${channelOption.label.toLowerCase()} on the pinned laps yet.`;
  }

  return (
    <section
      className="compare-overlay-chart"
      aria-label={`Lap overlay (${channelOption.label})`}
    >
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Overlay</span>
          <span className="compare-overlay-channel-label">
            {channelOption.label}
          </span>
        </div>
        <label className="compare-overlay-channel-control" htmlFor={selectId}>
          <span className="compare-overlay-channel-control-label">Channel</span>
          <select
            id={selectId}
            className="compare-overlay-channel-select"
            value={selectedChannel}
            onChange={(event) =>
              onSelectChannel(event.target.value as OverlayChannelKey)
            }
          >
            {OVERLAY_CHANNEL_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {model === null ? (
        <div
          className="compare-overlay-placeholder"
          role="status"
          aria-live="polite"
        >
          {placeholderMessage}
        </div>
      ) : (
        <div className="compare-overlay-stage">
          <svg
            className="compare-overlay-svg"
            viewBox={`0 0 ${OVERLAY_CHART_WIDTH} ${OVERLAY_CHART_HEIGHT}`}
            role="img"
            aria-label={`Lap overlay chart for ${channelOption.label}`}
          >
            {model.yTicks.map((tick) => {
              const y = model.toChartY(tick);
              return (
                <g key={`y-${tick}`}>
                  <line
                    className="compare-overlay-grid-line"
                    x1={OVERLAY_CHART_PADDING.left}
                    x2={OVERLAY_CHART_WIDTH - OVERLAY_CHART_PADDING.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="compare-overlay-tick"
                    x={OVERLAY_CHART_PADDING.left - 10}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {model.formatYTick(tick)}
                  </text>
                </g>
              );
            })}
            {model.xTicks.map((tick, index) => {
              const x = model.toChartX(tick);
              return (
                <g key={`x-${tick}-${index}`}>
                  <line
                    className="compare-overlay-grid-line"
                    x1={x}
                    x2={x}
                    y1={OVERLAY_CHART_PADDING.top}
                    y2={OVERLAY_CHART_HEIGHT - OVERLAY_CHART_PADDING.bottom}
                  />
                  <text
                    className="compare-overlay-tick"
                    x={x}
                    y={OVERLAY_CHART_HEIGHT - 14}
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === model.xTicks.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {model.formatXTick(tick)}
                  </text>
                </g>
              );
            })}
            <line
              className="compare-overlay-axis-line"
              x1={OVERLAY_CHART_PADDING.left}
              x2={OVERLAY_CHART_PADDING.left}
              y1={OVERLAY_CHART_PADDING.top}
              y2={OVERLAY_CHART_HEIGHT - OVERLAY_CHART_PADDING.bottom}
            />
            <line
              className="compare-overlay-axis-line"
              x1={OVERLAY_CHART_PADDING.left}
              x2={OVERLAY_CHART_WIDTH - OVERLAY_CHART_PADDING.right}
              y1={OVERLAY_CHART_HEIGHT - OVERLAY_CHART_PADDING.bottom}
              y2={OVERLAY_CHART_HEIGHT - OVERLAY_CHART_PADDING.bottom}
            />
            {model.traces.map((trace) => (
              <path
                key={getEntryKey(trace.entry)}
                className="compare-overlay-trace"
                style={
                  {
                    "--lap-color": trace.entry.color,
                  } as CSSProperties
                }
                d={trace.pathData}
              />
            ))}
            <text
              className="compare-overlay-axis-label"
              x={OVERLAY_CHART_PADDING.left}
              y={OVERLAY_CHART_HEIGHT - 2}
            >
              {model.xAxisLabel}
            </text>
            <text
              className="compare-overlay-axis-label"
              x={OVERLAY_CHART_PADDING.left - 10}
              y={OVERLAY_CHART_PADDING.top - 6}
              textAnchor="end"
            >
              {channelOption.axisLabel}
            </text>
          </svg>
        </div>
      )}

      <ul className="compare-overlay-legend" aria-label="Overlay legend">
        {entries.map((entry, index) => {
          const state = channelStates[getEntryKey(entry)];
          const status: "loading" | "ready" | "error" =
            state === undefined || state.status === "loading"
              ? "loading"
              : state.status;
          return (
            <li
              className={`compare-overlay-legend-item compare-overlay-legend-${status}`}
              key={getEntryKey(entry)}
            >
              <span
                className="compare-overlay-legend-swatch"
                style={{ "--lap-color": entry.color } as CSSProperties}
                aria-hidden="true"
              />
              <span className="compare-overlay-legend-label">
                {entry.label}
              </span>
              {index === 0 && (
                <span
                  className="compare-overlay-legend-badge"
                  aria-label="Reference lap"
                  title="Reference lap"
                >
                  REF
                </span>
              )}
              {index > 0 && (
                <button
                  type="button"
                  className="compare-overlay-reference-button"
                  disabled={onSetReferenceLap === undefined}
                  aria-label={`Set ${entry.label} as reference lap`}
                  title={`Set ${entry.label} as reference lap`}
                  onClick={() =>
                    onSetReferenceLap?.(entry.sessionId, entry.lapNumber)
                  }
                >
                  SET REF
                </button>
              )}
              <span className="compare-overlay-legend-status mono">
                {status === "ready"
                  ? "ready"
                  : status === "error"
                    ? "error"
                    : "loading"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const DELTA_CHART_HEIGHT = 240;
const DELTA_CHART_PADDING = {
  top: 22,
  right: 20,
  bottom: 44,
  left: 60,
};
const DELTA_MIN_POINTS = 2;
const DELTA_TONE_EPSILON = 0.0005;

type DeltaSegmentTone = "gain" | "loss" | "neutral";

type DeltaSegment = {
  from: DeltaTimePoint;
  to: DeltaTimePoint;
  tone: DeltaSegmentTone;
};

type DeltaChartTrace = {
  trace: DeltaTimeTrace;
  segments: DeltaSegment[];
};

type DeltaChartModel = {
  traces: DeltaChartTrace[];
  xTicks: number[];
  yTicks: number[];
  toChartX: (value: number) => number;
  toChartY: (value: number) => number;
};

function toDeltaSeriesInput(
  entry: LapBasketEntry,
  response: LapChannelsResponse,
): DeltaSeriesInput {
  return {
    id: getEntryKey(entry),
    label: entry.label,
    color: entry.color,
    time: response.channels.time,
    lapDistance: response.channels.lapDistance,
  };
}

function getDeltaTone(deltaSeconds: number): DeltaSegmentTone {
  if (deltaSeconds > DELTA_TONE_EPSILON) {
    return "loss";
  }
  if (deltaSeconds < -DELTA_TONE_EPSILON) {
    return "gain";
  }
  return "neutral";
}

function createZeroCrossingPoint(
  first: DeltaTimePoint,
  second: DeltaTimePoint,
) {
  const denominator =
    Math.abs(first.deltaSeconds) + Math.abs(second.deltaSeconds);
  const ratio =
    denominator === 0 ? 0 : Math.abs(first.deltaSeconds) / denominator;
  return {
    distanceMeters:
      first.distanceMeters +
      (second.distanceMeters - first.distanceMeters) * ratio,
    deltaSeconds: 0,
  } satisfies DeltaTimePoint;
}

function buildDeltaSegments(points: DeltaTimePoint[]) {
  const segments: DeltaSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (previous === undefined || next === undefined) {
      continue;
    }

    const previousTone = getDeltaTone(previous.deltaSeconds);
    const nextTone = getDeltaTone(next.deltaSeconds);
    if (
      previousTone !== nextTone &&
      previousTone !== "neutral" &&
      nextTone !== "neutral"
    ) {
      const zeroPoint = createZeroCrossingPoint(previous, next);
      segments.push({ from: previous, to: zeroPoint, tone: previousTone });
      segments.push({ from: zeroPoint, to: next, tone: nextTone });
      continue;
    }

    segments.push({
      from: previous,
      to: next,
      tone: nextTone === "neutral" ? previousTone : nextTone,
    });
  }

  return segments;
}

function buildDeltaChartModel(
  traces: DeltaTimeTrace[],
): DeltaChartModel | null {
  const allPoints = traces.flatMap((trace) => trace.points);
  if (allPoints.length < DELTA_MIN_POINTS) {
    return null;
  }

  const xMax = Math.max(1, ...allPoints.map((point) => point.distanceMeters));
  const maxAbsDelta = Math.max(
    0.1,
    ...allPoints.map((point) => Math.abs(point.deltaSeconds)),
  );
  const yStep = getNiceStep(maxAbsDelta / 2);
  const yMax = Math.max(yStep * 2, maxAbsDelta);
  const yTicks = [yMax, yStep, 0, -yStep, -yMax];
  const xTicks = buildAxisTicks(0, xMax);
  const finalXMax = Math.max(xMax, xTicks[xTicks.length - 1] ?? xMax);
  const plotWidth =
    OVERLAY_CHART_WIDTH - DELTA_CHART_PADDING.left - DELTA_CHART_PADDING.right;
  const plotHeight =
    DELTA_CHART_HEIGHT - DELTA_CHART_PADDING.top - DELTA_CHART_PADDING.bottom;
  const xRange = Math.max(finalXMax, Number.EPSILON);
  const yRange = Math.max(yMax * 2, Number.EPSILON);

  const toChartX = (value: number) =>
    DELTA_CHART_PADDING.left + (value / xRange) * plotWidth;
  const toChartY = (value: number) =>
    DELTA_CHART_PADDING.top + ((yMax - value) / yRange) * plotHeight;

  return {
    traces: traces.map((trace) => ({
      trace,
      segments: buildDeltaSegments(trace.points),
    })),
    xTicks,
    yTicks,
    toChartX,
    toChartY,
  };
}

function formatSignedDeltaSeconds(value: number) {
  if (Math.abs(value) < DELTA_TONE_EPSILON) {
    return "0.000s";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(3)}s`;
}

function getDeltaPlaceholderMessage(
  entries: LapBasketEntry[],
  channelStates: Record<string, LapChannelLoadState>,
) {
  const reference = entries[0];
  if (entries.length < 2) {
    return "Pin at least one comparison lap to draw delta time.";
  }
  if (reference === undefined) {
    return "Pin laps to draw delta time.";
  }

  const referenceState = channelStates[getEntryKey(reference)];
  if (referenceState?.status === "error") {
    return "Reference lap channels could not be loaded.";
  }
  if (referenceState === undefined || referenceState.status === "loading") {
    return "Loading reference lap channels...";
  }

  const comparisonStates = entries
    .slice(1)
    .map((entry) => channelStates[getEntryKey(entry)]);
  const readyComparisons = comparisonStates.filter(
    (state) => state?.status === "ready",
  ).length;
  const loadingComparisons = comparisonStates.filter(
    (state) => state === undefined || state.status === "loading",
  ).length;

  if (readyComparisons === 0 && loadingComparisons > 0) {
    return "Loading comparison lap channels...";
  }
  if (readyComparisons === 0) {
    return "No comparison lap channels are available for delta time.";
  }

  return "Delta time needs lap distance and time samples for the reference and comparison laps.";
}

function CompareDeltaTimeChart({
  entries,
  channelStates,
}: {
  entries: LapBasketEntry[];
  channelStates: Record<string, LapChannelLoadState>;
}) {
  const referenceEntry = entries[0] ?? null;
  const deltaModel = useMemo(() => {
    if (referenceEntry === null) {
      return null;
    }

    const referenceState = channelStates[getEntryKey(referenceEntry)];
    if (referenceState?.status !== "ready") {
      return null;
    }

    const comparisons = entries
      .slice(1)
      .map((entry) => {
        const state = channelStates[getEntryKey(entry)];
        return state?.status === "ready"
          ? toDeltaSeriesInput(entry, state.response)
          : null;
      })
      .filter((input): input is DeltaSeriesInput => input !== null);

    return buildDeltaTimeModel(
      toDeltaSeriesInput(referenceEntry, referenceState.response),
      comparisons,
    );
  }, [channelStates, entries, referenceEntry]);
  const chartModel = useMemo(
    () =>
      deltaModel === null ? null : buildDeltaChartModel(deltaModel.traces),
    [deltaModel],
  );
  const placeholderMessage = getDeltaPlaceholderMessage(entries, channelStates);
  const clippedTraceCount = deltaModel?.clippedTraceCount ?? 0;

  return (
    <section className="compare-delta-chart" aria-label="Delta time">
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Delta</span>
          <span className="compare-overlay-channel-label">Time variance</span>
        </div>
        <span className="compare-delta-reference mono">
          vs {referenceEntry?.label ?? "reference"}
        </span>
      </header>

      {chartModel === null || referenceEntry === null ? (
        <div
          className="compare-overlay-placeholder"
          role="status"
          aria-live="polite"
        >
          {placeholderMessage}
        </div>
      ) : (
        <>
          <div className="compare-overlay-stage">
            <svg
              className="compare-overlay-svg"
              viewBox={`0 0 ${OVERLAY_CHART_WIDTH} ${DELTA_CHART_HEIGHT}`}
              role="img"
              aria-label={`Delta time plot vs ${referenceEntry.label}`}
            >
              {chartModel.yTicks.map((tick) => {
                const y = chartModel.toChartY(tick);
                return (
                  <g key={`delta-y-${tick}`}>
                    <line
                      className={
                        tick === 0
                          ? "compare-delta-zero-line"
                          : "compare-overlay-grid-line"
                      }
                      x1={DELTA_CHART_PADDING.left}
                      x2={OVERLAY_CHART_WIDTH - DELTA_CHART_PADDING.right}
                      y1={y}
                      y2={y}
                    />
                    <text
                      className="compare-overlay-tick"
                      x={DELTA_CHART_PADDING.left - 10}
                      y={y + 4}
                      textAnchor="end"
                    >
                      {formatSignedDeltaSeconds(tick)}
                    </text>
                  </g>
                );
              })}
              {chartModel.xTicks.map((tick, index) => {
                const x = chartModel.toChartX(tick);
                return (
                  <g key={`delta-x-${tick}-${index}`}>
                    <line
                      className="compare-overlay-grid-line"
                      x1={x}
                      x2={x}
                      y1={DELTA_CHART_PADDING.top}
                      y2={DELTA_CHART_HEIGHT - DELTA_CHART_PADDING.bottom}
                    />
                    <text
                      className="compare-overlay-tick"
                      x={x}
                      y={DELTA_CHART_HEIGHT - 14}
                      textAnchor={
                        index === 0
                          ? "start"
                          : index === chartModel.xTicks.length - 1
                            ? "end"
                            : "middle"
                      }
                    >
                      {Math.round(tick)}
                    </text>
                  </g>
                );
              })}
              <line
                className="compare-overlay-axis-line"
                x1={DELTA_CHART_PADDING.left}
                x2={DELTA_CHART_PADDING.left}
                y1={DELTA_CHART_PADDING.top}
                y2={DELTA_CHART_HEIGHT - DELTA_CHART_PADDING.bottom}
              />
              {chartModel.traces.map(({ trace, segments }) => (
                <g key={trace.id}>
                  {segments.map((segment, index) => (
                    <line
                      key={`${trace.id}-underlay-${index}`}
                      className="compare-delta-segment-underlay"
                      style={
                        {
                          "--lap-color": trace.color ?? "var(--accent-cyan)",
                        } as CSSProperties
                      }
                      x1={chartModel.toChartX(segment.from.distanceMeters)}
                      x2={chartModel.toChartX(segment.to.distanceMeters)}
                      y1={chartModel.toChartY(segment.from.deltaSeconds)}
                      y2={chartModel.toChartY(segment.to.deltaSeconds)}
                    />
                  ))}
                  {segments.map((segment, index) => (
                    <line
                      key={`${trace.id}-${index}`}
                      className={`compare-delta-segment compare-delta-segment-${segment.tone}`}
                      x1={chartModel.toChartX(segment.from.distanceMeters)}
                      x2={chartModel.toChartX(segment.to.distanceMeters)}
                      y1={chartModel.toChartY(segment.from.deltaSeconds)}
                      y2={chartModel.toChartY(segment.to.deltaSeconds)}
                    />
                  ))}
                </g>
              ))}
              <text
                className="compare-overlay-axis-label"
                x={DELTA_CHART_PADDING.left}
                y={DELTA_CHART_HEIGHT - 2}
              >
                Lap distance (m)
              </text>
              <text
                className="compare-overlay-axis-label"
                x={DELTA_CHART_PADDING.left - 10}
                y={DELTA_CHART_PADDING.top - 6}
                textAnchor="end"
              >
                Delta (s)
              </text>
            </svg>
          </div>
          {clippedTraceCount > 0 && (
            <div className="compare-delta-notice" role="note">
              Delta traces clipped to shortest lap distance for{" "}
              {clippedTraceCount}{" "}
              {clippedTraceCount === 1 ? "comparison" : "comparisons"}.
            </div>
          )}
        </>
      )}
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
