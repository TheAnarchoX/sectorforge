import type { CSSProperties } from "react";
import type { ConnectionState, TelemetryRunMode } from "../../types/telemetry";

type StripCellTone = "neutral" | "accent" | "warning" | "success" | "danger";

export function ErrorBanner({
  title,
  message,
  tone = "error",
}: {
  title: string;
  message: string;
  tone?: "error" | "warning";
}) {
  return (
    <div className={`error-banner error-banner-${tone}`} role="alert">
      <div className="error-banner-title">{title}</div>
      <p className="error-banner-message">{message}</p>
    </div>
  );
}

export function StateNotice({
  title,
  message,
  tone = "neutral",
}: {
  title: string;
  message: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <section
      className={`state-notice state-notice-${tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="state-notice-title">{title}</div>
      <p className="state-notice-message">{message}</p>
    </section>
  );
}

export function StatusPill({
  label,
  state,
}: {
  label: string;
  state: ConnectionState;
}) {
  const dotClass =
    state === "connected"
      ? "live"
      : state === "reconnecting" || state === "connecting"
        ? "warn"
        : "stop";

  return (
    <div className="status-pill">
      <span className={`status-dot ${dotClass}`} />
      <span className="status-pill-label">{label}</span>
      <span className="status-pill-value">{state}</span>
    </div>
  );
}

export function ModePill({
  mode,
  isRunning,
}: {
  mode: TelemetryRunMode;
  isRunning: boolean;
}) {
  const dotClass = !isRunning ? "stop" : mode === "Replay" ? "warn" : "live";

  return (
    <div className="status-pill">
      <span className={`status-dot ${dotClass}`} />
      <span className="status-pill-label">Mode</span>
      <span className="status-pill-value">{isRunning ? mode : "Idle"}</span>
    </div>
  );
}

export function StripCell({
  label,
  value,
  unit,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: StripCellTone;
}) {
  return (
    <div className={`strip-cell strip-cell-${tone}`}>
      <div className="strip-label">{label}</div>
      <div className="strip-value mono">{value}</div>
      <div className="strip-unit">{unit}</div>
    </div>
  );
}

export function TraceLane({
  label,
  value,
  unit,
  values,
  min,
  max,
  color,
  centerValue,
}: {
  label: string;
  value: string;
  unit: string;
  values: number[];
  min: number;
  max: number;
  color: string;
  centerValue?: number;
}) {
  const width = 760;
  const height = 58;
  const paddingX = 10;
  const paddingY = 6;
  const laneStyle = { "--trace-color": color } as CSSProperties;

  let polylinePoints = "";
  let centerLineY: number | null = null;

  if (values.length > 1) {
    const range = Math.max(1, max - min);
    const xStep = (width - paddingX * 2) / Math.max(1, values.length - 1);
    polylinePoints = values
      .map((nextValue, index) => {
        const x = paddingX + index * xStep;
        const normalized = (nextValue - min) / range;
        const y = height - paddingY - normalized * (height - paddingY * 2);

        return `${x},${y}`;
      })
      .join(" ");

    if (centerValue !== undefined) {
      const centerNormalized = (centerValue - min) / range;
      centerLineY =
        height - paddingY - centerNormalized * (height - paddingY * 2);
    }
  }

  return (
    <div className="trace-lane" style={laneStyle}>
      <div className="trace-label-block">
        <div className="trace-label">{label}</div>
        <div className="trace-label-unit">{unit}</div>
      </div>

      <div className="trace-canvas-wrap">
        {values.length < 2 ? (
          <div className="trace-empty">Awaiting trace data</div>
        ) : (
          <svg
            className="trace-canvas"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${label} trace`}
          >
            {[0.25, 0.5, 0.75].map((line) => (
              <line
                key={line}
                className="trace-grid-line"
                x1={paddingX}
                x2={width - paddingX}
                y1={paddingY + (height - paddingY * 2) * line}
                y2={paddingY + (height - paddingY * 2) * line}
              />
            ))}
            {centerLineY !== null && (
              <line
                className="trace-center-line"
                x1={paddingX}
                x2={width - paddingX}
                y1={centerLineY}
                y2={centerLineY}
              />
            )}
            <polyline className="trace-line" points={polylinePoints} />
          </svg>
        )}
      </div>

      <div className="trace-reading mono">
        <span className="trace-reading-value">{value}</span>
        <span className="trace-reading-unit">{unit}</span>
      </div>
    </div>
  );
}
