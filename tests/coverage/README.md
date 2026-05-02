# Coverage Baseline

This folder contains the repo-local coverage command and threshold configuration for SectorForge.

## Run Locally

```powershell
.\tests\coverage\Invoke-Coverage.ps1
```

The script runs all three .NET test projects with MSBuild-based coverlet collection, merges the reports, and writes Cobertura, HTML, and text summary output under `artifacts\coverage\report`.

## Baseline

Baseline captured on 2026-05-03:

- Overall line coverage: 94.13%
- Overall branch coverage: 81.13%
- CI threshold: 93% overall line coverage

Critical file thresholds enforced in CI:

- `SectorForge.Api/Program.cs` >= 90%
- `SectorForge.Api/Hubs/TelemetryHub.cs` >= 95%
- `SectorForge.Api/Services/CollectorAutoStartService.cs` >= 95%
- `SectorForge.Collector/TelemetryCollectorService.cs` >= 90%
- `SectorForge.Collector/Worker.cs` >= 90%
- `SectorForge.Infrastructure/Storage/SqliteTelemetrySessionStore.cs` >= 90%

Known low-coverage file:

- `SectorForge.Collector/Program.cs` is now partially covered through `CollectorProgram.CreateHost(...)` registration tests, but the blocking `Main(...)` entrypoint remains intentionally unthresholded.
