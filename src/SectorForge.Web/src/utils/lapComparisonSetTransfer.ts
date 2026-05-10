import {
  DEFAULT_COMPARE_PANEL_CHANNEL,
  DEFAULT_COMPARE_PANEL_ID,
} from "../types/telemetry";
import type {
  LapBasketEntry,
  LapBasketPanelChannelSelection,
  LapBasketSessionContext,
  LapCompareChannelKey,
} from "../types/telemetry";
import {
  normalizeTelemetryAnnotations,
  type TelemetryAnnotation,
} from "./telemetryAnnotations";

export const LAP_COMPARISON_SET_SCHEMA = "sectorforge.lapComparisonSet";
export const LAP_COMPARISON_SET_VERSION = 1;

const DEFAULT_LAP_COLORS = [
  "#63b8d6",
  "#d9b04a",
  "#7bc96f",
  "#d97878",
  "#b68cff",
  "#f08c46",
];

const LAP_COMPARE_CHANNEL_KEYS = new Set<LapCompareChannelKey>([
  "speedKph",
  "rpm",
  "throttle",
  "brake",
  "steering",
  "lateralG",
  "longitudinalG",
  "drsActive",
  "ersStoreJoules",
]);

export type LapComparisonSetReference = Pick<
  LapBasketEntry,
  "sessionId" | "lapNumber"
>;

export type LapComparisonSetParseResult =
  | {
      ok: true;
      entries: LapBasketEntry[];
      reference: LapComparisonSetReference | null;
      annotations: TelemetryAnnotation[];
    }
  | { ok: false; message: string };

type ExportedLapComparisonSetEntry = LapBasketEntry & {
  role: "reference" | "comparison";
};

