---
description: "Scaffold new SectorForge docs/agent-tasks.md task entries inside an existing priority with status, type, goal, files, and acceptance criteria."
name: "Scaffold SectorForge Task"
argument-hint: "Priority and task idea, for example Priority 1: add verify script docs task"
agent: "SectorForge Task Implementer"
---
# Scaffold SectorForge Task

Add one or more task entries to an existing priority in `docs/agent-tasks.md`.

Task request: `${input:task}`

Use the `sectorforge-task-scaffold` skill. Follow this process:

1. Read `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and `docs/agent-tasks.md`.
2. Locate the target priority and preserve existing task entries, statuses, notes, and numbering.
3. Choose the next available SF task ID in that priority band unless the user supplied one explicitly.
4. Add concise task entries with status, type, goal, suggested files, and acceptance criteria.
5. Keep each task small enough for one focused pass.
6. Do not implement the new tasks.
7. Report task IDs added, assumptions, and any follow-up needed.
