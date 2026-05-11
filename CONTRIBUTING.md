# Contributing

Thanks for helping shape SectorForge. The project is Windows-first today, with a local .NET backend and React dashboard.

## Local Setup

```powershell
cd C:\Users\jimdv\repositories\sectorforge
.\tools\dev.ps1
```

Open `http://localhost:5173`. The fake telemetry adapter starts automatically so UI work does not require a running sim.

## Checks

Run these before opening a pull request:

```powershell
.\tools\verify.ps1
```

The verify script fails fast and runs backend tests, .NET format verification, frontend lint, and frontend build.

When you need the current coverage baseline or are touching low-covered runtime files, also run:

```powershell
.\tests\coverage\Invoke-Coverage.ps1
npx --yes pnpm@10.33.2 --dir .\src\SectorForge.Web test:coverage
```

The coverage script generates merged Cobertura and HTML reports under `artifacts\coverage\report` and enforces the thresholds in `tests\coverage\coverage-thresholds.json`.
The frontend coverage command runs Vitest + React Testing Library, writes HTML/Cobertura output to `artifacts\coverage\frontend`, and enforces the 83% frontend line-coverage gate. The current baseline is 83.77% line coverage.

## Agent Task Backlog

Agents and contributors can pick scoped work from `docs/agent-tasks.md`. Follow `AGENTS.md` for repo-specific operating rules and expected completion notes.

Reusable agentic assets live under `.github/instructions/`, `.github/prompts/`, `.github/agents/`, and `.github/skills/`.

### Tasking System

Use `docs/agent-tasks.md` as the source of truth for scoped work.

1. Choose one task ID and read its acceptance criteria before editing.
2. If the task is `ready`, implement only that scope.
3. If the task is `needs-research`, collect facts, update docs or the task entry, and avoid broad implementation until the path is clear.
4. If the task is `blocked`, use `vscode_askQuestions` to collect the maintainer decision. If the maintainer is unavailable, leave the task blocked and document the missing decision.
5. Finish by reporting the task ID, files changed, checks run, follow-up work, and assumptions.

### Prompts

Type `/` in chat and choose the matching workspace prompt:

| Prompt | Use when |
| --- | --- |
| `Plan SectorForge Task` | You want an implementation plan for a task without editing files. |
| `Take SectorForge Task` | You want an agent to implement one `docs/agent-tasks.md` task end to end. |
| `Review SectorForge Task` | You want a code-review pass over completed task work or changed files. |
| `Scaffold SectorForge Priority` | You want to add a new priority section with multiple backlog tasks. |
| `Scaffold SectorForge Task` | You want to add one or more tasks to an existing priority section. |
| `Scaffold SectorForge Adapter` | You want a safe research or scaffold plan for a game telemetry adapter. |

Example prompt inputs:

```text
/Plan SectorForge Task SF-010
/Take SectorForge Task SF-020
/Review SectorForge Task SF-020
/Scaffold SectorForge Priority Priority 5: Export and Sharing
/Scaffold SectorForge Task Priority 1: add VS Code verify task
/Scaffold SectorForge Adapter F1 25 UDP
```

### Skills

Skills load when the request matches their description. When writing a prompt or asking an agent manually, include the task domain plainly so the right skill is discoverable.

| Skill | Use when |
| --- | --- |
| `sectorforge-task` | Selecting, planning, implementing, validating, or reporting work from `docs/agent-tasks.md`. |
| `sectorforge-priority-scaffold` | Adding a new `docs/agent-tasks.md` priority section with SF task IDs and acceptance criteria. |
| `sectorforge-task-scaffold` | Adding new task entries to an existing `docs/agent-tasks.md` priority section. |
| `sectorforge-adapter` | Researching, scaffolding, parsing, normalizing, or testing game telemetry adapters such as F1 25, ACC, AMS2, LMU, UDP, shared memory, or plugin streams. |
| `agent-customization` | Creating or updating `.github/instructions`, `.github/prompts`, `.github/agents`, `.github/skills`, `AGENTS.md`, or similar agent customization files. |

Good manual requests name both the task and the workflow, for example: `Use the sectorforge-task skill to take SF-010`, `Use the sectorforge-task-scaffold skill to add a Priority 2 storage task`, or `Use the sectorforge-adapter skill to plan the F1 25 UDP adapter`.

## Adapter Contributions

- Keep raw packet/shared-memory parsing isolated from `SectorForge.Core`.
- Add parser and normalizer tests before enabling a real game adapter by default.
- Do not copy vendor protocol documents into the repository.
- Prefer nullable fields when a game does not expose a normalized value.

## Licensing

By submitting a contribution, you agree that it is licensed under the SectorForge Non-Commercial License in [LICENSE](LICENSE). Do not submit third-party code or assets unless you have the right to license them under those terms.

## Repository Hygiene

- Do not commit captures, exports, local databases, secrets, or game-specific personal paths.
- Keep setup paths Windows-friendly and avoid requiring WSL, Docker, or admin rights for normal development.
- Choose small, focused changes over broad refactors.
