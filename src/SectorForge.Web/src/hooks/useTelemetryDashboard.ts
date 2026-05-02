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
  TelemetrySample,
  TelemetrySessionSummary,
  TelemetryTraceSeries,
  TelemetrySource,
} from "../types/telemetry";

const TRACE_HISTORY_LIMIT = 180;
const SESSION_REFRESH_INTERVAL_MS = 5000;

type DashboardSnapshot = {
  collectorStatus: CollectorStatus;
  games: TelemetrySource[];
  sessions: TelemetrySessionSummary[];
};

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

function appendTraceValue(history: number[], nextValue: number) {
  const nextHistory = [...history, nextValue];
  return nextHistory.slice(Math.max(0, nextHistory.length - TRACE_HISTORY_LIMIT));
}

export function useTelemetryDashboard() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
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
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyDashboardSnapshot = (snapshot: DashboardSnapshot) => {
    setCollectorStatus(snapshot.collectorStatus);
    setGames(snapshot.games);
    setSessions(snapshot.sessions);
  };

  const syncDashboardEffect = useEffectEvent(
    async (options?: { silent?: boolean; sessionsOnly?: boolean }) => {
      try {
        if (options?.sessionsOnly) {
          setSessions(await loadSessionSnapshot());
          return true;
        }

        applyDashboardSnapshot(await loadDashboardSnapshot());
        return true;
      } catch (requestError) {
        if (!options?.silent) {
          setError(getErrorMessage(requestError, "API request failed"));
        }

        return false;
      }
    },
  );

  const handleCollectorStatus = useEffectEvent((status: CollectorStatus) => {
    setCollectorStatus(status);

    if (status.lastError) {
      setError(status.lastError);
    }
  });

  const handleTelemetrySample = useEffectEvent((nextSample: TelemetrySample) => {
    setSample(nextSample);
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

    connection.on("collectorStatus", (status: CollectorStatus) => {
      handleCollectorStatus(status);
    });

    connection.on("telemetrySample", (nextSample: TelemetrySample) => {
      handleTelemetrySample(nextSample);
    });

    connection.onreconnecting(() => setConnectionState("reconnecting"));
    connection.onreconnected(() => {
      setConnectionState("connected");
      void syncDashboardEffect({ silent: true });
    });
    connection.onclose(() => setConnectionState("disconnected"));

    connection
      .start()
      .then(() => setConnectionState("connected"))
      .catch((startError: unknown) => {
        setConnectionState("disconnected");
        setError(getErrorMessage(startError, "SignalR connection failed"));
      });

    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(sessionRefresh);
      void connection.stop();
    };
  }, []);

  const refreshDashboard = async () => {
    setError(null);

    try {
      applyDashboardSnapshot(await loadDashboardSnapshot());
    } catch (requestError) {
      setError(getErrorMessage(requestError, "API request failed"));
    }
  };

  const startCollector = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const [nextStatus, nextGames] = await Promise.all([
        startFakeCollector(),
        getGames(),
      ]);
      setCollectorStatus(nextStatus);
      setGames(nextGames);
    } catch (startError) {
      setError(getErrorMessage(startError, "Collector start failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const stopCollector = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const nextStatus = await stopCollectorRequest(collectorStatus?.runMode);
      const [nextGames, nextSessions] = await Promise.all([
        getGames(),
        getSessions(),
      ]);

      setCollectorStatus(nextStatus);
      setGames(nextGames);
      setSessions(nextSessions);
    } catch (stopError) {
      setError(getErrorMessage(stopError, "Collector stop failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const startReplay = async (sessionId: string) => {
    setIsBusy(true);
    setError(null);

    try {
      setCollectorStatus(await startReplayRequest(sessionId));
    } catch (replayError) {
      setError(getErrorMessage(replayError, "Replay start failed"));
    } finally {
      setIsBusy(false);
    }
  };

  return {
    connectionState,
    collectorStatus,
    sample,
    games,
    sessions,
    traceSeries,
    isBusy,
    error,
    refreshDashboard,
    startCollector,
    stopCollector,
    startReplay,
  };
}
