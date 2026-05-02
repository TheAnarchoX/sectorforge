---
description: "Use when changing SectorForge .NET backend, API, collector, storage, SignalR, tests, or telemetry domain code."
applyTo:
  - "src/SectorForge.Api/**/*.cs"
  - "src/SectorForge.Collector/**/*.cs"
  - "src/SectorForge.Core/**/*.cs"
  - "src/SectorForge.Infrastructure/**/*.cs"
  - "tests/**/*.cs"
---
# SectorForge Backend Instructions

- Keep `SectorForge.Core` game-agnostic. Do not add game-specific packet fields there unless they are genuinely normalized concepts.
- Keep protocol parsing in collector adapter code, not in API, storage, or web projects.
- Prefer C# records for telemetry state and explicit interfaces for boundaries.
- Preserve cancellation support in collector loops, UDP listeners, persistence calls, and SignalR publishing.
- Use nullable fields when a game does not expose a telemetry value.
- Add or update xUnit tests for behavior changes, especially parser, normalizer, storage, and endpoint behavior.
- Validate broad backend changes with `dotnet test .\src\SectorForge.slnx` and `dotnet format .\src\SectorForge.slnx --verify-no-changes`.
