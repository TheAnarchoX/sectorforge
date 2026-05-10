import { useCallback, useEffect, useMemo, useState } from "react";
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

export const LAP_BASKET_STORAGE_KEY = "sectorforge.lapBasket.v1";
export const DEFAULT_LAP_BASKET_LIMIT = 6;

const LAP_BASKET_STORAGE_VERSION = 1;
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

export type LapBasketAddInput = Pick<
  LapBasketEntry,
  "sessionId" | "lapNumber"
> &
  Partial<
    Pick<LapBasketEntry, "label" | "color" | "channelSelections" | "session">
  >;

export type UseLapBasketOptions = {
  storageKey?: string;
  maxEntries?: number;
};

type StoredLapBasket = {
  version: number;
  entries: LapBasketEntry[];
};

function createLapKey(entry: Pick<LapBasketEntry, "sessionId" | "lapNumber">) {
  return `${entry.sessionId}:${entry.lapNumber}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeMaxEntries(maxEntries: number | undefined) {
  if (maxEntries === undefined || !Number.isFinite(maxEntries)) {
    return DEFAULT_LAP_BASKET_LIMIT;
  }

  return Math.max(1, Math.floor(maxEntries));
}

function getDefaultLabel(lapNumber: number) {
  return `Lap ${lapNumber}`;
}

function pickColor(index: number) {
  return DEFAULT_LAP_COLORS[index % DEFAULT_LAP_COLORS.length];
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

function isLapCompareChannelKey(value: unknown): value is LapCompareChannelKey {
  return (
    typeof value === "string" &&
    LAP_COMPARE_CHANNEL_KEYS.has(value as LapCompareChannelKey)
  );
}

function createDefaultChannelSelections() {
  return [
    {
      panelId: DEFAULT_COMPARE_PANEL_ID,
      channelKey: DEFAULT_COMPARE_PANEL_CHANNEL,
    },
  ] satisfies LapBasketPanelChannelSelection[];
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

function upsertChannelSelection(
  selections: LapBasketPanelChannelSelection[] | undefined,
  nextSelection: LapBasketPanelChannelSelection,
) {
  const normalizedSelections = normalizeChannelSelections(selections);
  const existingIndex = normalizedSelections.findIndex(
    (selection) => selection.panelId === nextSelection.panelId,
  );

  if (existingIndex < 0) {
    return [...normalizedSelections, nextSelection];
  }

  return normalizedSelections.map((selection, index) =>
    index === existingIndex ? nextSelection : selection,
  );
}

function normalizeEntry(value: unknown, colorIndex: number) {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = readString(value.sessionId);
  const lapNumber = readLapNumber(value.lapNumber);
  if (sessionId === "" || lapNumber === null) {
    return null;
  }

  const label = readString(value.label) || getDefaultLabel(lapNumber);
  const color = readString(value.color) || pickColor(colorIndex);
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

function normalizeEntries(values: unknown[], maxEntries: number) {
  const entries: LapBasketEntry[] = [];
  const seenKeys = new Set<string>();

  for (const value of values) {
    const entry = normalizeEntry(value, entries.length);
    if (entry === null) {
      continue;
    }

    const key = createLapKey(entry);
    if (seenKeys.has(key)) {
      continue;
    }

    entries.push(entry);
    seenKeys.add(key);

    if (entries.length >= maxEntries) {
      break;
    }
  }

  return entries;
}

function readStoredBasket(storageKey: string, maxEntries: number) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    const rawEntries = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];

    return normalizeEntries(rawEntries, maxEntries);
  } catch {
    return [];
  }
}

function writeStoredBasket(storageKey: string, entries: LapBasketEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const payload = {
      version: LAP_BASKET_STORAGE_VERSION,
      entries,
    } satisfies StoredLapBasket;
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // localStorage can be unavailable in locked-down browser contexts.
  }
}

export function useLapBasket(options: UseLapBasketOptions = {}) {
  const storageKey = options.storageKey ?? LAP_BASKET_STORAGE_KEY;
  const maxEntries = normalizeMaxEntries(options.maxEntries);
  const [entries, setEntries] = useState<LapBasketEntry[]>(() =>
    readStoredBasket(storageKey, maxEntries),
  );

  useEffect(() => {
    writeStoredBasket(storageKey, entries);
  }, [entries, storageKey]);

  const addLap = useCallback(
    (lap: LapBasketAddInput) => {
      setEntries((currentEntries) => {
        const existingIndex = currentEntries.findIndex(
          (entry) =>
            entry.sessionId === lap.sessionId &&
            entry.lapNumber === lap.lapNumber,
        );
        const fallbackColor =
          existingIndex >= 0
            ? currentEntries[existingIndex].color
            : pickColor(currentEntries.length);
        const fallbackChannelSelections =
          existingIndex >= 0
            ? currentEntries[existingIndex].channelSelections
            : currentEntries[0]?.channelSelections;
        const fallbackSession =
          existingIndex >= 0
            ? currentEntries[existingIndex].session
            : undefined;
        const nextEntry = normalizeEntry(
          {
            sessionId: lap.sessionId,
            lapNumber: lap.lapNumber,
            label: lap.label,
            color: lap.color ?? fallbackColor,
            channelSelections:
              lap.channelSelections ?? fallbackChannelSelections,
            session: lap.session ?? fallbackSession,
          },
          currentEntries.length,
        );

        if (nextEntry === null) {
          return currentEntries;
        }

        if (existingIndex >= 0) {
          return currentEntries.map((entry, index) =>
            index === existingIndex ? nextEntry : entry,
          );
        }

        if (currentEntries.length >= maxEntries) {
          return currentEntries;
        }

        return [...currentEntries, nextEntry];
      });
    },
    [maxEntries],
  );

  const removeLap = useCallback((sessionId: string, lapNumber: number) => {
    setEntries((currentEntries) =>
      currentEntries.filter(
        (entry) =>
          entry.sessionId !== sessionId || entry.lapNumber !== lapNumber,
      ),
    );
  }, []);

  const setReference = useCallback((sessionId: string, lapNumber: number) => {
    setEntries((currentEntries) => {
      const referenceIndex = currentEntries.findIndex(
        (entry) =>
          entry.sessionId === sessionId && entry.lapNumber === lapNumber,
      );

      if (referenceIndex <= 0) {
        return currentEntries;
      }

      const nextReference = currentEntries[referenceIndex];
      return [
        nextReference,
        ...currentEntries.slice(0, referenceIndex),
        ...currentEntries.slice(referenceIndex + 1),
      ];
    });
  }, []);

  const setPanelChannel = useCallback(
    (panelId: string, channelKey: LapCompareChannelKey) => {
      const nextSelection = normalizeChannelSelection({ panelId, channelKey });
      if (nextSelection === null) {
        return;
      }

      setEntries((currentEntries) =>
        currentEntries.map((entry) => ({
          ...entry,
          channelSelections: upsertChannelSelection(
            entry.channelSelections,
            nextSelection,
          ),
        })),
      );
    },
    [],
  );

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  const isPinned = useCallback(
    (sessionId: string, lapNumber: number) =>
      entries.some(
        (entry) =>
          entry.sessionId === sessionId && entry.lapNumber === lapNumber,
      ),
    [entries],
  );

  return useMemo(
    () => ({
      entries,
      reference: entries[0] ?? null,
      comparisons: entries.slice(1),
      maxEntries,
      addLap,
      removeLap,
      setReference,
      setPanelChannel,
      clear,
      isPinned,
    }),
    [
      addLap,
      clear,
      entries,
      isPinned,
      maxEntries,
      removeLap,
      setPanelChannel,
      setReference,
    ],
  );
}
