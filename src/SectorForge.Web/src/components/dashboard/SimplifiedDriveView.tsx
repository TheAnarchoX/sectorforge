import type {
  TelemetryRunMode,
  TelemetrySample,
  TelemetrySource,
} from "../../types/telemetry";
import {
  formatDelta,
  formatGear,
  formatNumber,
  formatTime,
} from "../../utils/telemetryFormat";

type SimplifiedDriveViewProps = {
  activeSource: TelemetrySource | null;
  runMode: TelemetryRunMode;
  sample: TelemetrySample | null;
};

type MetricTone = "accent" | "success" | "warning" | "neutral";

type DriveMetric = {
  label: string;
  value: string;
  unit: string;
  detail: string;
  tone: MetricTone;
  valueKind?: "standard" | "time";
  isWide?: boolean;
};

type DriveInputTone = "success" | "warning";

export function SimplifiedDriveView({
  activeSource,
  runMode,
  sample,
}: SimplifiedDriveViewProps) {
  const playerParticipant =
    sample?.participants?.find((participant) => participant.isPlayer) ?? null;
  const participantCount = sample?.participants?.length ?? 0;
  const sectorValue =
    sample?.lap.sectorIndex === null || sample?.lap.sectorIndex === undefined
      ? "-"
      : `S${sample.lap.sectorIndex + 1}`;
  const rpmDetail =
    sample?.vehicle.rpm === null || sample?.vehicle.rpm === undefined
      ? "RPM pending"
      : `${formatNumber(sample.vehicle.rpm, 0)} rpm`;
  const fuelWindowDetail =
    sample?.fuel.lapsRemainingEstimate === null ||
    sample?.fuel.lapsRemainingEstimate === undefined
      ? "Range pending"
      : `${formatNumber(sample.fuel.lapsRemainingEstimate, 0)} laps est.`;
  const remainingDetail = sample?.timing.sessionElapsed
    ? `${formatTime(sample.timing.sessionElapsed)} elapsed`
    : "Elapsed time pending";
  const heroMetrics: DriveMetric[] = [
    {
      label: "Speed",
      value: formatNumber(sample?.vehicle.speedKph, 0),
      unit: "kph",
      detail:
        sample?.vehicle.carName ??
        activeSource?.displayName ??
        "Awaiting speed channel",
      tone: "accent",
      valueKind: "standard",
    },
    {
      label: "Lap time",
      value: formatTime(sample?.lap.currentLapTime),
      unit:
        sample?.lap.lapNumber === null || sample?.lap.lapNumber === undefined
          ? "current lap"
          : `lap ${sample.lap.lapNumber}`,
      detail:
        sample?.lap.lastLapTime !== null &&
        sample?.lap.lastLapTime !== undefined
          ? `Last ${formatTime(sample.lap.lastLapTime)}`
          : (sample?.session.sessionType ?? "Current lap"),
      tone: "neutral",
      valueKind: "time",
      isWide: true,
    },
    {
      label: "Position",
      value: playerParticipant ? `P${playerParticipant.position}` : "-",
      unit: participantCount > 0 ? `of ${participantCount}` : "classification",
      detail:
        playerParticipant?.gapToLeader !== null &&
        playerParticipant?.gapToLeader !== undefined
          ? `${formatDelta(playerParticipant.gapToLeader)} to leader`
          : (playerParticipant?.driverName ??
            "Player classification unavailable"),
      tone: "success",
      valueKind: "standard",
    },
  ];
  const timingMetrics: DriveMetric[] = [
    {
      label: "Delta",
      value: formatDelta(sample?.timing.deltaToBestLap),
      unit: "to best",
      detail:
        sample?.timing.sectorDelta !== null &&
        sample?.timing.sectorDelta !== undefined
          ? `Sector ${formatDelta(sample.timing.sectorDelta)}`
          : "Live lap delta",
      tone: getDeltaTone(sample?.timing.deltaToBestLap),
      valueKind: "time",
    },
    {
      label: "Best",
      value: formatTime(sample?.lap.bestLapTime),
      unit: "session",
      detail:
        sample?.lap.lastLapTime !== null &&
        sample?.lap.lastLapTime !== undefined
          ? `Last ${formatTime(sample.lap.lastLapTime)}`
          : "Best lap on record",
      tone: "neutral",
      valueKind: "time",
    },
    {
      label: "Remaining",
      value: formatTime(sample?.timing.sessionRemaining),
      unit: "session",
      detail: remainingDetail,
      tone: "neutral",
      valueKind: "time",
    },
  ];
  const vehicleMetrics: DriveMetric[] = [
    {
      label: "Gear",
      value: formatGear(sample?.vehicle.gear),
      unit: "current",
      detail: rpmDetail,
      tone: "success",
      valueKind: "standard",
    },
    {
      label: "Sector",
      value: sectorValue,
      unit: "active",
      detail:
        sample?.timing.sectorDelta !== null &&
        sample?.timing.sectorDelta !== undefined
          ? `${formatDelta(sample.timing.sectorDelta)} split`
          : (sample?.track.weather ?? "Live split pending"),
      tone: getDeltaTone(sample?.timing.sectorDelta),
      valueKind: "standard",
    },
    {
      label: "Fuel",
      value: formatNumber(sample?.fuel.remainingLiters, 1),
      unit: "liters",
      detail: fuelWindowDetail,
      tone: "warning",
      valueKind: "standard",
    },
  ];
  const modeTitle =
    runMode === "Replay"
      ? "Replay glance mode"
      : runMode === "Live"
        ? "Live drive monitor"
        : "Standby essentials";
  const focusLabel =
    sample?.vehicle.carName ??
    activeSource?.inputKind ??
    activeSource?.displayName ??
    "Awaiting telemetry";
  const modeDotClass =
    runMode === "Live" ? "live" : runMode === "Replay" ? "warn" : "stop";
  const emptyStateMessage =
    runMode === "Idle"
      ? "Start fake telemetry or replay a stored session to populate the simplified drive view."
      : "Waiting for the next telemetry sample to populate the large-format essentials.";

  return (
    <section className="drive-view" aria-label="Simplified drive view">
      <div className="drive-view-banner">
        <div>
          <div className="panel-kicker">Simplified drive view</div>
          <h2 className="drive-view-title">{modeTitle}</h2>
        </div>
        <div className="status-pill mono">
          <span className={`status-dot ${modeDotClass}`} />
          <span className="status-pill-value">{focusLabel}</span>
        </div>
      </div>

      {sample === null ? (
        <section className="drive-empty-state" aria-live="polite">
          <div className="panel-kicker">Awaiting telemetry</div>
          <h3 className="drive-empty-title">{modeTitle}</h3>
          <p className="drive-empty-message">{emptyStateMessage}</p>
        </section>
      ) : (
        <>
          <div className="drive-primary-grid">
            {heroMetrics.map((metric) => (
              <DriveMetricCard
                key={metric.label}
                metric={metric}
                variant="hero"
              />
            ))}
          </div>

          <div className="drive-support-stack">
            <section className="drive-metric-group" aria-label="Lap context">
              <div className="panel-kicker">Lap context</div>
              <div className="drive-secondary-grid">
                {timingMetrics.map((metric) => (
                  <DriveMetricCard
                    key={metric.label}
                    metric={metric}
                    variant="secondary"
                  />
                ))}
              </div>
            </section>

            <section className="drive-metric-group" aria-label="Car state">
              <div className="panel-kicker">Car state</div>
              <div className="drive-secondary-grid">
                {vehicleMetrics.map((metric) => (
                  <DriveMetricCard
                    key={metric.label}
                    metric={metric}
                    variant="secondary"
                  />
                ))}
              </div>
            </section>
          </div>

          <div className="drive-input-grid">
            <DriveInputBar
              label="Throttle"
              value={toInputPercentage(sample.driverInput.throttle)}
              tone="success"
            />
            <DriveInputBar
              label="Brake"
              value={toInputPercentage(sample.driverInput.brake)}
              tone="warning"
            />
          </div>
        </>
      )}
    </section>
  );
}

