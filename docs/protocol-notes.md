# Protocol Notes

This file tracks public references and implementation decisions without embedding proprietary or copyrighted protocol text.

## F1 25

EA Sports publishes an official F1 25 UDP telemetry specification as a public help article. The first real adapter targets this stream because the data source is clear, modern, and well-known to the community. The implementer must link the current canonical EA URL from this section at adapter-wire-up time and must not embed packet tables, byte offsets, struct definitions, or enum value lists from the spec into this repository.

Adapter ID: `f1-25-udp` (see `docs/game-adapters.md`).

Planned shape:

- UDP listener with configurable bind address and port (built on the SF-041 listener abstraction). The long-standing series default port can be used as the configuration default but must be re-verified against the current spec rather than assumed.
- Packet header validation: format byte, packet format / version, packet ID, session UID, frame identifier, player car index. The header reader rejects wrong format bytes and truncated buffers without throwing across the adapter boundary.
- Per-packet DTOs and parsers live under `src/SectorForge.Collector/Adapters/F125/`, isolated from `SectorForge.Core`. Parsing uses explicit little-endian reads (`BinaryPrimitives`), not `unsafe` struct overlays, to keep the parser forward-compatible.
- Player car index is re-read from each header and never cached across packets (driver swap / spectator support).
- Normalizer maps the supported subset of fields into `TelemetrySample`. Channels not yet mapped stay `null`; nothing is invented.
- Adapter remains opt-in: disabled by default, selected by configuration once SF-045 lands.

Data-model expansion plan:

The current `TelemetrySample` shape does not carry several channels F1 25 exposes (g-forces, world position, sector splits, DRS / pit-limiter / ABS / TC flags, ERS, damage, weather forecast, multi-participant sectors). Rather than dropping those channels, `TelemetrySample` is being expanded additively across three slices (SF-046, SF-047, SF-048). All new properties are nullable and default to `null` so other adapters, stored blobs, and existing tests stay valid.

Tests use small synthetic byte arrays generated in C# (`BinaryPrimitives.WriteXxxLittleEndian` into a `byte[]`). Recorded captures are not committed unless the maintainer explicitly approves a sanitized fixture.

## ACC

ACC exposes shared memory data through Kunos documentation and community examples. The adapter should be Windows-first and carefully handle unavailable fields.

## AMS2

AMS2 commonly uses Project CARS style shared memory or UDP configuration. Confirm the exact enabled mode before committing packet structures.

## LMU

LMU telemetry may require a community plugin or JSON telemetry socket. Decide on a stable data source before adding adapter code.
