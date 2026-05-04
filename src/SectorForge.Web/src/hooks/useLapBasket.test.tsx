import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LAP_BASKET_LIMIT,
  LAP_BASKET_STORAGE_KEY,
  useLapBasket,
} from "./useLapBasket";

const FIRST_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_SESSION_ID = "22222222-2222-2222-2222-222222222222";

describe("useLapBasket", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds, updates, removes, and clears pinned laps", () => {
    const { result } = renderHook(() => useLapBasket({ maxEntries: 2 }));

    act(() => {
      result.current.addLap({
        sessionId: FIRST_SESSION_ID,
        lapNumber: 4,
        label: "Practice lap 4",
      });
    });

    expect(result.current.entries).toEqual([
      {
        sessionId: FIRST_SESSION_ID,
        lapNumber: 4,
        label: "Practice lap 4",
        color: "#63b8d6",
      },
    ]);
    expect(result.current.reference?.label).toBe("Practice lap 4");
    expect(result.current.comparisons).toEqual([]);
    expect(result.current.isPinned(FIRST_SESSION_ID, 4)).toBe(true);

    act(() => {
      result.current.addLap({
        sessionId: FIRST_SESSION_ID,
        lapNumber: 4,
        label: "PB lap 4",
      });
      result.current.addLap({
        sessionId: SECOND_SESSION_ID,
        lapNumber: 5,
        color: "#ffffff",
      });
      result.current.addLap({ sessionId: SECOND_SESSION_ID, lapNumber: 6 });
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]).toMatchObject({
      sessionId: FIRST_SESSION_ID,
      lapNumber: 4,
      label: "PB lap 4",
      color: "#63b8d6",
    });
    expect(result.current.entries[1]).toMatchObject({
      sessionId: SECOND_SESSION_ID,
      lapNumber: 5,
      label: "Lap 5",
      color: "#ffffff",
    });

    act(() => {
      result.current.removeLap(FIRST_SESSION_ID, 4);
    });

    expect(result.current.entries).toEqual([
      {
        sessionId: SECOND_SESSION_ID,
        lapNumber: 5,
        label: "Lap 5",
        color: "#ffffff",
      },
    ]);

    act(() => {
      result.current.clear();
    });

    expect(result.current.entries).toEqual([]);
  });

  it("hydrates valid stored laps and persists updates", async () => {
    window.localStorage.setItem(
      LAP_BASKET_STORAGE_KEY,
      JSON.stringify({
        entries: [
          {
            sessionId: FIRST_SESSION_ID,
            lapNumber: 3,
            label: "Stored lap 3",
            color: "#d9b04a",
          },
          { sessionId: "", lapNumber: 4, label: "Bad lap" },
          { sessionId: FIRST_SESSION_ID, lapNumber: 3, label: "Duplicate" },
        ],
      }),
    );

    const { result } = renderHook(() => useLapBasket());

    expect(result.current.entries).toEqual([
      {
        sessionId: FIRST_SESSION_ID,
        lapNumber: 3,
        label: "Stored lap 3",
        color: "#d9b04a",
      },
    ]);
    expect(result.current.maxEntries).toBe(DEFAULT_LAP_BASKET_LIMIT);

    act(() => {
      result.current.addLap({ sessionId: SECOND_SESSION_ID, lapNumber: 7 });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(LAP_BASKET_STORAGE_KEY)).toContain(
        "22222222-2222-2222-2222-222222222222",
      );
    });
  });

  it("trims stored entries to the configured limit and ignores invalid additions", () => {
    window.localStorage.setItem(
      LAP_BASKET_STORAGE_KEY,
      JSON.stringify({
        entries: [
          { sessionId: FIRST_SESSION_ID, lapNumber: 1 },
          { sessionId: SECOND_SESSION_ID, lapNumber: 2 },
        ],
      }),
    );

    const { result } = renderHook(() => useLapBasket({ maxEntries: 1 }));

    expect(result.current.entries).toEqual([
      {
        sessionId: FIRST_SESSION_ID,
        lapNumber: 1,
        label: "Lap 1",
        color: "#63b8d6",
      },
    ]);

    act(() => {
      result.current.addLap({ sessionId: "", lapNumber: 3 });
    });

    expect(result.current.entries).toHaveLength(1);
  });

  it("moves an existing lap to the reference position without losing the basket", () => {
    const { result } = renderHook(() => useLapBasket());

    act(() => {
      result.current.addLap({
        sessionId: FIRST_SESSION_ID,
        lapNumber: 4,
        label: "Practice lap 4",
      });
      result.current.addLap({
        sessionId: SECOND_SESSION_ID,
        lapNumber: 5,
        label: "Practice lap 5",
      });
    });

    act(() => {
      result.current.setReference(SECOND_SESSION_ID, 5);
    });

    expect(result.current.reference?.label).toBe("Practice lap 5");
    expect(result.current.comparisons.map((entry) => entry.label)).toEqual([
      "Practice lap 4",
    ]);
    expect(result.current.entries).toHaveLength(2);
  });

  it("falls back to an empty basket when stored JSON is invalid", () => {
    window.localStorage.setItem(LAP_BASKET_STORAGE_KEY, "not-json");

    const { result } = renderHook(() => useLapBasket());

    expect(result.current.entries).toEqual([]);
  });
});
