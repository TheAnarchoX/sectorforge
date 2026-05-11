import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_ANNOTATION_STORAGE_KEY,
  TELEMETRY_ANNOTATION_STORAGE_VERSION,
  compareAnnotationsByUpdatedAt,
  createAnnotationContextId,
  createTelemetryAnnotation,
  filterAnnotationsByEntries,
  formatAnnotationMoment,
  getAnnotationKey,
  matchesAnnotationContext,
  normalizeAnnotationTags,
  normalizeTelemetryAnnotation,
  normalizeTelemetryAnnotations,
  readStoredTelemetryAnnotations,
  writeStoredTelemetryAnnotations,
  type TelemetryAnnotation,
} from "./telemetryAnnotations";

function createAnnotation(
  override: Partial<TelemetryAnnotation> = {},
): TelemetryAnnotation {
  return {
    id: "ann-1",
    scope: "lap",
    sessionId: "session-1",
    lapNumber: 3,
    note: "Trail brake earlier",
    tags: ["braking"],
    category: "driver feedback",
    createdAt: "2026-05-03T12:00:00.000Z",
    updatedAt: "2026-05-03T12:01:00.000Z",
    startTimeSeconds: null,
    endTimeSeconds: null,
    distanceMeters: null,
    endDistanceMeters: null,
    ...override,
  };
}

describe("telemetryAnnotations", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes annotation tags and context identifiers", () => {
    expect(normalizeAnnotationTags(" Brake, Setup, brake ,, ")).toEqual([
      "brake",
      "setup",
    ]);
    expect(normalizeAnnotationTags([" Wet ", "wet", 42, "Race"])).toEqual([
      "wet",
      "race",
    ]);

    expect(
      createAnnotationContextId({ scope: "session", sessionId: "session-1" }),
    ).toBe("session:session-1");
    expect(
      createAnnotationContextId({
        scope: "lap",
        sessionId: "session-1",
        lapNumber: 4,
      }),
    ).toBe("lap:session-1:4");
    expect(
      createAnnotationContextId({
        scope: "moment",
        sessionId: "session-1",
        lapNumber: 4,
        distanceMeters: 123.4,
        startTimeSeconds: 8.5,
      }),
    ).toBe("moment:session-1:4:123.4:8.5");
  });

  it("normalizes, deduplicates, and sorts stored annotation payloads", () => {
    const older = createAnnotation({
      id: "older",
      updatedAt: "2026-05-03T12:00:00.000Z",
    });
    const newer = createAnnotation({
      id: "newer",
      scope: "moment",
      note: "Apex marker",
      lapNumber: 5,
      tags: ["Apex", "apex", ""],
      updatedAt: "2026-05-03T12:05:00.000Z",
      startTimeSeconds: 10.2,
      endTimeSeconds: 11.4,
      distanceMeters: 450.2,
      endDistanceMeters: 510.8,
    });

    expect(normalizeTelemetryAnnotation(null)).toBeNull();
    expect(
      normalizeTelemetryAnnotation({ scope: "lap", note: "missing" }),
    ).toBeNull();
    expect(
      normalizeTelemetryAnnotation({
        id: "session-note",
        scope: "session",
        sessionId: "session-1",
        lapNumber: 99,
        note: "Session setup",
      }),
    ).toMatchObject({ lapNumber: null, note: "Session setup" });

    expect(
      normalizeTelemetryAnnotations({ annotations: [older, newer, older, {}] }),
    ).toEqual([
      expect.objectContaining({ id: "newer", tags: ["apex"] }),
      expect.objectContaining({ id: "older" }),
    ]);
  });

  it("reads and writes local annotation storage defensively", () => {
    const annotations = [createAnnotation()];
    writeStoredTelemetryAnnotations(annotations);

    expect(
      JSON.parse(
        window.localStorage.getItem(TELEMETRY_ANNOTATION_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({
      version: TELEMETRY_ANNOTATION_STORAGE_VERSION,
      annotations: [expect.objectContaining({ id: "ann-1" })],
    });
    expect(readStoredTelemetryAnnotations()).toEqual(annotations);

    window.localStorage.setItem(TELEMETRY_ANNOTATION_STORAGE_KEY, "not json");
    expect(readStoredTelemetryAnnotations()).toEqual([]);

    writeStoredTelemetryAnnotations([]);
    expect(
      window.localStorage.getItem(TELEMETRY_ANNOTATION_STORAGE_KEY),
    ).toBeNull();
  });

  it("creates, compares, filters, and formats annotation helpers", () => {
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("11111111-1111-4111-8111-111111111111");
    const created = createTelemetryAnnotation(
      {
        scope: "moment",
        sessionId: "session-1",
        lapNumber: 3,
        note: "Kerb strike",
        tags: ["Kerb"],
        startTimeSeconds: 12.25,
      },
      new Date("2026-05-03T12:10:00.000Z"),
    );

    expect(created).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      note: "Kerb strike",
      tags: ["kerb"],
      updatedAt: "2026-05-03T12:10:00.000Z",
    });
    randomUuid.mockRestore();

    const sessionNote = createAnnotation({
      id: "session-note",
      scope: "session",
      lapNumber: null,
    });
    const lapNote = createAnnotation({ id: "lap-note", lapNumber: 4 });
    const momentByDistance = createAnnotation({
      id: "moment-distance",
      scope: "moment",
      lapNumber: 4,
      distanceMeters: 100.4,
      endDistanceMeters: 250.6,
    });
    const momentByTime = createAnnotation({
      id: "moment-time",
      scope: "moment",
      lapNumber: 4,
      startTimeSeconds: 8.25,
      endTimeSeconds: 9.75,
    });

    expect(compareAnnotationsByUpdatedAt(lapNote, sessionNote)).toBe(0);
    expect(getAnnotationKey(sessionNote)).toBe("session-1:session");
    expect(
      matchesAnnotationContext(sessionNote, { sessionId: "session-1" }),
    ).toBe(true);
    expect(
      matchesAnnotationContext(lapNote, {
        sessionId: "session-1",
        lapNumber: 3,
      }),
    ).toBe(false);
    expect(
      filterAnnotationsByEntries(
        [sessionNote, lapNote, momentByDistance],
        [{ sessionId: "session-1", lapNumber: 4 }],
      ),
    ).toEqual([sessionNote, lapNote, momentByDistance]);
    expect(formatAnnotationMoment(sessionNote)).toBeNull();
    expect(formatAnnotationMoment(momentByDistance)).toBe("100-251 m");
    expect(
      formatAnnotationMoment({ ...momentByDistance, endDistanceMeters: null }),
    ).toBe("100 m");
    expect(formatAnnotationMoment(momentByTime)).toBe("8.3-9.8 s");
    expect(
      formatAnnotationMoment({ ...momentByTime, endTimeSeconds: null }),
    ).toBe("8.3 s");
  });
});
