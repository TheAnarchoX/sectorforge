namespace SectorForge.Core.Telemetry.Configuration;

/// <summary>
/// Shared configuration shape for any telemetry adapter (fake, UDP, shared memory, plugin, replay).
/// Adapters opt in to the values they need; unrelated fields are simply left null.
/// </summary>
/// <remarks>
/// Bound from the <c>Adapters</c> configuration section as a dictionary keyed by adapter id, e.g.:
/// <code>
/// "Adapters": {
///   "fake":      { "Enabled": true,  "SampleRateHz": 60 },
///   "f1-25-udp": { "Enabled": false, "BindAddress": "0.0.0.0", "Port": 20777 }
/// }
/// </code>
/// </remarks>
public sealed class TelemetryAdapterOptions
{
    /// <summary>
    /// Default UDP/socket bind address used by adapters that do not override it.
    /// Loopback by default to avoid binding on all interfaces in a local-first dev tool.
    /// </summary>
    public const string DefaultBindAddress = "127.0.0.1";

    /// <summary>
    /// Default fake adapter sample rate, matches the historical 60 Hz fake stream.
    /// </summary>
    public const double DefaultFakeSampleRateHz = 60d;

    /// <summary>
    /// Whether the adapter is allowed to run. Disabled adapters can still be registered
    /// but should refuse to start when the collector selects them.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Optional UDP/socket port for adapters that bind a listener. Null = adapter default.
    /// </summary>
    public int? Port { get; set; }

    /// <summary>
    /// Optional bind address for adapters that bind a socket. Null = adapter default.
    /// </summary>
    public string? BindAddress { get; set; }

    /// <summary>
    /// Optional sample rate hint in Hertz. Currently honoured by the fake adapter; real adapters
    /// emit at the rate the upstream packet stream provides.
    /// </summary>
    public double? SampleRateHz { get; set; }

    /// <summary>
    /// Optional socket receive buffer size in bytes for UDP adapters. Null/0 leaves the OS default.
    /// </summary>
    public int? ReceiveBufferBytes { get; set; }
}

/// <summary>
/// Configuration for the <c>Collector</c> section, controlling autostart behavior.
/// </summary>
public sealed class CollectorOptions
{
    public const string SectionName = "Collector";

    /// <summary>
    /// When true, the API host starts the collector with <see cref="AdapterId"/> at startup.
    /// </summary>
    public bool AutoStart { get; set; }

    /// <summary>
    /// Adapter id to autostart when <see cref="AutoStart"/> is true. Defaults to the fake adapter.
    /// </summary>
    public string AdapterId { get; set; } = "fake";
}

/// <summary>
/// Configuration for the <c>Storage</c> section.
/// </summary>
public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>
    /// Per-session raw sample blob retention cap. Older blobs beyond this count are pruned;
    /// session and lap summaries remain intact.
    /// </summary>
    public int RetainedSampleBlobLimit { get; set; } = 1800;
}

/// <summary>
/// Top-level wrapper around the per-adapter dictionary bound from the <c>Adapters</c> section.
/// Stored as a wrapper (rather than a bare dictionary) so it can be injected via
/// <see cref="Microsoft.Extensions.Options.IOptions{TOptions}"/> in the API host.
/// </summary>
public sealed class TelemetryAdaptersOptions
{
    public const string SectionName = "Adapters";

    /// <summary>
    /// Per-adapter configuration, keyed by adapter id (case-insensitive lookups via <see cref="For"/>).
    /// </summary>
    public Dictionary<string, TelemetryAdapterOptions> Items { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Returns the configuration for <paramref name="adapterId"/>, or a default (disabled) entry
    /// when none is configured. Lookups are case-insensitive.
    /// </summary>
    public TelemetryAdapterOptions For(string adapterId)
    {
        if (string.IsNullOrWhiteSpace(adapterId))
        {
            return new TelemetryAdapterOptions();
        }

        foreach (var (key, value) in Items)
        {
            if (string.Equals(key, adapterId, StringComparison.OrdinalIgnoreCase))
            {
                return value;
            }
        }

        return new TelemetryAdapterOptions();
    }
}
