import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TelemetrySource } from "../../types/telemetry";

type AdapterSetupGuide = {
  /** Title shown above the in-game settings list. */
  inGameTitle: string;
  /** Numbered/bulleted in-game configuration steps. */
  inGameSteps: string[];
  /** Config keys that need to be flipped in `appsettings*.json`. */
  configKeys: Array<{ key: string; value: string; note?: string }>;
  /** Network or filesystem requirements (ports, bind address, files). */
  requirements: string[];
  /** Known limitations or warnings. */
  limitations?: string[];
};

const ADAPTER_GUIDES: Record<string, AdapterSetupGuide> = {
  fake: {
    inGameTitle: "No game required",
    inGameSteps: [
      "The fake adapter runs entirely inside SectorForge and emits a synthetic 60 Hz stream.",
      "Use it to validate the dashboard, replay, and storage paths without launching a sim.",
    ],
    configKeys: [
      { key: "Adapters:fake:Enabled", value: "true", note: "Default" },
      {
        key: "Adapters:fake:SampleRateHz",
        value: "60",
        note: "Optional override (Hz)",
      },
    ],
    requirements: ["No external ports, files, or game install."],
  },
  "f1-25-udp": {
    inGameTitle: "EA Sports F1 25 — Settings → Telemetry Settings",
    inGameSteps: [
      "Set 'UDP Telemetry' to On.",
      "Set 'UDP Broadcast Mode' to Off (use direct IP) unless you also need other receivers.",
      "Set 'UDP IP Address' to 127.0.0.1 if SectorForge runs on the same PC, or to the LAN IP of the SectorForge host.",
      "Set 'UDP Port' to 20777 (or change it on both sides).",
      "Set 'UDP Send Rate' to 60 Hz for full-fidelity car telemetry.",
      "Set 'UDP Format' to '2025'.",
      "Leave 'Your Telemetry' set to Public so all packets, including car status and damage, are emitted.",
    ],
    configKeys: [
      { key: "Adapters:f1-25-udp:Enabled", value: "true" },
      {
        key: "Adapters:f1-25-udp:BindAddress",
        value: "0.0.0.0",
        note: "Use 127.0.0.1 for local-only, 0.0.0.0 for LAN",
      },
      { key: "Adapters:f1-25-udp:Port", value: "20777" },
      {
        key: "Collector:AutoStart",
        value: "true",
        note: "Optional: auto-start with the API",
      },
      {
        key: "Collector:AdapterId",
        value: "f1-25-udp",
        note: "Required when AutoStart is true",
      },
    ],
    requirements: [
      "Inbound UDP on the configured port must not be blocked by Windows Firewall.",
      "F1 25 must be running on the same network as the SectorForge host.",
    ],
    limitations: [
      "Optional channel groups (damage, ERS, weather forecast, multi-participant timing) populate only after their source packet has arrived for the current session.",
      "Team and car display names are placeholders until the normalized model carries F1-specific identifiers.",
    ],
  },
  "acc-shared-memory": {
    inGameTitle: "Assetto Corsa Competizione — runs locally only",
    inGameSteps: [
      "Launch ACC at least once so the shared memory blocks are created.",
      "Drive a session (practice / hotlap / race); telemetry is published while the session is loaded.",
    ],
    configKeys: [{ key: "Adapters:acc-shared-memory:Enabled", value: "true" }],
    requirements: [
      "SectorForge must run on the same Windows machine as ACC (shared memory is process-local).",
      "No firewall changes required.",
    ],
    limitations: [
      "Placeholder adapter — no parsing implemented yet. Enabling it currently reports NotImplemented through collector status.",
    ],
  },
  "ams2-project-cars": {
    inGameTitle: "Automobilista 2 — Options → Gameplay → Shared Memory / UDP",
    inGameSteps: [
      "Set 'Shared Memory' to 'Project CARS 2' (the AMS2 mode used by SectorForge).",
      "If using UDP, set 'UDP Frequency' to 1 (every frame) and 'UDP Protocol Version' to 'Project CARS 2'.",
      "Set the UDP IP/port to match SectorForge's BindAddress and Port.",
    ],
    configKeys: [
      { key: "Adapters:ams2-project-cars:Enabled", value: "true" },
      {
        key: "Adapters:ams2-project-cars:BindAddress",
        value: "127.0.0.1",
      },
      { key: "Adapters:ams2-project-cars:Port", value: "5606" },
    ],
    requirements: [
      "Inbound UDP on the configured port must be allowed.",
      "AMS2 telemetry export must remain enabled for the entire session.",
    ],
    limitations: [
      "Placeholder adapter — packet parsing is not implemented yet; enabling it surfaces NotImplemented through collector status.",
    ],
  },
  "lmu-plugin-udp": {
    inGameTitle: "Le Mans Ultimate — rFactor 2 plugin or UDP JSON bridge",
    inGameSteps: [
      "Install a rFactor 2-compatible telemetry plugin into LMU's Plugins folder (e.g. one that exposes UDP JSON).",
      "Configure the plugin to send to the SectorForge host's BindAddress and Port.",
      "Restart LMU after installing or updating the plugin.",
    ],
    configKeys: [
      { key: "Adapters:lmu-plugin-udp:Enabled", value: "true" },
      { key: "Adapters:lmu-plugin-udp:BindAddress", value: "127.0.0.1" },
      { key: "Adapters:lmu-plugin-udp:Port", value: "32789" },
    ],
    requirements: [
      "A working LMU telemetry plugin is required; SectorForge does not ship one.",
      "Inbound UDP on the configured port must be allowed.",
    ],
    limitations: [
      "Placeholder adapter — payload parsing is not implemented yet; enabling it surfaces NotImplemented through collector status.",
    ],
  },
};

