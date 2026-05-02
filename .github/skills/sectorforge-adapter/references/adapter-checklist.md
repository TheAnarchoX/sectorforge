# Adapter Checklist

Before implementation:

- Public data source identified and linked from docs.
- Adapter ID chosen and listed in `docs/game-adapters.md`.
- Configuration needs documented.
- Parser boundaries identified.
- Normalized fields mapped with unavailable values set to `null`.

Before enabling by default:

- Parser tests exist.
- Normalizer tests exist.
- Collector status reports adapter errors.
- Cancellation path is tested or manually verified.
- README or adapter docs explain game settings and ports.
