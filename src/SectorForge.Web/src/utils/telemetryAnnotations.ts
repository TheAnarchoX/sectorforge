export const TELEMETRY_ANNOTATION_STORAGE_KEY =
  "sectorforge.telemetryAnnotations.v1";
export const TELEMETRY_ANNOTATION_STORAGE_VERSION = 1;

export const TELEMETRY_ANNOTATION_CATEGORIES = [
  "driver feedback",
  "setup change",
  "track condition",
  "strategy",
  "incident",
] as const;

export type TelemetryAnnotationScope = "session" | "lap" | "moment";

export type TelemetryAnnotation = {
  id: string;
  scope: TelemetryAnnotationScope;
  sessionId: string;
  lapNumber?: number | null;
  note: string;
  tags: string[];
  category?: string | null;
  createdAt: string;
  updatedAt: string;
  startTimeSeconds?: number | null;
  endTimeSeconds?: number | null;
  distanceMeters?: number | null;
  endDistanceMeters?: number | null;
};

export type TelemetryAnnotationInput = Pick<
  TelemetryAnnotation,
  "scope" | "sessionId" | "note"
> &
  Partial<
    Pick<
      TelemetryAnnotation,
      | "lapNumber"
      | "tags"
      | "category"
      | "startTimeSeconds"
      | "endTimeSeconds"
      | "distanceMeters"
      | "endDistanceMeters"
    >
  >;

export function createAnnotationContextId(option: {
  scope: TelemetryAnnotationScope;
  sessionId: string;
  lapNumber?: number | null;
  startTimeSeconds?: number | null;
  distanceMeters?: number | null;
}) {
  if (option.scope === "session") {
    return `session:${option.sessionId}`;
  }

  if (option.scope === "moment") {
    const distance = option.distanceMeters ?? "x";
    const time = option.startTimeSeconds ?? "x";
    return `moment:${option.sessionId}:${option.lapNumber ?? "lap"}:${distance}:${time}`;
  }

  return `lap:${option.sessionId}:${option.lapNumber ?? "lap"}`;
}

type StoredTelemetryAnnotations = {
  version: typeof TELEMETRY_ANNOTATION_STORAGE_VERSION;
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

function isAnnotationScope(value: unknown): value is TelemetryAnnotationScope {
  return value === "session" || value === "lap" || value === "moment";
}

export function normalizeAnnotationTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const tags: string[] = [];
  const seenTags = new Set<string>();

  for (const rawTag of rawTags) {
    const tag = readString(rawTag).toLowerCase();
    if (tag === "" || seenTags.has(tag)) {
      continue;
    }

    tags.push(tag);
    seenTags.add(tag);
  }

  return tags;
}

