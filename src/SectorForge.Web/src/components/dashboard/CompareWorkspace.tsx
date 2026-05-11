import {
  AlertTriangle,
  Download,
  GitCompareArrows,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  CSSProperties,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
  WheelEvent,
} from "react";
import {
  AnnotationPanel,
  type AnnotationContextOption,
  type AnnotationDraft,
} from "../annotations/AnnotationPanel";
import { getLapChannelsForBasketEntry } from "../../api/telemetryApi";
import { useTelemetryAnnotations } from "../../hooks/useTelemetryAnnotations";
import {
  DEFAULT_COMPARE_PANEL_CHANNEL,
  DEFAULT_COMPARE_PANEL_ID,
} from "../../types/telemetry";
import type {
  LapBasketEntry,
  LapChannelsResponse,
  LapCompareChannelKey,
} from "../../types/telemetry";
import {
  buildDeltaTimeModel,
  type DeltaSeriesInput,
  type DeltaTimePoint,
  type DeltaTimeTrace,
} from "../../utils/lapDelta";
import {
  buildLapComparisonSetFilename,
  parseLapComparisonSetJson,
  serializeLapComparisonSet,
  type LapComparisonSetReference,
} from "../../utils/lapComparisonSetTransfer";
import {
  filterAnnotationsByEntries,
  formatAnnotationMoment,
  createAnnotationContextId,
  matchesAnnotationContext,
  type TelemetryAnnotation,
  type TelemetryAnnotationInput,
} from "../../utils/telemetryAnnotations";
import {
  formatDeltaSeconds,
  formatShortTimestamp,
  formatTime,
  parseDurationSeconds,
} from "../../utils/telemetryFormat";

const OVERLAY_CHANNEL_KEYS = [
  "speedKph",
  "rpm",
  "throttle",
  "brake",
  "steering",
] as const;

type OverlayChannelKey = (typeof OVERLAY_CHANNEL_KEYS)[number];

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

const DEFAULT_OVERLAY_CHANNEL: OverlayChannelKey =
  DEFAULT_COMPARE_PANEL_CHANNEL as OverlayChannelKey;
const OVERLAY_COMPARE_PANEL_ID = DEFAULT_COMPARE_PANEL_ID;
const OVERLAY_PANEL_ID_PREFIX = "overlay-";
const MAX_COMPARE_OVERLAY_PANELS = OVERLAY_CHANNEL_KEYS.length;
const DELTA_COMPARE_PANEL_ID = "delta-time";

type CompareOverlayPanel = {
  id: string;
  channelKey: OverlayChannelKey;
};

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
  variant?: "workspace" | "inline";
  onRemoveLap?: (sessionId: string, lapNumber: number) => void;
  onSetReferenceLap?: (sessionId: string, lapNumber: number) => void;
  onSetPanelChannel?: (
    panelId: string,
    channelKey: LapCompareChannelKey,
  ) => void;
  onImportComparisonSet?: (
    entries: LapBasketEntry[],
    reference: LapComparisonSetReference | null,
  ) => void;
  onClearBasket?: () => void;
  maxBasketEntries?: number;
  onOpenSessions: () => void;
};

type LapChannelLoadState =
  | { status: "loading" }
  | { status: "ready"; response: LapChannelsResponse }
  | { status: "error"; message: string };

type CompareDistanceCursorState = {
  distanceMeters: number | null;
  sourcePanelId: string | null;
};

type CompareDistanceCursorControls = {
  distanceCursor: CompareDistanceCursorState;
  onDistanceCursorChange: (
    sourcePanelId: string,
    distanceMeters: number,
  ) => void;
  onDistanceCursorClear: (sourcePanelId: string) => void;
};

type CompareChartXAxis = "lapDistance" | "time";

type CompareAxisZoom = {
  min: number;
  max: number;
};

type CompareXAxisZoom = CompareAxisZoom & {
  axis: CompareChartXAxis;
};

type CompareChartPoint = {
  x: number;
  y: number;
};

type CompareZoomSelection = {
  start: CompareChartPoint;
  current: CompareChartPoint;
};

type CompareChartDragState = CompareZoomSelection & {
  pointerId: number;
  mode: "pan" | "select";
  originClientX: number;
  originClientY: number;
  lastClientX: number;
  lastClientY: number;
  didMove: boolean;
};

type CompareSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CompareZoomControls = {
  xZoom: CompareXAxisZoom | null;
  yZoom: CompareAxisZoom | null;
  onXZoomChange: (zoom: CompareXAxisZoom | null) => void;
  onYZoomChange: (panelId: string, zoom: CompareAxisZoom | null) => void;
  onResetZoom: () => void;
};

type ChartPointerLikeEvent = {
  currentTarget: SVGSVGElement;
  clientX: number;
};

type CompareSetTransferStatus = {
  tone: "success" | "error";
  message: string;
};

const EMPTY_DISTANCE_CURSOR: CompareDistanceCursorState = {
  distanceMeters: null,
  sourcePanelId: null,
};

const DEFAULT_EMPTY_TITLE = "No comparison set loaded";
const DEFAULT_EMPTY_MESSAGE =
  "Pinned laps will appear here with reusable compare frames for overlays, deltas, and sector tables.";

type CompareSessionContextSummary = {
  sessionId: string;
  shortId: string;
  title: string;
  subtitle: string;
  conditions: string;
  laps: number[];
};

function compactParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0);
}

