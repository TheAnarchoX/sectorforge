import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTelemetryAnnotations } from "./useTelemetryAnnotations";

const STORAGE_KEY = "sectorforge.telemetryAnnotations.test";

describe("useTelemetryAnnotations", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads, mutates, imports, and persists annotations", () => {
    const { result, rerender } = renderHook(() =>
      useTelemetryAnnotations({ storageKey: STORAGE_KEY }),
    );

    let createdId: string | null = null;
    act(() => {
      createdId =
        result.current.addAnnotation({
          scope: "lap",
          sessionId: "session-1",
          lapNumber: 3,
          note: "Trail brake earlier",
          tags: ["braking"],
        })?.id ?? null;
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0]).toMatchObject({
      note: "Trail brake earlier",
      tags: ["braking"],
    });

    act(() => {
      result.current.updateAnnotation(createdId ?? "", {
        note: "Brake five meters earlier",
      });
    });

    expect(result.current.annotations[0]?.note).toBe(
      "Brake five meters earlier",
    );

    act(() => {
      result.current.importAnnotations([
        {
          ...result.current.annotations[0],
          id: "imported",
          note: "Imported setup note",
          updatedAt: "2026-05-03T12:20:00.000Z",
        },
      ]);
    });

    expect(
      result.current.annotations.map((annotation) => annotation.id),
    ).toContain("imported");

    act(() => {
      result.current.deleteAnnotation(createdId ?? "");
    });

    expect(result.current.annotations).toHaveLength(1);
    rerender();
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain(
      "Imported setup note",
    );
  });

  it("ignores invalid additions", () => {
    const { result } = renderHook(() =>
      useTelemetryAnnotations({ storageKey: STORAGE_KEY }),
    );

    act(() => {
      const created = result.current.addAnnotation({
        scope: "lap",
        sessionId: "",
        note: "",
      });
      expect(created).toBeNull();
    });

    expect(result.current.annotations).toEqual([]);
  });
});