export function createTelemetryAnnotationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `ann-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function normalizeTelemetryAnnotation(value: unknown) {
  if (!isRecord(value) || !isAnnotationScope(value.scope)) {
    return null;
  }

  const sessionId = readString(value.sessionId);
  const note = readString(value.note);
  if (sessionId === "" || note === "") {
    return null;
  }

  const lapNumber = readLapNumber(value.lapNumber);
  const now = new Date().toISOString();
  const createdAt = readOptionalString(value.createdAt) ?? now;
  const updatedAt = readOptionalString(value.updatedAt) ?? createdAt;
  const scope = value.scope;

  return {
    id: readString(value.id) || createTelemetryAnnotationId(),
    scope,
    sessionId,
    lapNumber: scope === "session" ? null : lapNumber,
    note,
    tags: normalizeAnnotationTags(value.tags),
    category: readOptionalString(value.category),
    createdAt,
    updatedAt,
    startTimeSeconds:
      scope === "moment" ? readOptionalNumber(value.startTimeSeconds) : null,
    endTimeSeconds:
      scope === "moment" ? readOptionalNumber(value.endTimeSeconds) : null,
    distanceMeters:
      scope === "moment" ? readOptionalNumber(value.distanceMeters) : null,
    endDistanceMeters:
      scope === "moment" ? readOptionalNumber(value.endDistanceMeters) : null,
  } satisfies TelemetryAnnotation;
}

export function normalizeTelemetryAnnotations(value: unknown) {
  const rawAnnotations = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.annotations)
      ? value.annotations
      : [];
  const annotations: TelemetryAnnotation[] = [];
  const seenIds = new Set<string>();

  for (const rawAnnotation of rawAnnotations) {
    const annotation = normalizeTelemetryAnnotation(rawAnnotation);
    if (annotation === null || seenIds.has(annotation.id)) {
      continue;
    }

    annotations.push(annotation);
    seenIds.add(annotation.id);
  }

  return annotations.sort(compareAnnotationsByUpdatedAt);
}

export function readStoredTelemetryAnnotations(
  storageKey = TELEMETRY_ANNOTATION_STORAGE_KEY,
) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? [] : normalizeTelemetryAnnotations(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeStoredTelemetryAnnotations(
  annotations: TelemetryAnnotation[],
  storageKey = TELEMETRY_ANNOTATION_STORAGE_KEY,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (annotations.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const payload = {
      version: TELEMETRY_ANNOTATION_STORAGE_VERSION,
      annotations,
    } satisfies StoredTelemetryAnnotations;
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // localStorage can be unavailable in private or locked-down contexts.
  }
}

export function createTelemetryAnnotation(
  input: TelemetryAnnotationInput,
  createdAt: Date = new Date(),
) {
  const timestamp = createdAt.toISOString();
  return normalizeTelemetryAnnotation({
    ...input,
    id: createTelemetryAnnotationId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function compareAnnotationsByUpdatedAt(
  firstAnnotation: TelemetryAnnotation,
  secondAnnotation: TelemetryAnnotation,
) {
  return secondAnnotation.updatedAt.localeCompare(firstAnnotation.updatedAt);
}

export function getAnnotationKey(annotation: TelemetryAnnotation) {
  return `${annotation.sessionId}:${annotation.lapNumber ?? "session"}`;
}

export function matchesAnnotationContext(
  annotation: TelemetryAnnotation,
  context: { sessionId: string; lapNumber?: number | null },
) {
  if (annotation.sessionId !== context.sessionId) {
    return false;
  }

  if (annotation.scope === "session") {
    return true;
  }

  return annotation.lapNumber === context.lapNumber;
}

export function filterAnnotationsByEntries(
  annotations: TelemetryAnnotation[],
  entries: Array<{ sessionId: string; lapNumber: number }>,
) {
  const sessionIds = new Set(entries.map((entry) => entry.sessionId));
  const lapKeys = new Set(
    entries.map((entry) => `${entry.sessionId}:${entry.lapNumber}`),
  );

  return annotations.filter((annotation) => {
    if (annotation.scope === "session") {
      return sessionIds.has(annotation.sessionId);
    }

    return lapKeys.has(`${annotation.sessionId}:${annotation.lapNumber}`);
  });
}

export function formatAnnotationMoment(annotation: TelemetryAnnotation) {
  if (annotation.scope !== "moment") {
    return null;
  }

  const startDistance = annotation.distanceMeters;
  const endDistance = annotation.endDistanceMeters;
  if (typeof startDistance === "number" && typeof endDistance === "number") {
    return `${Math.round(startDistance).toLocaleString()}-${Math.round(
      endDistance,
    ).toLocaleString()} m`;
  }

  if (typeof startDistance === "number") {
    return `${Math.round(startDistance).toLocaleString()} m`;
  }

  const startTime = annotation.startTimeSeconds;
  const endTime = annotation.endTimeSeconds;
  if (typeof startTime === "number" && typeof endTime === "number") {
    return `${startTime.toFixed(1)}-${endTime.toFixed(1)} s`;
  }

  return typeof startTime === "number" ? `${startTime.toFixed(1)} s` : null;
}
