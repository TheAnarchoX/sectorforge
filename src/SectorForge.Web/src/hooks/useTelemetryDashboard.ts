import { useEffect, useEffectEvent, useState } from "react";
import * as signalR from "@microsoft/signalr";
import {
  getCollectorStatus,
  getGames,
  getSessions,
  getTelemetryHubUrl,
  startFakeCollector,
  startReplay as startReplayRequest,
  stopCollector as stopCollectorRequest,
} from "../api/telemetryApi";
import type {
  CollectorStatus,
  ConnectionState,
  CurrentLapTelemetrySeries,
  TelemetrySample,
  TelemetrySessionSummary,
  TelemetryTraceSeries,
  TelemetrySource,
} from "../types/telemetry";
import { parseDurationSeconds } from "../utils/telemetryFormat";

const TRACE_HISTORY_LIMIT = 180;
const MAX_LAP_TRACE_POINTS = 720;
const SESSION_REFRESH_INTERVAL_MS = 5000;
const CONNECTION_RETRY_INTERVAL_MS = 1500;

const EMPTY_LAP_TRACE: CurrentLapTelemetrySeries = {
  sessionId: null,
  lapNumber: null,
  points: [],
};

type DashboardSnapshot = {
  collectorStatus: CollectorStatus;
  games: TelemetrySource[];
  sessions: TelemetrySessionSummary[];
};

type ApiAvailability = "checking" | "online" | "offline";

type DashboardAlert = {
  title: string;
  message: string;
  tone: "error" | "warning";
};

type DashboardErrorContext =
  | "snapshot"
  | "signalr"
  | "startCollector"
  | "stopCollector"
  | "startReplay"
  | "collectorRuntime";

async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [collectorStatus, games, sessions] = await Promise.all([
    getCollectorStatus(),
    getGames(),
    getSessions(),
  ]);

  return { collectorStatus, games, sessions };
}