type ExportedLapComparisonSet = {
  schema: typeof LAP_COMPARISON_SET_SCHEMA;
  version: typeof LAP_COMPARISON_SET_VERSION;
  exportedAt: string;
  reference: LapComparisonSetReference | null;
  entries: ExportedLapComparisonSetEntry[];
  annotations: TelemetryAnnotation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const text = readString(value);
  return text === "" ? null : text;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLapNumber(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function pickColor(index: number) {
  return DEFAULT_LAP_COLORS[index % DEFAULT_LAP_COLORS.length];
}

function getDefaultLabel(lapNumber: number) {
  return `Lap ${lapNumber}`;
}

function createDefaultChannelSelections() {
  return [
    {
      panelId: DEFAULT_COMPARE_PANEL_ID,
      channelKey: DEFAULT_COMPARE_PANEL_CHANNEL,
    },
  ] satisfies LapBasketPanelChannelSelection[];
}

function isLapCompareChannelKey(value: unknown): value is LapCompareChannelKey {
  return (
    typeof value === "string" &&
    LAP_COMPARE_CHANNEL_KEYS.has(value as LapCompareChannelKey)
  );
}

function normalizeChannelSelection(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const panelId = readString(value.panelId);
  if (panelId === "" || !isLapCompareChannelKey(value.channelKey)) {
    return null;
  }

  return {
    panelId,
    channelKey: value.channelKey,
  } satisfies LapBasketPanelChannelSelection;
}

function normalizeChannelSelections(value: unknown) {
  if (!Array.isArray(value)) {
    return createDefaultChannelSelections();
  }

  const selections: LapBasketPanelChannelSelection[] = [];
  const seenPanels = new Set<string>();
  for (const candidate of value) {
    const selection = normalizeChannelSelection(candidate);
    if (selection === null || seenPanels.has(selection.panelId)) {
      continue;
    }

    selections.push(selection);
    seenPanels.add(selection.panelId);
  }

  return selections.length > 0 ? selections : createDefaultChannelSelections();
}

function normalizeSessionContext(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const sessionContext = {
    game: readOptionalString(value.game),
    sourceName: readOptionalString(value.sourceName),
    trackName: readOptionalString(value.trackName),
    carName: readOptionalString(value.carName),
    startedAt: readOptionalString(value.startedAt),
    lastSeenAt: readOptionalString(value.lastSeenAt),
    weather: readOptionalString(value.weather),
    trackTemperatureC: readOptionalNumber(value.trackTemperatureC),
    airTemperatureC: readOptionalNumber(value.airTemperatureC),
  } satisfies LapBasketSessionContext;

  return Object.values(sessionContext).some(
    (contextValue) => contextValue !== null,
  )
    ? sessionContext
    : undefined;
}

function normalizeEntry(value: unknown, index: number) {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = readString(value.sessionId);
  const lapNumber = readLapNumber(value.lapNumber);
  if (sessionId === "" || lapNumber === null) {
    return null;
  }

  const label = readString(value.label) || getDefaultLabel(lapNumber);
  const color = readString(value.color) || pickColor(index);
  const channelSelections = normalizeChannelSelections(value.channelSelections);
  const session = normalizeSessionContext(value.session);

  return {
    sessionId,
    lapNumber,
    label,
    color,
    channelSelections,
    ...(session === undefined ? {} : { session }),
  } satisfies LapBasketEntry;
}

function getEntryKey(entry: Pick<LapBasketEntry, "sessionId" | "lapNumber">) {
  return `${entry.sessionId}:${entry.lapNumber}`;
}

function readReference(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = readString(value.sessionId);
  const lapNumber = readLapNumber(value.lapNumber);
  if (sessionId === "" || lapNumber === null) {
    return null;
  }

  return { sessionId, lapNumber } satisfies LapComparisonSetReference;
}

function findEntryRoleReference(
  rawEntries: unknown[],
  entries: LapBasketEntry[],
) {
  const roleIndex = rawEntries.findIndex(
    (entry) => isRecord(entry) && entry.role === "reference",
  );

  return roleIndex >= 0 ? entries[roleIndex] : null;
}

function moveReferenceFirst(
  entries: LapBasketEntry[],
  reference: LapComparisonSetReference | null,
) {
  if (reference === null) {
    return entries;
  }

  const referenceIndex = entries.findIndex(
    (entry) =>
      entry.sessionId === reference.sessionId &&
      entry.lapNumber === reference.lapNumber,
  );
  if (referenceIndex <= 0) {
    return entries;
  }

  return [
    entries[referenceIndex],
    ...entries.slice(0, referenceIndex),
    ...entries.slice(referenceIndex + 1),
  ];
}

export function buildLapComparisonSet(
  entries: LapBasketEntry[],
  exportedAt: Date = new Date(),
  annotations: TelemetryAnnotation[] = [],
) {
  const reference = entries[0]
    ? {
        sessionId: entries[0].sessionId,
        lapNumber: entries[0].lapNumber,
      }
    : null;

  return {
    schema: LAP_COMPARISON_SET_SCHEMA,
    version: LAP_COMPARISON_SET_VERSION,
    exportedAt: exportedAt.toISOString(),
    reference,
    entries: entries.map((entry, index) => ({
      ...entry,
      role: index === 0 ? "reference" : "comparison",
    })),
    annotations,
  } satisfies ExportedLapComparisonSet;
}

export function serializeLapComparisonSet(
  entries: LapBasketEntry[],
  exportedAt?: Date,
  annotations?: TelemetryAnnotation[],
) {
  return `${JSON.stringify(
    buildLapComparisonSet(entries, exportedAt, annotations),
    null,
    2,
  )}\n`;
}

export function buildLapComparisonSetFilename(exportedAt: Date = new Date()) {
  const timestamp = exportedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "-");

  return `sectorforge-compare-${timestamp}.json`;
}

export function parseLapComparisonSetJson(
  json: string,
  options: { maxEntries?: number } = {},
): LapComparisonSetParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, message: "The selected file is not valid JSON." };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      message: "Comparison sets must be JSON objects with an entries array.",
    };
  }

  if (
    parsed.schema !== undefined &&
    parsed.schema !== LAP_COMPARISON_SET_SCHEMA
  ) {
    return {
      ok: false,
      message: "This JSON file is not a SectorForge comparison set.",
    };
  }

  if (
    parsed.version !== undefined &&
    parsed.version !== LAP_COMPARISON_SET_VERSION
  ) {
    return {
      ok: false,
      message: "This comparison set version is not supported.",
    };
  }

  if (!Array.isArray(parsed.entries)) {
    return {
      ok: false,
      message: "Comparison sets must include an entries array.",
    };
  }

  if (parsed.entries.length === 0) {
    return {
      ok: false,
      message: "Comparison sets must include at least one lap.",
    };
  }

  const maxEntries = options.maxEntries;
  if (
    maxEntries !== undefined &&
    Number.isFinite(maxEntries) &&
    parsed.entries.length > maxEntries
  ) {
    return {
      ok: false,
      message: `This comparison set has ${parsed.entries.length} laps, but this workspace supports ${Math.floor(maxEntries)}.`,
    };
  }

  const entries: LapBasketEntry[] = [];
  const seenKeys = new Set<string>();
  for (const [index, rawEntry] of parsed.entries.entries()) {
    const entry = normalizeEntry(rawEntry, index);
    if (entry === null) {
      return {
        ok: false,
        message: `Lap entry ${index + 1} is missing a valid session ID or lap number.`,
      };
    }

    const key = getEntryKey(entry);
    if (seenKeys.has(key)) {
      return {
        ok: false,
        message: `Lap entry ${index + 1} duplicates another pinned lap.`,
      };
    }

    entries.push(entry);
    seenKeys.add(key);
  }

  const explicitReference = readReference(parsed.reference);
  const roleReference = findEntryRoleReference(parsed.entries, entries);
  const reference = explicitReference ?? roleReference ?? entries[0] ?? null;
  if (reference !== null && !seenKeys.has(getEntryKey(reference))) {
    return {
      ok: false,
      message: "The comparison set reference does not match any pinned lap.",
    };
  }

  return {
    ok: true,
    entries: moveReferenceFirst(entries, reference),
    reference,
    annotations: normalizeTelemetryAnnotations(parsed.annotations),
  };
}
