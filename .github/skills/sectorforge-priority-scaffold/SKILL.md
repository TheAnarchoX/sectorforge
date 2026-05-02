---
name: sectorforge-priority-scaffold
description: "Use when scaffolding, adding, or expanding SectorForge docs/agent-tasks.md with a new Priority section, roadmap area, multiple SF task IDs, acceptance criteria, and backlog status labels."
argument-hint: "Priority title and task ideas"
---
# SectorForge Priority Scaffold Workflow

Use this skill when adding a new priority section to `docs/agent-tasks.md`.

## Procedure

1. Read `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and `docs/agent-tasks.md`.
2. Identify the current highest priority number and highest SF task ID in the requested or next numeric band.
3. Add one new `## Priority N: Name` section in the appropriate location.
4. Add tasks under that section using the standard task shape.
5. Keep each task scoped to one focused implementation pass.
6. Use `needs-research` when facts are unclear, especially for protocol, adapter, storage, or external integration work.
7. Use `blocked` only when a maintainer decision is required before research or implementation can proceed.
8. Do not implement the new tasks as part of scaffolding.
9. Report the priority heading, task IDs added, assumptions, and follow-up work.

## Numbering

- Preserve existing priority headings and task IDs.
- For a new priority, prefer the next priority number after the current backlog.
- Prefer SF task IDs that match the priority band: `Priority 5` uses `SF-050`, `SF-051`, and so on.
- If a band is already occupied, choose the next unused ID in that band.

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

- Acceptance criteria should describe behavior or documentation outcomes, not implementation steps only.
- Suggested files should point agents toward likely ownership boundaries without forcing broad refactors.
- Keep Windows-first setup and local-first architecture assumptions visible when relevant.
- Do not add copied protocol specs, private paths, telemetry captures, secrets, or vendor packet tables.
