# Architecture

SectorForge starts as a local backend plus browser UI. This keeps telemetry collection in a native process that can use UDP, shared memory, files, plugins, and later hardware integrations, while keeping the dashboard fast to iterate on.

## Runtime Flow

```text
Game telemetry input
    -> ITelemetryAdapter
    -> TelemetrySample
    -> TelemetryCollectorService
    -> ILiveTelemetryPublisher
    -> SignalR /hubs/telemetry
    -> React dashboard
```

`SectorForge.Core` owns the normalized model. Game-specific adapters should translate raw game data into that model and avoid leaking packet layouts into UI or storage code.

## Projects

- `SectorForge.Core`: records, enums, and interfaces shared by all runtime projects.
- `SectorForge.Collector`: fake telemetry, adapter placeholders, and collector lifecycle.
- `SectorForge.Api`: Minimal APIs, SignalR hub, CORS, local collector control.
- `SectorForge.Infrastructure`: SQLite implementation of `ITelemetrySessionStore`.
- `SectorForge.Web`: React dashboard that consumes REST endpoints and live SignalR samples.

## Storage

The MVP stores:

- one row per session
- one row per lap summary
- JSON blobs for high-frequency samples

This is intentionally simple. The `ITelemetrySessionStore` abstraction leaves room for batching, chunk files, DuckDB, Parquet export, or a dedicated time-series layout later.

## Development Defaults

- API: `http://localhost:5221`
- Web: `http://localhost:5173`
- Fake adapter: `fake`
- Local database: `%LOCALAPPDATA%\SectorForge\sectorforge.db`

`tools/dev.ps1` starts both API and web, and starts the fake adapter automatically through API configuration.
