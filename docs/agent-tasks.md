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

### SF-024: Testing Coverager Baseline

- Status: `ready`
- Type: testing
- Goal: Add a code coverage baseline and ensure new tests are adding coverage. Goal of 90%+ overall code coverage with attention to untested files. This will help ensure the codebase remains maintainable and that new features are well-tested.
- Suggested files: `tests/coverage/*`, CI workflow updates, docs
- Acceptance criteria:
  - Code coverage reports are generated in CI and uploaded as artifacts.
  - Baseline coverage is established and documented.
  - New tests are adding to coverage, especially for untested files.
  - Coverage thresholds can be set in CI to prevent regressions.
  - Coverage target of 90%+ is met overall, with attention to critical and previously untested files.

## Priority 3: Frontend Product Slice

### SF-030: Add Session Detail View

- Status: `ready`
- Type: frontend feature
- Goal: Let users inspect a stored session from the recent captures list.
- Suggested files: `src/SectorForge.Web/src/*`, `src/SectorForge.Api/Program.cs` if API shape needs small additions
- Acceptance criteria:
  - Clicking a recent session opens a detail view or panel.
  - Detail view shows session metadata, lap summaries, and a recent speed trace.
  - Empty and loading states are clear.
  - Frontend lint and build pass.

### SF-031: Improve Dashboard Empty And Error States

- Status: `ready`
- Type: frontend polish
- Goal: Make disconnected API, stopped collector, and no-session states feel deliberate.
- Suggested files: `src/SectorForge.Web/src/App.tsx`, `src/SectorForge.Web/src/App.css`
- Acceptance criteria:
  - API offline state is distinct from collector stopped state.
  - Start/stop buttons remain keyboard accessible.
  - Error banner text is actionable without exposing stack traces.
  - Layout remains responsive below 720px width.

### SF-032: Split Dashboard Into Components

- Status: `ready`
- Type: frontend maintainability
- Goal: Break the first dashboard into smaller component and API modules.
- Suggested files: `src/SectorForge.Web/src/components/*`, `src/SectorForge.Web/src/api/*`, `src/SectorForge.Web/src/types/*`
- Acceptance criteria:
  - `App.tsx` mainly composes layout and top-level state.
  - API calls and SignalR setup are isolated in dedicated modules/hooks.
  - Type definitions are shared without circular imports.
  - No visual or behavioral regression.

## Priority 4: Real Game Adapter Path

### SF-040: Scaffold F1 25 UDP Adapter Project Area

- Status: `needs-research`
- Type: protocol adapter
- Goal: Prepare adapter structure and tests without copying protocol spec text.
- Suggested files: `src/SectorForge.Collector/Adapters/F125/*`, `tests/SectorForge.Protocol.Tests/*`, `docs/protocol-notes.md`
- Acceptance criteria:
  - Adapter-specific DTOs and parser interfaces are isolated from `SectorForge.Core`.
  - Tests use small synthetic byte arrays or generated fixtures, not copied spec tables.
  - Adapter remains disabled unless explicitly selected.
  - Docs link to the public official spec rather than embedding it.

### SF-041: Add UDP Listener Abstraction

- Status: `ready`
- Type: infrastructure
- Goal: Create reusable UDP receive plumbing for F1 and future UDP adapters.
- Suggested files: `SectorForge.Core`, `SectorForge.Collector`, tests
- Acceptance criteria:
  - UDP listener has configurable IP/port and cancellation support.
  - Listener can be tested without requiring a real game.
  - Errors are surfaced through collector status.
  - No game-specific packet parsing is added to the listener.

### SF-042: Add Adapter Configuration Model

- Status: `ready`
- Type: configuration
- Goal: Centralize adapter configuration for fake, UDP, shared memory, and replay sources.
- Suggested files: `SectorForge.Core`, `SectorForge.Api/appsettings*.json`, docs
- Acceptance criteria:
  - Config supports adapter ID, enabled flag, ports, sample rate, and storage retention values.
  - Fake adapter sample rate can be configured.
  - README documents common settings.
  - Tests cover default configuration binding where practical.

## Parking Lot

- Add screenshots or short GIFs to README after the UI stabilizes.
- Add hardware display integration notes.
- Add setup notes and strategy analysis models.
- Add export formats after storage format settles.
- Add WebView2 or desktop packaging only after the telemetry loop is solid.
