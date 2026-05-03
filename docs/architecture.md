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

`TelemetrySample` is intentionally additive. Vehicle dynamics, world position, sector splits, lap-valid and pit status, penalties, warnings, and driver-aid flags are nullable so adapters can publish only the channels their source exposes. Existing fake, replay, and stored samples remain valid when newer adapters add more detail.

## Projects

- `SectorForge.Core`: records, enums, and interfaces shared by all runtime projects.
- `SectorForge.Collector`: fake telemetry, adapter placeholders, and collector lifecycle.
- `SectorForge.Api`: Minimal APIs, SignalR hub, CORS, local collector control.
- `SectorForge.Infrastructure`: SQLite implementation of `ITelemetrySessionStore`.
- `SectorForge.Web`: React dashboard that consumes REST endpoints and live SignalR samples.

## Frontend Runtime Guardrails

The dashboard now keeps a few explicit browser-side memory boundaries so long live runs and stored-session replays stay stable:

- Live and replay traces stay windowed instead of growing without bound, and replay lap reconstruction only walks the active lap window instead of rescanning an entire stored capture on every replay step.
- SignalR telemetry samples (60Hz from the fake adapter, higher in real games) write into mutable ring buffers held in refs and a single throttled commit publishes a snapshot to React state at ~20Hz, so the dashboard tree reconciles roughly three times less often than the wire feed and avoids per-sample array spread+slice allocations.
- The high-frequency dashboard subtree (`MainTelemetryColumn`, `LapTelemetryChart`, `TraceLane`, `TelemetrySidebar`, `SessionBand`, `DashboardHeader`) is wrapped in `React.memo` so unrelated state changes (sessions polling, replay scrub, workspace switches) do not cascade into per-render SVG rebuilds, and the per-render `Math.max(..., ...arr)` argument-spreads on 180-element trace arrays were replaced with O(N) loops.
- The Sessions workspace releases loaded capture detail payloads when it is hidden, unless replay is actively using that capture, so background polling does not keep refetching large sample arrays while the user is back on the live or driver views.
- Development builds sample Chromium heap usage through `performance.memory` when the browser exposes it and surface a warning in the shared notice area when usage stays hot or grows quickly. This gives contributors a visible signal before a long-session regression reaches production.

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
