import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteSession,
  clearLapChannelCache,
  getCollectorStatus,
  getGames,
  getLapChannelsForBasketEntry,
  getSessionDetails,
  getSessions,
  getTelemetryHubUrl,
  startFakeCollector,
  startReplay,
  stopCollector,
} from "./telemetryApi";
import {
  createCollectorStatus,
  createLapChannelsResponse,
  createSessionDetails,
  createSessionSummary,
  createTelemetrySource,
} from "../test/telemetryFixtures";

function createResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number; text?: string },
) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(init?.text ?? ""),
  } as unknown as Response;
}

describe("telemetryApi", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    clearLapChannelCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the default telemetry hub URL", () => {
    expect(getTelemetryHubUrl()).toBe("http://localhost:5221/hubs/telemetry");
  });

  it("loads JSON endpoints for collector status, sources, sessions, and session detail", async () => {
    const collectorStatus = createCollectorStatus();
    const games = [createTelemetrySource()];
    const sessions = [createSessionSummary()];
    const sessionDetails = createSessionDetails();

    fetchMock
      .mockResolvedValueOnce(createResponse(collectorStatus))
      .mockResolvedValueOnce(createResponse(games))
      .mockResolvedValueOnce(createResponse(sessions))
      .mockResolvedValueOnce(createResponse(sessionDetails));

    await expect(getCollectorStatus()).resolves.toEqual(collectorStatus);
    await expect(getGames()).resolves.toEqual(games);
    await expect(getSessions()).resolves.toEqual(sessions);
    await expect(getSessionDetails("session-1")).resolves.toEqual(
      sessionDetails,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:5221/api/collector/status",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:5221/api/games",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:5221/api/sessions",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:5221/api/sessions/session-1",
      undefined,
    );
  });

  it("posts collector and replay control requests to the correct endpoints", async () => {
    const collectorStatus = createCollectorStatus({ runMode: "Replay" });

    fetchMock
      .mockResolvedValueOnce(createResponse(collectorStatus))
      .mockResolvedValueOnce(createResponse(collectorStatus))
      .mockResolvedValueOnce(createResponse(collectorStatus));

    await expect(startFakeCollector()).resolves.toEqual(collectorStatus);
    await expect(stopCollector("Replay")).resolves.toEqual(collectorStatus);
    await expect(startReplay("session-1")).resolves.toEqual(collectorStatus);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:5221/api/collector/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapterId: "fake" }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:5221/api/replay/stop",
      { method: "POST" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:5221/api/replay/start/session-1",
      { method: "POST" },
    );
  });

  it("deletes sessions and returns false when a capture is already gone", async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse(null, { status: 404, ok: false }))
      .mockResolvedValueOnce(createResponse(null));

    await expect(deleteSession("missing")).resolves.toBe(false);
    await expect(deleteSession("session-1")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:5221/api/sessions/missing",
      { method: "DELETE" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:5221/api/sessions/session-1",
      { method: "DELETE" },
    );
  });

  it("loads lap channels once per basket entry and reuses the in-memory cache", async () => {
    const channels = createLapChannelsResponse();
    const entry = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      lapNumber: 4,
      label: "Practice lap 4",
      color: "#63b8d6",
    };

    fetchMock.mockResolvedValueOnce(createResponse(channels));

    await expect(getLapChannelsForBasketEntry(entry)).resolves.toEqual(
      channels,
    );
    await expect(getLapChannelsForBasketEntry(entry)).resolves.toEqual(
      channels,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5221/api/sessions/11111111-1111-1111-1111-111111111111/laps/4/channels",
      undefined,
    );
  });

  it("evicts failed lap channel requests so retries can refetch", async () => {
    const entry = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      lapNumber: 4,
      label: "Practice lap 4",
      color: "#63b8d6",
    };
    const channels = createLapChannelsResponse();

    fetchMock
      .mockResolvedValueOnce(
        createResponse(null, {
          ok: false,
          status: 410,
          text: "lap samples pruned",
        }),
      )
      .mockResolvedValueOnce(createResponse(channels));

    await expect(getLapChannelsForBasketEntry(entry)).rejects.toThrow(
      "lap samples pruned",
    );
    await expect(getLapChannelsForBasketEntry(entry)).resolves.toEqual(
      channels,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces error text when API requests fail", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse(null, {
          ok: false,
          status: 500,
          text: "collector blew up",
        }),
      )
      .mockResolvedValueOnce(
        createResponse(null, {
          ok: false,
          status: 500,
          text: "",
        }),
      );

    await expect(getCollectorStatus()).rejects.toThrow("collector blew up");
    await expect(deleteSession("session-1")).rejects.toThrow(
      "Session delete failed: 500",
    );
  });
});
