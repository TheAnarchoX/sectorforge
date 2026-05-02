---
description: "Review a completed SectorForge task for correctness, scope control, tests, and docs."
name: "Review SectorForge Task"
argument-hint: "Task ID or changed files"
agent: "agent"
---
# Review SectorForge Task

Review the completed SectorForge task or changed files:

`${input:scope}`

Prioritize:

- bugs and behavioral regressions
- missing tests
- scope creep beyond the task
- Windows-first setup regressions
- docs or task backlog drift
- accidental copied protocol/vendor content

Return findings first, ordered by severity, with file references and concise remediation guidance.
