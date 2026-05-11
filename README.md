# SectorForge

<!-- markdownlint-disable MD033 -->

<p align="center">
   <img src="docs/assets/sectorforge-mark.svg" alt="SectorForge logo" width="72" />
   <img src="docs/assets/sectorforge-wordmark.svg" alt="SectorForge wordmark" width="360" />
</p>

<p align="center">
   <a href="https://github.com/TheAnarchoX/sectorforge/actions/workflows/ci.yml">
      <img src="https://github.com/TheAnarchoX/sectorforge/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" />
   </a>
   <a href="tests/coverage/README.md">
      <img src="https://img.shields.io/badge/coverage-94.13%25%20overall-brightgreen" alt="Coverage 94.13% overall" />
   </a>
   <a href="LICENSE">
      <img src="https://img.shields.io/badge/license-Non--Commercial-0f172a" alt="License Non-Commercial" />
   </a>
</p>

SectorForge is a Windows-first, local-first telemetry and race analysis app for sim racing. The current slice pairs a native .NET collector and local API with SignalR live telemetry, SQLite session storage, replay controls, a React/Vite dashboard, and a config-gated F1 25 UDP beta path.

Docker, WSL, admin rights, and a running sim are not required for the current MVP. The fake adapter starts automatically through the normal dev script so contributors can work on the runtime, storage, and UI without needing real game telemetry. F1 25 UDP can be enabled manually when the game is configured to send telemetry to SectorForge.

## Quick Look

- Native .NET collector and adapter boundary for fake, UDP, shared memory, plugin, or replay inputs.
- Local ASP.NET Core API with SignalR live telemetry, REST collector controls, replay controls, and SQLite-backed session storage.
- React/Vite dashboard with dedicated Live, Driver, Sessions, Compare, and Adapters workspaces.
- Live reference analysis that can compare the current lap against a stored lap through the same lap-channel data used by Compare.
- Config-gated F1 25 UDP beta path with player-car telemetry and optional session, tyre, ERS, damage, weather, and participant timing channels.

## Feature Tour

### 🟢 Live Pitwall

The default workspace is the pitwall console for the active telemetry stream. It shows the current session band, lap timing strip, speed/RPM/gear/fuel readings, current-lap graph, rolling trace lanes for speed, RPM, gear, throttle, brake, and steering, plus a sidebar for strategy, thermal, field, and collector status.

When an adapter publishes richer optional channels, the Live workspace adds driver flags, sector split tiles, lap-valid state, damage, ERS, and weather forecast panels without requiring game-specific UI branches.

<p align="center">
   <img src="artifacts/screenshot-live-pitwall-collapsed-f125.png" alt="SectorForge Live pitwall with F1 25 optional panels collapsed" width="49%" />
   <img src="artifacts/screenshot-live-pitwall-expanded-f125.png" alt="SectorForge Live pitwall with F1 25 optional panels expanded" width="49%" />
</p>

### 🏁 Driver HUD

The Driver workspace is a glanceable cockpit view for a secondary screen. It emphasizes shift lights, speed, gear, RPM, lap time, delta, best lap, position, active sector, fuel, remaining session time, throttle/brake/steering inputs, and tyre/brake thermal strips. It also includes a driver-focused lap compare view that can line the current lap up against a stored reference.

<p align="center">
   <img src="artifacts/screenshot-driver-dashboard.png" alt="SectorForge Driver HUD dashboard" width="920" />
</p>

### ⏱️ Sessions And Replays

The Sessions workspace is the local capture review area. It lists stored sessions, loads capture details, shows overview metrics and charts, supports search and sorting, exposes lap tables, and lets laps be pinned for Compare or marked as a Live reference.

<p align="center">
   <img src="artifacts/screenshot-sessions.png" alt="SectorForge Sessions workspace" width="920" />
</p>

Stored captures can be replayed back through the dashboard. Replay playback drives the same Live and Driver views as real telemetry, with play/pause, timeline scrub, sample progress, and a docked control surface when replay is active outside the Sessions workspace.

