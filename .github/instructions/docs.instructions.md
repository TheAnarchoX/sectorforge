---
description: "Use when changing SectorForge README, contributor docs, agent docs, architecture docs, adapter docs, prompts, agents, or skills."
applyTo:
  - "*.md"
  - "docs/**/*.md"
  - "AGENTS.md"
  - ".github/**/*.md"
---
# SectorForge Documentation Instructions

- Keep docs concise, current, and Windows-first.
- Prefer commands that work in PowerShell on native Windows.
- Link to deeper docs instead of duplicating full content across README, CONTRIBUTING, and AGENTS.
- Do not include secrets, local captures, private game paths, copied protocol specs, or copyrighted packet tables.
- For task docs, include task ID, status, goal, likely files, and acceptance criteria.
- Keep prompt, skill, and agent descriptions keyword-rich with task IDs, stack names, commands, and trigger phrases that match likely user requests.
- Keep `AGENTS.md` as the only always-on repo guide unless maintainers intentionally replace it.
- When adding agent customization files, keep frontmatter descriptions keyword-rich and quote descriptions containing colons.
