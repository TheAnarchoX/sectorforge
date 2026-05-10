using Microsoft.Extensions.Configuration;
using SectorForge.Core.Telemetry.Configuration;

namespace SectorForge.Api.Tests;

public sealed class TelemetryAdapterOptionsBindingTests
{
    [Fact]
    public void DefaultsAreSafeWhenSectionsAreMissing()
    {
        var configuration = new ConfigurationBuilder().Build();

        var collector = new CollectorOptions();
        configuration.GetSection(CollectorOptions.SectionName).Bind(collector);

        var storage = new StorageOptions();
        configuration.GetSection(StorageOptions.SectionName).Bind(storage);

        var adapters = BindAdapters(configuration);

        Assert.False(collector.AutoStart);
        Assert.Equal("fake", collector.AdapterId);
        Assert.Equal(120_000, storage.RetainedSampleBlobLimit);
        Assert.Empty(adapters.Items);

        var unknown = adapters.For("not-configured");
        Assert.False(unknown.Enabled);
        Assert.Null(unknown.Port);
        Assert.Null(unknown.SampleRateHz);
    }

    [Fact]
    public void ForReturnsDefaultEntryWhenAdapterIdIsBlank()
    {
        var options = new TelemetryAdaptersOptions
        {
            Items = new Dictionary<string, TelemetryAdapterOptions>
            {
                ["fake"] = new() { Enabled = true, SampleRateHz = 30 }
            }
        };

        var nullAdapter = options.For(null!);
        var whitespaceAdapter = options.For("   ");

        Assert.False(nullAdapter.Enabled);
        Assert.Null(nullAdapter.Port);
        Assert.Null(nullAdapter.SampleRateHz);
        Assert.False(whitespaceAdapter.Enabled);
        Assert.Null(whitespaceAdapter.ReceiveBufferBytes);
    }

    [Fact]
    public void BindsCollectorAndStorageOverrides()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Collector:AutoStart"] = "true",
                ["Collector:AdapterId"] = "f1-25-udp",
                ["Storage:RetainedSampleBlobLimit"] = "600"
            })
            .Build();

        var collector = new CollectorOptions();
        configuration.GetSection(CollectorOptions.SectionName).Bind(collector);

        var storage = new StorageOptions();
        configuration.GetSection(StorageOptions.SectionName).Bind(storage);

        Assert.True(collector.AutoStart);
        Assert.Equal("f1-25-udp", collector.AdapterId);
        Assert.Equal(600, storage.RetainedSampleBlobLimit);
    }

    [Fact]
    public void BindsPerAdapterEntries()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Adapters:fake:Enabled"] = "true",
                ["Adapters:fake:SampleRateHz"] = "30",
                ["Adapters:f1-25-udp:Enabled"] = "true",
                ["Adapters:f1-25-udp:BindAddress"] = "0.0.0.0",
                ["Adapters:f1-25-udp:Port"] = "20777",
                ["Adapters:f1-25-udp:ReceiveBufferBytes"] = "65536"
            })
            .Build();

        var adapters = BindAdapters(configuration);

        var fake = adapters.For("fake");
        Assert.True(fake.Enabled);
        Assert.Equal(30d, fake.SampleRateHz);
        Assert.Null(fake.Port);

        var f125 = adapters.For("F1-25-UDP");
        Assert.True(f125.Enabled);
        Assert.Equal("0.0.0.0", f125.BindAddress);
        Assert.Equal(20777, f125.Port);
        Assert.Equal(65536, f125.ReceiveBufferBytes);
    }

    private static TelemetryAdaptersOptions BindAdapters(IConfiguration configuration)
    {
        var options = new TelemetryAdaptersOptions();
        var section = configuration.GetSection(TelemetryAdaptersOptions.SectionName);
        foreach (var child in section.GetChildren())
        {
            var entry = new TelemetryAdapterOptions();
            child.Bind(entry);
            options.Items[child.Key] = entry;
        }

        return options;
    }
}
