# Game Adapters

Adapters convert game-specific telemetry into `TelemetrySample`. Keep each adapter isolated so the normalized model stays stable and the UI does not need game-specific branches.

## Adapter Order

1. Fake telemetry adapter
2. F1 25 UDP adapter
3. ACC shared memory adapter
4. AMS2 Project CARS style adapter
5. LMU plugin/UDP adapter

## Current Adapters

| Adapter ID | Game | Input | Status |
| --- | --- | --- | --- |
| `fake` | Simulated | Internal 60 Hz generator | Working |
| `f1-25-udp` | EA Sports F1 25 | UDP packets | Beta (config-gated) |
| `acc-shared-memory` | Assetto Corsa Competizione | Shared memory | Placeholder |
| `ams2-project-cars` | Automobilista 2 | Shared memory / UDP | Placeholder |
| `lmu-plugin-udp` | Le Mans Ultimate | Plugin / UDP JSON | Placeholder |

## Adapter Rules

- Parse raw packets or shared memory structures only inside adapter-specific code.
- Normalize unavailable fields to `null` instead of inventing values.
- Preserve game-specific details in adapter packages or optional extension data later, not in the core model.
- Add packet parsing tests before enabling a real adapter by default.
- Document required game settings, ports, and limitations without copying vendor documentation.

## F1 25 UDP

The `f1-25-udp` adapter is implemented behind configuration and remains disabled by default. Enable `Adapters:f1-25-udp:Enabled`, keep or override `BindAddress`, `Port`, and `ReceiveBufferBytes`, then select `f1-25-udp` through the collector start request or `Collector:AdapterId` autostart setting.

Current limitations:

- Publishes the player-car slice from motion, lap data, and car telemetry packets.
- Skips unsupported packet IDs and reports bind or parse failures through collector status `LastError`.
- Requires the game UDP stream to be configured outside SectorForge; the normal local development path still uses the fake adapter.
