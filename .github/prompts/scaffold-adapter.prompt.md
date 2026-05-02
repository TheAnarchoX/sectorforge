---
description: "Plan or scaffold a SectorForge game telemetry adapter while preserving protocol boundaries."
name: "Scaffold SectorForge Adapter"
argument-hint: "Game or adapter ID"
agent: "SectorForge Protocol Researcher"
---
# Scaffold SectorForge Adapter

Prepare work for a SectorForge telemetry adapter.

Adapter target: `${input:adapter}`

Requirements:

- Keep protocol parsing isolated from `SectorForge.Core`.
- Do not copy protocol specs or packet tables into the repo.
- Prefer public links and original summaries in docs.
- Define parser and normalizer test strategy.
- Keep the adapter opt-in until tests and error handling are ready.

Return either a research plan or a minimal scaffold plan, depending on whether enough public information is already available.
