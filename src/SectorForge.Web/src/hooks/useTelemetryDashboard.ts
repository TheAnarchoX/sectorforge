import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import {
  getCollectorStatus,
  getGames,
  getSessions,
  getTelemetryHubUrl,
  startCollectorAdapter,
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
// Coalesce SignalR samples (60Hz fake adapter, higher in real games) into a
// single React commit at ~20Hz. Below the threshold for cockpit displays to
// look "smooth" while drastically cutting reconciliation cost and array
// allocations during long sessions.
const COMMIT_INTERVAL_MS = 100;

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
): {
  alert: DashboardAlert;
  apiAvailability: Exclude<ApiAvailability, "checking">;
} {
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
  // Mutates history in place to keep allocations low on the 60Hz hot path.
  history.push(nextValue);
  if (history.length > TRACE_HISTORY_LIMIT) {
    history.splice(0, history.length - TRACE_HISTORY_LIMIT);
  }
}

function appendLapTracePoint(
  points: CurrentLapTelemetrySeries["points"],
  nextPoint: CurrentLapTelemetrySeries["points"][number],
) {
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  if (
    lastPoint !== null &&
    Math.abs(lastPoint.elapsedSeconds - nextPoint.elapsedSeconds) < 0.001
  ) {
    points[points.length - 1] = nextPoint;
    return;
  }

  points.push(nextPoint);
  if (points.length > MAX_LAP_TRACE_POINTS) {
    points.splice(0, points.length - MAX_LAP_TRACE_POINTS);
  }
}

type TraceBuffers = {
  speed: number[];
  rpm: number[];
  throttle: number[];
  brake: number[];
  steering: number[];
};

function createTraceBuffers(): TraceBuffers {
  return { speed: [], rpm: [], throttle: [], brake: [], steering: [] };
}

function snapshotTraceBuffers(buffers: TraceBuffers): TelemetryTraceSeries {
  return {
    speed: buffers.speed.slice(),
    rpm: buffers.rpm.slice(),
    throttle: buffers.throttle.slice(),
    brake: buffers.brake.slice(),
    steering: buffers.steering.slice(),
  };
}

function snapshotLapTrace(
  ref: CurrentLapTelemetrySeries,
): CurrentLapTelemetrySeries {
  return {
    sessionId: ref.sessionId,
    lapNumber: ref.lapNumber,
    points: ref.points.slice(),
  };
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

  // Hot-path refs: we mutate buffers per SignalR sample and only commit
  // snapshots into React state at COMMIT_INTERVAL_MS so the dashboard tree
  // reconciles ~20 times per second instead of 60+.
  const latestSampleRef = useRef<TelemetrySample | null>(null);
  const traceBuffersRef = useRef<TraceBuffers>(createTraceBuffers());
  const lapTraceRef = useRef<CurrentLapTelemetrySeries>({
    sessionId: null,
    lapNumber: null,
    points: [],
  });
  const sampleDirtyRef = useRef(false);
  const traceDirtyRef = useRef(false);
  const lapTraceDirtyRef = useRef(false);
  const commitTimerRef = useRef<number | null>(null);
  const commitFrameRef = useRef<number | null>(null);

  const flushPendingCommit = useEffectEvent(() => {
    commitFrameRef.current = null;
    if (sampleDirtyRef.current) {
      sampleDirtyRef.current = false;
      setSample(latestSampleRef.current);
    }
    if (traceDirtyRef.current) {
      traceDirtyRef.current = false;
      setTraceSeries(snapshotTraceBuffers(traceBuffersRef.current));
    }
    if (lapTraceDirtyRef.current) {
      lapTraceDirtyRef.current = false;
      setLapTrace(snapshotLapTrace(lapTraceRef.current));
    }
  });

  const scheduleCommit = useEffectEvent(() => {
    if (commitTimerRef.current !== null) {
      return;
    }
    // Throttle commits to ~10 Hz, then align the actual state update with the
    // next animation frame so React renders, browser paint, and GPU raster
    // happen on the same beat. This keeps the compositor cache warm instead of
    // invalidating SVG layers between paints.
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      if (typeof window.requestAnimationFrame === "function") {
        commitFrameRef.current = window.requestAnimationFrame(() => {
          flushPendingCommit();
        });
      } else {
        flushPendingCommit();
      }
    }, COMMIT_INTERVAL_MS);
  });

  const resetLapTrace = () => {
    lapTraceRef.current = { sessionId: null, lapNumber: null, points: [] };
    lapTraceDirtyRef.current = false;
    setLapTrace(EMPTY_LAP_TRACE);
  };

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
      resetLapTrace();
    }

    if (status.lastError) {
      setError(
        createDashboardAlert("collectorRuntime", status.lastError).alert,
      );
      return;
    }

    setError(null);
  });

  const handleTelemetrySample = useEffectEvent(
    (nextSample: TelemetrySample) => {
      latestSampleRef.current = nextSample;
      sampleDirtyRef.current = true;

      const buffers = traceBuffersRef.current;
      appendTraceValue(buffers.speed, nextSample.vehicle.speedKph ?? 0);
      appendTraceValue(buffers.rpm, nextSample.vehicle.rpm ?? 0);
      appendTraceValue(
        buffers.throttle,
        (nextSample.driverInput.throttle ?? 0) * 100,
      );
      appendTraceValue(
        buffers.brake,
        (nextSample.driverInput.brake ?? 0) * 100,
      );
      appendTraceValue(
        buffers.steering,
        (nextSample.driverInput.steering ?? 0) * 100,
      );
      traceDirtyRef.current = true;

      const elapsedSeconds = parseDurationSeconds(
        nextSample.lap.currentLapTime,
      );
      const speedKph = nextSample.vehicle.speedKph;

      if (
        elapsedSeconds !== null &&
        speedKph !== null &&
        speedKph !== undefined
      ) {
        const lapRef = lapTraceRef.current;
        const lastPoint =
          lapRef.points.length > 0
            ? lapRef.points[lapRef.points.length - 1]
            : null;
        const nextLapNumber = nextSample.lap.lapNumber ?? null;
        const shouldReset =
          lapRef.sessionId !== nextSample.session.id ||
          lapRef.lapNumber !== nextLapNumber ||
          (lastPoint !== null &&
            elapsedSeconds + 0.05 < lastPoint.elapsedSeconds);
        const nextPoint = {
          elapsedSeconds,
          value: speedKph,
          lapDistanceMeters: nextSample.lap.lapDistanceMeters ?? null,
        };

        if (shouldReset) {
          lapRef.sessionId = nextSample.session.id;
          lapRef.lapNumber = nextLapNumber;
          lapRef.points.length = 0;
          lapRef.points.push(nextPoint);
        } else {
          appendLapTracePoint(lapRef.points, nextPoint);
        }
        lapTraceDirtyRef.current = true;
      }

      if (apiAvailability !== "online") {
        setApiAvailability("online");
      }
      if (error !== null) {
        setError(null);
      }

      scheduleCommit();
    },
  );

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
      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      if (
        commitFrameRef.current !== null &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(commitFrameRef.current);
        commitFrameRef.current = null;
      }
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

  const startCollector = async (adapterId?: string) => {
    setIsBusy(true);
    setError(null);
    resetLapTrace();

    try {
      const startRequest =
        adapterId === undefined || adapterId === "fake"
          ? startFakeCollector()
          : startCollectorAdapter(adapterId);
      const [nextStatus, nextGames] = await Promise.all([
        startRequest,
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
    resetLapTrace();

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
    resetLapTrace();

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
