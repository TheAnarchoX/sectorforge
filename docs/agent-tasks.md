# Agent Task Backlog

This backlog is written for coding agents and human contributors. Each task is intentionally scoped so it can be completed in one focused pass.

## How To Use This Backlog

- Pick one task at a time.
- Keep changes limited to the listed scope unless the task reveals a necessary dependency.
- Add or update tests when behavior changes.
- Keep setup Windows-first and avoid adding Docker, WSL, or admin requirements to the normal path.
- Do not paste vendor protocol text or proprietary telemetry captures into the repository.

## Agentic Workspace Files

- `AGENTS.md`: repo-level instructions loaded by coding agents.
- `.github/instructions/*.instructions.md`: targeted guidance for backend, frontend, protocol adapter, and docs changes.
- `.github/prompts/*.prompt.md`: reusable chat prompts for planning, implementing, reviewing, backlog scaffolding, and adapter scaffolding.
- `.github/agents/*.agent.md`: specialized workspace agents for implementation, backend, frontend, and protocol research.
- `.github/skills/*/SKILL.md`: reusable workflows for backlog tasks, backlog scaffolding, and game adapter work.

## Status Labels

- `ready`: clear enough to start.
- `needs-research`: gather facts first, then update the task before implementation.
- `blocked`: waiting on a user decision or external input.
- `done`: completed and validated.

## Priority 0: Repo Publication

### SF-001: Choose And Add An OSS License

- Status: `done`
- Type: governance
- Goal: Add the project license once the maintainer chooses one.
- Suggested files: `LICENSE`, `README.md`
- Notes: Maintainer approved using the best fit license on 2026-05-02. MIT was selected as a simple permissive default for an open-source local developer tool.
- Acceptance criteria:
  - `LICENSE` exists at the repo root.
  - `README.md` names the license.
  - Package metadata is consistent with the chosen license if package publishing metadata is added.

### SF-002: Add GitHub Community Health Files