async function loadSessionSnapshot() {
  return getSessions();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isLikelyOfflineError(message: string) {
  return [
    /failed to fetch/i,
    /fetch failed/i,
    /networkerror/i,
    /load failed/i,
    /connection refused/i,
    /econnrefused/i,
    /err_connection_refused/i,
  ].some((pattern) => pattern.test(message));
}

function createDashboardAlert(
  context: DashboardErrorContext,
  error: unknown,
): { alert: DashboardAlert; apiAvailability: Exclude<ApiAvailability, "checking"> } {
  const rawMessage = getErrorMessage(error, "Request failed");

  if (isLikelyOfflineError(rawMessage)) {
    return {
      apiAvailability: "offline",
      alert: {
        tone: "error",
        title: "API offline",
        message:
          "The local SectorForge API could not be reached. Start the local service, then press Refresh to sync the dashboard.",
      },
    };
  }

  switch (context) {
    case "signalr":
      return {
        apiAvailability: "online",
        alert: {
          tone: "warning",
          title: "Live feed interrupted",
          message:
            "Live updates dropped out. Wait for the connection to recover or press Refresh after the local API is available again.",
        },
      };
    case "startCollector":
      return {
        apiAvailability: "online",
        alert: {
          tone: "error",
          title: "Could not start telemetry",
          message:
            "The collector did not start. Press Refresh, then try Start fake again.",
        },
      };
    case "stopCollector":
      return {
        apiAvailability: "online",
        alert: {
          tone: "error",
          title: "Could not stop telemetry",
          message:
            "The active run did not stop cleanly. Try Stop again or press Refresh before retrying.",
        },
      };
    case "startReplay":
      return {
        apiAvailability: "online",
        alert: {
          tone: "error",
          title: "Could not start replay",
          message:
            "The selected capture could not start replay. Refresh the captures list and try again.",
        },
      };
    case "collectorRuntime":
      return {
        apiAvailability: "online",
        alert: {
          tone: "warning",
          title: "Collector needs attention",
          message:
            "The collector reported a runtime problem. Stop the current run, start it again, and check the local API logs if the issue repeats.",
        },
      };
    case "snapshot":
    default:
      return {
        apiAvailability: "online",
        alert: {
          tone: "error",
          title: "Dashboard refresh failed",
          message:
            "Current telemetry state could not be refreshed. Confirm the local API is available, then press Refresh.",
        },
      };
  }
}

function appendTraceValue(history: number[], nextValue: number) {
  const nextHistory = [...history, nextValue];
  return nextHistory.slice(Math.max(0, nextHistory.length - TRACE_HISTORY_LIMIT));
}

function appendLapTracePoint(
  points: CurrentLapTelemetrySeries["points"],
  nextPoint: CurrentLapTelemetrySeries["points"][number],
) {
  const lastPoint = points.at(-1) ?? null;

  if (
    lastPoint !== null &&
    Math.abs(lastPoint.elapsedSeconds - nextPoint.elapsedSeconds) < 0.001
  ) {
    return [...points.slice(0, -1), nextPoint];
  }

  return [...points, nextPoint].slice(-MAX_LAP_TRACE_POINTS);
}

export function useTelemetryDashboard() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [apiAvailability, setApiAvailability] =
    useState<ApiAvailability>("checking");
  const [collectorStatus, setCollectorStatus] =
    useState<CollectorStatus | null>(null);
  const [sample, setSample] = useState<TelemetrySample | null>(null);
  const [games, setGames] = useState<TelemetrySource[]>([]);
  const [sessions, setSessions] = useState<TelemetrySessionSummary[]>([]);
  const [traceSeries, setTraceSeries] = useState<TelemetryTraceSeries>({
    speed: [],
    rpm: [],
    throttle: [],
    brake: [],
    steering: [],
  });
  const [lapTrace, setLapTrace] =
    useState<CurrentLapTelemetrySeries>(EMPTY_LAP_TRACE);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<DashboardAlert | null>(null);

  const applyDashboardSnapshot = (snapshot: DashboardSnapshot) => {
    setCollectorStatus(snapshot.collectorStatus);
    setGames(snapshot.games);
    setSessions(snapshot.sessions);
    setApiAvailability("online");

    if (snapshot.collectorStatus.lastError) {
      setError(
        createDashboardAlert(
          "collectorRuntime",
          snapshot.collectorStatus.lastError,
        ).alert,
      );
      return;
    }

    setError(null);
  };

  const syncDashboardEffect = useEffectEvent(
    async (options?: { silent?: boolean; sessionsOnly?: boolean }) => {
      try {
        if (options?.sessionsOnly) {
          setSessions(await loadSessionSnapshot());
          setApiAvailability("online");
          return true;
        }

        applyDashboardSnapshot(await loadDashboardSnapshot());
        return true;
      } catch (requestError) {
        const nextAlert = createDashboardAlert("snapshot", requestError);
        setApiAvailability(nextAlert.apiAvailability);

        if (!options?.silent) {
          setError(nextAlert.alert);
        }

        return false;
      }
    },
  );

  const handleCollectorStatus = useEffectEvent((status: CollectorStatus) => {
    setCollectorStatus(status);
    setApiAvailability("online");

    if (!status.isRunning || status.runMode === "Idle") {
      setLapTrace(EMPTY_LAP_TRACE);
    }

    if (status.lastError) {
      setError(createDashboardAlert("collectorRuntime", status.lastError).alert);
      return;
    }

    setError(null);
  });

  const handleTelemetrySample = useEffectEvent((nextSample: TelemetrySample) => {
    setSample(nextSample);
    setApiAvailability("online");
    setError(null);
    setTraceSeries((current) => ({
      speed: appendTraceValue(current.speed, nextSample.vehicle.speedKph ?? 0),
      rpm: appendTraceValue(current.rpm, nextSample.vehicle.rpm ?? 0),
      throttle: appendTraceValue(
        current.throttle,
        (nextSample.driverInput.throttle ?? 0) * 100,
      ),
      brake: appendTraceValue(
        current.brake,
        (nextSample.driverInput.brake ?? 0) * 100,
      ),
      steering: appendTraceValue(
        current.steering,
        (nextSample.driverInput.steering ?? 0) * 100,
      ),
    }));

    const elapsedSeconds = parseDurationSeconds(nextSample.lap.currentLapTime);
    const speedKph = nextSample.vehicle.speedKph;

    if (elapsedSeconds === null || speedKph === null || speedKph === undefined) {
      return;
    }

    setLapTrace((current) => {
      const lastPoint = current.points.at(-1) ?? null;
      const nextLapNumber = nextSample.lap.lapNumber ?? null;
      const shouldReset =
        current.sessionId !== nextSample.session.id ||
        current.lapNumber !== nextLapNumber ||
        (lastPoint !== null && elapsedSeconds + 0.05 < lastPoint.elapsedSeconds);
      const nextPoint = {
        elapsedSeconds,
        value: speedKph,
      };

      return {
        sessionId: nextSample.session.id,
        lapNumber: nextLapNumber,
        points: shouldReset
          ? [nextPoint]
          : appendLapTracePoint(current.points, nextPoint),
      };
    });
  });

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void syncDashboardEffect();
    }, 0);

    const sessionRefresh = window.setInterval(() => {
      void syncDashboardEffect({ silent: true, sessionsOnly: true });
    }, SESSION_REFRESH_INTERVAL_MS);

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(getTelemetryHubUrl())
      .withAutomaticReconnect()
      .build();
    let isDisposed = false;
    let connectionRetryTimeout: number | null = null;

    const clearConnectionRetryTimeout = () => {
      if (connectionRetryTimeout !== null) {
        window.clearTimeout(connectionRetryTimeout);
        connectionRetryTimeout = null;
      }
    };

    const scheduleConnectionStart = (delayMs: number) => {
      if (isDisposed || connectionRetryTimeout !== null) {
        return;
      }

      connectionRetryTimeout = window.setTimeout(() => {
        connectionRetryTimeout = null;
        void startConnection();
      }, delayMs);
    };

    const startConnection = async () => {
      if (
        isDisposed ||
        connection.state !== signalR.HubConnectionState.Disconnected
      ) {
        return;
      }

      try {
        setConnectionState("connecting");
        await connection.start();

        if (isDisposed) {
          return;
        }

        setConnectionState("connected");
        setApiAvailability("online");
        await syncDashboardEffect({ silent: true });
      } catch (startError: unknown) {
        if (isDisposed) {
          return;
        }

        const nextAlert = createDashboardAlert("signalr", startError);
        setConnectionState("disconnected");
        setApiAvailability(nextAlert.apiAvailability);
        setError(nextAlert.alert);
        scheduleConnectionStart(CONNECTION_RETRY_INTERVAL_MS);
      }
    };

    connection.on("collectorStatus", (status: CollectorStatus) => {
      handleCollectorStatus(status);
    });

    connection.on("telemetrySample", (nextSample: TelemetrySample) => {
      handleTelemetrySample(nextSample);
    });

    connection.onreconnecting(() => setConnectionState("reconnecting"));
    connection.onreconnected(() => {
      clearConnectionRetryTimeout();
      setConnectionState("connected");
      setApiAvailability("online");
      void syncDashboardEffect({ silent: true });
    });
    connection.onclose(() => {
      if (isDisposed) {
        return;
      }

      setConnectionState("disconnected");
      scheduleConnectionStart(CONNECTION_RETRY_INTERVAL_MS);
    });

    scheduleConnectionStart(0);

    return () => {
      isDisposed = true;
      window.clearTimeout(initialFetch);
      window.clearInterval(sessionRefresh);
      clearConnectionRetryTimeout();
      void connection.stop();
    };
  }, []);

  const refreshDashboard = async () => {
    setError(null);

    try {
      applyDashboardSnapshot(await loadDashboardSnapshot());
    } catch (requestError) {
      const nextAlert = createDashboardAlert("snapshot", requestError);
      setApiAvailability(nextAlert.apiAvailability);
      setError(nextAlert.alert);
    }
  };

  const refreshSessions = async () => {
    try {
      const next = await loadSessionSnapshot();
      setSessions(next);
      setApiAvailability("online");
    } catch (requestError) {
      const nextAlert = createDashboardAlert("snapshot", requestError);
      setApiAvailability(nextAlert.apiAvailability);
      setError(nextAlert.alert);
    }
  };

  const startCollector = async () => {
    setIsBusy(true);
    setError(null);
    setLapTrace(EMPTY_LAP_TRACE);

    try {
      const [nextStatus, nextGames] = await Promise.all([
        startFakeCollector(),
        getGames(),
      ]);
      setCollectorStatus(nextStatus);
      setGames(nextGames);
      setApiAvailability("online");
    } catch (startError) {
      const nextAlert = createDashboardAlert("startCollector", startError);
      setApiAvailability(nextAlert.apiAvailability);
      setError(nextAlert.alert);
    } finally {
      setIsBusy(false);
    }
  };

  const stopCollector = async () => {
    setIsBusy(true);
    setError(null);
    setLapTrace(EMPTY_LAP_TRACE);

    try {
      const nextStatus = await stopCollectorRequest(collectorStatus?.runMode);
      const [nextGames, nextSessions] = await Promise.all([
        getGames(),
        getSessions(),
      ]);

      setCollectorStatus(nextStatus);
      setGames(nextGames);
      setSessions(nextSessions);
      setApiAvailability("online");
    } catch (stopError) {
      const nextAlert = createDashboardAlert("stopCollector", stopError);
      setApiAvailability(nextAlert.apiAvailability);
      setError(nextAlert.alert);
    } finally {
      setIsBusy(false);
    }
  };

  const startReplay = async (sessionId: string) => {
    setIsBusy(true);
    setError(null);
    setLapTrace(EMPTY_LAP_TRACE);

    try {
      setCollectorStatus(await startReplayRequest(sessionId));
      setApiAvailability("online");
      return true;
    } catch (replayError) {
      const nextAlert = createDashboardAlert("startReplay", replayError);
      setApiAvailability(nextAlert.apiAvailability);
      setError(nextAlert.alert);
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  return {
    connectionState,
    apiAvailability,
    collectorStatus,
    sample,
    games,
    sessions,
    traceSeries,
    lapTrace,
    isBusy,
    error,
    refreshDashboard,
    refreshSessions,
    startCollector,
    stopCollector,
    startReplay,
  };
}
