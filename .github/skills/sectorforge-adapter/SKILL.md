---
name: sectorforge-adapter
description: "Use when researching, planning, scaffolding, parsing, normalizing, or testing SectorForge game telemetry adapters for F1 25, ACC, AMS2, LMU, UDP, shared memory, or plugin streams."
argument-hint: "Game or adapter ID"
---
# SectorForge Adapter Workflow

Use this skill for game telemetry adapter work.

Use it alongside the `sectorforge-task` workflow when adapter work comes from `docs/agent-tasks.md`.

## Procedure

1. Read `docs/game-adapters.md` and `docs/protocol-notes.md`.
2. Identify the data source: UDP, shared memory, plugin stream, file, or replay.
3. Keep raw protocol DTOs and parsing in adapter-specific code.
4. Normalize into `TelemetrySample` without adding game-specific details to `SectorForge.Core`.
5. Add parser and normalizer tests using synthetic fixtures.
6. Keep the adapter disabled or opt-in until tests and status/error handling are ready.

## Boundaries

- Do not copy vendor packet specs into source or docs.
- Do not commit real telemetry captures unless the maintainer explicitly approves sanitized fixtures.
- Do not require a running game for normal test execution.

See [adapter checklist](./references/adapter-checklist.md) before implementing.
