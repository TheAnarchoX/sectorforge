# AGENTS

This repository is intended to be friendly to coding agents and human contributors. Use this file as the repo-level operating guide, and use `docs/agent-tasks.md` as the task backlog.

## Project Ground Rules

- Keep SectorForge Windows-first for now. Do not assume WSL, Bash, Docker, or admin rights for normal development.
- Preserve the local-first architecture: .NET API/collector is the source of truth, React renders state, and game-specific parsing stays isolated from `SectorForge.Core`.
- Do not copy vendor protocol documents, proprietary packet specs, telemetry captures, secrets, or local game paths into the repo.
- Prefer small, focused changes with tests over broad refactors.
- Update docs when setup, commands, APIs, storage, or adapter behavior changes.

## Before Starting A Task

- Read `README.md`, `CONTRIBUTING.md`, and the relevant docs under `docs/`.
- Check `git status --short` and do not overwrite changes you did not make.
- Pick one task from `docs/agent-tasks.md` and keep the change scoped to that task.
- If a task has unclear requirements, add a short note under that task instead of guessing large behavior.

## Agentic Workspace Files

- `AGENTS.md` is the canonical always-on repo guide. Do not add a duplicate `.github/copilot-instructions.md` alongside it unless maintainers intentionally replace this file.
- `.github/instructions/`: focused instructions for backend, frontend, protocol adapter, and docs work.
- `.github/prompts/`: reusable slash prompts for planning, taking, reviewing, and scaffolding backlog tasks, priorities, and adapters.
- `.github/agents/`: specialized agents for task implementation, backend, frontend, and protocol research.
- `.github/skills/`: reusable workflows for SectorForge task execution, backlog scaffolding, and adapter work.
- `docs/agent-tasks.md`: the task backlog agents should work from.

## Validation Expectations

Run the smallest useful checks for your change. For broad changes, run the full baseline:

```powershell
.\tools\verify.ps1
```

The verify script runs backend tests, .NET format verification, frontend lint, and frontend build.

For UI/runtime changes, also run:

```powershell
.\tools\dev.ps1
```

Then verify the dashboard at `http://localhost:5173` and API at `http://localhost:5221`.

## Task Completion Notes

When finishing a task, include:

- task ID from `docs/agent-tasks.md`
- files changed
- checks run
- known follow-up work
- any assumptions made