type DriveInputBarProps = {
  label: string;
  value: number | null;
  tone: DriveInputTone;
};

type DriveMetricCardProps = {
  metric: DriveMetric;
  variant: "hero" | "secondary";
};

function DriveMetricCard({ metric, variant }: DriveMetricCardProps) {
  const cardClassName =
    variant === "hero"
      ? `drive-hero-card${metric.isWide ? " drive-hero-card-wide" : ""}`
      : "drive-secondary-card";
  const baseValueClassName =
    variant === "hero" ? "drive-hero-value" : "drive-secondary-value";
  const timeValueClassName =
    metric.valueKind === "time" ? ` ${baseValueClassName}-time` : "";

  return (
    <article className={`${cardClassName} drive-tone-${metric.tone}`}>
      <div className="drive-card-header">
        <span className="panel-kicker">{metric.label}</span>
        <span className="drive-card-unit">{metric.unit}</span>
      </div>
      <div className={`${baseValueClassName}${timeValueClassName} mono`}>
        {metric.value}
      </div>
      <div className="drive-card-detail">{metric.detail}</div>
    </article>
  );
}

function DriveInputBar({ label, value, tone }: DriveInputBarProps) {
  return (
    <article className={`drive-input-card drive-tone-${tone}`}>
      <div className="drive-card-header">
        <span className="panel-kicker">{label}</span>
        <span className="drive-input-value mono">
          {value === null ? "-" : `${value}%`}
        </span>
      </div>
      <div className="drive-input-track" aria-hidden="true">
        <div
          className={`drive-input-fill drive-input-fill-${tone}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </article>
  );
}

function toInputPercentage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function getDeltaTone(value: string | null | undefined): MetricTone {
  if (!value) {
    return "neutral";
  }

  return value.startsWith("-") ? "success" : "warning";
}