function formatSessionTemperature(
  label: string,
  value: number | null | undefined,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${label} ${value.toFixed(0)}C`
    : null;
}

function getShortSessionId(sessionId: string) {
  return sessionId.slice(0, 8);
}

function getEntrySessionTitle(entry: LapBasketEntry) {
  return (
    entry.session?.trackName ??
    entry.session?.game ??
    `Session ${getShortSessionId(entry.sessionId)}`
  );
}

function getEntrySessionBadge(entry: LapBasketEntry) {
  return `${getEntrySessionTitle(entry)} / ${getShortSessionId(entry.sessionId)}`;
}

function getEntrySessionDetails(entry: LapBasketEntry) {
  const session = entry.session;
  if (session === undefined) {
    return `session ${getShortSessionId(entry.sessionId)}`;
  }

  const conditions = compactParts([
    session.weather,
    formatSessionTemperature("track", session.trackTemperatureC),
    formatSessionTemperature("air", session.airTemperatureC),
  ]).join(" / ");
  const details = compactParts([session.carName, conditions]).join(" / ");

  return details || `session ${getShortSessionId(entry.sessionId)}`;
}

function getEntrySessionMeta(entry: LapBasketEntry) {
  const session = entry.session;
  if (session === undefined) {
    return `session ${getShortSessionId(entry.sessionId)} / lap ${entry.lapNumber}`;
  }

  return compactParts([
    `session ${getShortSessionId(entry.sessionId)}`,
    session.sourceName ?? session.game,
    session.startedAt ? formatShortTimestamp(session.startedAt) : null,
    `lap ${entry.lapNumber}`,
  ]).join(" / ");
}

function buildCompareSessionSummaries(entries: LapBasketEntry[]) {
  const summaries = new Map<string, CompareSessionContextSummary>();

  for (const entry of entries) {
    const existing = summaries.get(entry.sessionId);
    if (existing !== undefined) {
      if (!existing.laps.includes(entry.lapNumber)) {
        existing.laps.push(entry.lapNumber);
      }
      continue;
    }

    const session = entry.session;
    const title = getEntrySessionTitle(entry);
    const subtitle = compactParts([
      session?.game,
      session?.sourceName,
      session?.carName,
    ]).join(" / ");
    const conditions = compactParts([
      session?.weather,
      formatSessionTemperature("track", session?.trackTemperatureC),
      formatSessionTemperature("air", session?.airTemperatureC),
      session?.startedAt
        ? `start ${formatShortTimestamp(session.startedAt)}`
        : null,
    ]).join(" / ");

    summaries.set(entry.sessionId, {
      sessionId: entry.sessionId,
      shortId: getShortSessionId(entry.sessionId),
      title,
      subtitle: subtitle || "Session context pending",
      conditions: conditions || "Conditions not captured",
      laps: [entry.lapNumber],
    });
  }

  return Array.from(summaries.values()).map((summary) => ({
    ...summary,
    laps: [...summary.laps].sort((firstLap, secondLap) => firstLap - secondLap),
  }));
}

function buildSessionAnnotationOption(
  summary: CompareSessionContextSummary,
): AnnotationContextOption {
  return {
    id: createAnnotationContextId({
      scope: "session",
      sessionId: summary.sessionId,
    }),
    label: `Session ${summary.title} / ${summary.shortId}`,
    scope: "session",
    sessionId: summary.sessionId,
    lapNumber: null,
  };
}

function buildLapAnnotationOption(
  entry: LapBasketEntry,
): AnnotationContextOption {
  return {
    id: createAnnotationContextId({
      scope: "lap",
      sessionId: entry.sessionId,
      lapNumber: entry.lapNumber,
    }),
    label: `${entry.label} / ${getEntrySessionBadge(entry)}`,
    scope: "lap",
    sessionId: entry.sessionId,
    lapNumber: entry.lapNumber,
  };
}

function buildMomentAnnotationDraft(
  entry: LapBasketEntry,
  distanceMeters: number,
  endDistanceMeters?: number | null,
): AnnotationDraft {
  const roundedDistance = Math.round(distanceMeters);
  const roundedEndDistance =
    typeof endDistanceMeters === "number"
      ? Math.round(endDistanceMeters)
      : null;
  const label =
    roundedEndDistance === null
      ? `${entry.label} moment / ${roundedDistance.toLocaleString()} m`
      : `${entry.label} span / ${roundedDistance.toLocaleString()}-${roundedEndDistance.toLocaleString()} m`;

  return {
    id: createAnnotationContextId({
      scope: "moment",
      sessionId: entry.sessionId,
      lapNumber: entry.lapNumber,
      distanceMeters,
    }),
    label,
    scope: "moment",
    sessionId: entry.sessionId,
    lapNumber: entry.lapNumber,
    distanceMeters,
    endDistanceMeters: roundedEndDistance === null ? null : endDistanceMeters,
  };
}

function getAnnotationCountForContext(
  annotations: TelemetryAnnotation[],
  context: { sessionId: string; lapNumber?: number | null },
) {
  return annotations.filter((annotation) =>
    matchesAnnotationContext(annotation, context),
  ).length;
}

function getMomentAnnotationsForEntries(
  annotations: TelemetryAnnotation[],
  entries: LapBasketEntry[],
) {
  const lapKeys = new Set(
    entries.map((entry) => `${entry.sessionId}:${entry.lapNumber}`),
  );

  return annotations.filter(
    (annotation) =>
      annotation.scope === "moment" &&
      typeof annotation.distanceMeters === "number" &&
      lapKeys.has(`${annotation.sessionId}:${annotation.lapNumber}`),
  );
}

function isOverlayChannelKey(value: unknown): value is OverlayChannelKey {
  return OVERLAY_CHANNEL_KEYS.includes(value as OverlayChannelKey);
}

function getSelectedOverlayChannel(entries: LapBasketEntry[]) {
  for (const entry of entries) {
    const selection = entry.channelSelections?.find(
      (candidate) => candidate.panelId === OVERLAY_COMPARE_PANEL_ID,
    );
    if (selection !== undefined && isOverlayChannelKey(selection.channelKey)) {
      return selection.channelKey;
    }
  }

  return DEFAULT_OVERLAY_CHANNEL;
}

function getOverlayPanelChannels(entries: LapBasketEntry[]) {
  const channelsByPanelId = new Map<string, OverlayChannelKey>();

  for (const entry of entries) {
    for (const selection of entry.channelSelections ?? []) {
      if (
        !channelsByPanelId.has(selection.panelId) &&
        isOverlayChannelKey(selection.channelKey)
      ) {
        channelsByPanelId.set(selection.panelId, selection.channelKey);
      }
    }
  }

  return channelsByPanelId;
}

function getOverlayPanelsFromEntries(entries: LapBasketEntry[]) {
  const channelsByPanelId = getOverlayPanelChannels(entries);
  const panels: CompareOverlayPanel[] = [
    {
      id: OVERLAY_COMPARE_PANEL_ID,
      channelKey:
        channelsByPanelId.get(OVERLAY_COMPARE_PANEL_ID) ??
        getSelectedOverlayChannel(entries),
    },
  ];

  for (const [panelId, channelKey] of channelsByPanelId) {
    if (panelId !== OVERLAY_COMPARE_PANEL_ID) {
      panels.push({ id: panelId, channelKey });
    }
  }

  return panels.slice(0, MAX_COMPARE_OVERLAY_PANELS);
}

function createNextOverlayPanel(currentPanels: CompareOverlayPanel[]) {
  const usedPanelIds = new Set(currentPanels.map((panel) => panel.id));
  const usedChannels = new Set(currentPanels.map((panel) => panel.channelKey));
  let nextId = `${OVERLAY_PANEL_ID_PREFIX}2`;
  for (let index = 2; usedPanelIds.has(nextId); index += 1) {
    nextId = `${OVERLAY_PANEL_ID_PREFIX}${index}`;
  }

  return {
    id: nextId,
    channelKey:
      OVERLAY_CHANNEL_KEYS.find(
        (channelKey) => !usedChannels.has(channelKey),
      ) ?? DEFAULT_OVERLAY_CHANNEL,
  } satisfies CompareOverlayPanel;
}

function getCursorReadoutChannel(
  panels: CompareOverlayPanel[],
  distanceCursor: CompareDistanceCursorState,
) {
  const sourcePanel = panels.find(
    (panel) => panel.id === distanceCursor.sourcePanelId,
  );

  return (
    sourcePanel?.channelKey ?? panels[0]?.channelKey ?? DEFAULT_OVERLAY_CHANNEL
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDomainXFromPointer(
  event: ChartPointerLikeEvent,
  chartWidth: number,
  padding: { left: number; right: number },
  domainMin: number,
  domainMax: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) {
    return null;
  }

  const plotLeft = padding.left;
  const plotRight = chartWidth - padding.right;
  const chartX = ((event.clientX - rect.left) / rect.width) * chartWidth;
  const clampedX = clamp(chartX, plotLeft, plotRight);
  const ratio = (clampedX - plotLeft) / Math.max(plotRight - plotLeft, 1);
  return domainMin + ratio * (domainMax - domainMin);
}

function getCursorChartX(
  cursor: CompareDistanceCursorState,
  domainMin: number,
  domainMax: number,
  toChartX: (value: number) => number,
) {
  if (cursor.distanceMeters === null) {
    return null;
  }

  return toChartX(clamp(cursor.distanceMeters, domainMin, domainMax));
}

function normalizeZoomRange(
  zoom: CompareAxisZoom | null,
  domainMin: number,
  domainMax: number,
) {
  if (zoom === null || domainMax <= domainMin) {
    return null;
  }

  const domainSpan = domainMax - domainMin;
  const minSpan = Math.max(domainSpan * 0.015, Number.EPSILON);
  const nextMin = clamp(Math.min(zoom.min, zoom.max), domainMin, domainMax);
  const nextMax = clamp(Math.max(zoom.min, zoom.max), domainMin, domainMax);
  if (nextMax - nextMin < minSpan) {
    return null;
  }

  return { min: nextMin, max: nextMax } satisfies CompareAxisZoom;
}

function zoomRangeAround(
  rangeMin: number,
  rangeMax: number,
  domainMin: number,
  domainMax: number,
  center: number,
  factor: number,
) {
  const domainSpan = domainMax - domainMin;
  const rangeSpan = rangeMax - rangeMin;
  if (domainSpan <= Number.EPSILON || rangeSpan <= Number.EPSILON) {
    return null;
  }

  const nextSpan = clamp(rangeSpan * factor, domainSpan * 0.015, domainSpan);
  if (nextSpan >= domainSpan * 0.995) {
    return null;
  }

  const anchorRatio = clamp((center - rangeMin) / rangeSpan, 0, 1);
  let nextMin = center - nextSpan * anchorRatio;
  let nextMax = nextMin + nextSpan;

  if (nextMin < domainMin) {
    nextMin = domainMin;
    nextMax = domainMin + nextSpan;
  }
  if (nextMax > domainMax) {
    nextMax = domainMax;
    nextMin = domainMax - nextSpan;
  }

  return { min: nextMin, max: nextMax } satisfies CompareAxisZoom;
}

function panZoomRange(
  rangeMin: number,
  rangeMax: number,
  domainMin: number,
  domainMax: number,
  delta: number,
) {
  const span = rangeMax - rangeMin;
  const domainSpan = domainMax - domainMin;
  if (span <= Number.EPSILON || span >= domainSpan * 0.995) {
    return null;
  }

  let nextMin = rangeMin + delta;
  let nextMax = rangeMax + delta;
  if (nextMin < domainMin) {
    nextMin = domainMin;
    nextMax = domainMin + span;
  }
  if (nextMax > domainMax) {
    nextMax = domainMax;
    nextMin = domainMax - span;
  }

  return { min: nextMin, max: nextMax } satisfies CompareAxisZoom;
}

function interpolateChartPointAtX(
  from: CompareChartPoint,
  to: CompareChartPoint,
  x: number,
): CompareChartPoint {
  if (Math.abs(to.x - from.x) <= Number.EPSILON) {
    return { x, y: from.y };
  }

  const ratio = (x - from.x) / (to.x - from.x);
  return { x, y: from.y + (to.y - from.y) * ratio };
}

function clipChartSegmentToXDomain(
  from: CompareChartPoint,
  to: CompareChartPoint,
  domainMin: number,
  domainMax: number,
): [CompareChartPoint, CompareChartPoint] | null {
  const segmentMin = Math.min(from.x, to.x);
  const segmentMax = Math.max(from.x, to.x);
  if (segmentMax < domainMin || segmentMin > domainMax) {
    return null;
  }

  const clippedFromX = clamp(from.x, domainMin, domainMax);
  const clippedToX = clamp(to.x, domainMin, domainMax);
  const clippedFrom =
    clippedFromX === from.x
      ? from
      : interpolateChartPointAtX(from, to, clippedFromX);
  const clippedTo =
    clippedToX === to.x ? to : interpolateChartPointAtX(from, to, clippedToX);

  return [clippedFrom, clippedTo];
}

function clipChartPointsToXDomain(
  points: CompareChartPoint[],
  domainMin: number,
  domainMax: number,
) {
  const clippedPoints: CompareChartPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) {
      continue;
    }

    const segment = clipChartSegmentToXDomain(
      previous,
      current,
      domainMin,
      domainMax,
    );
    if (segment === null) {
      continue;
    }

    const [from, to] = segment;
    const last = clippedPoints.at(-1);
    if (
      last === undefined ||
      Math.abs(last.x - from.x) > Number.EPSILON ||
      Math.abs(last.y - from.y) > Number.EPSILON
    ) {
      clippedPoints.push(from);
    }
    clippedPoints.push(to);
  }

  return clippedPoints;
}

function splitChartPointsIntoForwardRuns(points: CompareChartPoint[]) {
  const runs: CompareChartPoint[][] = [];
  let currentRun: CompareChartPoint[] = [];

  for (const point of points) {
    const previous = currentRun.at(-1);
    if (previous === undefined) {
      currentRun = [point];
      continue;
    }

    if (point.x < previous.x - Number.EPSILON) {
      if (currentRun.length >= 2) {
        runs.push(currentRun);
      }
      currentRun = [point];
      continue;
    }

    if (Math.abs(point.x - previous.x) <= Number.EPSILON) {
      currentRun[currentRun.length - 1] = point;
      continue;
    }

    currentRun.push(point);
  }

  if (currentRun.length >= 2) {
    runs.push(currentRun);
  }

  return runs;
}

function buildClippedPathData(
  points: CompareChartPoint[],
  xDomainMin: number,
  xDomainMax: number,
  toChartX: (value: number) => number,
  toChartY: (value: number) => number,
) {
  return splitChartPointsIntoForwardRuns(points).flatMap((run) => {
    const clippedPoints = clipChartPointsToXDomain(run, xDomainMin, xDomainMax);
    if (clippedPoints.length < 2) {
      return [];
    }

    return [
      clippedPoints
        .map((point, index) => {
          const command = index === 0 ? "M" : "L";
          return `${command} ${toChartX(point.x).toFixed(2)} ${toChartY(point.y).toFixed(2)}`;
        })
        .join(" "),
    ];
  });
}

function isDragPastThreshold(
  originClientX: number,
  originClientY: number,
  clientX: number,
  clientY: number,
) {
  return (
    Math.abs(clientX - originClientX) >= 4 ||
    Math.abs(clientY - originClientY) >= 4
  );
}

function getSelectionRect(
  selection: CompareZoomSelection | null,
  toChartX: (value: number) => number,
  toChartY: (value: number) => number,
): CompareSelectionRect | null {
  if (selection === null) {
    return null;
  }

  const x1 = toChartX(selection.start.x);
  const x2 = toChartX(selection.current.x);
  const y1 = toChartY(selection.start.y);
  const y2 = toChartY(selection.current.y);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function useWheelScrollBlock(
  ref: RefObject<SVGSVGElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const element = ref.current;
    if (element === null) {
      return undefined;
    }

    const blockWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
    };
    element.addEventListener("wheel", blockWheel, { passive: false });
    return () => element.removeEventListener("wheel", blockWheel);
  }, [active, ref]);
}

function getChartDomainPointFromPointer(
  event: { currentTarget: SVGSVGElement; clientX: number; clientY: number },
  chartWidth: number,
  chartHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  xDomainMin: number,
  xDomainMax: number,
  yDomainMin: number,
  yDomainMax: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const plotLeft = padding.left;
  const plotRight = chartWidth - padding.right;
  const plotTop = padding.top;
  const plotBottom = chartHeight - padding.bottom;
  const chartX = ((event.clientX - rect.left) / rect.width) * chartWidth;
  const chartY = ((event.clientY - rect.top) / rect.height) * chartHeight;
  const clampedX = clamp(chartX, plotLeft, plotRight);
  const clampedY = clamp(chartY, plotTop, plotBottom);
  const xRatio = (clampedX - plotLeft) / Math.max(plotRight - plotLeft, 1);
  const yRatio = (plotBottom - clampedY) / Math.max(plotBottom - plotTop, 1);

  return {
    x: xDomainMin + xRatio * (xDomainMax - xDomainMin),
    y: yDomainMin + yRatio * (yDomainMax - yDomainMin),
  };
}

export function CompareWorkspace({
  frame,
  basketEntries = [],
  variant = "workspace",
  onRemoveLap,
  onSetReferenceLap,
  onSetPanelChannel,
  onImportComparisonSet,
  onClearBasket,
  maxBasketEntries,
  onOpenSessions,
}: CompareWorkspaceProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [transferStatus, setTransferStatus] =
    useState<CompareSetTransferStatus | null>(null);
  const canImport = onImportComparisonSet !== undefined;
  const annotationStore = useTelemetryAnnotations();
  const exportAnnotations = useMemo(
    () =>
      filterAnnotationsByEntries(annotationStore.annotations, basketEntries),
    [annotationStore.annotations, basketEntries],
  );

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleExportComparisonSet = useCallback(() => {
    if (basketEntries.length === 0) {
      return;
    }

    try {
      const exportedAt = new Date();
      downloadTextFile(
        buildLapComparisonSetFilename(exportedAt),
        serializeLapComparisonSet(basketEntries, exportedAt, exportAnnotations),
        "application/json",
      );
      setTransferStatus({
        tone: "success",
        message: `Exported ${basketEntries.length} ${
          basketEntries.length === 1 ? "lap" : "laps"
        } to JSON.`,
      });
    } catch (error: unknown) {
      setTransferStatus({
        tone: "error",
        message: getTransferErrorMessage(error, "Export failed."),
      });
    }
  }, [basketEntries, exportAnnotations]);

  const handleImportFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (file === null || onImportComparisonSet === undefined) {
        return;
      }

      try {
        const rawJson = await readTextFile(file);
        const result = parseLapComparisonSetJson(rawJson, {
          maxEntries: maxBasketEntries,
        });
        if (!result.ok) {
          setTransferStatus({
            tone: "error",
            message: `Import failed: ${result.message}`,
          });
          return;
        }

        annotationStore.importAnnotations(result.annotations);
        onImportComparisonSet(result.entries, result.reference);
        setTransferStatus({
          tone: "success",
          message: `Imported ${result.entries.length} ${
            result.entries.length === 1 ? "lap" : "laps"
          } from JSON.`,
        });
      } catch (error: unknown) {
        setTransferStatus({
          tone: "error",
          message: getTransferErrorMessage(error, "Import failed."),
        });
      }
    },
    [annotationStore, maxBasketEntries, onImportComparisonSet],
  );

  const transferActions =
    !canImport && basketEntries.length === 0 ? null : (
      <CompareSetTransferActions
        canExport={basketEntries.length > 0}
        canImport={canImport}
        importInputRef={importInputRef}
        onExport={handleExportComparisonSet}
        onImportClick={handleImportClick}
        onImportFileChange={handleImportFileChange}
      />
    );

  if (basketEntries.length > 0 && frame === undefined) {
    return (
      <CompareBasketView
        entries={basketEntries}
        variant={variant}
        onRemoveLap={onRemoveLap}
        onSetReferenceLap={onSetReferenceLap}
        onSetPanelChannel={onSetPanelChannel}
        onClearBasket={onClearBasket}
        transferActions={variant === "workspace" ? transferActions : null}
        transferStatus={variant === "workspace" ? transferStatus : null}
        annotations={annotationStore.annotations}
        onAddAnnotation={annotationStore.addAnnotation}
        onUpdateAnnotation={annotationStore.updateAnnotation}
        onDeleteAnnotation={annotationStore.deleteAnnotation}
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

  return (
    <CompareWorkspaceFrameView
      frame={resolvedFrame}
      transferActions={variant === "workspace" ? transferActions : null}
      transferStatus={variant === "workspace" ? transferStatus : null}
    />
  );
}

function CompareBasketView({
  entries,
  variant,
  onRemoveLap,
  onSetReferenceLap,
  onSetPanelChannel,
  onClearBasket,
  transferActions,
  transferStatus,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: {
  entries: LapBasketEntry[];
  variant: "workspace" | "inline";
  onRemoveLap?: (sessionId: string, lapNumber: number) => void;
  onSetReferenceLap?: (sessionId: string, lapNumber: number) => void;
  onSetPanelChannel?: (
    panelId: string,
    channelKey: LapCompareChannelKey,
  ) => void;
  onClearBasket?: () => void;
  transferActions: ReactNode;
  transferStatus: CompareSetTransferStatus | null;
  annotations: TelemetryAnnotation[];
  onAddAnnotation: (
    input: TelemetryAnnotationInput,
  ) => TelemetryAnnotation | null;
  onUpdateAnnotation: (
    annotationId: string,
    input: Partial<TelemetryAnnotationInput>,
  ) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}) {
  const isInline = variant === "inline";
  const [channelStates, setChannelStates] = useState<
    Record<string, LapChannelLoadState>
  >({});
  const [overlayPanels, setOverlayPanels] = useState<CompareOverlayPanel[]>(
    () => getOverlayPanelsFromEntries(entries),
  );
  const [distanceCursor, setDistanceCursor] =
    useState<CompareDistanceCursorState>(EMPTY_DISTANCE_CURSOR);
  const [xZoom, setXZoom] = useState<CompareXAxisZoom | null>(null);
  const [yZoomsByPanelId, setYZoomsByPanelId] = useState<
    Record<string, CompareAxisZoom | undefined>
  >({});
  const [annotationDraft, setAnnotationDraft] =
    useState<AnnotationDraft | null>(null);
  const sessionSummaries = useMemo(
    () => buildCompareSessionSummaries(entries),
    [entries],
  );
  const relevantAnnotations = useMemo(
    () => filterAnnotationsByEntries(annotations, entries),
    [annotations, entries],
  );
  const annotationContextOptions = useMemo(
    () => [
      ...sessionSummaries.map(buildSessionAnnotationOption),
      ...entries.map(buildLapAnnotationOption),
    ],
    [entries, sessionSummaries],
  );

  const handleAddAnnotation = useCallback(
    (input: TelemetryAnnotationInput) => {
      onAddAnnotation(input);
    },
    [onAddAnnotation],
  );

  const handleDraftConsumed = useCallback(() => {
    setAnnotationDraft(null);
  }, []);

  const handleCreateLapAnnotation = useCallback((entry: LapBasketEntry) => {
    setAnnotationDraft(buildLapAnnotationOption(entry));
  }, []);

  const handleCreateMomentAnnotation = useCallback(
    (
      entry: LapBasketEntry,
      distanceMeters: number,
      endDistanceMeters?: number | null,
    ) => {
      setAnnotationDraft(
        buildMomentAnnotationDraft(entry, distanceMeters, endDistanceMeters),
      );
    },
    [],
  );

  const handleSelectAnnotation = useCallback(
    (annotation: TelemetryAnnotation) => {
      if (
        annotation.scope === "moment" &&
        typeof annotation.distanceMeters === "number"
      ) {
        setDistanceCursor({
          sourcePanelId: "annotation",
          distanceMeters: annotation.distanceMeters,
        });
      }
      setAnnotationDraft(null);
    },
    [],
  );

  const handleSelectPanelChannel = useCallback(
    (panelId: string, channel: OverlayChannelKey) => {
      setOverlayPanels((currentPanels) =>
        currentPanels.map((panel) =>
          panel.id === panelId ? { ...panel, channelKey: channel } : panel,
        ),
      );
      setYZoomsByPanelId((currentZooms) => {
        const remainingZooms = { ...currentZooms };
        delete remainingZooms[panelId];
        return remainingZooms;
      });
      onSetPanelChannel?.(panelId, channel);
    },
    [onSetPanelChannel],
  );

  const handleAddOverlayPanel = useCallback(() => {
    if (overlayPanels.length >= MAX_COMPARE_OVERLAY_PANELS) {
      return;
    }

    const nextPanel = createNextOverlayPanel(overlayPanels);
    setOverlayPanels((currentPanels) => [...currentPanels, nextPanel]);
    onSetPanelChannel?.(nextPanel.id, nextPanel.channelKey);
  }, [onSetPanelChannel, overlayPanels]);

  const handleRemoveOverlayPanel = useCallback((panelId: string) => {
    setOverlayPanels((currentPanels) =>
      currentPanels.length <= 1
        ? currentPanels
        : currentPanels.filter((panel) => panel.id !== panelId),
    );
    setDistanceCursor((currentCursor) =>
      currentCursor.sourcePanelId === panelId
        ? EMPTY_DISTANCE_CURSOR
        : currentCursor,
    );
    setYZoomsByPanelId((currentZooms) => {
      const remainingZooms = { ...currentZooms };
      delete remainingZooms[panelId];
      return remainingZooms;
    });
  }, []);

  const handleYZoomChange = useCallback(
    (panelId: string, zoom: CompareAxisZoom | null) => {
      setYZoomsByPanelId((currentZooms) => {
        const remainingZooms = { ...currentZooms };
        delete remainingZooms[panelId];
        if (zoom === null) {
          return remainingZooms;
        }

        return { ...remainingZooms, [panelId]: zoom };
      });
    },
    [],
  );

  const handleResetZoom = useCallback(() => {
    setXZoom(null);
    setYZoomsByPanelId({});
  }, []);

  const handleDistanceCursorChange = useCallback(
    (sourcePanelId: string, distanceMeters: number) => {
      setDistanceCursor({ sourcePanelId, distanceMeters });
    },
    [],
  );

  const handleDistanceCursorClear = useCallback((sourcePanelId: string) => {
    setDistanceCursor((currentCursor) =>
      currentCursor.sourcePanelId === sourcePanelId
        ? EMPTY_DISTANCE_CURSOR
        : currentCursor,
    );
  }, []);

  const hasZoom = xZoom !== null || Object.keys(yZoomsByPanelId).length > 0;

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
    <section
      className={`compare-workspace${isInline ? " compare-workspace-inline" : ""}`}
      aria-label={isInline ? "Inline lap compare" : "Lap compare"}
    >
      <header className="zone-bar">
        <div className="zone-bar-title">
          <span className="zone-kicker">
            {isInline ? "Inline Compare" : "Compare"}
          </span>
          <span className="zone-source">
            <GitCompareArrows size={13} /> {entries.length}{" "}
            {isInline ? "scoped" : "pinned"}{" "}
            {entries.length === 1 ? "lap" : "laps"}
          </span>
        </div>
        <div className="zone-bar-meta">
          <span className="mono">
            {sessionSummaries.length}{" "}
            {sessionSummaries.length === 1 ? "session" : "sessions"}
          </span>
          <span className="mono">reference {entries[0].label}</span>
          {transferStatus && (
            <CompareSetTransferStatusView status={transferStatus} />
          )}
          {!isInline && (
            <>
              <button
                type="button"
                className="icon-button"
                disabled={overlayPanels.length >= MAX_COMPARE_OVERLAY_PANELS}
                onClick={handleAddOverlayPanel}
              >
                <Plus size={13} /> Add chart
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!hasZoom}
                onClick={handleResetZoom}
              >
                <RotateCcw size={13} /> Reset zoom
              </button>
              {transferActions}
              <button
                type="button"
                className="icon-button danger"
                disabled={onClearBasket === undefined}
                onClick={onClearBasket}
              >
                <Trash2 size={13} /> Clear
              </button>
            </>
          )}
        </div>
      </header>
      <CompareSessionContextStrip
        summaries={sessionSummaries}
        annotations={relevantAnnotations}
      />
      <div
        className="compare-overlay-stack"
        aria-label="Compare overlay charts"
      >
        {overlayPanels.map((panel, index) => (
          <CompareOverlayChart
            key={panel.id}
            panelId={panel.id}
            panelNumber={index + 1}
            entries={entries}
            channelStates={channelStates}
            selectedChannel={panel.channelKey}
            canRemove={overlayPanels.length > 1}
            onSelectChannel={handleSelectPanelChannel}
            onRemovePanel={handleRemoveOverlayPanel}
            onSetReferenceLap={onSetReferenceLap}
            annotations={relevantAnnotations}
            onCreateMomentAnnotation={handleCreateMomentAnnotation}
            distanceCursor={distanceCursor}
            onDistanceCursorChange={handleDistanceCursorChange}
            onDistanceCursorClear={handleDistanceCursorClear}
            xZoom={xZoom}
            yZoom={yZoomsByPanelId[panel.id] ?? null}
            onXZoomChange={setXZoom}
            onYZoomChange={handleYZoomChange}
            onResetZoom={handleResetZoom}
          />
        ))}
      </div>
      <CompareSectorSplitTable
        entries={entries}
        channelStates={channelStates}
      />
      <CompareDeltaTimeChart
        entries={entries}
        channelStates={channelStates}
        annotations={relevantAnnotations}
        onCreateMomentAnnotation={handleCreateMomentAnnotation}
        distanceCursor={distanceCursor}
        onDistanceCursorChange={handleDistanceCursorChange}
        onDistanceCursorClear={handleDistanceCursorClear}
        xZoom={xZoom}
        yZoom={yZoomsByPanelId[DELTA_COMPARE_PANEL_ID] ?? null}
        onXZoomChange={setXZoom}
        onYZoomChange={handleYZoomChange}
        onResetZoom={handleResetZoom}
      />
      <CompareDistanceCursorReadout
        entries={entries}
        channelStates={channelStates}
        selectedChannel={getCursorReadoutChannel(overlayPanels, distanceCursor)}
        distanceCursor={distanceCursor}
        onCreateMomentAnnotation={handleCreateMomentAnnotation}
      />
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
                  {getEntrySessionMeta(entry)}
                </span>
                <span className="compare-lap-context">
                  {getEntrySessionDetails(entry)}
                </span>
              </div>
              {renderChannelStatus(channelStates[key])}
              <button
                type="button"
                className="icon-button compare-row-action"
                aria-label={`Add note to ${entry.label}`}
                title={`Add note to ${entry.label}`}
                onClick={() => handleCreateLapAnnotation(entry)}
              >
                <MessageSquareText size={13} />
                {getAnnotationCountForContext(relevantAnnotations, entry) >
                  0 && (
                  <span className="annotation-count-badge">
                    {getAnnotationCountForContext(relevantAnnotations, entry)}
                  </span>
                )}
              </button>
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
      {!isInline && (
        <AnnotationPanel
          title="Compare notes"
          annotations={relevantAnnotations}
          contextOptions={annotationContextOptions}
          draft={annotationDraft}
          onDraftConsumed={handleDraftConsumed}
          onAddAnnotation={handleAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onDeleteAnnotation={onDeleteAnnotation}
          onSelectAnnotation={handleSelectAnnotation}
        />
      )}
    </section>
  );
}

function CompareSetTransferActions({
  canExport,
  canImport,
  importInputRef,
  onExport,
  onImportClick,
  onImportFileChange,
}: {
  canExport: boolean;
  canImport: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onImportClick: () => void;
  onImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="icon-button"
        disabled={!canExport}
        onClick={onExport}
      >
        <Download size={13} /> Export
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!canImport}
        onClick={onImportClick}
      >
        <Upload size={13} /> Import
      </button>
      <input
        ref={importInputRef}
        className="compare-import-input"
        type="file"
        accept="application/json,.json"
        aria-label="Import comparison JSON"
        onChange={onImportFileChange}
      />
    </>
  );
}

function CompareSetTransferStatusView({
  status,
}: {
  status: CompareSetTransferStatus;
}) {
  return (
    <span
      className={`compare-transfer-status compare-transfer-status-${status.tone}`}
      role={status.tone === "error" ? "alert" : "status"}
    >
      {status.message}
    </span>
  );
}

function CompareSessionContextStrip({
  summaries,
  annotations,
}: {
  summaries: CompareSessionContextSummary[];
  annotations: TelemetryAnnotation[];
}) {
  return (
    <section
      className="compare-session-strip"
      aria-label="Compared session context"
    >
      {summaries.map((summary) => (
        <article className="compare-session-chip" key={summary.sessionId}>
          <div className="compare-session-chip-header">
            <span className="compare-session-chip-title">{summary.title}</span>
            <span className="compare-session-chip-id mono">
              {summary.shortId}
            </span>
          </div>
          <div className="compare-session-chip-subtitle">
            {summary.subtitle}
          </div>
          <div className="compare-session-chip-meta mono">
            {summary.conditions}
          </div>
          <div className="compare-session-chip-laps mono">
            laps {summary.laps.join(", ")}
          </div>
          {getAnnotationCountForContext(annotations, {
            sessionId: summary.sessionId,
          }) > 0 && (
            <div className="annotation-chip mono">
              {getAnnotationCountForContext(annotations, {
                sessionId: summary.sessionId,
              })}{" "}
              notes
            </div>
          )}
        </article>
      ))}
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
            <span className="compare-sector-lap-session">
              {getEntrySessionBadge(row.entry)}
            </span>
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

type CursorReadoutRow = {
  entry: LapBasketEntry;
  status: "loading" | "ready" | "error";
  statusMessage: string | null;
  formattedValue: string;
  deltaSeconds: number | null;
  sectorLabel: string;
};

type NumericDistancePoint = {
  distanceMeters: number;
  value: number;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function interpolateByDistance(
  distances: Array<number | null> | null | undefined,
  values: Array<number | null> | null | undefined,
  distanceMeters: number,
) {
  if (!Array.isArray(distances) || !Array.isArray(values)) {
    return null;
  }

  const sampleCount = Math.min(distances.length, values.length);
  const points: NumericDistancePoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const sampleDistance = distances[index];
    const sampleValue = values[index];
    if (isFiniteNumber(sampleDistance) && isFiniteNumber(sampleValue)) {
      points.push({ distanceMeters: sampleDistance, value: sampleValue });
    }
  }

  if (points.length === 0) {
    return null;
  }

  points.sort(
    (firstPoint, secondPoint) =>
      firstPoint.distanceMeters - secondPoint.distanceMeters,
  );

  const firstPoint = points[0];
  if (distanceMeters <= firstPoint.distanceMeters) {
    return firstPoint.value;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const nextPoint = points[index];
    if (distanceMeters > nextPoint.distanceMeters) {
      continue;
    }

    const distanceSpan =
      nextPoint.distanceMeters - previousPoint.distanceMeters;
    if (distanceSpan <= Number.EPSILON) {
      return nextPoint.value;
    }

    const ratio =
      (distanceMeters - previousPoint.distanceMeters) / distanceSpan;
    return (
      previousPoint.value + (nextPoint.value - previousPoint.value) * ratio
    );
  }

  return points[points.length - 1].value;
}

function getChannelValueAtDistance(
  response: LapChannelsResponse,
  channelKey: OverlayChannelKey,
  distanceMeters: number,
) {
  return interpolateByDistance(
    response.channels.lapDistance,
    response.channels[channelKey],
    distanceMeters,
  );
}

function getElapsedSecondsAtDistance(
  response: LapChannelsResponse,
  distanceMeters: number,
) {
  return interpolateByDistance(
    response.channels.lapDistance,
    response.channels.time,
    distanceMeters,
  );
}

function getSectorLabelAtDistance(
  response: LapChannelsResponse,
  distanceMeters: number,
) {
  const elapsedSeconds = getElapsedSecondsAtDistance(response, distanceMeters);
  if (elapsedSeconds === null) {
    return null;
  }

  const sectorOneSeconds = parseDurationSeconds(response.sector1Time);
  const sectorTwoSeconds = parseDurationSeconds(response.sector2Time);
  const sectorThreeSeconds = parseDurationSeconds(response.sector3Time);
  if (sectorOneSeconds !== null && elapsedSeconds <= sectorOneSeconds) {
    return "S1";
  }

  if (
    sectorOneSeconds !== null &&
    sectorTwoSeconds !== null &&
    elapsedSeconds <= sectorOneSeconds + sectorTwoSeconds
  ) {
    return "S2";
  }

  if (
    sectorOneSeconds !== null &&
    sectorTwoSeconds !== null &&
    sectorThreeSeconds !== null
  ) {
    return "S3";
  }

  return null;
}

function interpolateDeltaAtDistance(
  points: DeltaTimePoint[],
  distanceMeters: number,
) {
  return interpolateByDistance(
    points.map((point) => point.distanceMeters),
    points.map((point) => point.deltaSeconds),
    distanceMeters,
  );
}

function buildDeltaLookupAtDistance(
  entries: LapBasketEntry[],
  channelStates: Record<string, LapChannelLoadState>,
  distanceMeters: number,
) {
  const deltaByEntryKey = new Map<string, number | null>();
  const referenceEntry = entries[0];
  if (referenceEntry === undefined) {
    return deltaByEntryKey;
  }

  const referenceState = channelStates[getEntryKey(referenceEntry)];
  if (referenceState?.status !== "ready") {
    return deltaByEntryKey;
  }

  const comparisonInputs = entries
    .slice(1)
    .map((entry) => {
      const state = channelStates[getEntryKey(entry)];
      return state?.status === "ready"
        ? toDeltaSeriesInput(entry, state.response)
        : null;
    })
    .filter((input): input is DeltaSeriesInput => input !== null);

  const deltaModel = buildDeltaTimeModel(
    toDeltaSeriesInput(referenceEntry, referenceState.response),
    comparisonInputs,
  );
  if (deltaModel === null) {
    return deltaByEntryKey;
  }

  for (const trace of deltaModel.traces) {
    deltaByEntryKey.set(
      trace.id,
      interpolateDeltaAtDistance(trace.points, distanceMeters),
    );
  }

  return deltaByEntryKey;
}

function buildCursorReadoutRows(
  entries: LapBasketEntry[],
  channelStates: Record<string, LapChannelLoadState>,
  channelKey: OverlayChannelKey,
  distanceMeters: number,
) {
  const channelOption =
    OVERLAY_CHANNEL_OPTIONS.find((option) => option.key === channelKey) ??
    OVERLAY_CHANNEL_OPTIONS[0];
  const deltaByEntryKey = buildDeltaLookupAtDistance(
    entries,
    channelStates,
    distanceMeters,
  );

  return entries.map((entry, index) => {
    const state = channelStates[getEntryKey(entry)];
    if (state === undefined || state.status === "loading") {
      return {
        entry,
        status: "loading",
        statusMessage: "Loading lap channels",
        formattedValue: "-",
        deltaSeconds: null,
        sectorLabel: "-",
      } satisfies CursorReadoutRow;
    }

    if (state.status === "error") {
      return {
        entry,
        status: "error",
        statusMessage: state.message,
        formattedValue: "-",
        deltaSeconds: null,
        sectorLabel: "-",
      } satisfies CursorReadoutRow;
    }

    const channelValue = getChannelValueAtDistance(
      state.response,
      channelKey,
      distanceMeters,
    );
    return {
      entry,
      status: "ready",
      statusMessage: null,
      formattedValue:
        channelValue === null ? "-" : channelOption.formatValue(channelValue),
      deltaSeconds:
        index === 0 ? null : (deltaByEntryKey.get(getEntryKey(entry)) ?? null),
      sectorLabel:
        getSectorLabelAtDistance(state.response, distanceMeters) ?? "-",
    } satisfies CursorReadoutRow;
  });
}

function CompareDistanceCursorReadout({
  entries,
  channelStates,
  selectedChannel,
  distanceCursor,
  onCreateMomentAnnotation,
}: {
  entries: LapBasketEntry[];
  channelStates: Record<string, LapChannelLoadState>;
  selectedChannel: OverlayChannelKey;
  distanceCursor: CompareDistanceCursorState;
  onCreateMomentAnnotation: (
    entry: LapBasketEntry,
    distanceMeters: number,
    endDistanceMeters?: number | null,
  ) => void;
}) {
  const distanceMeters = distanceCursor.distanceMeters;
  const channelOption =
    OVERLAY_CHANNEL_OPTIONS.find((option) => option.key === selectedChannel) ??
    OVERLAY_CHANNEL_OPTIONS[0];
  const rows = useMemo(
    () =>
      distanceMeters === null
        ? []
        : buildCursorReadoutRows(
            entries,
            channelStates,
            selectedChannel,
            distanceMeters,
          ),
    [channelStates, distanceMeters, entries, selectedChannel],
  );

  if (distanceMeters === null) {
    return null;
  }

  const roundedDistance = Math.round(distanceMeters);
  const referenceEntry = entries[0] ?? null;

  return (
    <section className="compare-cursor-readout" aria-label="Cursor values">
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Cursor</span>
          <span className="compare-overlay-channel-label">
            {roundedDistance.toLocaleString()} m
          </span>
        </div>
        <span className="compare-delta-reference mono">
          {channelOption.label}
        </span>
        {referenceEntry !== null && (
          <div className="compare-overlay-actions">
            <button
              type="button"
              className="compare-overlay-reference-button"
              onClick={() =>
                onCreateMomentAnnotation(referenceEntry, distanceMeters)
              }
            >
              Note point
            </button>
            <button
              type="button"
              className="compare-overlay-reference-button"
              onClick={() =>
                onCreateMomentAnnotation(
                  referenceEntry,
                  distanceMeters,
                  distanceMeters + 50,
                )
              }
            >
              Note span
            </button>
          </div>
        )}
      </header>
      <div className="table-panel-body compare-cursor-table-region">
        <table
          className="dense-table compare-cursor-table"
          aria-label={`Cursor values at ${roundedDistance.toLocaleString()} m`}
        >
          <thead>
            <tr>
              <th scope="col">Lap</th>
              <th scope="col">{channelOption.label}</th>
              <th scope="col">Delta</th>
              <th scope="col">Sector</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={getEntryKey(row.entry)}
                className={
                  index === 0 ? "compare-cursor-reference-row" : undefined
                }
              >
                <th scope="row">
                  <span className="compare-sector-lap">
                    <span
                      className="compare-sector-lap-swatch"
                      style={
                        { "--lap-color": row.entry.color } as CSSProperties
                      }
                      aria-hidden="true"
                    />
                    <span className="compare-sector-lap-text">
                      <span className="compare-sector-lap-number mono">
                        Lap {row.entry.lapNumber}
                      </span>
                      <span className="compare-sector-lap-label">
                        {row.entry.label}
                      </span>
                      <span className="compare-sector-lap-session">
                        {getEntrySessionBadge(row.entry)}
                      </span>
                    </span>
                  </span>
                </th>
                <td className="mono" title={row.statusMessage ?? undefined}>
                  <span
                    className={`compare-cursor-value compare-cursor-${row.status}`}
                  >
                    {row.formattedValue}
                  </span>
                </td>
                <td className={getSectorDeltaClass(row.deltaSeconds)}>
                  {index === 0 ? "REF" : formatDeltaSeconds(row.deltaSeconds)}
                </td>
                <td className="mono compare-cursor-sector">
                  {row.sectorLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
  pathId: string;
};

type OverlayChartModel = {
  traces: OverlayTrace[];
  traceStrokeWidth: number;
  xAxis: CompareChartXAxis;
  xAxisLabel: string;
  xDomainMin: number;
  xDomainMax: number;
  fullXDomainMin: number;
  fullXDomainMax: number;
  yDomainMin: number;
  yDomainMax: number;
  fullYDomainMin: number;
  fullYDomainMax: number;
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

function getOverlayTraceStrokeWidth(
  xDomainMin: number,
  xDomainMax: number,
  fullXDomainMin: number,
  fullXDomainMax: number,
  traceCount: number,
  seriesCount: number,
) {
  const fullSpan = Math.max(fullXDomainMax - fullXDomainMin, Number.EPSILON);
  const visibleSpan = Math.max(xDomainMax - xDomainMin, Number.EPSILON);
  const zoomRatio = clamp(visibleSpan / fullSpan, 0, 1);
  const zoomStroke = clamp(0.9 * Math.sqrt(zoomRatio), 0.24, 0.9);
  const pathDensity = traceCount / Math.max(seriesCount, 1);
  const densityStroke =
    pathDensity <= 1 ? 0.9 : clamp(0.9 / Math.sqrt(pathDensity), 0.24, 0.9);

  return Math.min(zoomStroke, densityStroke);
}

function buildOverlayChartModel(
  ready: Array<{ entry: LapBasketEntry; response: LapChannelsResponse }>,
  channelKey: OverlayChannelKey,
  xZoom: CompareXAxisZoom | null,
  yZoom: CompareAxisZoom | null,
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

  const fullXTicks = buildAxisTicks(xMin, xMax);
  const fullYTicks = buildAxisTicks(yMin, yMax);
  const fullXDomainMin = Math.min(xMin, fullXTicks[0] ?? xMin);
  const fullXDomainMax = Math.max(xMax, fullXTicks.at(-1) ?? xMax);
  const fullYDomainMin = Math.min(yMin, fullYTicks[0] ?? yMin);
  const fullYDomainMax = Math.max(yMax, fullYTicks.at(-1) ?? yMax);
  const normalizedXZoom =
    xZoom?.axis === xAxis
      ? normalizeZoomRange(xZoom, fullXDomainMin, fullXDomainMax)
      : null;
  const normalizedYZoom = normalizeZoomRange(
    yZoom,
    fullYDomainMin,
    fullYDomainMax,
  );
  const xDomainMin = normalizedXZoom?.min ?? fullXDomainMin;
  const xDomainMax = normalizedXZoom?.max ?? fullXDomainMax;
  const yDomainMin = normalizedYZoom?.min ?? fullYDomainMin;
  const yDomainMax = normalizedYZoom?.max ?? fullYDomainMax;
  const xTicks = buildAxisTicks(xDomainMin, xDomainMax).filter(
    (tick) => tick >= xDomainMin && tick <= xDomainMax,
  );
  const yTicks = buildAxisTicks(yDomainMin, yDomainMax).filter(
    (tick) => tick >= yDomainMin && tick <= yDomainMax,
  );
  const resolvedXTicks = xTicks.length > 0 ? xTicks : [xDomainMin, xDomainMax];
  const resolvedYTicks = yTicks.length > 0 ? yTicks : [yDomainMin, yDomainMax];
  const xRange = Math.max(xDomainMax - xDomainMin, Number.EPSILON);
  const yRange = Math.max(yDomainMax - yDomainMin, Number.EPSILON);
  const plotWidth =
    OVERLAY_CHART_WIDTH -
    OVERLAY_CHART_PADDING.left -
    OVERLAY_CHART_PADDING.right;
  const plotHeight =
    OVERLAY_CHART_HEIGHT -
    OVERLAY_CHART_PADDING.top -
    OVERLAY_CHART_PADDING.bottom;

  const toChartX = (value: number) =>
    OVERLAY_CHART_PADDING.left + ((value - xDomainMin) / xRange) * plotWidth;

  const toChartY = (value: number) =>
    OVERLAY_CHART_PADDING.top +
    (1 - (value - yDomainMin) / yRange) * plotHeight;

  const traces: OverlayTrace[] = series.flatMap(({ entry, points }) => {
    const pathRuns = buildClippedPathData(
      points,
      xDomainMin,
      xDomainMax,
      toChartX,
      toChartY,
    );
    return pathRuns.map((pathData, pathIndex) => ({
      entry,
      pathData,
      pathId: `${getEntryKey(entry)}-${pathIndex}`,
    }));
  });
  const traceStrokeWidth = getOverlayTraceStrokeWidth(
    xDomainMin,
    xDomainMax,
    fullXDomainMin,
    fullXDomainMax,
    traces.length,
    series.length,
  );

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
    traceStrokeWidth,
    xAxis,
    xAxisLabel,
    xDomainMin,
    xDomainMax,
    fullXDomainMin,
    fullXDomainMax,
    yDomainMin,
    yDomainMax,
    fullYDomainMin,
    fullYDomainMax,
    xTicks: resolvedXTicks,
    yTicks: [...resolvedYTicks].reverse(),
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
  panelId,
  panelNumber,
  entries,
  channelStates,
  selectedChannel,
  canRemove,
  onSelectChannel,
  onRemovePanel,
  onSetReferenceLap,
  annotations,
  onCreateMomentAnnotation,
  distanceCursor,
  onDistanceCursorChange,
  onDistanceCursorClear,
  xZoom,
  yZoom,
  onXZoomChange,
  onYZoomChange,
  onResetZoom,
}: {
  panelId: string;
  panelNumber: number;
  entries: LapBasketEntry[];
  channelStates: Record<string, LapChannelLoadState>;
  selectedChannel: OverlayChannelKey;
  canRemove: boolean;
  onSelectChannel: (panelId: string, channel: OverlayChannelKey) => void;
  onRemovePanel: (panelId: string) => void;
  onSetReferenceLap?: (sessionId: string, lapNumber: number) => void;
  annotations: TelemetryAnnotation[];
  onCreateMomentAnnotation: (
    entry: LapBasketEntry,
    distanceMeters: number,
    endDistanceMeters?: number | null,
  ) => void;
} & CompareDistanceCursorControls &
  CompareZoomControls) {
  const selectId = useId();
  const clipPathId = `compare-overlay-clip-${panelId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<CompareChartDragState | null>(null);
  const suppressClickRef = useRef(false);
  const [zoomSelection, setZoomSelection] =
    useState<CompareZoomSelection | null>(null);
  const ready = useMemo(
    () => pickReadyEntries(entries, channelStates),
    [entries, channelStates],
  );
  const channelOption =
    OVERLAY_CHANNEL_OPTIONS.find((option) => option.key === selectedChannel) ??
    OVERLAY_CHANNEL_OPTIONS[0];
  const model = useMemo(
    () => buildOverlayChartModel(ready, selectedChannel, xZoom, yZoom),
    [ready, selectedChannel, xZoom, yZoom],
  );
  useWheelScrollBlock(svgRef, model !== null);
  const momentAnnotations = useMemo(
    () => getMomentAnnotationsForEntries(annotations, entries),
    [annotations, entries],
  );
  const cursorX =
    model !== null && model.xAxis === "lapDistance"
      ? getCursorChartX(
          distanceCursor,
          model.xDomainMin,
          model.xDomainMax,
          model.toChartX,
        )
      : null;
  const selectionRect =
    model === null
      ? null
      : getSelectionRect(zoomSelection, model.toChartX, model.toChartY);
  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (model === null || model.xAxis !== "lapDistance") {
        return;
      }

      const dragState = dragStateRef.current;
      if (dragState?.pointerId === event.pointerId) {
        const point = getChartDomainPointFromPointer(
          event,
          OVERLAY_CHART_WIDTH,
          OVERLAY_CHART_HEIGHT,
          OVERLAY_CHART_PADDING,
          model.xDomainMin,
          model.xDomainMax,
          model.yDomainMin,
          model.yDomainMax,
        );
        if (point === null) {
          return;
        }

        const didMove =
          dragState.didMove ||
          isDragPastThreshold(
            dragState.originClientX,
            dragState.originClientY,
            event.clientX,
            event.clientY,
          );

        if (dragState.mode === "select") {
          const nextSelection = { start: dragState.start, current: point };
          dragStateRef.current = {
            ...dragState,
            current: point,
            lastClientX: event.clientX,
            lastClientY: event.clientY,
            didMove,
          };
          setZoomSelection(didMove ? nextSelection : null);
          if (didMove) {
            suppressClickRef.current = true;
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const plotWidth =
          rect.width *
          ((OVERLAY_CHART_WIDTH -
            OVERLAY_CHART_PADDING.left -
            OVERLAY_CHART_PADDING.right) /
            OVERLAY_CHART_WIDTH);
        const plotHeight =
          rect.height *
          ((OVERLAY_CHART_HEIGHT -
            OVERLAY_CHART_PADDING.top -
            OVERLAY_CHART_PADDING.bottom) /
            OVERLAY_CHART_HEIGHT);
        const deltaX = event.clientX - dragState.lastClientX;
        const deltaY = event.clientY - dragState.lastClientY;
        if (plotWidth > 0 && plotHeight > 0) {
          const nextXZoom = panZoomRange(
            model.xDomainMin,
            model.xDomainMax,
            model.fullXDomainMin,
            model.fullXDomainMax,
            -(deltaX / plotWidth) * (model.xDomainMax - model.xDomainMin),
          );
          const nextYZoom = panZoomRange(
            model.yDomainMin,
            model.yDomainMax,
            model.fullYDomainMin,
            model.fullYDomainMax,
            (deltaY / plotHeight) * (model.yDomainMax - model.yDomainMin),
          );

          if (nextXZoom !== null) {
            onXZoomChange({ ...nextXZoom, axis: model.xAxis });
          }
          if (nextYZoom !== null) {
            onYZoomChange(panelId, nextYZoom);
          }
        }

        dragStateRef.current = {
          ...dragState,
          current: point,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          didMove,
        };
        if (didMove) {
          suppressClickRef.current = true;
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const distanceMeters = getDomainXFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        OVERLAY_CHART_PADDING,
        model.xDomainMin,
        model.xDomainMax,
      );
      if (distanceMeters !== null) {
        onDistanceCursorChange(panelId, distanceMeters);
      }
    },
    [model, onDistanceCursorChange, onXZoomChange, onYZoomChange, panelId],
  );
  const handleWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      if (model === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const point = getChartDomainPointFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        OVERLAY_CHART_HEIGHT,
        OVERLAY_CHART_PADDING,
        model.xDomainMin,
        model.xDomainMax,
        model.yDomainMin,
        model.yDomainMax,
      );
      if (point === null) {
        return;
      }

      const factor = event.deltaY < 0 ? 0.82 : 1.22;
      const nextXZoom = zoomRangeAround(
        model.xDomainMin,
        model.xDomainMax,
        model.fullXDomainMin,
        model.fullXDomainMax,
        point.x,
        factor,
      );
      const nextYZoom = zoomRangeAround(
        model.yDomainMin,
        model.yDomainMax,
        model.fullYDomainMin,
        model.fullYDomainMax,
        point.y,
        factor,
      );

      onXZoomChange(
        nextXZoom === null ? null : { ...nextXZoom, axis: model.xAxis },
      );
      onYZoomChange(panelId, nextYZoom);
    },
    [model, onXZoomChange, onYZoomChange, panelId],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (model === null || (event.button !== 0 && event.button !== 1)) {
        return;
      }

      const point = getChartDomainPointFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        OVERLAY_CHART_HEIGHT,
        OVERLAY_CHART_PADDING,
        model.xDomainMin,
        model.xDomainMax,
        model.yDomainMin,
        model.yDomainMax,
      );
      if (point === null) {
        return;
      }

      const canPan = xZoom !== null || yZoom !== null;
      const mode =
        canPan && (event.shiftKey || event.button === 1) ? "pan" : "select";

      dragStateRef.current = {
        pointerId: event.pointerId,
        mode,
        start: point,
        current: point,
        originClientX: event.clientX,
        originClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        didMove: false,
      };
      setZoomSelection(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [model, xZoom, yZoom],
  );
  const handlePointerRelease = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (dragState?.pointerId === event.pointerId) {
        const point =
          model === null
            ? null
            : getChartDomainPointFromPointer(
                event,
                OVERLAY_CHART_WIDTH,
                OVERLAY_CHART_HEIGHT,
                OVERLAY_CHART_PADDING,
                model.xDomainMin,
                model.xDomainMax,
                model.yDomainMin,
                model.yDomainMax,
              );
        const finalSelection = {
          start: dragState.start,
          current: point ?? dragState.current,
        };
        const didMove =
          dragState.didMove ||
          isDragPastThreshold(
            dragState.originClientX,
            dragState.originClientY,
            event.clientX,
            event.clientY,
          );

        if (dragState.mode === "select" && didMove && model !== null) {
          const nextXZoom = normalizeZoomRange(
            {
              min: finalSelection.start.x,
              max: finalSelection.current.x,
            },
            model.fullXDomainMin,
            model.fullXDomainMax,
          );
          const nextYZoom = normalizeZoomRange(
            {
              min: finalSelection.start.y,
              max: finalSelection.current.y,
            },
            model.fullYDomainMin,
            model.fullYDomainMax,
          );

          if (nextXZoom !== null) {
            onXZoomChange({ ...nextXZoom, axis: model.xAxis });
          }
          if (nextYZoom !== null) {
            onYZoomChange(panelId, nextYZoom);
          }
          suppressClickRef.current = true;
        }

        dragStateRef.current = null;
        setZoomSelection(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }
    },
    [model, onXZoomChange, onYZoomChange, panelId],
  );
  const handleFocus = useCallback(() => {
    if (model === null || model.xAxis !== "lapDistance") {
      return;
    }

    onDistanceCursorChange(
      panelId,
      distanceCursor.distanceMeters ??
        model.xDomainMin + (model.xDomainMax - model.xDomainMin) / 2,
    );
  }, [distanceCursor.distanceMeters, model, onDistanceCursorChange, panelId]);
  const handleChartClick = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        return;
      }

      if (model === null || model.xAxis !== "lapDistance") {
        return;
      }

      const distanceMeters = getDomainXFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        OVERLAY_CHART_PADDING,
        model.xDomainMin,
        model.xDomainMax,
      );
      const referenceEntry = entries[0];
      if (distanceMeters !== null && referenceEntry !== undefined) {
        onCreateMomentAnnotation(referenceEntry, distanceMeters);
      }
    },
    [entries, model, onCreateMomentAnnotation],
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
      aria-label={`Lap overlay ${panelNumber} (${channelOption.label})`}
    >
      <header className="compare-overlay-header">
        <div className="compare-overlay-title">
          <span className="zone-kicker">Overlay {panelNumber}</span>
          <span className="compare-overlay-channel-label">
            {channelOption.label}
          </span>
        </div>
        <div className="compare-overlay-actions">
          <label className="compare-overlay-channel-control" htmlFor={selectId}>
            <span className="compare-overlay-channel-control-label">
              Channel
            </span>
            <select
              id={selectId}
              className="compare-overlay-channel-select"
              aria-label={`Overlay ${panelNumber} channel`}
              value={selectedChannel}
              onChange={(event) =>
                onSelectChannel(
                  panelId,
                  event.target.value as OverlayChannelKey,
                )
              }
            >
              {OVERLAY_CHANNEL_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {canRemove && (
            <button
              type="button"
              className="icon-button compare-row-action"
              aria-label={`Remove overlay ${panelNumber}`}
              title={`Remove overlay ${panelNumber}`}
              onClick={() => onRemovePanel(panelId)}
            >
              <X size={13} />
            </button>
          )}
        </div>
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
            ref={svgRef}
            className="compare-overlay-svg"
            viewBox={`0 0 ${OVERLAY_CHART_WIDTH} ${OVERLAY_CHART_HEIGHT}`}
            role="img"
            aria-label={`Lap overlay chart for ${channelOption.label} overlay ${panelNumber}`}
            tabIndex={model.xAxis === "lapDistance" ? 0 : undefined}
            onFocus={handleFocus}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerRelease}
            onPointerCancel={handlePointerRelease}
            onPointerLeave={(event) => {
              handlePointerRelease(event);
              onDistanceCursorClear(panelId);
            }}
            onWheelCapture={handleWheel}
            onDoubleClick={onResetZoom}
            onClick={handleChartClick}
          >
            <defs>
              <clipPath id={clipPathId}>
                <rect
                  x={OVERLAY_CHART_PADDING.left}
                  y={OVERLAY_CHART_PADDING.top}
                  width={
                    OVERLAY_CHART_WIDTH -
                    OVERLAY_CHART_PADDING.left -
                    OVERLAY_CHART_PADDING.right
                  }
                  height={
                    OVERLAY_CHART_HEIGHT -
                    OVERLAY_CHART_PADDING.top -
                    OVERLAY_CHART_PADDING.bottom
                  }
                />
              </clipPath>
            </defs>
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
            <g clipPath={`url(#${clipPathId})`}>
              {model.traces.map((trace) => (
                <path
                  key={trace.pathId}
                  className="compare-overlay-trace"
                  style={
                    {
                      "--lap-color": trace.entry.color,
                      "--compare-overlay-stroke-width": `${model.traceStrokeWidth.toFixed(2)}`,
                    } as CSSProperties
                  }
                  d={trace.pathData}
                />
              ))}
              {model.xAxis === "lapDistance" &&
                momentAnnotations.map((annotation) => {
                  const startX = model.toChartX(annotation.distanceMeters ?? 0);
                  const endX =
                    typeof annotation.endDistanceMeters === "number"
                      ? model.toChartX(annotation.endDistanceMeters)
                      : null;
                  return (
                    <g key={`annotation-${annotation.id}`}>
                      {endX !== null && (
                        <rect
                          className="annotation-chart-span"
                          x={Math.min(startX, endX)}
                          y={OVERLAY_CHART_PADDING.top}
                          width={Math.max(Math.abs(endX - startX), 2)}
                          height={
                            OVERLAY_CHART_HEIGHT -
                            OVERLAY_CHART_PADDING.top -
                            OVERLAY_CHART_PADDING.bottom
                          }
                        />
                      )}
                      <line
                        className="annotation-chart-marker"
                        x1={startX}
                        x2={startX}
                        y1={OVERLAY_CHART_PADDING.top}
                        y2={OVERLAY_CHART_HEIGHT - OVERLAY_CHART_PADDING.bottom}
                      >
                        <title>
                          {annotation.note} {formatAnnotationMoment(annotation)}
                        </title>
                      </line>
                    </g>
                  );
                })}
            </g>
            {cursorX !== null && (
              <line
                className="compare-distance-cursor-line"
                x1={cursorX}
                x2={cursorX}
                y1={OVERLAY_CHART_PADDING.top}
                y2={OVERLAY_CHART_HEIGHT - OVERLAY_CHART_PADDING.bottom}
              />
            )}
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
            <rect
              className="compare-chart-pointer-capture"
              x={OVERLAY_CHART_PADDING.left}
              y={OVERLAY_CHART_PADDING.top}
              width={
                OVERLAY_CHART_WIDTH -
                OVERLAY_CHART_PADDING.left -
                OVERLAY_CHART_PADDING.right
              }
              height={
                OVERLAY_CHART_HEIGHT -
                OVERLAY_CHART_PADDING.top -
                OVERLAY_CHART_PADDING.bottom
              }
              fill="transparent"
              pointerEvents="all"
            />
            {selectionRect !== null &&
              selectionRect.width >= 1 &&
              selectionRect.height >= 1 && (
                <rect
                  className="compare-zoom-selection"
                  x={selectionRect.x}
                  y={selectionRect.y}
                  width={selectionRect.width}
                  height={selectionRect.height}
                />
              )}
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
              <span
                className="compare-overlay-legend-session mono"
                title={getEntrySessionDetails(entry)}
              >
                {getEntrySessionBadge(entry)}
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
  xDomainMin: number;
  xDomainMax: number;
  fullXDomainMin: number;
  fullXDomainMax: number;
  yDomainMin: number;
  yDomainMax: number;
  fullYDomainMin: number;
  fullYDomainMax: number;
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

