---
name: sectorforge-task
description: "Use when selecting, planning, implementing, validating, or reporting work from docs/agent-tasks.md in SectorForge. Covers task intake, scope, checks, and completion notes."
argument-hint: "Task ID from docs/agent-tasks.md"
---
# SectorForge Task Workflow

Use this skill when working from the SectorForge agent backlog.

## Procedure

1. Read `AGENTS.md`, `CONTRIBUTING.md`, and `docs/agent-tasks.md`.
2. Locate the requested task ID and copy its acceptance criteria into your working notes.
3. Inspect current files before editing, especially files named in the task.
4. Keep implementation scoped to the task.
5. Run the relevant checks from [validation](./references/validation.md).
6. Finish with the completion format from [completion note](./assets/completion-note.md).

## Scope Rules

- If the task is blocked, update the task with the blocker instead of inventing requirements.
- If the task needs research, produce a research note or plan before code changes.
- If implementation reveals a separate task, add a follow-up to `docs/agent-tasks.md`.
