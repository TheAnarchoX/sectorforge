# Protocol Notes

This file tracks public references and implementation decisions without embedding proprietary or copyrighted protocol text.

## F1 25

EA Sports publishes an official F1 25 UDP telemetry specification as a public help article. The first real adapter targets this stream because the data source is clear, modern, and well-known to the community. The implementer must link the current canonical EA URL from this section at adapter-wire-up time and must not embed packet tables, byte offsets, struct definitions, or enum value lists from the spec into this repository.

Adapter ID: `f1-25-udp` (see `docs/game-adapters.md`).

Implemented shape:

- UDP listener with configurable bind address and port (built on the SF-041 listener abstraction). The adapter remains opt-in through `Adapters:f1-25-udp:Enabled`.
- Packet header validation: format byte, packet format / version, packet ID, session UID, frame identifier, player car index. The header reader rejects wrong format bytes and truncated buffers without throwing across the adapter boundary.
- Per-packet DTOs and parsers live under `src/SectorForge.Collector/Adapters/F125/`, isolated from `SectorForge.Core`. Parsing uses explicit little-endian reads (`BinaryPrimitives`), not `unsafe` struct overlays, to keep the parser forward-compatible.
- Player car index is re-read from each header and never cached across packets (driver swap / spectator support).
- Readers currently cover motion, session/weather, lap data, participants, car telemetry, car status, car damage, and session history. Unsupported packet IDs are skipped.
- The UDP adapter caches packets by session UID so optional data can arrive at different rates. A session UID change clears cached optional data before publishing the next sample.
- Normalizer maps available values into `TelemetrySample`. Channels whose source packets have not arrived stay `null`; values that do not have a normalized home stay out of the model.
- Adapter remains opt-in and disabled by default.

Data-model expansion status:

The `TelemetrySample` model was expanded additively across SF-046, SF-047, and SF-048. The F1 25 normalizer now fills the mapped subset when matching packets are present: g-forces, world position, lap distance and split timing, DRS / pit-limiter / ABS / TC flags, ERS state, tyre compound and age, damage, weather forecast, session timing, safety-car state, and participant timing. Remaining dashboard surfacing is tracked by SF-049.

Current limitations:

- Publishing is still anchored to car telemetry packets; optional packet updates become visible on the next car telemetry sample.
- Team and car display names remain generic because `TelemetrySample` does not carry game-specific team or car IDs.
- The reader coverage is validated with synthetic fixtures only. No recorded captures are committed.

Tests use small synthetic byte arrays generated in C# (`BinaryPrimitives.WriteXxxLittleEndian` into a `byte[]`). Recorded captures are not committed unless the maintainer explicitly approves a sanitized fixture.

## ACC

ACC exposes shared memory data through Kunos documentation and community examples. The adapter should be Windows-first and carefully handle unavailable fields.

## AMS2

AMS2 commonly uses Project CARS style shared memory or UDP configuration. Confirm the exact enabled mode before committing packet structures.

## LMU

LMU telemetry may require a community plugin or JSON telemetry socket. Decide on a stable data source before adding adapter code.