function clipDeltaSegmentToXDomain(
  segment: DeltaSegment,
  domainMin: number,
  domainMax: number,
): DeltaSegment | null {
  const clipped = clipChartSegmentToXDomain(
    {
      x: segment.from.distanceMeters,
      y: segment.from.deltaSeconds,
    },
    {
      x: segment.to.distanceMeters,
      y: segment.to.deltaSeconds,
    },
    domainMin,
    domainMax,
  );
  if (clipped === null) {
    return null;
  }

  const [from, to] = clipped;
  return {
    from: { distanceMeters: from.x, deltaSeconds: from.y },
    to: { distanceMeters: to.x, deltaSeconds: to.y },
    tone: segment.tone,
  };
}

function buildDeltaChartModel(
  traces: DeltaTimeTrace[],
  xZoom: CompareXAxisZoom | null,
  yZoom: CompareAxisZoom | null,
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
  const fullXTicks = buildAxisTicks(0, xMax);
  const fullXDomainMin = 0;
  const fullXDomainMax = Math.max(xMax, fullXTicks.at(-1) ?? xMax);
  const fullYDomainMin = -yMax;
  const fullYDomainMax = yMax;
  const normalizedXZoom =
    xZoom?.axis === "lapDistance"
      ? normalizeZoomRange(xZoom, fullXDomainMin, fullXDomainMax)
      : null;
  const normalizedYZoom = normalizeZoomRange(
    yZoom,
    fullYDomainMin,
    fullYDomainMax,
  );
  const xDomainMin = normalizedXZoom?.min ?? fullXDomainMin;
  const xDomainMax = normalizedXZoom?.max ?? fullXDomainMax;
  const yDomainMin = normalizedYZoom?.min ?? fullYDomainMin;
  const yDomainMax = normalizedYZoom?.max ?? fullYDomainMax;
  const xTicks = buildAxisTicks(xDomainMin, xDomainMax).filter(
    (tick) => tick >= xDomainMin && tick <= xDomainMax,
  );
  const yTicks = buildAxisTicks(yDomainMin, yDomainMax).filter(
    (tick) => tick >= yDomainMin && tick <= yDomainMax,
  );
  const resolvedXTicks = xTicks.length > 0 ? xTicks : [xDomainMin, xDomainMax];
  const resolvedYTicks = yTicks.length > 0 ? yTicks : [yDomainMin, yDomainMax];
  const plotWidth =
    OVERLAY_CHART_WIDTH - DELTA_CHART_PADDING.left - DELTA_CHART_PADDING.right;
  const plotHeight =
    DELTA_CHART_HEIGHT - DELTA_CHART_PADDING.top - DELTA_CHART_PADDING.bottom;
  const xRange = Math.max(xDomainMax - xDomainMin, Number.EPSILON);
  const yRange = Math.max(yDomainMax - yDomainMin, Number.EPSILON);

  const toChartX = (value: number) =>
    DELTA_CHART_PADDING.left + ((value - xDomainMin) / xRange) * plotWidth;
  const toChartY = (value: number) =>
    DELTA_CHART_PADDING.top + ((yDomainMax - value) / yRange) * plotHeight;

  return {
    traces: traces.map((trace) => ({
      trace,
      segments: buildDeltaSegments(trace.points).flatMap((segment) => {
        const clippedSegment = clipDeltaSegmentToXDomain(
          segment,
          xDomainMin,
          xDomainMax,
        );
        return clippedSegment === null ? [] : [clippedSegment];
      }),
    })),
    xDomainMin,
    xDomainMax,
    fullXDomainMin,
    fullXDomainMax,
    yDomainMin,
    yDomainMax,
    fullYDomainMin,
    fullYDomainMax,
    xTicks: resolvedXTicks,
    yTicks: [...resolvedYTicks].reverse(),
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
  annotations,
  onCreateMomentAnnotation,
  distanceCursor,
  onDistanceCursorChange,
  onDistanceCursorClear,
  xZoom,
  yZoom,
  onXZoomChange,
  onYZoomChange,
  onResetZoom,
}: {
  entries: LapBasketEntry[];
  channelStates: Record<string, LapChannelLoadState>;
  annotations: TelemetryAnnotation[];
  onCreateMomentAnnotation: (
    entry: LapBasketEntry,
    distanceMeters: number,
    endDistanceMeters?: number | null,
  ) => void;
} & CompareDistanceCursorControls &
  CompareZoomControls) {
  const clipPathId = "compare-delta-clip";
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<CompareChartDragState | null>(null);
  const suppressClickRef = useRef(false);
  const [zoomSelection, setZoomSelection] =
    useState<CompareZoomSelection | null>(null);
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
      deltaModel === null
        ? null
        : buildDeltaChartModel(deltaModel.traces, xZoom, yZoom),
    [deltaModel, xZoom, yZoom],
  );
  useWheelScrollBlock(svgRef, chartModel !== null);
  const placeholderMessage = getDeltaPlaceholderMessage(entries, channelStates);
  const momentAnnotations = useMemo(
    () => getMomentAnnotationsForEntries(annotations, entries),
    [annotations, entries],
  );
  const clippedTraceCount = deltaModel?.clippedTraceCount ?? 0;
  const cursorX =
    chartModel === null
      ? null
      : getCursorChartX(
          distanceCursor,
          chartModel.xDomainMin,
          chartModel.xDomainMax,
          chartModel.toChartX,
        );
  const selectionRect =
    chartModel === null
      ? null
      : getSelectionRect(
          zoomSelection,
          chartModel.toChartX,
          chartModel.toChartY,
        );
  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (chartModel === null) {
        return;
      }

      const dragState = dragStateRef.current;
      if (dragState?.pointerId === event.pointerId) {
        const point = getChartDomainPointFromPointer(
          event,
          OVERLAY_CHART_WIDTH,
          DELTA_CHART_HEIGHT,
          DELTA_CHART_PADDING,
          chartModel.xDomainMin,
          chartModel.xDomainMax,
          chartModel.yDomainMin,
          chartModel.yDomainMax,
        );
        if (point === null) {
          return;
        }

        const didMove =
          dragState.didMove ||
          isDragPastThreshold(
            dragState.originClientX,
            dragState.originClientY,
            event.clientX,
            event.clientY,
          );

        if (dragState.mode === "select") {
          const nextSelection = { start: dragState.start, current: point };
          dragStateRef.current = {
            ...dragState,
            current: point,
            lastClientX: event.clientX,
            lastClientY: event.clientY,
            didMove,
          };
          setZoomSelection(didMove ? nextSelection : null);
          if (didMove) {
            suppressClickRef.current = true;
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const plotWidth =
          rect.width *
          ((OVERLAY_CHART_WIDTH -
            DELTA_CHART_PADDING.left -
            DELTA_CHART_PADDING.right) /
            OVERLAY_CHART_WIDTH);
        const plotHeight =
          rect.height *
          ((DELTA_CHART_HEIGHT -
            DELTA_CHART_PADDING.top -
            DELTA_CHART_PADDING.bottom) /
            DELTA_CHART_HEIGHT);
        const deltaX = event.clientX - dragState.lastClientX;
        const deltaY = event.clientY - dragState.lastClientY;
        if (plotWidth > 0 && plotHeight > 0) {
          const nextXZoom = panZoomRange(
            chartModel.xDomainMin,
            chartModel.xDomainMax,
            chartModel.fullXDomainMin,
            chartModel.fullXDomainMax,
            -(deltaX / plotWidth) *
              (chartModel.xDomainMax - chartModel.xDomainMin),
          );
          const nextYZoom = panZoomRange(
            chartModel.yDomainMin,
            chartModel.yDomainMax,
            chartModel.fullYDomainMin,
            chartModel.fullYDomainMax,
            (deltaY / plotHeight) *
              (chartModel.yDomainMax - chartModel.yDomainMin),
          );

          if (nextXZoom !== null) {
            onXZoomChange({ ...nextXZoom, axis: "lapDistance" });
          }
          if (nextYZoom !== null) {
            onYZoomChange(DELTA_COMPARE_PANEL_ID, nextYZoom);
          }
        }

        dragStateRef.current = {
          ...dragState,
          current: point,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          didMove,
        };
        if (didMove) {
          suppressClickRef.current = true;
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const distanceMeters = getDomainXFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        DELTA_CHART_PADDING,
        chartModel.xDomainMin,
        chartModel.xDomainMax,
      );
      if (distanceMeters !== null) {
        onDistanceCursorChange(DELTA_COMPARE_PANEL_ID, distanceMeters);
      }
    },
    [chartModel, onDistanceCursorChange, onXZoomChange, onYZoomChange],
  );
  const handleWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      if (chartModel === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const point = getChartDomainPointFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        DELTA_CHART_HEIGHT,
        DELTA_CHART_PADDING,
        chartModel.xDomainMin,
        chartModel.xDomainMax,
        chartModel.yDomainMin,
        chartModel.yDomainMax,
      );
      if (point === null) {
        return;
      }

      const factor = event.deltaY < 0 ? 0.82 : 1.22;
      const nextXZoom = zoomRangeAround(
        chartModel.xDomainMin,
        chartModel.xDomainMax,
        chartModel.fullXDomainMin,
        chartModel.fullXDomainMax,
        point.x,
        factor,
      );
      const nextYZoom = zoomRangeAround(
        chartModel.yDomainMin,
        chartModel.yDomainMax,
        chartModel.fullYDomainMin,
        chartModel.fullYDomainMax,
        point.y,
        factor,
      );

      onXZoomChange(
        nextXZoom === null ? null : { ...nextXZoom, axis: "lapDistance" },
      );
      onYZoomChange(DELTA_COMPARE_PANEL_ID, nextYZoom);
    },
    [chartModel, onXZoomChange, onYZoomChange],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (chartModel === null || (event.button !== 0 && event.button !== 1)) {
        return;
      }

      const point = getChartDomainPointFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        DELTA_CHART_HEIGHT,
        DELTA_CHART_PADDING,
        chartModel.xDomainMin,
        chartModel.xDomainMax,
        chartModel.yDomainMin,
        chartModel.yDomainMax,
      );
      if (point === null) {
        return;
      }

      const canPan = xZoom !== null || yZoom !== null;
      const mode =
        canPan && (event.shiftKey || event.button === 1) ? "pan" : "select";

      dragStateRef.current = {
        pointerId: event.pointerId,
        mode,
        start: point,
        current: point,
        originClientX: event.clientX,
        originClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        didMove: false,
      };
      setZoomSelection(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [chartModel, xZoom, yZoom],
  );
  const handlePointerRelease = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (dragState?.pointerId === event.pointerId) {
        const point =
          chartModel === null
            ? null
            : getChartDomainPointFromPointer(
                event,
                OVERLAY_CHART_WIDTH,
                DELTA_CHART_HEIGHT,
                DELTA_CHART_PADDING,
                chartModel.xDomainMin,
                chartModel.xDomainMax,
                chartModel.yDomainMin,
                chartModel.yDomainMax,
              );
        const finalSelection = {
          start: dragState.start,
          current: point ?? dragState.current,
        };
        const didMove =
          dragState.didMove ||
          isDragPastThreshold(
            dragState.originClientX,
            dragState.originClientY,
            event.clientX,
            event.clientY,
          );

        if (dragState.mode === "select" && didMove && chartModel !== null) {
          const nextXZoom = normalizeZoomRange(
            {
              min: finalSelection.start.x,
              max: finalSelection.current.x,
            },
            chartModel.fullXDomainMin,
            chartModel.fullXDomainMax,
          );
          const nextYZoom = normalizeZoomRange(
            {
              min: finalSelection.start.y,
              max: finalSelection.current.y,
            },
            chartModel.fullYDomainMin,
            chartModel.fullYDomainMax,
          );

          if (nextXZoom !== null) {
            onXZoomChange({ ...nextXZoom, axis: "lapDistance" });
          }
          if (nextYZoom !== null) {
            onYZoomChange(DELTA_COMPARE_PANEL_ID, nextYZoom);
          }
          suppressClickRef.current = true;
        }

        dragStateRef.current = null;
        setZoomSelection(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }
    },
    [chartModel, onXZoomChange, onYZoomChange],
  );
  const handleFocus = useCallback(() => {
    if (chartModel === null) {
      return;
    }

    onDistanceCursorChange(
      DELTA_COMPARE_PANEL_ID,
      distanceCursor.distanceMeters ??
        chartModel.xDomainMin +
          (chartModel.xDomainMax - chartModel.xDomainMin) / 2,
    );
  }, [chartModel, distanceCursor.distanceMeters, onDistanceCursorChange]);
  const handleChartClick = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        return;
      }

      if (chartModel === null || referenceEntry === null) {
        return;
      }

      const distanceMeters = getDomainXFromPointer(
        event,
        OVERLAY_CHART_WIDTH,
        DELTA_CHART_PADDING,
        chartModel.xDomainMin,
        chartModel.xDomainMax,
      );
      if (distanceMeters !== null) {
        onCreateMomentAnnotation(referenceEntry, distanceMeters);
      }
    },
    [chartModel, onCreateMomentAnnotation, referenceEntry],
  );

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
              ref={svgRef}
              className="compare-overlay-svg"
              viewBox={`0 0 ${OVERLAY_CHART_WIDTH} ${DELTA_CHART_HEIGHT}`}
              role="img"
              aria-label={`Delta time plot vs ${referenceEntry.label}`}
              tabIndex={0}
              onFocus={handleFocus}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerRelease}
              onPointerCancel={handlePointerRelease}
              onPointerLeave={(event) => {
                handlePointerRelease(event);
                onDistanceCursorClear(DELTA_COMPARE_PANEL_ID);
              }}
              onWheelCapture={handleWheel}
              onDoubleClick={onResetZoom}
              onClick={handleChartClick}
            >
              <defs>
                <clipPath id={clipPathId}>
                  <rect
                    x={DELTA_CHART_PADDING.left}
                    y={DELTA_CHART_PADDING.top}
                    width={
                      OVERLAY_CHART_WIDTH -
                      DELTA_CHART_PADDING.left -
                      DELTA_CHART_PADDING.right
                    }
                    height={
                      DELTA_CHART_HEIGHT -
                      DELTA_CHART_PADDING.top -
                      DELTA_CHART_PADDING.bottom
                    }
                  />
                </clipPath>
              </defs>
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
              <g clipPath={`url(#${clipPathId})`}>
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
                {momentAnnotations.map((annotation) => {
                  const startX = chartModel.toChartX(
                    annotation.distanceMeters ?? 0,
                  );
                  const endX =
                    typeof annotation.endDistanceMeters === "number"
                      ? chartModel.toChartX(annotation.endDistanceMeters)
                      : null;
                  return (
                    <g key={`delta-annotation-${annotation.id}`}>
                      {endX !== null && (
                        <rect
                          className="annotation-chart-span"
                          x={Math.min(startX, endX)}
                          y={DELTA_CHART_PADDING.top}
                          width={Math.max(Math.abs(endX - startX), 2)}
                          height={
                            DELTA_CHART_HEIGHT -
                            DELTA_CHART_PADDING.top -
                            DELTA_CHART_PADDING.bottom
                          }
                        />
                      )}
                      <line
                        className="annotation-chart-marker"
                        x1={startX}
                        x2={startX}
                        y1={DELTA_CHART_PADDING.top}
                        y2={DELTA_CHART_HEIGHT - DELTA_CHART_PADDING.bottom}
                      >
                        <title>
                          {annotation.note} {formatAnnotationMoment(annotation)}
                        </title>
                      </line>
                    </g>
                  );
                })}
              </g>
              {cursorX !== null && (
                <line
                  className="compare-distance-cursor-line"
                  x1={cursorX}
                  x2={cursorX}
                  y1={DELTA_CHART_PADDING.top}
                  y2={DELTA_CHART_HEIGHT - DELTA_CHART_PADDING.bottom}
                />
              )}
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
              <rect
                className="compare-chart-pointer-capture"
                x={DELTA_CHART_PADDING.left}
                y={DELTA_CHART_PADDING.top}
                width={
                  OVERLAY_CHART_WIDTH -
                  DELTA_CHART_PADDING.left -
                  DELTA_CHART_PADDING.right
                }
                height={
                  DELTA_CHART_HEIGHT -
                  DELTA_CHART_PADDING.top -
                  DELTA_CHART_PADDING.bottom
                }
                fill="transparent"
                pointerEvents="all"
              />
              {selectionRect !== null &&
                selectionRect.width >= 1 &&
                selectionRect.height >= 1 && (
                  <rect
                    className="compare-zoom-selection"
                    x={selectionRect.x}
                    y={selectionRect.y}
                    width={selectionRect.width}
                    height={selectionRect.height}
                  />
                )}
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

function getTransferErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

function readTextFile(file: File) {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed."));
    reader.readAsText(file);
  });
}

function downloadTextFile(filename: string, content: string, type: string) {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error("File downloads are unavailable in this browser.");
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function CompareWorkspaceFrameView({
  frame,
  transferActions,
  transferStatus,
}: {
  frame: CompareWorkspaceFrame;
  transferActions?: ReactNode;
  transferStatus?: CompareSetTransferStatus | null;
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
      {transferActions && (
        <div className="compare-empty-transfer-actions">{transferActions}</div>
      )}
      {transferStatus && (
        <CompareSetTransferStatusView status={transferStatus} />
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
