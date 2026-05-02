import { Gauge, RadioTower, TimerReset } from "lucide-react";
import type {
  CollectorStatus,
  TelemetrySample,
  TelemetrySource,
} from "../../types/telemetry";
import { formatNumber, formatTime } from "../../utils/telemetryFormat";

type TelemetrySidebarProps = {
  sample: TelemetrySample | null;
  games: TelemetrySource[];
  collectorStatus: CollectorStatus | null;
};

export function TelemetrySidebar({
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

  const detailItems = [
    { label: "Session", value: sample?.session.name ?? "Awaiting telemetry" },
    { label: "Source", value: sample?.source.displayName ?? "No source" },
    { label: "Track", value: sample?.track.trackName ?? "-" },
    { label: "Weather", value: sample?.track.weather ?? "-" },
    { label: "Elapsed", value: formatTime(sample?.timing.sessionElapsed) },
    { label: "Remaining", value: formatTime(sample?.timing.sessionRemaining) },
    {
      label: "Fuel laps",
      value: formatNumber(sample?.fuel.lapsRemainingEstimate, 0),
    },
    {
      label: "Engine",
      value: `${formatNumber(sample?.vehicle.engineTemperatureC, 1)} C`,
    },
  ];

  return (
    <aside className="side-column">
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Session context</div>
            <h2 className="panel-title">Live detail rail</h2>
          </div>
          <div className="status-pill mono">
            <TimerReset size={16} />
            {formatTime(sample?.timing.sessionElapsed)}
          </div>
        </div>
        <div className="panel-body detail-grid">
          {detailItems.map((item) => (
            <div className="detail-cell" key={item.label}>
              <div className="detail-label">{item.label}</div>
              <div className="detail-value">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Thermal grid</div>
            <h2 className="panel-title">Tyre, brake, and pressure matrix</h2>
          </div>
        </div>
        <div className="table-panel-body">
          <table className="dense-table thermal-table">
            <thead>
              <tr>
                <th>Corner</th>
                <th>Tyre C</th>
                <th>Brake C</th>
                <th>Psi</th>
              </tr>
            </thead>
            <tbody>
              {thermalRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="mono">{formatNumber(row.tyre, 1)}</td>
                  <td className="mono">{formatNumber(row.brake, 1)}</td>
                  <td className="mono">{formatNumber(row.pressure, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Environmental feed</div>
            <h2 className="panel-title">Ambient and collector state</h2>
          </div>
        </div>
        <div className="panel-body detail-grid detail-grid-compact">
          <div className="detail-cell">
            <div className="detail-label">Track temp</div>
            <div className="detail-value">
              {formatNumber(sample?.track.trackTemperatureC, 1)} C
            </div>
          </div>
          <div className="detail-cell">
            <div className="detail-label">Air temp</div>
            <div className="detail-value">
              {formatNumber(sample?.track.airTemperatureC, 1)} C
            </div>
          </div>
          <div className="detail-cell">
            <div className="detail-label">Mode</div>
            <div className="detail-value">
              {collectorStatus?.runMode ?? "Idle"}
            </div>
          </div>
          <div className="detail-cell">
            <div className="detail-label">Samples</div>
            <div className="detail-value mono">
              {collectorStatus?.samplesPublished ?? 0}
            </div>
          </div>
          <div className="detail-cell">
            <div className="detail-label">Speed</div>
            <div className="detail-value">
              <Gauge size={14} /> {formatNumber(sample?.vehicle.speedKph, 0)}{" "}
              kph
            </div>
          </div>
          <div className="detail-cell">
            <div className="detail-label">Input bus</div>
            <div className="detail-value">
              <RadioTower size={14} /> {sample?.source.inputKind ?? "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Garage bus</div>
            <h2 className="panel-title">Telemetry adapters</h2>
          </div>
        </div>
        <div className="table-panel-body">
          {games.length === 0 && (
            <div className="empty-chart compact">No adapters reported</div>
          )}
          {games.length > 0 && (
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
        </div>
      </div>
    </aside>
  );
}
