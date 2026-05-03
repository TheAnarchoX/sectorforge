import type {
  CollectorStatus,
  TelemetrySessionDetails,
  TelemetryRunMode,
  TelemetrySessionSummary,
  TelemetrySource,
} from "../types/telemetry";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5221";

function toAbsoluteUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

async function readErrorMessage(response: Response, fallback: string) {
  const text = (await response.text()).trim();
  return text || `${fallback}: ${response.status}`;
}

async function requestJson<T>(
  path: string,
  fallback: string,
  init?: RequestInit,
) {
  const response = await fetch(toAbsoluteUrl(path), init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallback));
  }

  return (await response.json()) as T;
}

export function getTelemetryHubUrl() {
  return toAbsoluteUrl("/hubs/telemetry");
}

export function getCollectorStatus() {
  return requestJson<CollectorStatus>(
    "/api/collector/status",
    "Status request failed",
  );
}

export function getGames() {
  return requestJson<TelemetrySource[]>("/api/games", "Games request failed");
}

export function getSessions() {
  return requestJson<TelemetrySessionSummary[]>(
    "/api/sessions",
    "Sessions request failed",
  );
}

export function getSessionDetails(sessionId: string, init?: RequestInit) {
  return requestJson<TelemetrySessionDetails>(
    `/api/sessions/${sessionId}`,
    "Session detail request failed",
    init,
  );
}

export async function deleteSession(sessionId: string) {
  const response = await fetch(toAbsoluteUrl(`/api/sessions/${sessionId}`), {
    method: "DELETE",
  });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Session delete failed"));
  }
  return true;
}

export function startFakeCollector() {
  return startCollectorAdapter("fake");
}

export function startCollectorAdapter(adapterId: string) {
  return requestJson<CollectorStatus>(
    "/api/collector/start",
    "Collector start failed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adapterId }),
    },
  );
}

export function stopCollector(runMode: TelemetryRunMode | null | undefined) {
  const endpoint =
    runMode === "Replay" ? "/api/replay/stop" : "/api/collector/stop";

  return requestJson<CollectorStatus>(endpoint, "Collector stop failed", {
    method: "POST",
  });
}

export function startReplay(sessionId: string) {
  return requestJson<CollectorStatus>(
    `/api/replay/start/${sessionId}`,
    "Replay start failed",
    {
      method: "POST",
    },
  );
}
