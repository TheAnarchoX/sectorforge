---
description: "Review a completed SectorForge docs/agent-tasks.md task or changed files for bugs, regressions, tests, docs, and scope control."
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
- agentic workflow drift beyond one task

Return findings first, ordered by severity, with file references and concise remediation guidance.
