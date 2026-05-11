import { useEffect, useRef, useState } from "react";
import type { TelemetrySample } from "../types/telemetry";
import { parseDurationSeconds } from "../utils/telemetryFormat";

export type SectorTone = "improving" | "losing" | "neutral";
export type SectorTones = [SectorTone, SectorTone, SectorTone];

type PartialSectorTones = [
  SectorTone | null,
  SectorTone | null,
  SectorTone | null,
];

type SectorSnapshot = {
  sessionId: string;
  lapNumber: number | null;
  sectorIndex: number | null;
  sectorTone: SectorTone;
};

const SECTOR_DELTA_EPSILON = 0.0005;

export function useSectorTones(sample: TelemetrySample | null) {
  const activeSectorTone = getDeltaTone(sample?.timing.sectorDelta);
  const storedSectorTones = useCompletedSectorTones(sample);
  const splitSectorTones = getSplitSectorTones(sample);
  const sectorTones = mergeSectorTones(splitSectorTones, storedSectorTones);
  const activeIndex = sample?.lap.sectorIndex ?? null;

  if (
    activeIndex !== null &&
    activeIndex >= 0 &&
    activeIndex < sectorTones.length
  ) {
    sectorTones[activeIndex] = activeSectorTone;
  }

  return { activeSectorTone, sectorTones };
}

export function getDeltaTone(value: string | null | undefined): SectorTone {
  if (!value || value === "0:00.000" || value === "+0:00.000") {
    return "neutral";
  }

  return value.startsWith("-") ? "improving" : "losing";
}

function useCompletedSectorTones(sample: TelemetrySample | null) {
  const [completedSectorTones, setCompletedSectorTones] = useState<SectorTones>(
    createNeutralSectorTones,
  );
  const previousSectorRef = useRef<SectorSnapshot | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const snapshot = getSectorSnapshot(sample);
    const previous = previousSectorRef.current;

    if (snapshot === null) {
      previousSectorRef.current = null;
      setCompletedSectorTones(createNeutralSectorTones);
      return;
    }

    if (
      previous === null ||
      previous.sessionId !== snapshot.sessionId ||
      previous.lapNumber !== snapshot.lapNumber
    ) {
      previousSectorRef.current = snapshot;
      setCompletedSectorTones(() => getInitialCompletedSectorTones(snapshot));
      return;
    }

    if (
      previous.sectorIndex !== null &&
      snapshot.sectorIndex !== null &&
      snapshot.sectorIndex > previous.sectorIndex
    ) {
      const completedSectorIndex = previous.sectorIndex;
      const completedSectorTone =
        previous.sectorTone === "neutral"
          ? snapshot.sectorTone
          : previous.sectorTone;

      setCompletedSectorTones((currentTones) => {
        if (currentTones[completedSectorIndex] === completedSectorTone) {
          return currentTones;
        }

        const nextTones = [...currentTones] as SectorTones;
        nextTones[completedSectorIndex] = completedSectorTone;
        return nextTones;
      });
    } else if (
      previous.sectorIndex !== null &&
      snapshot.sectorIndex !== null &&
      snapshot.sectorIndex < previous.sectorIndex
    ) {
      setCompletedSectorTones(createNeutralSectorTones);
    }

    previousSectorRef.current = snapshot;
  }, [sample]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return completedSectorTones;
}

function getSectorSnapshot(
  sample: TelemetrySample | null,
): SectorSnapshot | null {
  if (sample === null) {
    return null;
  }

  return {
    sessionId: sample.session.id || sample.sessionId,
    lapNumber: sample.lap.lapNumber ?? null,
    sectorIndex: sample.lap.sectorIndex ?? null,
    sectorTone: getDeltaTone(sample.timing.sectorDelta),
  };
}

function getInitialCompletedSectorTones(snapshot: SectorSnapshot) {
  const tones = createNeutralSectorTones();

  if (snapshot.sectorIndex !== null && snapshot.sectorIndex > 0) {
    tones[snapshot.sectorIndex - 1] = snapshot.sectorTone;
  }

  return tones;
}

function getSplitSectorTones(
  sample: TelemetrySample | null,
): PartialSectorTones {
  const tones = createEmptySectorTones();

  if (sample === null) {
    return tones;
  }

  const lap = sample.lap;
  const splits: Array<{
    sectorIndex: number;
    current: string | null | undefined;
    previous: string | null | undefined;
  }> = [
    {
      sectorIndex: 0,
      current: lap.sector1Time,
      previous: lap.lastSector1Time,
    },
    {
      sectorIndex: 1,
      current: lap.sector2Time,
      previous: lap.lastSector2Time,
    },
    {
      sectorIndex: 2,
      current: lap.sector3Time,
      previous: lap.lastSector3Time,
    },
  ];

  for (const split of splits) {
    const splitTone = getSectorSplitTone(split.current, split.previous);
    if (splitTone !== null) {
      tones[split.sectorIndex] = splitTone;
    }
  }

  return tones;
}

function getSectorSplitTone(
  current: string | null | undefined,
  previous: string | null | undefined,
) {
  const currentSeconds = parseDurationSeconds(current);
  const previousSeconds = parseDurationSeconds(previous);

  if (currentSeconds === null || previousSeconds === null) {
    return null;
  }

  const deltaSeconds = currentSeconds - previousSeconds;
  if (Math.abs(deltaSeconds) <= SECTOR_DELTA_EPSILON) {
    return "neutral";
  }

  return deltaSeconds < 0 ? "improving" : "losing";
}

function mergeSectorTones(
  primaryTones: PartialSectorTones,
  fallbackTones: SectorTones,
) {
  return primaryTones.map(
    (tone, sectorIndex) => tone ?? fallbackTones[sectorIndex],
  ) as SectorTones;
}

function createNeutralSectorTones(): SectorTones {
  return ["neutral", "neutral", "neutral"];
}

function createEmptySectorTones(): PartialSectorTones {
  return [null, null, null];
}