<p align="center">
   <img src="artifacts/screenshot-replay.png" alt="SectorForge replay controls and dashboard playback" width="920" />
</p>

### 📊 Compare Workspace

Compare is the lap analysis workbench. Pin laps from Sessions, choose the reference lap, and compare up to the basket limit across one or more overlay charts. Current overlay channels include speed, RPM, throttle, brake, and steering, with distance alignment when lap-distance data is available and time fallback for older captures.

The workspace includes add/remove chart controls, synchronized distance cursors, X/Y zoom and pan, delta-time traces against the reference lap, sector split tables, cursor readouts, telemetry annotations, and JSON import/export for comparison sets and notes.

<p align="center">
   <img src="artifacts/screenshot-compare.png" alt="SectorForge Compare workspace with lap overlays and delta analysis" width="920" />
</p>

<!-- markdownlint-enable MD033 -->

### 🔌 Adapters And Collector

The Adapters workspace shows the local telemetry input registry and collector state. The fake adapter is the default development path and autostarts through `tools\dev.ps1`. The F1 25 UDP adapter is implemented as an opt-in beta, while ACC shared memory, AMS2, and LMU inputs are present as disabled placeholders until their parser work is ready.

## Setup

### Prerequisites

- Windows 11 or Windows 10
- .NET SDK 10.0.203 or newer 10.0 feature release
- Node.js 24 or current LTS
- `npx` from npm
- Optional: global `pnpm`; scripts fall back to `npx pnpm@latest`

### Local Development

1. Clone the repo and open it in PowerShell.

   ```powershell
   git clone https://github.com/TheAnarchoX/sectorforge.git
   Set-Location .\sectorforge
   ```

2. Start the local API and dashboard.

   ```powershell
   .\tools\dev.ps1
   ```

   `tools\dev.ps1` installs frontend dependencies automatically when `src\SectorForge.Web\node_modules` is missing. Pass `-NoInstall` if dependencies are already present and you want to skip that check.

3. Open `http://localhost:5173`. The API listens on `http://localhost:5221` and autostarts the fake telemetry adapter.

4. If either default port is occupied, rerun with explicit ports.

   ```powershell
   .\tools\dev.ps1 -ApiPort 5222 -WebPort 5174
   ```

5. Before opening a pull request, run the local quality gate.

   ```powershell
   .\tools\verify.ps1
   ```

Useful local commands:

```powershell
.\tools\verify.ps1
.\tests\coverage\Invoke-Coverage.ps1
npx --yes pnpm@10.33.2 --dir .\src\SectorForge.Web test:coverage
dotnet test .\src\SectorForge.slnx
.\tools\format.ps1
.\tools\clean.ps1
.\tools\clean.ps1 -Full
```

`tools\verify.ps1` runs the full local quality gate: backend tests, .NET format verification, frontend lint, and frontend build. `tests\coverage\Invoke-Coverage.ps1` generates merged Cobertura and HTML coverage reports under `artifacts\coverage\report` and enforces the backend thresholds from `tests\coverage\coverage-thresholds.json`. The frontend coverage command writes HTML/Cobertura output to `artifacts\coverage\frontend` and enforces the 83% frontend line gate. The current frontend baseline is 83.77% line coverage.

### Common Settings

The API host reads its runtime configuration from `src\SectorForge.Api\appsettings.json` (and the matching `appsettings.Development.json`). All values can be overridden with environment variables (e.g. `Adapters__fake__SampleRateHz=30`) or `--Section:Key=value` command-line flags.

