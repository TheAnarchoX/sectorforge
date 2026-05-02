---
name: sectorforge-task-scaffold
description: "Use when scaffolding or adding new task entries to an existing SectorForge docs/agent-tasks.md Priority with SF IDs, status, type, goal, suggested files, and acceptance criteria."
argument-hint: "Priority and task idea"
---
# SectorForge Task Scaffold Workflow

Use this skill when adding one or more tasks to an existing priority in `docs/agent-tasks.md`.

## Procedure

1. Read `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and `docs/agent-tasks.md`.
2. Locate the requested priority by number, title, or nearby task IDs.
3. Choose the next unused SF task ID in that priority band unless the user supplied an ID.
4. Add each task using the standard task shape.
5. Keep every new task scoped to one focused pass with clear acceptance criteria.
6. Use `needs-research` when implementation details must be confirmed first.
7. Use `blocked` only when a maintainer decision is required.
8. Do not implement the newly added tasks as part of scaffolding.
9. Report task IDs added, assumptions, and follow-up work.

## Numbering

- Preserve existing task IDs and statuses.
- Match the target priority band: `Priority 1` uses `SF-010` through `SF-019`, `Priority 4` uses `SF-040` through `SF-049`, and so on.
- If the priority band is full, add a short note instead of silently reusing or renumbering IDs.
- If the requested priority does not exist, use `sectorforge-priority-scaffold` or ask for confirmation before creating a new section.

## Task Template

```markdown
### SF-000: Task Title

- Status: `ready`
- Type: category
- Goal: One sentence describing the outcome.
- Suggested files: `path/or/glob`, `another/path`
- Acceptance criteria:
  - Observable, testable outcome.
  - Observable, testable outcome.
```

## Quality Bar

- Prefer concise tasks with observable acceptance criteria.
- Include docs and tests in suggested files when behavior, setup, commands, APIs, storage, adapters, or UI workflows change.
- Keep tasks aligned with the local-first .NET API/collector, React dashboard, SQLite storage, and isolated adapter architecture.
- Do not add copied protocol specs, private paths, telemetry captures, secrets, or vendor packet tables.