const FALLBACK_GUIDE: AdapterSetupGuide = {
  inGameTitle: "Adapter-specific instructions are not documented yet",
  inGameSteps: [
    "Check docs/game-adapters.md and the adapter's README in src/SectorForge.Collector/Adapters for current setup notes.",
  ],
  configKeys: [],
  requirements: [],
};

type AdapterRowProps = {
  adapter: TelemetrySource;
  isActive: boolean;
  isCollectorRunning: boolean;
  isBusy: boolean;
  onStartAdapter: (adapterId: string) => void;
  onStopAdapter: () => void;
};

function AdapterRow({
  adapter,
  isActive,
  isCollectorRunning,
  isBusy,
  onStartAdapter,
  onStopAdapter,
}: AdapterRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const guide = ADAPTER_GUIDES[adapter.adapterId] ?? FALLBACK_GUIDE;
  const detailRowId = `adapter-detail-${adapter.adapterId}`;
  const isAdapterActive = isActive && isCollectorRunning;
  const stateLabel = isAdapterActive ? "Active" : adapter.status;
  const isNotImplemented = adapter.status === "NotImplemented";
  const isOffline = adapter.status === "Offline";
  const startDisabled = isBusy || isNotImplemented;
  const stopDisabled = isBusy;
  const startTitle = isNotImplemented
    ? "Adapter is registered but not implemented yet."
    : isOffline
      ? `Adapter is currently disabled in configuration. Starting will attempt to bind anyway, but will fail until ${adapter.adapterId} is enabled in appsettings.`
      : isCollectorRunning && !isActive
        ? "Switches the collector to this adapter (stops the active one first)."
        : `Start the ${adapter.displayName} adapter.`;

  return (
    <>
      <tr
        className={[
          "adapter-row",
          isOpen ? "adapter-row-open" : null,
          isAdapterActive ? "table-row-active" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid={`adapter-row-${adapter.adapterId}`}
      >
        <td>
          <button
            type="button"
            className="adapter-row-toggle"
            aria-expanded={isOpen}
            aria-controls={detailRowId}
            onClick={() => setIsOpen((current) => !current)}
          >
            <span className="adapter-row-toggle-icon" aria-hidden="true">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="adapter-row-name">{adapter.displayName}</span>
            <span className="adapter-row-id mono muted">
              {adapter.adapterId}
            </span>
          </button>
        </td>
        <td>{adapter.inputKind}</td>
        <td>
          <span
            className={`status-chip status-chip-${stateLabel.toLowerCase()}`}
          >
            {stateLabel}
          </span>
        </td>
        <td className="adapter-row-actions">
          {isAdapterActive ? (
            <button
              type="button"
              className="adapter-row-button adapter-row-button-stop"
              onClick={onStopAdapter}
              disabled={stopDisabled}
              data-testid={`adapter-stop-${adapter.adapterId}`}
              title={`Stop the ${adapter.displayName} adapter.`}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="adapter-row-button adapter-row-button-start"
              onClick={() => onStartAdapter(adapter.adapterId)}
              disabled={startDisabled}
              data-testid={`adapter-start-${adapter.adapterId}`}
              title={startTitle}
            >
              {isCollectorRunning ? "Switch" : "Start"}
            </button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr
          id={detailRowId}
          className="adapter-row-detail"
          data-testid={`adapter-detail-${adapter.adapterId}`}
        >
          <td colSpan={4}>
            <div className="adapter-setup">
              <section className="adapter-setup-section">
                <h4 className="adapter-setup-heading">{guide.inGameTitle}</h4>
                {guide.inGameSteps.length > 0 && (
                  <ol className="adapter-setup-list">
                    {guide.inGameSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
              </section>

              {guide.configKeys.length > 0 && (
                <section className="adapter-setup-section">
                  <h4 className="adapter-setup-heading">
                    SectorForge configuration
                  </h4>
                  <table className="dense-table adapter-setup-config">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guide.configKeys.map((entry) => (
                        <tr key={entry.key}>
                          <td className="mono">{entry.key}</td>
                          <td className="mono">{entry.value}</td>
                          <td className="muted">{entry.note ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="adapter-setup-hint muted">
                    Edit <code>src/SectorForge.Api/appsettings.json</code> (or{" "}
                    <code>appsettings.Development.json</code>) and restart the
                    API. Environment variables like{" "}
                    <code>Adapters__{adapter.adapterId}__Enabled=true</code>{" "}
                    work too.
                  </p>
                </section>
              )}

              {guide.requirements.length > 0 && (
                <section className="adapter-setup-section">
                  <h4 className="adapter-setup-heading">Requirements</h4>
                  <ul className="adapter-setup-list">
                    {guide.requirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              {guide.limitations && guide.limitations.length > 0 && (
                <section className="adapter-setup-section">
                  <h4 className="adapter-setup-heading">Current limitations</h4>
                  <ul className="adapter-setup-list">
                    {guide.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              {adapter.notes && (
                <section className="adapter-setup-section">
                  <h4 className="adapter-setup-heading">Adapter notes</h4>
                  <p>{adapter.notes}</p>
                </section>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

type AdapterSetupTableProps = {
  adapters: TelemetrySource[];
  activeAdapterId: string | null;
  isCollectorRunning: boolean;
  isBusy: boolean;
  onStartAdapter: (adapterId: string) => void;
  onStopAdapter: () => void;
};

export function AdapterSetupTable({
  adapters,
  activeAdapterId,
  isCollectorRunning,
  isBusy,
  onStartAdapter,
  onStopAdapter,
}: AdapterSetupTableProps) {
  return (
    <table className="dense-table adapter-table adapters-workspace-table">
      <thead>
        <tr>
          <th>Adapter</th>
          <th>Input</th>
          <th>State</th>
          <th>Control</th>
        </tr>
      </thead>
      <tbody>
        {adapters.map((adapter) => (
          <AdapterRow
            key={adapter.adapterId}
            adapter={adapter}
            isActive={activeAdapterId === adapter.adapterId}
            isCollectorRunning={isCollectorRunning}
            isBusy={isBusy}
            onStartAdapter={onStartAdapter}
            onStopAdapter={onStopAdapter}
          />
        ))}
      </tbody>
    </table>
  );
}