- Status: `done`
- Type: open-source setup
- Goal: Add basic public repo hygiene for contributors and issue triage.
- Suggested files: `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- Notes: Added issue forms, a pull request template, a security policy, and a project-specific code of conduct on 2026-05-02.
- Acceptance criteria:
  - Bug report and feature request issue templates exist.
  - PR template asks for summary, checks run, screenshots for UI changes, and linked tasks/issues.
  - Security policy explains how to report vulnerabilities without publishing exploit details.
  - Code of conduct uses a standard community-friendly template or a concise project-specific policy.

### SF-003: Add CI Baseline

- Status: `done`
- Type: automation
- Goal: Add GitHub Actions that run the same checks contributors run locally.
- Suggested files: `.github/workflows/ci.yml`, `README.md`
- Notes: Added a Windows GitHub Actions CI baseline on 2026-05-02 with NuGet and pnpm caching.
- Acceptance criteria:
  - CI runs on pull requests and pushes to the default branch.
  - CI uses Windows runners for the primary path.
  - CI runs `dotnet test`, `dotnet format --verify-no-changes`, frontend lint, and frontend build.
  - CI caches NuGet and pnpm dependencies where practical.

### SF-004: Maintain Agentic Workspace Files

- Status: `done`
- Type: agentic workflow
- Goal: Keep repo instructions, prompts, agents, and skills aligned with the codebase as architecture changes.
- Notes: Refreshed agent, prompt, skill, and instruction guidance on 2026-05-02. Added backlog priority and task scaffolding prompts and skills. `AGENTS.md` remains the canonical always-on repo guide.
- Suggested files: `AGENTS.md`, `.github/instructions/*`, `.github/prompts/*`, `.github/agents/*`, `.github/skills/*`, `docs/agent-tasks.md`
- Acceptance criteria:
  - Customization files reference current commands, paths, and architecture.
  - Prompt and skill descriptions remain keyword-rich and discoverable.
  - No duplicate always-on instruction file is added alongside `AGENTS.md`.
  - Agent workflows remain scoped to one task at a time.

## Priority 1: Developer Experience

### SF-010: Add A Single Verify Script

- Status: `done`
- Type: DevEx
- Goal: Provide one PowerShell command that runs the full local quality gate.
- Suggested files: `tools/verify.ps1`, `README.md`, `CONTRIBUTING.md`, `.vscode/tasks.json`
- Notes: Added `tools/verify.ps1`, VS Code task wiring, and contributor/agent docs on 2026-05-02.
- Acceptance criteria:
  - `tools/verify.ps1` runs backend tests, format verification, frontend lint, and frontend build.
  - Script fails fast and exits non-zero on failure.
  - Agentic workflows made aware of changes.
  - README and VS Code tasks mention the script.

### SF-011: Harden Dev Script Port Handling

- Status: `done`
- Type: DevEx
- Goal: Make `tools/dev.ps1` handle occupied ports gracefully.
- Suggested files: `tools/dev.ps1`, `README.md`
- Notes: Hardened `tools/dev.ps1` port checks and README alternate port guidance on 2026-05-02.
- Acceptance criteria:
  - Script checks API and web ports before launching.
  - Error output names the occupied port and suggests `-ApiPort` or `-WebPort`.
  - Existing `-ApiPort`, `-WebPort`, and `-NoInstall` options still work.

### SF-012: Add VS Code Problem Matchers For Vite

- Status: `done`
- Type: VS Code
- Goal: Improve background task readiness detection and TypeScript/Vite diagnostics.
- Suggested files: `.vscode/tasks.json`
- Acceptance criteria:
  - `web: dev server` reliably transitions to ready when Vite starts.
  - TypeScript build errors appear in the Problems panel.
  - Compound launch still starts API and web together.

## Priority 2: Telemetry Runtime

### SF-020: Add Collector Start Stop Integration Tests

- Status: `done`
- Type: backend test
- Goal: Cover the collector control endpoints beyond health checks.
- Suggested files: `tests/SectorForge.Api.Tests/*`, `src/SectorForge.Api/Program.cs`
- Notes: Added a deterministic API integration test on 2026-05-02 that exercises fake collector start, status, and stop with isolated SQLite state and no sleeps.
- Acceptance criteria:
  - Test can start the fake collector through `POST /api/collector/start`.
  - Test confirms `GET /api/collector/status` reports running.
  - Test can stop the collector through `POST /api/collector/stop`.
  - Test avoids long sleeps and remains deterministic.

### SF-021: Add Bounded Sample Persistence

- Status: `done`
- Type: storage
- Goal: Avoid unbounded high-frequency sample growth during long fake telemetry runs.
- Suggested files: `src/SectorForge.Infrastructure/Storage/*`, `src/SectorForge.Api/appsettings*.json`, docs
- Notes: Added per-session raw sample blob pruning on 2026-05-02 with a configurable `Storage:RetainedSampleBlobLimit` default of 1,800. Session summaries and lap summaries remain intact when older raw blobs are trimmed.
- Acceptance criteria:
  - Storage has configurable retention or batch pruning for raw sample blobs.
  - Defaults are safe for local development.
  - Session and lap summaries are preserved when sample blobs are pruned.
  - Tests cover pruning behavior.

### SF-022: Add Live Publisher Backpressure Guard

- Status: `ready`
- Type: backend resilience
- Goal: Keep slow SignalR clients or storage work from destabilizing the collector loop.
- Suggested files: `src/SectorForge.Collector/*`, `src/SectorForge.Api/Services/*`, tests
- Acceptance criteria:
  - Collector loop remains responsive if publishing is temporarily slow.
  - Status reports dropped or skipped samples if any are intentionally dropped.
  - Tests cover publisher failure or delay behavior.

### SF-023: Add Replay Service From Stored Sessions

- Status: `done`
- Type: feature
- Goal: Allow stored session samples to be replayed through the same live stream path.
- Suggested files: `SectorForge.Core`, `SectorForge.Infrastructure`, `SectorForge.Api`, `SectorForge.Web`
- Notes: Added stored-session replay start and stop endpoints on 2026-05-02. Replay streams saved samples through the existing SignalR telemetry path, exposes replay mode through runtime status, and adds dashboard replay controls for recent sessions.
- Acceptance criteria:
  - API exposes a replay start/stop endpoint for a stored session.
  - Replay publishes normalized `TelemetrySample` messages to `/hubs/telemetry`.
  - UI can distinguish live fake telemetry from replay mode.
  - Tests cover missing session and successful replay start.

### SF-024: Testing Coverage Baseline

- Status: `done`
- Type: testing
- Goal: Add a code coverage baseline and ensure new tests are adding coverage. Goal of 90%+ overall code coverage with attention to untested files. This will help ensure the codebase remains maintainable and that new features are well-tested.
- Suggested files: `tests/coverage/*`, CI workflow updates, docs
- Notes: Added `tests/coverage/Invoke-Coverage.ps1`, GitHub Actions coverage artifact upload, and a documented 94.13% line coverage baseline on 2026-05-03. CI now enforces 93% overall line coverage plus per-file thresholds for critical runtime files.
- Acceptance criteria:
  - Code coverage reports are generated in CI and uploaded as artifacts.
  - Baseline coverage is established and documented.
  - New tests are adding to coverage, especially for untested files.
  - Coverage thresholds can be set in CI to prevent regressions.
  - Coverage target of 90%+ is met overall, with attention to critical and previously untested files.

## Priority 3: Frontend Product Slice

### SF-030: Split Dashboard Into Components

- Status: `done`
- Type: frontend maintainability
- Goal: Break the first dashboard into smaller component and API modules.
- Suggested files: `src/SectorForge.Web/src/components/*`, `src/SectorForge.Web/src/api/*`, `src/SectorForge.Web/src/types/*`
- Notes: Split the dashboard into dedicated layout/components, extracted shared telemetry types plus a `useTelemetryDashboard` hook and API module, and refreshed the UI into a denser pitwall-style console without changing the live telemetry flow.
- Acceptance criteria:
  - `App.tsx` mainly composes layout and top-level state.
  - API calls and SignalR setup are isolated in dedicated modules/hooks.
  - Type definitions are shared without circular imports.
  - No visual or behavioral regression.

### SF-031: Improve Dashboard Empty And Error States

- Status: `done`
- Type: frontend polish
- Goal: Make disconnected API, stopped collector, and no-session states feel deliberate.
- Suggested files: `src/SectorForge.Web/src/App.tsx`, `src/SectorForge.Web/src/App.css`
- Acceptance criteria:
  - API offline state is distinct from collector stopped state.
  - Start/stop buttons remain keyboard accessible.
  - Error banner text is actionable without exposing stack traces.
  - Layout remains responsive below 720px width.

### SF-032: Add Session Detail View

- Status: `done`
- Type: frontend feature
- Goal: Let users inspect a stored session from the recent captures list.
- Suggested files: `src/SectorForge.Web/src/*`, `src/SectorForge.Api/Program.cs` if API shape needs small additions
- Acceptance criteria:
  - Clicking a recent session opens a detail view or panel.
  - Detail view shows session metadata, lap summaries, and a recent speed trace.
  - Empty and loading states are clear.
  - Frontend lint and build pass.

### SF-033: Add Lap Telemetry Chart

- Status: `done`
- Type: frontend feature
- Goal: Add a simple time-series chart of lap speed or another telemetry value.
- Suggested files: `src/SectorForge.Web/src/*`, `src/SectorForge.Api /Program.cs` if API shape needs small additions
- Acceptance criteria:
  - Chart shows a time-series of a telemetry value for the current lap.
  - Chart updates in real-time with new samples.
  - Chart has axes labels and a legend if needed.
  - Empty and loading states are handled gracefully.

### SF-034: Add Replay Mode UI Controls

- Status: `done`
- Type: frontend feature
- Goal: Add UI controls to start and stop replaying a stored session through the dashboard. Also add controls for scrolling through the replay timeline and an indicator for when replay mode is active. This will allow users to review past sessions and analyze their telemetry in a familiar interface.
- Suggested files: `src/SectorForge.Web/src/*`, `src/SectorForge.Api/Program.cs` if API shape needs small additions
- Acceptance criteria:
  - UI has a way to select a stored session and start replay mode.
  - When replay mode is active, the dashboard indicates this clearly.
  - Controls allow the user to pause, resume, and scroll through the replay timeline.
  - Telemetry charts and values update according to the replayed data.
  - Frontend lint and build pass without errors.

### SF-035: Add Session Overview

- Status: `done`
- Type: frontend feature
- Goal: Add a session overview panel that shows key metadata and lap summaries for the user and the other participants in the current active/loaded session. This will provide context for the telemetry data and allow users to quickly understand the session details at a glance. Give insight into the drivers, cars, teams, track, and lap performance without needing to dive into the raw telemetry.
- Suggested files: `src/SectorForge.Web/src/*`, `src/SectorForge.Api/Program.cs` if API shape needs small additions
- Notes: Added a replay-aware session overview on 2026-05-03 that renders current live or loaded session metadata, participant/team/car lap snapshots, stored lap summaries, and persisted participant snapshots from replayed captures.
- Acceptance criteria:
  - Overview panel shows session metadata like game, track, car, and participants.
  - Lap summaries show key performance metrics for each lap and driver.
  - UI is clear and organized, allowing users to quickly grasp session details.
  - Frontend lint and build pass without errors.

### SF-036: Add Simplified View Mode for while Driving

- Status: `done`
- Type: frontend feature
- Goal: Add a simplified view mode that shows only essential telemetry values in a large, easy-to-read format. This mode can be toggled on while driving to reduce distraction and allow the driver to focus on key information like speed, lap time, and position. This is intended to be used on a secondary monitor or in a WebView overlay while playing, providing at-a-glance telemetry without needing to navigate the full dashboard.
- Suggested files: `src/SectorForge.Web/src/*`
- Notes: Added a toggleable drive view on 2026-05-03 that swaps the full dashboard for a large-format telemetry layout with speed, lap time, position, delta, gear, fuel, and pedal load while keeping replay progression alive behind the simplified shell.
- Acceptance criteria:
  - UI has a toggle to switch between the full dashboard and the simplified view mode.
  - Simplified view shows only essential telemetry values in a large, clear format.
  - Layout is optimized for quick glances while driving, with high contrast and large fonts.
  - Frontend lint and build pass without errors.

### SF-037: Frontend Testing Baseline with Coverage Reporting, CI Integration, and 90%+ Coverage Target

- Status: `done`
- Type: testing
- Goal: Add a frontend testing baseline with code coverage reporting and a target of 90%+ coverage. This will help ensure the frontend remains maintainable and that new features are well-tested.
- Suggested files: `src/SectorForge.Web/src/*`, CI workflow updates, docs
- Notes: Added a Vitest + React Testing Library frontend baseline on 2026-05-03. Frontend coverage now writes HTML/Cobertura reports under `artifacts/coverage/frontend`, CI runs `pnpm --dir .\src\SectorForge.Web test:coverage`, and the current baseline is 92.31% line coverage.
- Acceptance criteria:
  - Frontend tests are added using a suitable testing framework (e.g., Jest, React Testing Library).
  - Code coverage reports are generated for the frontend and can be viewed locally.
  - CI workflow is updated to run frontend tests and fail if coverage falls below the target.
  - A baseline coverage percentage is established and documented.

### SF-038: Frontend Memory Usage Monitoring And Optimization To prevent Leaks and Out-of-Memory Issues During Long Sessions

- Status: `done`
- Type: frontend resilience
- Goal: Implement memory usage monitoring in the frontend and optimize any identified leaks or inefficiencies. This will help ensure the dashboard remains responsive and stable during long driving sessions, especially when replaying stored sessions with large amounts of telemetry data.
- Suggested files: `src/SectorForge.Web/src/*`, docs
- Notes: Added a dev-only frontend heap monitor on 2026-05-03 that surfaces high-usage warnings when Chromium exposes `performance.memory`. The Sessions workspace now releases hidden capture detail payloads unless replay is actively using them, and replay/session trace derivation no longer rescans or spreads whole-session sample arrays on every update. A follow-up perf pass on 2026-05-03 cut the live-telemetry hot path: SignalR samples now mutate ring buffers in refs and a single throttled commit at ~20Hz drives all React state, the dashboard subtree (`MainTelemetryColumn`, `LapTelemetryChart`, `TraceLane`, `TelemetrySidebar`, `SessionBand`, `DashboardHeader`) is wrapped in `React.memo`, and per-render `Math.max(..., ...arr)` spreads were replaced with O(N) loops to remove 60Hz argument-spreading on 180-element arrays. This brings the fake-adapter live workspace down from 60Hz reconciliation/allocation churn to ~20Hz commits with a single array clone per channel per commit. A second runtime-validated round on 2026-05-03 used Chrome DevTools to measure the dev vs. production renderer footprint: with the fake adapter running for several minutes, the Vite dev tab grew to ~2.3 GB / ~60% CPU in Chrome's Task Manager (bloat lived in HMR + StrictMode double-render + raster cache, not the JS heap, which stayed under 50 MB), while the same workload on a `vite preview` production build held flat at ~10 MB JS heap, ~20 MB total heap, and 453 stable DOM nodes over 3+ minutes. To cut compositor pressure further, `COMMIT_INTERVAL_MS` was raised from 50 ms to 100 ms and the flush is now aligned to `requestAnimationFrame` so React commit, browser paint, and GPU raster occur on the same tick instead of mid-frame SVG attribute mutations invalidating layers between paints.
- Acceptance criteria:
  - Memory usage is monitored in development builds, with warnings for high usage.
  - Any identified memory leaks or inefficiencies are addressed and optimized.
  - The frontend remains responsive and does not crash due to memory issues during long sessions or replays.
  - Documentation includes notes on memory optimization strategies used.

## Intermezzo: README Polish

### SFI-001: Add Screenshots And GIFs To README

- Status: `done`
- Type: documentation
- Goal: Add visual examples of the dashboard and features to the README to help users understand what the project does at a glance. This can include screenshots of the dashboard, charts, and session details, as well as short GIFs demonstrating live telemetry updates and replay mode.
- Notes: Added a live dashboard screenshot and animated live-feed GIF under `docs/assets/` on 2026-05-03 and embedded both near the top of `README.md`.
- Suggested files: `README.md`, `docs/assets/*`
- Acceptance criteria:
  - README includes at least one screenshot of the dashboard showing live telemetry.
  - README includes a GIF demonstrating live updates or replay mode.
  - Images are optimized for web and stored in the repo under `docs/assets/` or a similar folder.
  - Visuals enhance the README without making it too long or cluttered.

### SFI-002: Add Setup Notes To README

- Status: `done`
- Type: documentation
- Goal: Add a setup section to the README that provides clear instructions for getting the project up and running locally. This should include prerequisites, installation steps, and how to start the development environment. Clear setup instructions will help new contributors get started quickly and reduce friction.
- Notes: Reworked `README.md` on 2026-05-03 with a dedicated Setup section covering prerequisites, clone/start steps, alternate ports, and the local verify command. Instructions were validated against the current `tools/dev.ps1` behavior.
- Suggested files: `README.md`
- Acceptance criteria:
  - README has a "Setup" section with clear, step-by-step instructions for local development.
  - Instructions cover prerequisites (e.g., .NET SDK, Node.js), installation steps, and how to start the dev environment.
  - Setup instructions are tested to ensure they work as written.
  
### SFI-003: Add Architecture Overview To README

- Status: `done`
- Type: documentation
- Goal: Add an architecture overview section to the README that explains the high-level structure of the project, including the different components (collector, API, frontend, adapters) and how they interact. This will help new contributors understand the overall design and where to focus their efforts when working on different features.
- Notes: Refreshed the README architecture section on 2026-05-03 with an explicit runtime flow diagram, component responsibilities, and links to the deeper architecture docs.
- Suggested files: `README.md`, architecture diagrams if needed
- Acceptance criteria:
  - README includes an "Architecture Overview" section that describes the main components of the project.
  - The overview explains how the collector, API, frontend, and adapters interact with each other.
  - Diagrams or visuals are included if they help clarify the architecture.

### SFI-004: Add (CI) Badges To README

- Status: `done`
- Type: documentation
- Goal: Add badges to the README for CI status, code coverage, and license to provide at-a-glance information about the project health and licensing. This is a common practice in open-source projects and can help build trust with potential contributors.
- Notes: Added CI, coverage, and MIT license badges to the top of `README.md` on 2026-05-03.
- Suggested files: `README.md`
- Acceptance criteria:
  - README includes a badge for CI build status that reflects the current state of the default branch.
  - README includes a badge for code coverage that shows the current coverage percentage.
  - README includes a badge for the chosen license.
  - Badges are placed prominently at the top of the README.

## Priority 4: Real Game Adapter Path

### SF-040: Scaffold F1 25 UDP Adapter Project Area

- Status: `in-progress`
- Type: protocol adapter
- Goal: Prepare adapter structure and tests without copying protocol spec text.
- Notes: Research and follow-on tasks scaffolded on 2026-05-03. SF-043..SF-049 cover packet parser, player-car normalizer, collector wiring, three-slice `TelemetrySample` model expansion, and frontend surfacing. Source-code scaffold (Adapters/F125 project area) still pending under SF-043. F1 25 section in `docs/protocol-notes.md` expanded with the data-source plan and additive model-expansion strategy.
- Suggested files: `src/SectorForge.Collector/Adapters/F125/*`, `tests/SectorForge.Protocol.Tests/*`, `docs/protocol-notes.md`
- Acceptance criteria:
  - Adapter-specific DTOs and parser interfaces are isolated from `SectorForge.Core`.
  - Tests use small synthetic byte arrays or generated fixtures, not copied spec tables.
  - Adapter remains disabled unless explicitly selected.
  - Docs link to the public official spec rather than embedding it.
  - Tasks added to `docs/agent-tasks.md` for subsequent implementation steps. including parsing, publishing, and UI integration. Tasks should be added under Priority 4 and can be as granular as needed to keep implementation focused.

### SF-041: Add UDP Listener Abstraction

- Status: `done`
- Type: infrastructure
- Goal: Create reusable UDP receive plumbing for F1 and future UDP adapters.
- Suggested files: `SectorForge.Core`, `SectorForge.Collector`, tests
- Notes: Added `IUdpTelemetryListener`, `IUdpTelemetryListenerFactory`, `UdpTelemetryListenerOptions`, and `UdpTelemetryDatagram` in `SectorForge.Core/Telemetry/Udp/` plus a `UdpClient`-backed `UdpTelemetryListener` and factory in `SectorForge.Collector/Adapters/Udp/` on 2026-05-03. Listener exposes the bound `LocalEndPoint` (so tests can use ephemeral port 0), honours `CancellationToken` to stop cleanly, and allows bind/socket exceptions to propagate so the collector can record them in `LastError`. No game-specific parsing lives in the listener; F1 25 wiring is deferred to SF-043.
- Acceptance criteria:
  - UDP listener has configurable IP/port and cancellation support.
  - Listener can be tested without requiring a real game.
  - Errors are surfaced through collector status.
  - No game-specific packet parsing is added to the listener.

### SF-042: Add Adapter Configuration Model

- Status: `done`
- Type: configuration
- Goal: Centralize adapter configuration for fake, UDP, shared memory, and replay sources.
- Suggested files: `SectorForge.Core`, `SectorForge.Api/appsettings*.json`, docs
- Notes: Added `TelemetryAdapterOptions`, `TelemetryAdaptersOptions`, `CollectorOptions`, and `StorageOptions` POCOs in `SectorForge.Core/Telemetry/Configuration/` on 2026-05-03. The API host now binds the `Collector`, `Storage`, and per-adapter `Adapters:<id>` sections via `IOptions<T>`, the fake adapter's sample rate is sourced from `Adapters:fake:SampleRateHz` (default 60 Hz), `appsettings.json` ships defaults for `fake`, `f1-25-udp`, `acc-shared-memory`, `ams2-project-cars`, and `lmu-plugin-udp`, `CollectorAutoStartService` consumes `CollectorOptions`, and the README "Common Settings" table documents the supported keys. Binding tests in `SectorForge.Api.Tests` cover defaults plus per-adapter and section overrides.
- Acceptance criteria:
  - Config supports adapter ID, enabled flag, ports, sample rate, and storage retention values.
  - Fake adapter sample rate can be configured.
  - README documents common settings.
  - Tests cover default configuration binding where practical.

### SF-043: Implement F1 25 Packet Header Parser And Dispatcher

- Status: `done`
- Type: protocol adapter
- Goal: Parse the F1 25 UDP packet header into an internal DTO and dispatch to per-packet readers, isolated from `SectorForge.Core`.
- Notes: Added the F1 25 header reader and packet dispatcher on 2026-05-03 with explicit little-endian parsing, typed failures for truncated or wrong-format buffers, unsupported packet skips, and synthetic parser tests. Motion, lap data, and car telemetry packet readers currently retain raw payloads for the SF-044 normalizer slice.
- Suggested files: `src/SectorForge.Collector/Adapters/F125/F125PacketReader.cs`, `src/SectorForge.Collector/Adapters/F125/Packets/*`, `tests/SectorForge.Protocol.Tests/F125/*`
- Acceptance criteria:
  - Header reader uses `BinaryPrimitives` little-endian reads, no `unsafe` struct overlays.
  - Unknown or unsupported packet IDs are skipped without throwing across the adapter boundary.
  - Wrong format byte and truncated buffers return a typed failure (no exception escapes).
  - Tests build synthetic byte arrays in C# (no recorded captures, no copied spec tables).
  - Player car index is re-read from each header and never cached across packets.

### SF-044: Implement F1 25 Player-Car Normalizer

- Status: `done`
- Type: protocol adapter
- Goal: Convert F1 25 motion + lap data + car telemetry packets into a normalized `TelemetrySample` for the player car, with unavailable fields set to `null`.
- Notes: Added player-car payload DTO parsing and a pure `F125Normalizer` on 2026-05-03. Speed, rpm, gear, throttle, brake, steering, clutch, current/last lap time, sector index, and lap distance now flow into `TelemetrySample`; best lap remains `null` for this three-packet slice until a session-history source exists, avoiding invented values. The placeholder F1 25 adapter remains unavailable until SF-045 wires it in.
- Suggested files: `src/SectorForge.Collector/Adapters/F125/F125Normalizer.cs`, `src/SectorForge.Collector/Adapters/F125/F125Adapter.cs`, `tests/SectorForge.Protocol.Tests/F125/*`
- Acceptance criteria:
  - Normalizer maps speed, rpm, gear, throttle, brake, steering, clutch, current/last/best lap time, sector index, and lap distance.
  - Fields not yet mapped remain `null`; no invented values.
  - Normalizer is a pure function over parsed DTOs (no I/O, no statics other than constants).
  - Tests cover a synthetic motion+lap+telemetry trio producing the expected scalars and nulls.
  - Adapter still reports `TelemetrySourceStatus.Offline` (or equivalent unavailable status) until SF-045 wires it in.

### SF-045: Wire f1-25-udp Adapter Into Collector Selection

- Status: `done`
- Type: protocol adapter
- Goal: Allow the collector to select the F1 25 adapter via configuration, while keeping it disabled by default and surfacing errors through collector status.
- Notes: SF-042 landed the shared `TelemetryAdaptersOptions` / `TelemetryAdapterOptions` model under `SectorForge.Core/Telemetry/Configuration/`. This task should consume `IOptions<TelemetryAdaptersOptions>` (and `CollectorOptions` for autostart) to honour `Adapters:f1-25-udp:Enabled`, `BindAddress`, `Port`, and `ReceiveBufferBytes` rather than reading raw configuration. Defaults already ship in `appsettings.json` with `f1-25-udp` disabled on `127.0.0.1:20777`.
- Completion: Wired the config-gated F1 25 UDP adapter on 2026-05-03. The adapter binds through the shared UDP listener abstraction only when `Adapters:f1-25-udp:Enabled` is true, publishes normalized player-car samples from the SF-044 parser/normalizer slice, reports listener and parse failures through collector status, and remains disabled by default while the fake adapter stays selected.
- Suggested files: `src/SectorForge.Collector/Program.cs`, `src/SectorForge.Collector/TelemetryCollectorService.cs`, `src/SectorForge.Api/appsettings*.json`, `tests/SectorForge.Protocol.Tests/*`, `docs/game-adapters.md`
- Acceptance criteria:
  - When the F1 25 adapter is enabled in configuration and `f1-25-udp` is selected, the collector runs `F125Adapter`; otherwise it falls back to the existing fake / unavailable path.
  - Default configuration keeps `fake` selected and `f1-25-udp` disabled.
  - Listener bind errors and parse errors are reported through `TelemetryReceiverStatus.LastError` without crashing the worker.
  - Adapter status entry in `docs/game-adapters.md` flips to `Scaffolded` (or `Beta` once SF-044 lands), still gated by config.
  - Cancellation of the host stops the adapter promptly in tests.

### SF-046: Extend TelemetrySample - Slice A (Vehicle Dynamics, Sector Splits, Driver Flags)

- Status: `done`
- Type: backend feature
- Goal: Additively expand `TelemetrySample` so F1 25 (and future adapters) can publish g-forces, world position, sector split times, lap-distance, and driver-input flags without breaking existing adapters or stored blobs.
- Notes: Added nullable Slice A fields on 2026-05-03 with JSON and SQLite blob round-trip coverage. The F1 25 normalizer now publishes mapped motion, lap-distance/split, pit-status, penalty/warning, engine-temperature, and DRS-active values from the existing motion/lap/car-telemetry packet slice; fields not present in that slice remain `null`.
- Suggested files: `src/SectorForge.Core/Telemetry/TelemetryModels.cs`, `src/SectorForge.Collector/Adapters/F125/F125Normalizer.cs`, `src/SectorForge.Web/src/types/*`, `tests/SectorForge.Core.Tests/*`, `docs/architecture.md`
- Acceptance criteria:
  - New nullable properties on `VehicleState` (`LateralG`, `LongitudinalG`, `VerticalG`, `WorldPositionX/Y/Z`, `Yaw`, `Pitch`, `Roll`, `OilTemperatureC`), on `LapState` (`Sector1Time`, `Sector2Time`, `Sector3Time`, `LastSector1Time`, `LastSector2Time`, `LastSector3Time`, `IsValid`, `LapDistanceMeters`, `TotalDistanceMeters`, `PitStatus`, `PitStopCount`, `PenaltiesSeconds`, `WarningsCount`, `CornersCut`), and on `DriverInputState` (`DrsAllowed`, `DrsActive`, `PitLimiterActive`, `AbsActive`, `TcActive`).
  - New `PitStatus` enum with `Unknown = 0` so default-construction is safe.
  - All additions default to `null`; existing adapters and tests compile and pass unchanged.
  - JSON round-trip and Sqlite blob round-trip tests cover the new fields.
  - F1 25 normalizer fills these fields where mapped; other adapters leave them `null`.
  - Frontend TS types mirror the new optional fields; UI consumers guard with `value == null` checks.

### SF-047: Extend TelemetrySample - Slice B+C (Damage, Power Unit, Extended Tyres)

- Status: `done`
- Type: backend feature
- Goal: Additively expand `TelemetrySample` with optional `DamageState`, `PowerUnitState`, and tyre compound/age/wear so F1-class data can flow end to end.
- Suggested files: `src/SectorForge.Core/Telemetry/TelemetryModels.cs`, `src/SectorForge.Collector/Adapters/F125/F125Normalizer.cs`, `src/SectorForge.Web/src/types/*`, `tests/SectorForge.Core.Tests/*`, `docs/architecture.md`
- Acceptance criteria:
  - New optional sub-records on `TelemetrySample`: `DamageState? Damage` (front wing L/R %, rear wing %, floor/diffuser/sidepod %, gearbox %, engine %, tyre damage per corner %, brake damage per corner %) and `PowerUnitState? PowerUnit` (`ErsStoreJoules`, `ErsDeployedThisLapJoules`, `ErsHarvestedThisLapMguk`, `ErsHarvestedThisLapMguh`, `ErsDeployMode`).
  - `TyreState` gains optional `Compound`, `AgeLaps`, and per-corner `WheelWearState` with `WearPercent`.
  - New enums (`TyreCompound`, `ErsDeployMode`) include `Unknown = 0`.
  - All new properties nullable / default-null; non-F1 adapters and existing snapshots remain valid.
  - JSON and Sqlite blob round-trip tests cover the new sub-records.

### SF-048: Extend TelemetrySample - Slice D (Weather Forecast, Safety Car, Multi-Participant Timing)

- Status: `done`
- Type: backend feature
- Goal: Additively expand `TelemetrySample` with weather forecast, safety-car / session status, and richer per-participant fields so F1 25 timing-board parity is possible.
- Notes: Added nullable Slice D weather forecast, track/session status, and per-participant timing fields on 2026-05-03 with JSON and SQLite blob round-trip coverage. F1 25 normalizer population remains deferred to the pre-SF-049 packet-reader plan; current adapters leave the fields `null`.
- Suggested files: `src/SectorForge.Core/Telemetry/TelemetryModels.cs`, `src/SectorForge.Collector/Adapters/F125/F125Normalizer.cs`, `src/SectorForge.Web/src/types/*`, `tests/SectorForge.Core.Tests/*`, `docs/architecture.md`
- Acceptance criteria:
  - New optional `WeatherForecastState? WeatherForecast` on `TelemetrySample` carrying a list of `WeatherForecastSample` (`MinutesAhead`, `Weather`, `RainPercent`, `TrackTemperatureC`, `AirTemperatureC`).
  - `TrackState` gains optional `TrackId`, `TrackLengthMeters`, `RainPercent`, `WeatherEnum`, `SafetyCarStatus`, `FormationLap`.
  - `TimingState` gains optional `SessionTimeLeft`, `SessionDuration`.
  - `ParticipantState` gains optional `Sector1`, `Sector2`, `BestSector1`, `BestSector2`, `BestSector3`, `TyreCompound`, `PitStopCount`, `ResultStatus`, `GridPosition`, `DriverNumber`, `IsAi`.
  - New enums (`SafetyCarStatus`, `WeatherKind`, `ResultStatus`) include `Unknown = 0`.
  - F1 25 normalizer population is deferred to the pre-SF-049 packet-reader plan below; non-F1 adapters leave fields `null`.
  - Round-trip tests cover the new fields.

### Pre-SF-049: Complete F1 25 Packet Readers For Slices A-D

- Status: `ready`
- Type: protocol adapter plan
- Goal: Finish the F1 25 packet reader, optional-packet aggregation, and normalizer work needed before surfacing the SF-046/SF-047/SF-048 channels in the dashboard.
- Notes: Priority 4 already uses `SF-040` through `SF-049`, so these are intentionally listed as pre-frontend implementation tasks instead of silently reusing or renumbering task IDs. Assign new IDs or open a new adapter priority before taking them as implementation work. Keep all parser tests synthetic; do not copy vendor packet tables or recorded captures.
- Required tasks before SF-049:
  - Add an optional-packet aggregation state for `F125UdpTelemetryAdapter` so motion, lap data, car telemetry, car status, car damage, session/weather, participant, and session-history packets can arrive at different rates. Publishing must continue when optional packets are missing, reset cached packets on session UID changes, and leave missing channel groups `null`.
  - Add a F1 25 car-status packet reader and normalizer extension for remaining Slice A driver flags plus Slice B/C power-unit, ERS deploy mode, tyre compound, and tyre age fields. Tests must cover typed parser failures, player-car selection, session reset behavior, and normalized samples with and without a latest status packet.
  - Add a F1 25 car-damage packet reader and normalizer extension for Slice B/C tyre wear, tyre damage, brake damage, wing, floor, diffuser, sidepod, gearbox, and engine damage fields. Tests must cover synthetic per-corner values and default-null behavior when the packet has not arrived.
  - Add a F1 25 session/weather packet reader and normalizer extension for Slice D track/session metadata, weather forecast samples, rain percentage, safety-car status, formation-lap state, session duration, and session time remaining. Tests must cover forecast list bounds and nulls for unavailable values.
  - Add F1 25 participant timing readers and normalizer support for Slice D multi-participant timing: participant identity, team/car metadata where available, driver number, AI flag, grid position, result status, pit-stop count, per-driver sectors, best sectors, and tyre compound. Combine participant, lap-data, and session-history style packets without requiring all of them before publishing.
  - Update `docs/game-adapters.md` and `docs/protocol-notes.md` with original-language implementation notes and current limitations after the readers land.

### SF-049: Surface New F1 25 Channels In Dashboard And Lap Channels API

- Status: `blocked`
- Type: frontend feature
- Goal: Render the new SF-046/047/048 channels in the dashboard with strict null-guarding, and extend the SF-050 lap channel manifest to include them when available.
- Notes: Do not take this task until the pre-SF-049 F1 25 packet-reader plan is assigned and completed. The frontend should surface real optional channels, not only newly added nullable model fields.
- Suggested files: `src/SectorForge.Web/src/types/*`, `src/SectorForge.Web/src/components/dashboard/*`, `src/SectorForge.Api/Services/*`, `src/SectorForge.Api/Program.cs`, `tests/SectorForge.Api.Tests/*`, `docs/architecture.md`
- Acceptance criteria:
  - Live workspace shows DRS / pit limiter / ABS / TC indicator strip, sector 1/2/3 split tiles, and a lap-valid badge - each panel mounts only when its source field is non-null.
  - New "Damage" and "ERS" panels mount only when `sample.damage` / `sample.powerUnit` are present and stay collapsed by default.
  - Track/weather card shows a forecast strip when `sample.weatherForecast` is present.
  - Sessions workspace surfaces tyre compound chip + age and a pit-stop count column when populated.
  - SF-050 channel manifest gains entries for `lateralG`, `longitudinalG`, `lapDistance`, `drsActive`, and `ersStoreJoules`, gated by per-session availability.
  - Fake adapter and existing tests keep working with all new fields rendered as hidden / absent.
  - Lint and frontend build pass.

## Priority 5: Lap Comparison & Analysis

The dashboard already has a `Compare` workspace placeholder driven by the workspace rail. This priority fills it in: pick laps from one or more stored sessions, overlay their channels, and inspect deltas the way drivers and engineers expect from tools like MoTeC i2, AiM Race Studio, and SimHub. Each task is scoped so it can ship independently behind the existing `Compare` route without disturbing live or replay flows.

### SF-050: Add Lap Channel Retrieval API

- Status: `ready`
- Type: backend feature
- Goal: Expose a per-lap channel endpoint that returns aligned arrays (distance, time, speed, rpm, throttle, brake, steering) for one stored lap so the frontend can overlay laps without re-streaming through replay.
- Suggested files: `src/SectorForge.Api/Program.cs`, `src/SectorForge.Api/Services/*`, `src/SectorForge.Infrastructure/Storage/*`, `src/SectorForge.Core/Telemetry/*`, `tests/SectorForge.Api.Tests/*`, `tests/SectorForge.Core.Tests/*`
- Acceptance criteria:
  - `GET /api/sessions/{sessionId}/laps/{lapNumber}/channels` returns aligned arrays plus lap metadata (number, lap time, sector splits) as JSON.
  - Endpoint reads from existing stored sample blobs and respects `Storage:RetainedSampleBlobLimit` pruning by surfacing a clear "lap not retained" error when blobs are gone.
  - Response includes a stable channel manifest so additional channels can be added without breaking existing clients.
  - Tests cover unknown session, unknown lap, pruned lap, and a happy-path lap shape.
  - Endpoint shape is documented in `docs/architecture.md` or a new compare docs section.

### SF-051: Add Lap Compare Selection State And API Client

- Status: `ready`
- Type: frontend state
- Goal: Track a small "lap basket" (reference + up to N comparison laps) in the dashboard so users can pin laps from the Sessions workspace and have them ready in the Compare workspace.
- Suggested files: `src/SectorForge.Web/src/hooks/*`, `src/SectorForge.Web/src/api/*`, `src/SectorForge.Web/src/types/*`, `src/SectorForge.Web/src/App.tsx`
- Acceptance criteria:
  - A new hook (e.g. `useLapBasket`) exposes pinned laps with `{ sessionId, lapNumber, label, color }` entries and add/remove/clear actions.
  - The basket persists to `localStorage` so users can switch workspaces or reload without losing their pinned laps.
  - An API client function fetches lap channels for a basket entry and caches the response in memory keyed by session+lap.
  - Lint and frontend build pass; no regression in live or replay flows.

### SF-052: Add Pin-To-Compare Action In Sessions Workspace

- Status: `ready`
- Type: frontend feature
- Goal: Let users pin individual laps from the existing Timing Board / Session Overview into the lap basket without leaving the Sessions workspace.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/TimingBoard.tsx`, `src/SectorForge.Web/src/components/dashboard/SessionOverview.tsx`, `src/SectorForge.Web/src/App.tsx`, `src/SectorForge.Web/src/App.css`
- Acceptance criteria:
  - Each lap row in the Sessions workspace exposes a pin/unpin control with clear pinned vs unpinned states.
  - The workspace rail's `Compare` item shows a small badge or count when the basket has at least one lap.
  - Pinned laps survive workspace switches and reloads (uses the basket from SF-051).
  - Lint and frontend build pass.

### SF-053: Add Compare Workspace Overlay Chart

- Status: `ready`
- Type: frontend feature
- Goal: Replace the Compare workspace placeholder with a real overlay chart that draws the pinned laps for one channel (start with speed) aligned by distance, plus a legend keyed to lap colors.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx` (new), `src/SectorForge.Web/src/components/dashboard/LapTelemetryChart.tsx`, `src/SectorForge.Web/src/App.tsx`, `src/SectorForge.Web/src/App.css`
- Acceptance criteria:
  - Compare workspace renders an SVG overlay chart with one trace per pinned lap, using the lap basket colors.
  - Empty state guides the user back to Sessions when no laps are pinned.
  - Loading and error states are handled per-lap so a single failed fetch does not blank the whole chart.
  - Channel selector lets the user switch the overlay between speed, rpm, throttle, brake, and steering.
  - Lint and frontend build pass.

### SF-054: Add Delta Time Plot Between Reference And Comparison Laps

- Status: `ready`
- Type: frontend feature
- Goal: Add a delta-time view (time variance plot) that shows where each comparison lap gains or loses time against the reference lap across the lap distance.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx`, `src/SectorForge.Web/src/utils/*`
- Acceptance criteria:
  - First pinned lap is treated as the reference; remaining laps are plotted as cumulative time delta vs. reference along distance.
  - Positive delta is rendered as losing time (warning tone), negative as gaining (success tone), zero baseline is visually obvious.
  - Reference lap can be reassigned from the legend without losing the basket.
  - Plot handles laps of different lengths gracefully (clip to shortest distance, show a notice).
  - Lint and frontend build pass.

### SF-055: Add Sector Split Compare Table

- Status: `ready`
- Type: frontend feature
- Goal: Add a compact sector split table below the overlay so engineers can scan per-sector deltas without reading the chart pixel-by-pixel.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx`, `src/SectorForge.Web/src/utils/telemetryFormat.ts`
- Acceptance criteria:
  - Table shows lap number, lap time, S1/S2/S3 times and per-sector deltas vs. the reference lap.
  - Best sector across the basket is highlighted with the existing best-lap accent color.
  - Table is keyboard-navigable and screen-reader friendly.
  - Lint and frontend build pass.

### SF-056: Sync Cursor Across Compare Panels

- Status: `ready`
- Type: frontend interaction
- Goal: When the user hovers over the overlay chart or the delta plot, all compare panels track the same distance cursor so values line up across views.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx`, `src/SectorForge.Web/src/components/dashboard/LapTelemetryChart.tsx`
- Acceptance criteria:
  - Hovering or focusing one chart moves a vertical cursor on every compare panel at the same distance.
  - Active cursor surfaces lap value, delta value, and sector for each pinned lap.
  - Cursor state stays local to the Compare workspace and does not affect Live or Driver views.
  - Lint and frontend build pass.

### SF-057: Document Compare Workflow

- Status: `ready`
- Type: documentation
- Goal: Document how to pin laps, switch reference laps, read deltas, and the limits of the comparison (pruned blobs, lap length mismatch).
- Suggested files: `docs/architecture.md`, `README.md`, `docs/agent-tasks.md`
- Acceptance criteria:
  - Architecture doc covers the lap channel API contract from SF-050 and the basket model from SF-051.
  - README links to the compare workflow once the UI ships.
  - Docs note current limitations (single-channel overlay at a time, retained sample blob constraints).

### SF-058: Add Multi-Channel Compare Views

- Status: `ready`
- Type: frontend feature
- Goal: Allow users to add multiple overlay charts for different channels (e.g. speed, rpm, throttle) so they can analyze how different aspects of the lap interact with each other.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx`, `src/SectorForge.Web/src/components/dashboard/LapTelemetryChart.tsx`
- Acceptance criteria:
  - Compare workspace allows users to add multiple `LapTelemetryChart` components, each with its own channel selector.
  - Charts are synchronized to the same distance cursor when hovering or focusing.
  - Users can remove individual charts without affecting the lap basket or other charts.
  - Lint and frontend build pass.

### SF-059: Add Compare Workspace To Frontend Routing
- Status: `ready`
- Type: frontend feature
- Goal: Ensure the Compare workspace is accessible via the frontend routing system (e.g. `/compare`) and that it can be navigated to from the workspace rail, so users can easily find and use the new comparison features.
- Suggested files: `src/SectorForge.Web/src/App.tsx`, `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx`
- Acceptance criteria:
  - Compare workspace is registered in the routing system and can be accessed via a URL (e.g. `/compare`).
  - Workspace rail includes a `Compare` item that navigates to the Compare workspace when clicked.
  - Navigating to the Compare workspace does not disrupt the state of other workspaces (e.g. Live, Sessions).
  - Lint and frontend build pass.

### SF-05A: Add Lap Comparison To Session History View

- Status: `ready`
- Type: frontend feature
- Goal: In the Session History view for a completed session, allow users to select multiple laps and trigger a comparison view that overlays those laps without needing to pin them first, so they can quickly analyze differences between laps from the same session.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/SessionHistoryView.tsx`, `src/SectorForge.Web/src/components/dashboard/LapTelemetryChart.tsx`
- Acceptance criteria:
  - Session History view allows users to select multiple laps (e.g. with checkboxes) and includes a "Compare Selected" button.
  - Clicking "Compare Selected" navigates to the Compare workspace with the selected laps pinned in the basket.
  - The Compare workspace shows the selected laps in the overlay charts and delta plots as per the existing compare functionality.
  - Lint and frontend build pass.

### SF-05B: Import/Export Lap Comparison Sets

- Status: `ready`
- Type: frontend feature
- Goal: Allow users to export their pinned lap sets and reference selections as a JSON file that can be shared or re-imported later, so they can save interesting comparisons or share them with friends without relying on the persistence of `localStorage`.
- Suggested files: `src/SectorForge.Web/src/components/dashboard/CompareWorkspace.tsx`, `src/SectorForge.Web/src/utils/*`
- Acceptance criteria:
  - Compare workspace includes "Export" and "Import" buttons that trigger file download and upload dialogs.
  - Exported JSON includes the session ID, lap numbers, labels, colors, and reference selection for each pinned lap.
  - Importing a valid JSON file populates the lap basket and reference selection accordingly, with error handling for invalid formats.
  - Lint and frontend build pass.

### SF-05C: External Export Of Comparison Data
- Status: `ready`
- Type: backend feature
- Goal: Add an API endpoint that allows users to export the telemetry data for a set of laps in a format compatible with external analysis tools (e.g. CSV, MoTeC i2 format), so they can perform more advanced analysis or visualization outside of the dashboard.
- Suggested files: `src/SectorForge.Api/Program.cs`, `src/SectorForge.Api/Services/*`, `src/SectorForge.Infrastructure/Storage/*`, `src/SectorForge.Core/Telemetry/*`, `tests/SectorForge.Api.Tests/*`
- Acceptance criteria:
  - `POST /api/compare/export` accepts a payload with session ID, lap numbers, and desired export format.
  - Endpoint retrieves the telemetry data for the specified laps and returns it in the requested format (e.g. CSV with aligned channels, or a MoTeC i2-compatible file).
  - Endpoint includes error handling for unknown sessions/laps and unsupported formats.
  - Tests cover valid export requests, error cases, and format correctness.

## Priority 6: LMU Plugin Adapter

Note: LMU's UDP plugin is a popular community adapter for Assetto Corsa and Assetto Corsa Competizione, so it can be a good next step after F1 25 to expand the user base. However, it's a third-party plugin with its own release cadence and support model, so it may require more maintenance work to keep up with changes. The adapter should be designed to handle potential protocol changes gracefully and minimize breakage when the plugin updates.

## Priority 7: ACC Shared Memory Adapter

Note: ACC's shared memory API is a different integration approach than UDP, so it will require a new adapter structure that reads from shared memory instead of listening on a socket. This can be a good opportunity to further abstract the adapter interface and allow for multiple integration methods. However, shared memory can be more complex to implement and debug than UDP, especially around synchronization and cross-platform support, so it may take more time to get right.

## Priority 8: AMS2 Project Cars UDP Adapter

Note: Like the LMU plugin, this is a third-party UDP adapter for Assetto Corsa and Assetto Corsa Competizione. It may have a different packet structure and update cadence than the F1 25 UDP adapter, so it will require its own parser and normalizer. However, since it's also UDP-based, some of the existing infrastructure from the F1 25 adapter (e.g. the UDP listener abstraction) can likely be reused, which may speed up development compared to the ACC shared memory adapter.

## Priority 9: WebView2 Desktop Packaging

Note: Packaging the frontend as a WebView2 desktop app can make it more accessible to users who are not comfortable running a web server or using the command line. It also allows for tighter integration with the Windows OS, such as auto-start on boot, system tray icons, and native notifications. However, it adds complexity to the build and release process, and may require additional maintenance to keep up with WebView2 updates and Windows compatibility issues. It should be considered after the core features are stable and the user base is growing.

## Priority 10: Release Packaging, Publishing, and Versioning

Note: this is very needed because now only people who know how to build and run the project from source can use it, and we want to make it available to a wider audience who may not be developers. This will include creating release builds for the collector and frontend, packaging them in a user-friendly way (e.g. an installer or portable zip), and publishing them on GitHub Releases or a similar platform. It will also involve setting up a versioning strategy (e.g. semantic versioning) and possibly automating the release process with CI/CD pipelines. However, it requires additional work to set up and maintain the build and release infrastructure, and may involve troubleshooting issues that arise in the packaging process. It should be considered after the core features are stable and there is demand from users for easier access to releases.

## Priority 11: Hardware Display Integration

Note: Integrating with hardware displays (e.g. Raspberry Pi dashboards, Arduino-based gauges) can be a great way to extend the project's reach and allow users to create custom physical telemetry displays. However, it requires additional hardware-specific code and testing, and may involve supporting multiple platforms and communication protocols (e.g. serial, I2C, MQTT). It should be considered after the core software features are stable and there is demand from the community for hardware integration.

## Priority 12: Strategy Analysis Models

Note: Adding strategy analysis models (e.g. pit stop optimization, fuel load calculations, tire wear predictions) can provide advanced insights for competitive racing and add significant value for users. However, it requires domain expertise in racing strategy, as well as careful design to ensure the models are accurate and useful without overwhelming users with complexity. It should be considered after the core telemetry features are solid and there is interest from the community in strategy analysis.

## Priority 13: AI Coaching And Assistance

Note: Building AI coaching features (e.g. real-time driving advice, post-session performance analysis, personalized training plans) can be a long-term vision for the project that leverages machine learning and data analysis to help users improve their racing skills. However, it requires significant development effort, access to large datasets for training, and careful consideration of user experience to ensure the AI provides actionable and relevant insights without being intrusive or overwhelming. It should be considered as a future direction once the core telemetry and analysis features are well-established and there is a strong user base to support it. This will not implement an LLM or integrate with an AI provider but instead be a completely custom-built solution using traditional ML techniques and domain-specific heuristics, at least in the initial implementation.

## Priority 14: Community Contributions And Custom Adapters

Note: Encouraging and supporting community contributions (e.g. new game adapters, UI features, bug fixes) can help grow the project and make it more sustainable in the long term. This can be facilitated by clear contribution guidelines, good documentation, and an active presence in relevant communities (e.g. racing sim forums, GitHub). However, it also requires time and effort to review and manage contributions, as well as maintain a welcoming and inclusive community culture. It should be an ongoing priority as the project grows. This should include things like:

- Clear contribution guidelines in the README.
- A CONTRIBUTING.md file with detailed instructions for setting up a development environment, running tests, and submitting pull requests.
- Active engagement in relevant online communities to encourage contributions and gather feedback.
- Regularly reviewing and merging pull requests, and providing constructive feedback to contributors.
- A Discord server or other community hub for real-time discussion and support.

## Parking Lot

- Add screenshots or short GIFs to README after the UI stabilizes.
- Add hardware display integration notes.
- Add setup notes and strategy analysis models.
- Add export formats after storage format settles.
- Add WebView2 or desktop packaging only after the telemetry loop is solid.
