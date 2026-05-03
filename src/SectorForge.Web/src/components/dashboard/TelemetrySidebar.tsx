import { memo } from "react";
import { Gauge, RadioTower } from "lucide-react";
import type {
  CollectorStatus,
  TelemetrySample,
  TelemetrySource,
} from "../../types/telemetry";
import { formatNumber } from "../../utils/telemetryFormat";

type TelemetrySidebarProps = {
  sample: TelemetrySample | null;
  games: TelemetrySource[];
  collectorStatus: CollectorStatus | null;
};

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

export const TelemetrySidebar = memo(TelemetrySidebarImpl);

function TelemetrySidebarImpl({
  sample,
  games,
  collectorStatus,
}: TelemetrySidebarProps) {
  const thermalRows = [
    {
      label: "FL",
      tyre: sample?.tyres.frontLeft?.coreC,
      brake: sample?.brakes.frontLeftTemperatureC,
      pressure: sample?.tyres.frontLeftPressurePsi,
    },
    {
      label: "FR",
      tyre: sample?.tyres.frontRight?.coreC,
      brake: sample?.brakes.frontRightTemperatureC,
      pressure: sample?.tyres.frontRightPressurePsi,
    },
    {
      label: "RL",
      tyre: sample?.tyres.rearLeft?.coreC,
      brake: sample?.brakes.rearLeftTemperatureC,
      pressure: sample?.tyres.rearLeftPressurePsi,
    },
    {
      label: "RR",
      tyre: sample?.tyres.rearRight?.coreC,
      brake: sample?.brakes.rearRightTemperatureC,
      pressure: sample?.tyres.rearRightPressurePsi,
    },
  ];

  const fuelLaps = sample?.fuel.lapsRemainingEstimate;
  const fuelL = sample?.fuel.remainingLiters;
  const fuelCap = sample?.fuel.capacityLiters;
  const fuelPct =
    fuelL !== null &&
    fuelL !== undefined &&
    fuelCap !== null &&
    fuelCap !== undefined &&
    fuelCap > 0
      ? Math.max(0, Math.min(100, (fuelL / fuelCap) * 100))
      : null;

  return (
    <aside className="side-column" aria-label="Engineer console">
      <ZoneSection kicker="Strategy" title="Fuel & stint">
        <div className="strategy-grid">
          <StrategyMetric
            label="Fuel"
            value={`${formatNumber(fuelL, 1)} L`}
            sub={
              fuelCap === null || fuelCap === undefined
                ? "capacity —"
                : `of ${formatNumber(fuelCap, 0)} L`
            }
            tone="warning"
            barPct={fuelPct}
          />
          <StrategyMetric
            label="Laps left"
            value={formatNumber(fuelLaps, 0)}
            sub="estimated"
            tone="warning"
          />
          <StrategyMetric
            label="L / lap"
            value={formatNumber(sample?.fuel.litersPerLapEstimate, 2)}
            sub="rolling"
            tone="neutral"
          />
          <StrategyMetric
            label="Engine"
            value={`${formatNumber(sample?.vehicle.engineTemperatureC, 0)}°`}
            sub="cyl head"
            tone={
              (sample?.vehicle.engineTemperatureC ?? 0) >= 110
                ? "danger"
                : "neutral"
            }
          />
        </div>
      </ZoneSection>

      <ZoneSection kicker="Thermal grid" title="Tyre · brake · pressure">
        <table className="dense-table thermal-table">
          <thead>
            <tr>
              <th>Corner</th>
              <th>Tyre °C</th>
              <th>Brake °C</th>
              <th>PSI</th>
            </tr>
          </thead>
          <tbody>
            {thermalRows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className={`mono thermal-cell-${tyreTone(row.tyre)}`}>
                  {formatNumber(row.tyre, 1)}
                </td>
                <td className={`mono thermal-cell-${brakeTone(row.brake)}`}>
                  {formatNumber(row.brake, 1)}
                </td>
                <td className="mono">{formatNumber(row.pressure, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ZoneSection>

      <ZoneSection kicker="Collector bus" title="Telemetry feed">
        <div className="bus-grid">
          <BusCell
            icon={<Gauge size={14} />}
            label="Speed"
            value={`${formatNumber(sample?.vehicle.speedKph, 0)} kph`}
          />
          <BusCell
            icon={<RadioTower size={14} />}
            label="Input"
            value={sample?.source.inputKind ?? "—"}
          />
          <BusCell label="Mode" value={collectorStatus?.runMode ?? "Idle"} />
          <BusCell
            label="Samples"
            value={(collectorStatus?.samplesPublished ?? 0).toLocaleString()}
          />
        </div>
      </ZoneSection>

      <ZoneSection kicker="Garage bus" title="Adapters">
        {games.length === 0 ? (
          <div className="empty-chart compact">No adapters reported</div>
        ) : (
          <table className="dense-table adapter-table">
            <thead>
              <tr>
                <th>Adapter</th>
                <th>Input</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.adapterId}>
                  <td>{game.displayName}</td>
                  <td>{game.inputKind}</td>
                  <td>
                    <span
                      className={`status-chip status-chip-${game.status.toLowerCase()}`}
                    >
                      {game.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ZoneSection>
    </aside>
  );
}

function ZoneSection({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="zone zone-sub">
      <div className="zone-bar">
        <div className="zone-bar-title">
          <span className="zone-kicker">{kicker}</span>
          <span className="zone-source">{title}</span>
        </div>
      </div>
      <div className="zone-body">{children}</div>
    </div>
  );
}

function StrategyMetric({
  label,
  value,
  sub,
  tone,
  barPct,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "warning" | "danger" | "success";
  barPct?: number | null;
}) {
  return (
    <div className={`strategy-cell strategy-tone-${tone}`}>
      <span className="strategy-label">{label}</span>
      <span className="strategy-value mono">{value}</span>
      <span className="strategy-sub">{sub}</span>
      {barPct !== null && barPct !== undefined && (
        <div className="strategy-bar" aria-hidden="true">
          <div className="strategy-bar-fill" style={{ width: `${barPct}%` }} />
        </div>
      )}
    </div>
  );
}

function BusCell({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bus-cell">
      <span className="bus-cell-label">{label}</span>
      <span className="bus-cell-value mono">
        {icon}
        {value}
      </span>
    </div>
  );
}
