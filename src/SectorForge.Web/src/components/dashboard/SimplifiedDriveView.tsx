import { useEffect, useState } from "react";
import type {
  CurrentLapTelemetrySeries,
  TelemetryRunMode,
  TelemetrySample,
  TelemetrySessionSummary,
  TelemetrySource,
} from "../../types/telemetry";
import {
  formatDelta,
  formatGear,
  formatNumber,
  formatTime,
} from "../../utils/telemetryFormat";
import { DriverLapCompare } from "./DriverLapCompare";

type SimplifiedDriveViewProps = {
  activeSource: TelemetrySource | null;
  runMode: TelemetryRunMode;
  sample: TelemetrySample | null;
  lapTrace: CurrentLapTelemetrySeries;
  sessions: TelemetrySessionSummary[];
};

type DeltaTone = "improving" | "losing" | "neutral";

const SHIFT_LIGHT_COUNT = 15;
const SHIFT_BEGIN = 0.7;
const SHIFT_AMBER = 0.86;
const SHIFT_RED = 0.94;
const SHIFT_BLINK = 0.985;

export function SimplifiedDriveView({
  activeSource,
  runMode,
  sample,
  lapTrace,
  sessions,
}: SimplifiedDriveViewProps) {
  const playerParticipant =
    sample?.participants?.find((participant) => participant.isPlayer) ?? null;
  const participantCount = sample?.participants?.length ?? 0;

  const deltaRaw = sample?.timing.deltaToBestLap;
  const sectorDeltaRaw = sample?.timing.sectorDelta;
  const deltaTone = getDeltaTone(deltaRaw);
  const sectorTone = getDeltaTone(sectorDeltaRaw);

  const sectorIndex = sample?.lap.sectorIndex ?? null;

  const lapNumber = sample?.lap.lapNumber;
  const lapLabel =
    lapNumber === null || lapNumber === undefined ? "—" : `LAP ${lapNumber}`;

  const speed = sample?.vehicle.speedKph;
  const rpm = sample?.vehicle.rpm ?? null;
  const gear = sample?.vehicle.gear;
  const fuel = sample?.fuel.remainingLiters;
  const fuelLaps = sample?.fuel.lapsRemainingEstimate;

  const throttle = toInputPercentage(sample?.driverInput.throttle);
  const brake = toInputPercentage(sample?.driverInput.brake);
  const steering = sample?.driverInput.steering ?? null;

  // Track observed RPM ceiling so shift-lights and gauge auto-scale per session.
  const [rpmMax, setRpmMax] = useState<number>(8000);
  useEffect(() => {
    if (rpm === null || rpm === undefined) return;
    // Functional updater is a no-op when the ceiling is unchanged, so this
    // does not cascade renders despite the eslint rule's heuristic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRpmMax((prev) => (rpm > prev ? rpm : prev));
  }, [rpm]);
  const rpmPct =
    rpm === null || rpm === undefined ? 0 : Math.min(1, rpm / rpmMax);

  const focusLabel =
    sample?.vehicle.carName ??
    activeSource?.displayName ??
    "Awaiting telemetry";

  const modeLabel =
    runMode === "Replay" ? "REPLAY" : runMode === "Live" ? "LIVE" : "STANDBY";
  const modeTone =
    runMode === "Live" ? "live" : runMode === "Replay" ? "warn" : "stop";

  if (sample === null) {
    return (
      <section className="hud" aria-label="Driver HUD">
        <ShiftLightBar pct={0} />
        <div className={`hud-status hud-status-${modeTone}`}>
          <span className={`status-dot ${modeTone}`} aria-hidden="true" />
          <span className="hud-status-label mono">{modeLabel}</span>
          <span className="hud-status-meta">{focusLabel}</span>
        </div>
        <div className="hud-empty">
          <span className="hud-empty-kicker">Driver HUD</span>
          <h2 className="hud-empty-title">Awaiting telemetry</h2>
          <p className="hud-empty-message">
            {runMode === "Idle"
              ? "Start the collector or replay a stored capture to populate the driver HUD."
              : "Waiting for the next sample from the telemetry bus."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="hud" aria-label="Driver HUD">
      <ShiftLightBar pct={rpmPct} />

      <div className={`hud-status hud-status-${modeTone}`}>
        <span className={`status-dot ${modeTone}`} aria-hidden="true" />
        <span className="hud-status-label mono">{modeLabel}</span>
        <span className="hud-status-meta">{focusLabel}</span>
        <span className="hud-status-spacer" />
        <span className="hud-status-lap mono">{lapLabel}</span>
      </div>

      <div className="hud-grid">
        <div className="hud-cell hud-cell-speed">
          <span className="hud-label">SPEED</span>
          <span className="hud-cell-value mono">{formatNumber(speed, 0)}</span>
          <span className="hud-cell-unit">KPH</span>
        </div>

        <div className="hud-cell hud-cell-gear">
          <span className="hud-label">GEAR</span>
          <div className="hud-gear-body">
            <span className="hud-cell-value mono">{formatGear(gear)}</span>
            <RpmGauge pct={rpmPct} rpm={rpm} />
          </div>
          <span className="hud-cell-unit">
            {rpm === null
              ? `RPM —  /  MAX ${formatNumber(rpmMax, 0)}`
              : `${formatNumber(rpm, 0)} RPM  /  MAX ${formatNumber(rpmMax, 0)}`}
          </span>
        </div>

        <div className="hud-cell hud-cell-lap">
          <span className="hud-label">LAP TIME</span>
          <span className="hud-cell-value mono hud-cell-value-time">
            {formatTime(sample.lap.currentLapTime)}
          </span>
          <span className="hud-cell-unit">
            {sample.lap.lastLapTime
              ? `LAST ${formatTime(sample.lap.lastLapTime)}`
              : "CURRENT LAP"}
          </span>
        </div>

        <div className={`hud-cell hud-cell-delta hud-tone-${deltaTone}`}>
          <span className="hud-label">DELTA</span>
          <span className="hud-cell-value mono hud-cell-value-time">
            {formatDelta(deltaRaw)}
          </span>
          <span className="hud-cell-unit">TO BEST</span>
        </div>

        <div className="hud-cell hud-cell-best">
          <span className="hud-label">BEST LAP</span>
          <span className="hud-cell-value mono hud-cell-value-time">
            {formatTime(sample.lap.bestLapTime)}
          </span>
          <span className="hud-cell-unit">SESSION</span>
        </div>

        <div className="hud-cell hud-cell-position">
          <span className="hud-label">POSITION</span>
          <span className="hud-cell-value mono">
            {playerParticipant ? `P${playerParticipant.position}` : "—"}
          </span>
          <span className="hud-cell-unit">
            {participantCount > 0 ? `OF ${participantCount}` : "CLASS"}
          </span>
        </div>

        <div className={`hud-cell hud-cell-sector hud-tone-${sectorTone}`}>
          <span className="hud-label">SECTOR</span>
          <SectorTrio
            activeIndex={sectorIndex}
            sectorDelta={sectorDeltaRaw ?? null}
          />
          <span className="hud-cell-unit">
            {sectorDeltaRaw ? `Δ ${formatDelta(sectorDeltaRaw)}` : "ACTIVE"}
          </span>
        </div>

        <div className="hud-cell hud-cell-fuel">
          <span className="hud-label">FUEL</span>
          <span className="hud-cell-value mono">{formatNumber(fuel, 1)}</span>
          <span className="hud-cell-unit">
            L ·{" "}
            {fuelLaps === null || fuelLaps === undefined
              ? "—"
              : `${formatNumber(fuelLaps, 0)} LAPS`}
          </span>
        </div>

        <div className="hud-cell hud-cell-remaining">
          <span className="hud-label">REMAINING</span>
          <span className="hud-cell-value mono hud-cell-value-time">
            {formatTime(sample.timing.sessionRemaining)}
          </span>
          <span className="hud-cell-unit">SESSION</span>
        </div>
      </div>

      <div className="hud-inputs">
        <DriveInputBar label="THROTTLE" value={throttle} tone="success" />
        <DriveInputBar label="BRAKE" value={brake} tone="warning" />
        <SteeringIndicator value={steering} />
      </div>

      <ThermalStrip sample={sample} />

      <DriverLapCompare
        sample={sample}
        lapTrace={lapTrace}
        sessions={sessions}
      />
    </section>
  );
}

function ShiftLightBar({ pct }: { pct: number }) {
  const cells = Array.from({ length: SHIFT_LIGHT_COUNT }, (_, i) => {
    const segPct = (i + 1) / SHIFT_LIGHT_COUNT;
    if (segPct > pct) return "off";
    if (pct >= SHIFT_BLINK) return "blink";
    if (segPct >= SHIFT_RED) return "red";
    if (segPct >= SHIFT_AMBER) return "amber";
    if (segPct >= SHIFT_BEGIN) return "green";
    return "green";
  });
  return (
    <div className="hud-shift" aria-hidden="true">
      {cells.map((tone, i) => (
        <span key={i} className={`hud-shift-led hud-shift-${tone}`} />
      ))}
    </div>
  );
}

function RpmGauge({ pct, rpm }: { pct: number; rpm: number | null }) {
  const tone =
    pct >= SHIFT_RED ? "red" : pct >= SHIFT_AMBER ? "amber" : "green";
  return (
    <div className={`hud-rpm-gauge hud-rpm-${tone}`} aria-hidden="true">
      <div
        className="hud-rpm-fill"
        style={{ height: `${Math.round(pct * 100)}%` }}
      />
      <span className="hud-rpm-label mono">
        {rpm === null ? "—" : Math.round(rpm).toLocaleString()}
      </span>
    </div>
  );
}

function SectorTrio({
  activeIndex,
  sectorDelta,
}: {
  activeIndex: number | null;
  sectorDelta: string | null;
}) {
  const sectorTone = getDeltaTone(sectorDelta);
  return (
    <div className="hud-sector-trio">
      {[0, 1, 2].map((i) => {
        const isActive = activeIndex === i;
        const cls = isActive ? `active hud-sector-${sectorTone}` : "";
        return (
          <span key={i} className={`hud-sector-pip ${cls}`}>
            S{i + 1}
          </span>
        );
      })}
    </div>
  );
}

function ThermalStrip({ sample }: { sample: TelemetrySample }) {
  const corners: Array<{
    key: string;
    label: string;
    tyre: number | null | undefined;
    brake: number | null | undefined;
  }> = [
    {
      key: "FL",
      label: "FL",
      tyre: sample.tyres.frontLeft?.coreC,
      brake: sample.brakes.frontLeftTemperatureC,
    },
    {
      key: "FR",
      label: "FR",
      tyre: sample.tyres.frontRight?.coreC,
      brake: sample.brakes.frontRightTemperatureC,
    },
    {
      key: "RL",
      label: "RL",
      tyre: sample.tyres.rearLeft?.coreC,
      brake: sample.brakes.rearLeftTemperatureC,
    },
    {
      key: "RR",
      label: "RR",
      tyre: sample.tyres.rearRight?.coreC,
      brake: sample.brakes.rearRightTemperatureC,
    },
  ];

  return (
    <div className="hud-thermal" aria-label="Tyre and brake temperatures">
      <div className="hud-thermal-row">
        <span className="hud-thermal-label">TYRE °C</span>
        {corners.map((c) => (
          <ThermalChip
            key={`t-${c.key}`}
            label={c.label}
            value={c.tyre}
            tone={tyreTone(c.tyre)}
          />
        ))}
      </div>
      <div className="hud-thermal-row">
        <span className="hud-thermal-label">BRAKE °C</span>
        {corners.map((c) => (
          <ThermalChip
            key={`b-${c.key}`}
            label={c.label}
            value={c.brake}
            tone={brakeTone(c.brake)}
          />
        ))}
      </div>
    </div>
  );
}

function ThermalChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  tone: "cold" | "ok" | "hot" | "crit" | "neutral";
}) {
  return (
    <div className={`hud-thermal-chip hud-thermal-${tone}`}>
      <span className="hud-thermal-corner">{label}</span>
      <span className="hud-thermal-value mono">{formatNumber(value, 0)}</span>
    </div>
  );
}

function tyreTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "neutral";
  if (v < 60) return "cold";
  if (v < 95) return "ok";
  if (v < 105) return "hot";
  return "crit";
}

function brakeTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "neutral";
  if (v < 200) return "cold";
  if (v < 550) return "ok";
  if (v < 720) return "hot";
  return "crit";
}

function DriveInputBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "success" | "warning";
}) {
  return (
    <div className={`hud-input hud-input-${tone}`}>
      <div className="hud-input-head">
        <span className="hud-label">{label}</span>
        <span className="hud-input-value mono">
          {value === null ? "—" : `${value}%`}
        </span>
      </div>
      <div className="hud-input-track" aria-hidden="true">
        <div className="hud-input-fill" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function SteeringIndicator({ value }: { value: number | null }) {
  const clamped = value === null ? 0 : Math.max(-1, Math.min(1, value));
  const offsetPercent = (clamped * 0.5 + 0.5) * 100;
  const labelPercent = value === null ? "—" : `${Math.round(clamped * 100)}%`;

  return (
    <div className="hud-input hud-input-steer">
      <div className="hud-input-head">
        <span className="hud-label">STEER</span>
        <span className="hud-input-value mono">{labelPercent}</span>
      </div>
      <div className="hud-steer-track" aria-hidden="true">
        <div className="hud-steer-center" />
        <div
          className="hud-steer-marker"
          style={{ left: `${offsetPercent}%` }}
        />
      </div>
    </div>
  );
}

function toInputPercentage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function getDeltaTone(value: string | null | undefined): DeltaTone {
  if (!value || value === "0:00.000" || value === "+0:00.000") {
    return "neutral";
  }

  return value.startsWith("-") ? "improving" : "losing";
}