| Setting | Default | Purpose |
| --- | --- | --- |
| `Collector:AutoStart` | `false` | Start the collector automatically with `Collector:AdapterId` when the API host boots. |
| `Collector:AdapterId` | `fake` | Adapter id selected when autostart is enabled. |
| `Storage:RetainedSampleBlobLimit` | `120000` | Per-session raw sample blob cap; older blobs are pruned, summaries are kept. |
| `Adapters:<id>:Enabled` | `true` for `fake`, `false` for real-game adapters | Enable flag per adapter id (e.g. `fake`, `f1-25-udp`, `acc-shared-memory`, `ams2-project-cars`, `lmu-plugin-udp`). |
| `Adapters:fake:SampleRateHz` | `60` | Fake adapter emit rate in Hertz. |
| `Adapters:<id>:BindAddress` | `127.0.0.1` for UDP adapters | UDP/socket bind address for adapters that bind a listener. |
| `Adapters:<id>:Port` | adapter-specific (e.g. `20777` for `f1-25-udp`) | UDP/socket port for adapters that bind a listener. |
| `Adapters:<id>:ReceiveBufferBytes` | OS default | Optional UDP socket receive buffer override. |

### F1 25 UDP Beta

The `f1-25-udp` adapter is implemented but opt-in. It listens for F1 25 UDP packets, publishes normalized player-car samples, and fills optional channel groups when their source packets have arrived: motion and g-force data, lap timing, sector splits, driver flags, tyres, ERS, damage, weather forecast, safety-car/session status, and participant timing.

The adapter stays disabled by default so local development remains game-free. Missing optional packets leave their `TelemetrySample` fields `null`, unsupported packet IDs are skipped, and bind or parse failures surface through collector status instead of crashing the API host. Team and car display names are still generic because the normalized model does not carry F1-specific IDs yet.

For a manual F1 25 run, start the API with the F1 adapter selected and start the dashboard in a second PowerShell window:

```powershell
$env:ASPNETCORE_URLS = "http://localhost:5221"
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --project .\src\SectorForge.Api\SectorForge.Api.csproj --no-launch-profile -- `
   --Collector:AutoStart=true `
   --Collector:AdapterId=f1-25-udp `
   --Adapters:f1-25-udp:Enabled=true `
   --Adapters:f1-25-udp:BindAddress=0.0.0.0 `
   --Adapters:f1-25-udp:Port=20777
```

```powershell
$env:VITE_API_BASE_URL = "http://localhost:5221"
npx --yes pnpm@latest --dir .\src\SectorForge.Web dev --host localhost --port 5173
```

Configure F1 25 to send UDP telemetry to the machine and port SectorForge is listening on. Use `127.0.0.1` if the game and API are on the same machine; use a LAN address or `0.0.0.0` bind when receiving from another host.

### Local Development Loop

```mermaid
flowchart LR
   Dev["./tools/dev.ps1"] --> Api["SectorForge.Api<br/>http://localhost:5221"]
   Dev --> Web["Vite dashboard<br/>http://localhost:5173"]
   Api --> Fake["Fake adapter<br/>autostart"]
   Api --> Hub["SignalR<br/>/hubs/telemetry"]
   Api --> Store["SQLite<br/>session store"]
   Hub --> Browser["Live dashboard<br/>in the browser"]
   Store --> Replay["Recent capture<br/>replay"]
   Replay --> Hub
```

## Architecture Overview

```mermaid
flowchart LR
  Game["Game adapters"] --> Collector["SectorForge.Collector<br/>sample loop"]
  Fake["Fake adapter"] --> Collector
  Collector --> Core["SectorForge.Core<br/>normalized telemetry model"]
  Core --> Api["SectorForge.Api<br/>REST + SignalR"]
  Core --> Storage["SectorForge.Infrastructure<br/>SQLite session store"]
  Storage --> Replay["Replay service"]
  Replay --> Api
  Api --> Web["SectorForge.Web<br/>live dashboard + controls"]
