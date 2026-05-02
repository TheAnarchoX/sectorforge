---
description: "Pick up and implement one scoped SectorForge task from docs/agent-tasks.md."
name: "Take SectorForge Task"
argument-hint: "Task ID, for example SF-020"
agent: "SectorForge Task Implementer"
---
# Take SectorForge Task

Implement the requested SectorForge task from `docs/agent-tasks.md`.

Task ID: `${input:taskId}`

Follow this process:

1. Read `AGENTS.md`, `CONTRIBUTING.md`, and the task entry.
2. Inspect current file contents before editing.
3. Keep the change scoped to the task acceptance criteria.
4. Add or update tests and docs when behavior changes.
5. Run the smallest useful validation set, or the full baseline for broad changes.
6. Report files changed, checks run, and follow-up work.
