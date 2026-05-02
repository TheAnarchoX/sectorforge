---
description: "Scaffold a new SectorForge docs/agent-tasks.md priority section with SF task IDs, goals, suggested files, and acceptance criteria."
name: "Scaffold SectorForge Priority"
argument-hint: "Priority title and task ideas, for example Priority 5: Export and Sharing"
agent: "SectorForge Task Implementer"
---
# Scaffold SectorForge Priority

Add a new priority section to `docs/agent-tasks.md`.

Priority request: `${input:priority}`

Use the `sectorforge-priority-scaffold` skill. Follow this process:

1. Read `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and `docs/agent-tasks.md`.
2. Preserve existing task entries, statuses, notes, and numbering.
3. Choose the next priority number and SF task ID band unless the user supplied them explicitly.
4. Add concise task entries with status, type, goal, suggested files, and acceptance criteria.
5. Keep each task small enough for one focused pass.
6. Do not implement the new tasks.
7. Report priority heading, task IDs added, assumptions, and any follow-up needed.
