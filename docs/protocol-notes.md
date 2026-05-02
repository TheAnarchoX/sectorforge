# Protocol Notes

This file tracks public references and implementation decisions without embedding proprietary or copyrighted protocol text.

## F1 25

EA publishes an official F1 25 UDP specification. The first real adapter should start here because the packet source is clear and modern.

Planned shape:

- UDP listener with configurable port
- packet header validation
- packet version checks
- packet-specific DTOs isolated from `SectorForge.Core`
- normalizer tests per packet type

## ACC

ACC exposes shared memory data through Kunos documentation and community examples. The adapter should be Windows-first and carefully handle unavailable fields.

## AMS2

AMS2 commonly uses Project CARS style shared memory or UDP configuration. Confirm the exact enabled mode before committing packet structures.

## LMU

LMU telemetry may require a community plugin or JSON telemetry socket. Decide on a stable data source before adding adapter code.