```

The backend is the source of truth. The web UI renders state, controls the local collector, and reuses the same live publish path for replay. Game-specific parsing stays isolated inside collector adapters so packet or shared-memory layouts do not leak into the normalized model.

- `SectorForge.Core` owns the game-agnostic records, enums, and interfaces.
- `SectorForge.Collector` owns adapters, the collector loop, and fake telemetry for local development.
- `SectorForge.Api` exposes the local control plane, SignalR stream, and replay endpoints.
- `SectorForge.Infrastructure` persists sessions, lap summaries, and retained sample blobs.
- `SectorForge.Web` renders live telemetry, stored sessions, replay state, and the driver-facing views.

For the deeper runtime breakdown, see [docs/architecture.md](docs/architecture.md) and [docs/game-adapters.md](docs/game-adapters.md).

## Current Slice

| Area                    | Status                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Fake telemetry adapter  | Working 60 Hz simulated stream                                                                                       |
| ASP.NET Core API        | Health, games, sessions, collector control, replay control                                                           |
| SignalR hub             | Streams normalized telemetry samples                                                                                 |
| React dashboard         | Live pitwall, Driver HUD, Sessions, Compare, Adapters, replay dock, and F1 25 optional channel panels                |
| Live reference analysis | Stored-lap reference overlay, timing/input deltas, and sector comparison in the Live workspace                       |
| SQLite storage          | Sessions, lap summaries, lap-channel API, and raw sample blobs with retention cap                                    |
| Sessions and replay     | Stored capture review, search/sort, lap pinning, inline compare, replay playback, and timeline scrub                 |
| Compare workflow        | Lap basket, multi-chart overlays, delta plot, sector table, synchronized cursor, annotations, and JSON import/export |
| F1 25 UDP               | Beta, config-gated; player-car telemetry plus optional packet aggregation                                            |
| ACC shared memory       | Placeholder adapter                                                                                                  |
| AMS2 telemetry          | Placeholder adapter                                                                                                  |
| LMU plugin/UDP          | Placeholder adapter                                                                                                  |

The GitHub Actions workflow runs on Windows and checks merged .NET coverage thresholds, frontend Vitest coverage, .NET format verification, frontend lint, and frontend build. The coverage badge above reflects the current documented 94.13% overall line-coverage baseline from [tests/coverage/README.md](tests/coverage/README.md).

## Repository Map

```mermaid
flowchart TB
    Repo["sectorforge repo"]
    Repo --> ApiProj["src/SectorForge.Api<br/>Minimal API + SignalR"]
    Repo --> CollectorProj["src/SectorForge.Collector<br/>adapters + collector"]
    Repo --> CoreProj["src/SectorForge.Core<br/>shared telemetry model"]
    Repo --> InfraProj["src/SectorForge.Infrastructure<br/>SQLite storage"]
    Repo --> WebProj["src/SectorForge.Web<br/>React + Vite dashboard"]
    Repo --> Tests["tests/*<br/>API, core, protocol coverage"]
    Repo --> Docs["docs/*<br/>architecture, backlog, assets"]
    Repo --> Tools["tools/*.ps1<br/>dev, verify, format, clean"]
```

## More Docs

- [CONTRIBUTING.md](CONTRIBUTING.md) for local checks and contribution rules.
- [docs/architecture.md](docs/architecture.md) for runtime flow, storage, frontend guardrails, and the [compare workflow](docs/architecture.md#compare-workflow).
- [docs/game-adapters.md](docs/game-adapters.md) for adapter status, enablement notes, and limitations.
- [docs/protocol-notes.md](docs/protocol-notes.md) for protocol references and implementation decisions.
- [docs/agent-tasks.md](docs/agent-tasks.md) for the scoped backlog.
- [AGENTS.md](AGENTS.md) for repo-level coding-agent guidance.
- [tests/coverage/README.md](tests/coverage/README.md) for baseline and threshold details.

## License

SectorForge is licensed under the SectorForge Non-Commercial License. You may
use, fork, modify, and share the software and derivative works for
non-commercial purposes. You may not sell the software, sell forks or derivative
works, or otherwise use them to generate revenue. See [LICENSE](LICENSE).

Because this license restricts commercial use, SectorForge is source-available
rather than OSI-approved open source.
