# SectorForge

SectorForge is a Windows-first, local-first telemetry and race analysis app for sim racing. The first vertical slice is a .NET local API with SignalR live telemetry, a fake 60 Hz collector, SQLite session storage, and a React/Vite dashboard.

## Prerequisites

- Windows 11 or Windows 10
- .NET SDK 10.0.203 or newer 10.0 feature release
- Node.js 24 or current LTS
- `npx` from npm
- Optional: global `pnpm`; scripts fall back to `npx pnpm@latest`

Docker, WSL, admin rights, and a running sim are not required for the MVP.

## Run Locally

```powershell
cd C:\Users\jimdv\repositories\sectorforge
.\tools\dev.ps1
```

Open `http://localhost:5173`. The API runs on `http://localhost:5221` and starts the fake telemetry adapter automatically.

If the default ports are already in use, pass alternate ports before launching:

```powershell
.\tools\dev.ps1 -ApiPort 5222 -WebPort 5174
```

The dev script checks both ports up front and reports whether to use `-ApiPort` or `-WebPort`.

Useful commands:

```powershell
.\tools\verify.ps1
dotnet test .\src\SectorForge.slnx
.\tools\format.ps1
.\tools\clean.ps1
.\tools\clean.ps1 -Full
```

`tools\verify.ps1` runs the full local quality gate: backend tests, .NET format verification, frontend lint, and frontend build.

SQLite raw sample storage keeps the newest 1,800 sample blobs per session by default so long fake telemetry runs do not grow without bound. Adjust `Storage:RetainedSampleBlobLimit` in `src/SectorForge.Api/appsettings.json` if you want a shorter or longer local trace.

## Continuous Integration

Pull requests and pushes to `main` run the baseline checks on Windows through GitHub Actions: .NET tests, .NET format verification, frontend lint, and frontend build. The workflow also caches NuGet and pnpm dependencies to keep repeat runs quick.

## VS Code

The repository includes `.vscode` settings for a smoother local loop:

- `SectorForge: API + Web` compound debug launch starts the API with fake telemetry and opens the Vite app in Chrome.
- `API: Debug fake telemetry` debugs only the ASP.NET Core backend.
- `Collector: Debug worker` runs the standalone fake collector worker.
- Tasks are available for restore, build, test, verify, web install, web dev server, web build, lint, clean, and the full dev script.

Install the recommended extensions when VS Code prompts. They are standard .NET, PowerShell, ESLint, Tailwind, EditorConfig, and Copilot extensions.

## Agentic Work

SectorForge includes repo-native files for coding agents:

- `AGENTS.md` for repo-level operating rules.
- `docs/agent-tasks.md` for scoped backlog tasks with acceptance criteria.
- `.github/instructions/` for targeted backend, frontend, protocol, and docs guidance.
- `.github/prompts/` for reusable task planning, implementation, review, backlog scaffolding, and adapter scaffolding prompts.
- `.github/agents/` for specialized workspace agents.
- `.github/skills/` for repeatable SectorForge task, backlog scaffolding, and adapter workflows.

## Architecture

```text
Game telemetry input
    -> .NET collector / protocol adapter
    -> Normalized telemetry model
    -> ASP.NET Core API + SignalR
    -> React/Vite dashboard
    -> SQLite local persistence
```

The backend is the source of truth. The web UI renders live state, controls the local collector, and shows recent stored sessions.

## Current Status

| Area | Status |
| --- | --- |
| Fake telemetry adapter | Working 60 Hz simulated stream |
| ASP.NET Core API | Health, games, sessions, collector status/start/stop |
| SignalR hub | Streams normalized telemetry samples |
| React dashboard | Live metrics, input bars, temperatures, speed chart |
| SQLite storage | Sessions, lap summaries, raw sample blobs |
| F1 25 UDP | Placeholder adapter |
| ACC shared memory | Placeholder adapter |
| AMS2 telemetry | Placeholder adapter |
| LMU plugin/UDP | Placeholder adapter |

## Open Source Notes

- SectorForge is licensed under the MIT License. See `LICENSE`.
- Game-specific packet parsing should stay isolated under collector/protocol adapters.
- Do not copy proprietary protocol documents into the repository.
- Keep local telemetry captures, databases, exports, and secrets out of source control.
- See `CONTRIBUTING.md` for local checks and adapter contribution rules.
- See `AGENTS.md` and `docs/agent-tasks.md` for coding-agent guidance and the current agent backlog.

## License

MIT License. See `LICENSE`.

## Project Layout

```text
src/
  SectorForge.Api/             ASP.NET Core Minimal API and SignalR hub
  SectorForge.Collector/       Telemetry adapters and collector service
  SectorForge.Core/            Game-agnostic telemetry model and interfaces
  SectorForge.Infrastructure/  SQLite persistence
  SectorForge.Web/             React, Vite, TypeScript dashboard
tests/
  SectorForge.Core.Tests/
  SectorForge.Protocol.Tests/
  SectorForge.Api.Tests/
docs/
  architecture.md
  game-adapters.md
  protocol-notes.md
tools/
  dev.ps1
  format.ps1
  clean.ps1
```

## API Surface

- `GET /api/health`
- `GET /api/games`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/collector/start`
- `POST /api/collector/stop`
- `GET /api/collector/status`
- SignalR hub: `/hubs/telemetry`
