import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Sun,
  Zap,
} from "lucide-react";
import type {
  LapChannelsResponse,
  TelemetrySample,
} from "../../types/telemetry";
import {
  formatDeltaSeconds,
  formatNumber,
  formatTime,
} from "../../utils/telemetryFormat";
import {
  buildLiveReferenceSectorDeltas,
  type LiveReferenceSectorDeltas,
} from "../../utils/liveReferenceComparison";

const ERS_MAX_JOULES = 4_000_000;

type Severity = "ok" | "warn" | "danger" | "na";

function severity(value: number | null | undefined): Severity {
  if (value === null || value === undefined) return "na";
  if (value <= 0) return "ok";
  if (value < 15) return "ok";
  if (value < 50) return "warn";
  return "danger";
}

function clampPct(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

function formatMJ(joules: number | null | undefined) {
  if (joules === null || joules === undefined) return null;
  return joules / 1_000_000;
}

type LiveStatusPanelsProps = {
  sample: TelemetrySample | null;
  referenceChannels?: LapChannelsResponse | null;
};

/**
 * Renders SF-049 optional channel panels (driver flags strip, sector splits,
 * lap-valid badge, damage, ERS, and weather forecast). Each panel mounts only
 * when its source field is non-null on the active sample, so the dashboard
 * stays compact when the F1 25 adapter has not yet observed the underlying
 * packet.
 */
export function LiveStatusPanels({
  sample,
  referenceChannels = null,
}: LiveStatusPanelsProps) {
  const referenceSectorDeltas = useMemo(
    () =>
      sample === null || referenceChannels === null
        ? null
        : buildLiveReferenceSectorDeltas(sample, referenceChannels),
    [referenceChannels, sample],
  );

  if (sample === null) {
    return null;
  }

  return (
    <>
      <DriverFlagsStrip sample={sample} />
      <SectorSplitsTiles
        sample={sample}
        referenceDeltas={referenceSectorDeltas}
      />
      <DamagePanel sample={sample} />
      <ErsPanel sample={sample} />
      <WeatherForecastStrip sample={sample} />
    </>
  );
}

function hasAnyDriverFlag(sample: TelemetrySample) {
  const input = sample.driverInput;
  return (
    (input.drsActive !== null && input.drsActive !== undefined) ||
    (input.drsAllowed !== null && input.drsAllowed !== undefined) ||
    (input.pitLimiterActive !== null && input.pitLimiterActive !== undefined) ||
    (input.absActive !== null && input.absActive !== undefined) ||
    (input.tcActive !== null && input.tcActive !== undefined) ||
    (sample.lap.isValid !== null && sample.lap.isValid !== undefined)
  );
}

export function DriverFlagsStrip({ sample }: { sample: TelemetrySample }) {
  if (!hasAnyDriverFlag(sample)) {
    return null;
  }

  const input = sample.driverInput;
  const items: Array<{
    key: string;
    label: string;
    value: boolean | null | undefined;
    activeTone: "accent" | "warning" | "danger" | "success";
  }> = [
    {
      key: "drs",
      label: "DRS",
      value:
        input.drsActive ??
        (input.drsAllowed === true ? false : input.drsAllowed),
      activeTone: "accent",
    },
    {
      key: "pit",
      label: "Pit lim.",
      value: input.pitLimiterActive,
      activeTone: "warning",
    },
    { key: "abs", label: "ABS", value: input.absActive, activeTone: "success" },
    { key: "tc", label: "TC", value: input.tcActive, activeTone: "success" },
  ];

  const visibleItems = items.filter(
    (item) => item.value !== null && item.value !== undefined,
  );

  const lapValid = sample.lap.isValid;

  return (
    <section
      className="status-strip"
      aria-label="Driver flags"
      data-testid="driver-flags-strip"
    >
      {visibleItems.map((item) => (
        <span
          key={item.key}
          className={
            item.value === true
              ? `status-flag status-flag-on status-flag-${item.activeTone}`
              : "status-flag status-flag-off"
          }
        >
          <span className="status-flag-label">{item.label}</span>
          <span className="status-flag-state mono">
            {item.value === true ? "ON" : "OFF"}
          </span>
        </span>
      ))}
      {lapValid !== null && lapValid !== undefined && (
        <span
          className={
            lapValid
              ? "status-flag status-flag-on status-flag-success"
              : "status-flag status-flag-on status-flag-danger"
          }
          data-testid="lap-valid-badge"
        >
          <span className="status-flag-label">Lap</span>
          <span className="status-flag-state mono">
            {lapValid ? "VALID" : "INVALID"}
          </span>
        </span>
      )}
    </section>
  );
}

function hasAnySectorSplit(sample: TelemetrySample) {
  const lap = sample.lap;
  return (
    Boolean(lap.sector1Time) ||
    Boolean(lap.sector2Time) ||
    Boolean(lap.sector3Time) ||
    Boolean(lap.lastSector1Time) ||
    Boolean(lap.lastSector2Time) ||
    Boolean(lap.lastSector3Time)
  );
}

function getReferenceDeltaTone(value: number | null | undefined) {
  if (value === null || value === undefined || Math.abs(value) < 0.0005) {
    return "neutral";
  }

  return value < 0 ? "gain" : "loss";
}

export function SectorSplitsTiles({
  sample,
  referenceDeltas,
}: {
  sample: TelemetrySample;
  referenceDeltas?: LiveReferenceSectorDeltas | null;
}) {
  if (!hasAnySectorSplit(sample)) {
    return null;
  }

  const lap = sample.lap;
  const tiles: Array<{
    label: string;
    current: string | null | undefined;
    last: string | null | undefined;
    referenceDelta: number | null | undefined;
  }> = [
    {
      label: "S1",
      current: lap.sector1Time,
      last: lap.lastSector1Time,
      referenceDelta: referenceDeltas?.sector1DeltaSeconds,
    },
    {
      label: "S2",
      current: lap.sector2Time,
      last: lap.lastSector2Time,
      referenceDelta: referenceDeltas?.sector2DeltaSeconds,
    },
    {
      label: "S3",
      current: lap.sector3Time,
      last: lap.lastSector3Time,
      referenceDelta: referenceDeltas?.sector3DeltaSeconds,
    },
  ];

  return (
    <section
      className="sector-splits"
      aria-label="Sector splits"
      data-testid="sector-splits-tiles"
    >
      {tiles.map((tile) => (
        <div key={tile.label} className="sector-split-tile">
          <span className="sector-split-label">{tile.label}</span>
          <span className="sector-split-value mono">
            {formatTime(tile.current ?? null)}
          </span>
          <span className="sector-split-last mono muted">
            last {formatTime(tile.last ?? null)}
          </span>
          {tile.referenceDelta !== null &&
            tile.referenceDelta !== undefined && (
              <span
                className={`sector-split-reference sector-split-reference-${getReferenceDeltaTone(tile.referenceDelta)} mono`}
              >
                REF {formatDeltaSeconds(tile.referenceDelta)}
              </span>
            )}
        </div>
      ))}
    </section>
  );
}

function weatherIcon(kind: string | null | undefined, size = 18) {
  const key = (kind ?? "").toLowerCase();
  if (key.includes("storm") || key.includes("thunder")) {
    return <CloudLightning size={size} aria-hidden />;
  }
  if (key.includes("heavy") && key.includes("rain")) {
    return <CloudRain size={size} aria-hidden />;
  }
  if (
    key.includes("rain") ||
    key.includes("drizzle") ||
    key.includes("light")
  ) {
    return <CloudDrizzle size={size} aria-hidden />;
  }
  if (key.includes("fog") || key.includes("mist")) {
    return <CloudFog size={size} aria-hidden />;
  }
  if (key.includes("overcast") || key.includes("cloud")) {
    return key.includes("partly") || key.includes("scattered") ? (
      <CloudSun size={size} aria-hidden />
    ) : (
      <Cloud size={size} aria-hidden />
    );
  }
  if (key.includes("clear") || key.includes("sun")) {
    return <Sun size={size} aria-hidden />;
  }
  return <Cloud size={size} aria-hidden />;
}

function weatherTone(rainPct: number | null | undefined): Severity {
  if (rainPct === null || rainPct === undefined) return "na";
  if (rainPct >= 60) return "danger";
  if (rainPct >= 25) return "warn";
  return "ok";
}

export function WeatherForecastStrip({ sample }: { sample: TelemetrySample }) {
  const forecast = sample.weatherForecast;
  if (!forecast || forecast.samples.length === 0) {
    return null;
  }

  return (
    <section
      className="weather-forecast"
      aria-label="Weather forecast"
      data-testid="weather-forecast-strip"
    >
      <div className="weather-forecast-header">
        <span className="zone-kicker">Forecast</span>
        <span className="zone-source">
          {forecast.samples.length} sample
          {forecast.samples.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="weather-forecast-row">
        {forecast.samples.map((entry, index) => {
          const tone = weatherTone(entry.rainPercent);
          return (
            <div
              key={`${entry.minutesAhead ?? "?"}-${index}`}
              className={`weather-forecast-cell weather-forecast-tone-${tone}`}
            >
              <div className="weather-forecast-cell-head">
                <span className="weather-forecast-icon">
                  {weatherIcon(entry.weather)}
                </span>
                <span className="weather-forecast-minute mono">
                  {entry.minutesAhead === null ||
                  entry.minutesAhead === undefined
                    ? "—"
                    : `+${entry.minutesAhead}m`}
                </span>
              </div>
              <span className="weather-forecast-kind">
                {entry.weather ?? "—"}
              </span>
              <div className="weather-forecast-rain">
                <div className="weather-forecast-rain-bar" aria-hidden>
                  <div
                    className={`weather-forecast-rain-fill sev-${tone}`}
                    style={{ width: `${clampPct(entry.rainPercent)}%` }}
                  />
                </div>
                <span className="weather-forecast-rain-label mono">
                  rain {formatNumber(entry.rainPercent, 0)}%
                </span>
              </div>
              <span className="weather-forecast-meta mono muted">
                trk {formatNumber(entry.trackTemperatureC, 0)}° · air{" "}
                {formatNumber(entry.airTemperatureC, 0)}°
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type CollapsiblePanelProps = {
  kicker: string;
  title: string;
  accent?: "cyan" | "amber" | "magenta" | "violet" | "green";
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testId?: string;
};

function CollapsiblePanel({
  kicker,
  title,
  accent = "cyan",
  summary,
  defaultOpen = false,
  children,
  testId,
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      className={`collapsible-panel collapsible-panel-accent-${accent}${
        isOpen ? " collapsible-panel-open" : ""
      }`}
      data-testid={testId}
    >
      <button
        type="button"
        className="collapsible-panel-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="collapsible-panel-icon" aria-hidden="true">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="zone-kicker">{kicker}</span>
        <span className="collapsible-panel-title">{title}</span>
        {summary !== undefined && (
          <span className="collapsible-panel-summary">{summary}</span>
        )}
      </button>
      {isOpen && <div className="collapsible-panel-body">{children}</div>}
    </section>
  );
}

type DamageRow = { label: string; value: number | null | undefined };

function damageBar(value: number | null | undefined) {
  const pct = clampPct(value);
  return (
    <div className="meter" aria-hidden>
      <div
        className={`meter-fill sev-${severity(value)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function damageWorst(rows: DamageRow[]) {
  let worst = -1;
  let label: string | null = null;
  for (const row of rows) {
    const value = row.value;
    if (value === null || value === undefined) continue;
    if (value > worst) {
      worst = value;
      label = row.label;
    }
  }
  if (worst < 0 || label === null) return null;
  return { value: worst, label };
}

export function DamagePanel({ sample }: { sample: TelemetrySample }) {
  const damage = sample.damage;
  if (!damage) {
    return null;
  }

  const aero: DamageRow[] = [
    { label: "FL wing", value: damage.frontLeftWingPercent },
    { label: "FR wing", value: damage.frontRightWingPercent },
    { label: "Rear wing", value: damage.rearWingPercent },
    { label: "Floor", value: damage.floorPercent },
    { label: "Diffuser", value: damage.diffuserPercent },
    { label: "Sidepod", value: damage.sidepodPercent },
  ];
  const power: DamageRow[] = [
    { label: "Engine", value: damage.enginePercent },
    { label: "Gearbox", value: damage.gearboxPercent },
  ];

  const corners: Array<{
    corner: string;
    tyre: number | null | undefined;
    brake: number | null | undefined;
  }> = [
    {
      corner: "FL",
      tyre: damage.frontLeftTyreDamage?.damagePercent,
      brake: damage.frontLeftBrakeDamage?.damagePercent,
    },
    {
      corner: "FR",
      tyre: damage.frontRightTyreDamage?.damagePercent,
      brake: damage.frontRightBrakeDamage?.damagePercent,
    },
    {
      corner: "RL",
      tyre: damage.rearLeftTyreDamage?.damagePercent,
      brake: damage.rearLeftBrakeDamage?.damagePercent,
    },
    {
      corner: "RR",
      tyre: damage.rearRightTyreDamage?.damagePercent,
      brake: damage.rearRightBrakeDamage?.damagePercent,
    },
  ];

  const allRows: DamageRow[] = [
    ...aero,
    ...power,
    ...corners.flatMap((c) => [
      { label: `${c.corner} tyre`, value: c.tyre },
      { label: `${c.corner} brake`, value: c.brake },
    ]),
  ];
  const worst = damageWorst(allRows);
  const summary =
    worst === null ? (
      <span className="collapsible-panel-summary-text muted mono">no data</span>
    ) : worst.value <= 0 ? (
      <span className="collapsible-panel-summary-pill sev-ok mono">OK</span>
    ) : (
      <span
        className={`collapsible-panel-summary-pill sev-${severity(worst.value)} mono`}
        title={`Worst: ${worst.label}`}
      >
        worst {Math.round(worst.value)}%
      </span>
    );

  return (
    <CollapsiblePanel
      kicker="Damage"
      title="Body, tyres, brakes"
      accent="amber"
      summary={summary}
      testId="damage-panel"
    >
      <div className="damage-section">
        <h4 className="damage-section-heading">Powertrain</h4>
        <div className="damage-bars damage-bars-power">
          {power.map((row) => (
            <DamageBarRow key={row.label} row={row} emphasized />
          ))}
        </div>
      </div>
      <div className="damage-section">
        <h4 className="damage-section-heading">Aero &amp; body</h4>
        <div className="damage-bars">
          {aero.map((row) => (
            <DamageBarRow key={row.label} row={row} />
          ))}
        </div>
      </div>
      <div className="damage-section">
        <h4 className="damage-section-heading">Corners</h4>
        <div className="damage-corners">
          {corners.map((c) => (
            <div key={c.corner} className="damage-corner">
              <span className="damage-corner-label mono">{c.corner}</span>
              <div className="damage-corner-bars">
                <div className="damage-corner-line">
                  <span className="damage-corner-line-label">Tyre</span>
                  {damageBar(c.tyre)}
                  <span className="damage-corner-line-value mono">
                    {formatPct(c.tyre)}
                  </span>
                </div>
                <div className="damage-corner-line">
                  <span className="damage-corner-line-label">Brake</span>
                  {damageBar(c.brake)}
                  <span className="damage-corner-line-value mono">
                    {formatPct(c.brake)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapsiblePanel>
  );
}

function DamageBarRow({
  row,
  emphasized,
}: {
  row: DamageRow;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`damage-bar-row${emphasized ? " damage-bar-row-emphasized" : ""}`}
    >
      <span className="damage-bar-label">{row.label}</span>
      {damageBar(row.value)}
      <span className={`damage-bar-value mono sev-${severity(row.value)}-text`}>
        {formatPct(row.value)}
      </span>
    </div>
  );
}

export function ErsPanel({ sample }: { sample: TelemetrySample }) {
  const power = sample.powerUnit;
  if (!power) {
    return null;
  }

  const storeMJ = formatMJ(power.ersStoreJoules);
  const deployedMJ = formatMJ(power.ersDeployedThisLapJoules);
  const mgukMJ = formatMJ(power.ersHarvestedThisLapMguk);
  const mguhMJ = formatMJ(power.ersHarvestedThisLapMguh);
  const storePct =
    storeMJ === null
      ? null
      : Math.max(
          0,
          Math.min(100, (storeMJ / (ERS_MAX_JOULES / 1_000_000)) * 100),
        );

  const summary = (
    <span className="collapsible-panel-summary-text mono">
      {storeMJ === null ? "—" : `${storeMJ.toFixed(2)} MJ store`}
    </span>
  );

  return (
    <CollapsiblePanel
      kicker="ERS"
      title="Power unit"
      accent="cyan"
      summary={summary}
      testId="ers-panel"
    >
      <div className="ers-store">
        <div className="ers-store-head">
          <span className="ers-store-label">Store</span>
          <span className="ers-store-value mono">
            {storeMJ === null ? "—" : `${storeMJ.toFixed(2)} MJ`}
            <span className="ers-store-max mono muted">
              {" "}
              / {(ERS_MAX_JOULES / 1_000_000).toFixed(0)}.00
            </span>
          </span>
        </div>
        <div className="ers-store-bar" aria-hidden>
          <div
            className="ers-store-bar-fill"
            style={{ width: `${storePct ?? 0}%` }}
          />
        </div>
      </div>
      <div className="ers-stats">
        <ErsStat label="Deployed" valueMJ={deployedMJ} tone="amber" icon />
        <ErsStat label="MGU-K" valueMJ={mgukMJ} tone="green" />
        <ErsStat label="MGU-H" valueMJ={mguhMJ} tone="cyan" />
      </div>
      <div className="ers-mode-row">
        <span className="ers-cell-label">Mode</span>
        <span className="ers-mode-value mono">
          {power.ersDeployMode ?? "—"}
        </span>
      </div>
    </CollapsiblePanel>
  );
}

function ErsStat({
  label,
  valueMJ,
  tone,
  icon,
}: {
  label: string;
  valueMJ: number | null;
  tone: "amber" | "green" | "cyan";
  icon?: boolean;
}) {
  return (
    <div className={`ers-stat ers-stat-${tone}`}>
      <span className="ers-stat-label">
        {icon && <Zap size={11} aria-hidden />} {label}
      </span>
      <span className="ers-stat-value mono">
        {valueMJ === null ? "—" : `${valueMJ.toFixed(2)} MJ`}
      </span>
    </div>
  );
}
