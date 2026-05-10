import { describe, expect, it } from "vitest";
import {
  LAP_COMPARISON_SET_SCHEMA,
  buildLapComparisonSet,
  buildLapComparisonSetFilename,
  parseLapComparisonSetJson,
  serializeLapComparisonSet,
} from "./lapComparisonSetTransfer";
import { DEFAULT_COMPARE_PANEL_ID } from "../types/telemetry";
import type { LapBasketEntry } from "../types/telemetry";
import type { TelemetryAnnotation } from "./telemetryAnnotations";

const FIRST_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_SESSION_ID = "22222222-2222-2222-2222-222222222222";

const entries: LapBasketEntry[] = [
  {
    sessionId: FIRST_SESSION_ID,
    lapNumber: 4,
    label: "Silverstone L4",
    color: "#63b8d6",
    channelSelections: [
      { panelId: DEFAULT_COMPARE_PANEL_ID, channelKey: "rpm" },
    ],
    session: {
      trackName: "Silverstone",
      weather: "Dry",
      trackTemperatureC: 31.2,
      airTemperatureC: 22.4,
    },
  },
  {
    sessionId: SECOND_SESSION_ID,
    lapNumber: 5,
    label: "Spa L5",
    color: "#d9b04a",
  },
];

const annotations: TelemetryAnnotation[] = [
  {
    id: "annotation-1",
    scope: "moment",
    sessionId: FIRST_SESSION_ID,
    lapNumber: 4,
    note: "Brake earlier for entry stability.",
    tags: ["braking", "driver feedback"],
    category: "driver feedback",
    createdAt: "2026-05-10T14:00:00.000Z",
    updatedAt: "2026-05-10T14:00:00.000Z",
    distanceMeters: 240,
    endDistanceMeters: null,
    startTimeSeconds: null,
    endTimeSeconds: null,
  },
];

describe("lap comparison set transfer", () => {
  it("serializes pinned laps with schema, reference, roles, and context", () => {
    const exportedAt = new Date("2026-05-10T14:15:16.000Z");
    const comparisonSet = buildLapComparisonSet(
      entries,
      exportedAt,
      annotations,
    );

    expect(comparisonSet).toMatchObject({
      schema: LAP_COMPARISON_SET_SCHEMA,
      version: 1,
      exportedAt: "2026-05-10T14:15:16.000Z",
      reference: { sessionId: FIRST_SESSION_ID, lapNumber: 4 },
    });
    expect(comparisonSet.entries[0]).toMatchObject({
      role: "reference",
      label: "Silverstone L4",
      color: "#63b8d6",
      session: { trackName: "Silverstone", weather: "Dry" },
    });
    expect(comparisonSet.entries[1]).toMatchObject({ role: "comparison" });
    expect(comparisonSet.annotations).toHaveLength(1);
    expect(comparisonSet.annotations[0]).toMatchObject({
      note: "Brake earlier for entry stability.",
      distanceMeters: 240,
    });
    expect(
      serializeLapComparisonSet(entries, exportedAt, annotations),
    ).toContain('"role": "reference"');
    expect(buildLapComparisonSetFilename(exportedAt)).toBe(
      "sectorforge-compare-20260510-141516Z.json",
    );
  });

  it("parses a valid set and moves the referenced lap first", () => {
    const result = parseLapComparisonSetJson(
      JSON.stringify({
        schema: LAP_COMPARISON_SET_SCHEMA,
        version: 1,
        reference: { sessionId: SECOND_SESSION_ID, lapNumber: 5 },
        entries,
        annotations,
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.reference).toEqual({
      sessionId: SECOND_SESSION_ID,
      lapNumber: 5,
    });
    expect(result.entries.map((entry) => entry.label)).toEqual([
      "Spa L5",
      "Silverstone L4",
    ]);
    expect(result.entries[1].channelSelections).toEqual([
      { panelId: DEFAULT_COMPARE_PANEL_ID, channelKey: "rpm" },
    ]);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]).toMatchObject({
      scope: "moment",
      note: "Brake earlier for entry stability.",
    });
  });

  it("rejects invalid JSON, unknown schema, oversized sets, and bad entries", () => {
    expect(parseLapComparisonSetJson("not-json")).toMatchObject({
      ok: false,
      message: "The selected file is not valid JSON.",
    });
    expect(
      parseLapComparisonSetJson(
        JSON.stringify({ schema: "other", version: 1, entries }),
      ),
    ).toMatchObject({
      ok: false,
      message: "This JSON file is not a SectorForge comparison set.",
    });
    expect(
      parseLapComparisonSetJson(JSON.stringify({ version: 1, entries }), {
        maxEntries: 1,
      }),
    ).toMatchObject({
      ok: false,
      message: "This comparison set has 2 laps, but this workspace supports 1.",
    });
    expect(
      parseLapComparisonSetJson(
        JSON.stringify({
          version: 1,
          entries: [{ sessionId: "", lapNumber: 1 }],
        }),
      ),
    ).toMatchObject({
      ok: false,
      message: "Lap entry 1 is missing a valid session ID or lap number.",
    });
  });
});
