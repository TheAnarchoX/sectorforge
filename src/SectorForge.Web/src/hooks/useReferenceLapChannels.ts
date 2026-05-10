import { useEffect, useState } from "react";
import { getLapChannelsForBasketEntry } from "../api/telemetryApi";
import type {
  LapChannelsResponse,
  ReferenceLapSelection,
} from "../types/telemetry";

export type ReferenceLapChannelsState =
  | { status: "idle" }
  | { status: "loading"; referenceLap: ReferenceLapSelection }
  | {
      status: "ready";
      referenceLap: ReferenceLapSelection;
      response: LapChannelsResponse;
    }
  | { status: "error"; referenceLap: ReferenceLapSelection; message: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Reference lap unavailable";
}

export function useReferenceLapChannels(
  referenceLap: ReferenceLapSelection | null,
) {
  const [state, setState] = useState<ReferenceLapChannelsState>({
    status: "idle",
  });

  useEffect(() => {
    if (referenceLap === null) {
      return undefined;
    }

    let isCancelled = false;

    void getLapChannelsForBasketEntry(referenceLap)
      .then((response) => {
        if (!isCancelled) {
          setState({ status: "ready", referenceLap, response });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({
            status: "error",
            referenceLap,
            message: getErrorMessage(error),
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [referenceLap]);

  if (referenceLap === null) {
    return { status: "idle" } satisfies ReferenceLapChannelsState;
  }

  if (
    state.status !== "idle" &&
    state.referenceLap.sessionId === referenceLap.sessionId &&
    state.referenceLap.lapNumber === referenceLap.lapNumber
  ) {
    return state;
  }

  return {
    status: "loading",
    referenceLap,
  } satisfies ReferenceLapChannelsState;
}
