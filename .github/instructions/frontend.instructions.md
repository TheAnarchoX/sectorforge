---
description: "Use when changing the SectorForge React, Vite, TypeScript, Tailwind, SignalR dashboard, UI state, or frontend build."
applyTo:
  - "src/SectorForge.Web/src/**/*.ts"
  - "src/SectorForge.Web/src/**/*.tsx"
  - "src/SectorForge.Web/src/**/*.css"
  - "src/SectorForge.Web/*.ts"
  - "src/SectorForge.Web/*.js"
---
# SectorForge Frontend Instructions

- Build the actual telemetry tool surface, not a marketing landing page.
- Keep the UI dark, dense, readable, and suitable for repeated telemetry inspection.
- Do not couple React components to a specific game unless the feature is explicitly game-specific.
- Treat the backend as the source of truth. Frontend state should render API/SignalR data and user controls.
- Keep controls keyboard-friendly and use clear empty, loading, offline, and stopped states.
- Avoid oversized hero sections, decorative cards inside cards, and visual clutter.
- Validate frontend changes with `npx --yes pnpm@latest --dir .\src\SectorForge.Web lint` and `npx --yes pnpm@latest --dir .\src\SectorForge.Web build`.
